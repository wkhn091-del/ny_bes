import {
  BOOKING_WINDOW_DAYS,
  MIN_BOOKING_MINUTES,
  SLOT_MINUTES,
  addDays,
  hoursForDate,
  israelToUtc,
  nowInIsrael,
} from './time';
import type { Branch, Space } from './types';

export type SlotErrorCode =
  | 'INVALID_DATE'
  | 'TOO_FAR'
  | 'IN_PAST'
  | 'BRANCH_CLOSED'
  | 'MISALIGNED'
  | 'TOO_SHORT'
  | 'OUTSIDE_HOURS'
  | 'DAY_PASS_NOT_ALLOWED'
  | 'INVALID_SEATS';

export const SLOT_ERROR_MESSAGES: Record<SlotErrorCode | 'SLOT_TAKEN' | 'CAPACITY_EXCEEDED', string> = {
  INVALID_DATE: 'התאריך שנבחר אינו תקין.',
  TOO_FAR: `אפשר להזמין עד ${BOOKING_WINDOW_DAYS} יום מראש.`,
  IN_PAST: 'השעה שנבחרה כבר עברה.',
  BRANCH_CLOSED: 'הסניף סגור ביום הזה.',
  MISALIGNED: 'יש לבחור שעות בקפיצות של חצי שעה.',
  TOO_SHORT: 'מינימום הזמנה הוא שעה אחת.',
  OUTSIDE_HOURS: 'השעות שנבחרו מחוץ לשעות הפעילות של הסניף.',
  DAY_PASS_NOT_ALLOWED: 'יום שלם זמין רק במשרדים פרטיים.',
  INVALID_SEATS: 'מספר המקומות שנבחר אינו זמין בחלל הזה.',
  SLOT_TAKEN: 'מישהו הקדים אותך — השעות האלה כבר נתפסו. בחר/י שעות אחרות.',
  CAPACITY_EXCEEDED: 'אין מספיק עמדות פנויות בשעות שנבחרו.',
};

export interface SlotRequest {
  date: string;
  startMinute: number;
  endMinute: number;
  seats: number;
  isDayPass: boolean;
}

export type SlotValidation =
  | {
      ok: true;
      start: Date;
      end: Date;
      startMinute: number;
      endMinute: number;
      durationMinutes: number;
      seats: number;
    }
  | { ok: false; code: SlotErrorCode };

/** Mirrors public.validate_booking_window in SQL; the database remains the final authority. */
export function validateSlotRequest(
  space: Pick<Space, 'type' | 'poolSize' | 'capacity'>,
  branch: Pick<Branch, 'hours'>,
  request: SlotRequest,
  now: Date = new Date(),
): SlotValidation {
  const window = hoursForDate(branch.hours, request.date);
  const { date: today } = nowInIsrael(now);
  if (request.date < today) return { ok: false, code: 'IN_PAST' };
  if (request.date > addDays(today, BOOKING_WINDOW_DAYS)) return { ok: false, code: 'TOO_FAR' };
  if (!window) return { ok: false, code: 'BRANCH_CLOSED' };

  if (request.isDayPass && space.type !== 'privateOffice') return { ok: false, code: 'DAY_PASS_NOT_ALLOWED' };

  const startMinute = request.isDayPass ? window.open : request.startMinute;
  const endMinute = request.isDayPass ? window.close : request.endMinute;

  if (startMinute % SLOT_MINUTES !== 0 || endMinute % SLOT_MINUTES !== 0) return { ok: false, code: 'MISALIGNED' };
  if (endMinute - startMinute < MIN_BOOKING_MINUTES) return { ok: false, code: 'TOO_SHORT' };
  if (startMinute < window.open || endMinute > window.close) return { ok: false, code: 'OUTSIDE_HOURS' };

  const start = israelToUtc(request.date, startMinute);
  const end = israelToUtc(request.date, endMinute);
  if (start.getTime() <= now.getTime()) return { ok: false, code: 'IN_PAST' };

  let seats = 1;
  if (space.type === 'hotDesk') {
    const maxSeats = Math.min(space.poolSize ?? 0, space.capacity);
    if (!Number.isInteger(request.seats) || request.seats < 1 || request.seats > maxSeats) {
      return { ok: false, code: 'INVALID_SEATS' };
    }
    seats = request.seats;
  }

  return { ok: true, start, end, startMinute, endMinute, durationMinutes: endMinute - startMinute, seats };
}

export const FREE_CANCELLATION_HOURS = 24;
export const GRACE_CANCELLATION_MINUTES = 5;

export interface CancellableBooking {
  status: string;
  start: Date;
  end: Date;
  confirmedAt: Date | null;
}

/** Mirrors public.cancel_booking_by_customer. */
export function canCancelWithRefund(booking: CancellableBooking, now: Date = new Date()): boolean {
  if (booking.status !== 'active') return false;
  if (booking.start.getTime() <= now.getTime()) return false;
  const msUntilStart = booking.start.getTime() - now.getTime();
  if (msUntilStart >= FREE_CANCELLATION_HOURS * 3_600_000) return true;
  return (
    booking.confirmedAt !== null &&
    now.getTime() - booking.confirmedAt.getTime() <= GRACE_CANCELLATION_MINUTES * 60_000
  );
}

/** Mirrors public.release_booking_by_customer. */
export function canRelease(booking: CancellableBooking, now: Date = new Date()): boolean {
  return booking.status === 'active' && booking.end.getTime() > now.getTime() && !canCancelWithRefund(booking, now);
}
