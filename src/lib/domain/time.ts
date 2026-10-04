import { TZDate } from '@date-fns/tz';
import type { Branch, DayHours } from './types';

export const TIME_ZONE = 'Asia/Jerusalem';
export const SLOT_MINUTES = 30;
export const MIN_BOOKING_MINUTES = 60;
export const BOOKING_WINDOW_DAYS = 60;
export const HOLD_MINUTES = 15;

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const HHMM_RE = /^([01]\d|2[0-3]):([03]0)$/;

export function isValidDateString(value: string): boolean {
  const m = DATE_RE.exec(value);
  if (!m) return false;
  const [, y, mo, d] = m.map(Number) as [number, number, number, number];
  const probe = new Date(Date.UTC(y, mo - 1, d));
  return probe.getUTCFullYear() === y && probe.getUTCMonth() === mo - 1 && probe.getUTCDate() === d;
}

export function parseHHMM(value: string): number {
  const m = HHMM_RE.exec(value);
  if (!m) throw new Error(`Invalid HH:MM value: ${value}`);
  return Number(m[1]) * 60 + Number(m[2]);
}

export function isValidHHMM(value: string): boolean {
  return HHMM_RE.test(value);
}

export function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Day of week (0 = Sunday) for a calendar date, independent of the runtime time zone. */
export function dayOfWeek(date: string): number {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay();
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const t = new Date(Date.UTC(y, m - 1, d + days, 12));
  return t.toISOString().slice(0, 10);
}

/** Current calendar date and minute-of-day in Israel. */
export function nowInIsrael(now: Date = new Date()): { date: string; minutes: number } {
  const z = new TZDate(now.getTime(), TIME_ZONE);
  const date = `${z.getFullYear()}-${String(z.getMonth() + 1).padStart(2, '0')}-${String(z.getDate()).padStart(2, '0')}`;
  return { date, minutes: z.getHours() * 60 + z.getMinutes() };
}

/** Converts an Israel-local date + minute-of-day to an absolute instant (handles DST). */
export function israelToUtc(date: string, minutes: number): Date {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const z = new TZDate(y, m - 1, d, Math.floor(minutes / 60), minutes % 60, 0, TIME_ZONE);
  return new Date(z.getTime());
}

export function utcToIsrael(instant: Date | string): { date: string; minutes: number } {
  const t = typeof instant === 'string' ? new Date(instant) : instant;
  return nowInIsrael(t);
}

export function hoursForDate(hours: DayHours[], date: string): { open: number; close: number } | null {
  const dow = dayOfWeek(date);
  const entry = hours.find((h) => h.day === dow);
  if (!entry || entry.closed) return null;
  const open = parseHHMM(entry.open);
  const close = parseHHMM(entry.close);
  if (close - open < MIN_BOOKING_MINUTES) return null;
  return { open, close };
}

export function maxBookableDate(now: Date = new Date()): string {
  return addDays(nowInIsrael(now).date, BOOKING_WINDOW_DAYS);
}

/** All 30-minute slot starts for a branch on a date, excluding slots already in the past. */
export function slotStartsForDate(branch: Pick<Branch, 'hours'>, date: string, now: Date = new Date()): number[] {
  const window = hoursForDate(branch.hours, date);
  if (!window) return [];
  const { date: today, minutes: nowMinutes } = nowInIsrael(now);
  if (date < today || date > maxBookableDate(now)) return [];
  const slots: number[] = [];
  for (let m = window.open; m + SLOT_MINUTES <= window.close; m += SLOT_MINUTES) {
    if (date === today && m <= nowMinutes) continue;
    slots.push(m);
  }
  return slots;
}

/** First date from today on which the branch still has a bookable slot. */
export function nextOpenDate(branch: Pick<Branch, 'hours'>, now: Date = new Date()): string {
  const today = nowInIsrael(now).date;
  for (let i = 0; i <= BOOKING_WINDOW_DAYS; i += 1) {
    const candidate = addDays(today, i);
    const slots = slotStartsForDate(branch, candidate, now);
    if (slots.length >= MIN_BOOKING_MINUTES / SLOT_MINUTES) return candidate;
  }
  return today;
}

const HEBREW_DATE = new Intl.DateTimeFormat('he-IL', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
});

const HEBREW_DATE_SHORT = new Intl.DateTimeFormat('he-IL', {
  weekday: 'short',
  day: 'numeric',
  month: 'numeric',
  timeZone: 'UTC',
});

export function formatDateHebrew(date: string, short = false): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const t = new Date(Date.UTC(y, m - 1, d, 12));
  return (short ? HEBREW_DATE_SHORT : HEBREW_DATE).format(t);
}

const HEBREW_WEEKDAY_SHORT = new Intl.DateTimeFormat('he-IL', { weekday: 'short', timeZone: 'UTC' });

/** Short weekday label without the "יום" prefix: "א׳" … "ו׳", "שבת". */
export function formatWeekdayShort(date: string): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return HEBREW_WEEKDAY_SHORT.format(new Date(Date.UTC(y, m - 1, d, 12))).replace(/^יום\s+/, '');
}

export const HEBREW_DAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'] as const;
