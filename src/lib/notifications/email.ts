import 'server-only';
import { render } from '@react-email/render';
import { Resend } from 'resend';
import { getCatalog } from '@/lib/content/catalog';
import { env, isConfigured } from '@/lib/env.server';
import { logError, logInfo } from '@/lib/logger';
import type { BookingView } from './booking-view';
import {
  BookingCancelledEmail,
  BookingConfirmationEmail,
  BookingConflictRefundEmail,
  BookingReleasedEmail,
  BookingReminderEmail,
  PointsExpiringEmail,
  SecurityNoticeEmail,
} from './email-templates';
import { formatDateHebrew, utcToIsrael } from '@/lib/domain/time';
import { buildIcs, googleCalendarUrl, type IcsEvent } from './ics';

let resend: Resend | null = null;

function client(): Resend | null {
  if (!isConfigured.resend()) return null;
  if (!resend) resend = new Resend(env.RESEND_API_KEY);
  return resend;
}

interface SendArgs {
  /** null for anonymised bookings (deleted account) — nothing is sent */
  to: string | null;
  subject: string;
  html: string;
  text: string;
  attachments?: { filename: string; content: string; contentType: string }[];
  idempotencyKey: string;
}

async function send(args: SendArgs): Promise<void> {
  if (!args.to) return;
  const c = client();
  if (!c) {
    logInfo('email', 'Resend not configured — skipping email', { subject: args.subject });
    return;
  }
  const { error } = await c.emails.send(
    {
      from: env.EMAIL_FROM,
      to: [args.to],
      subject: args.subject,
      html: args.html,
      text: args.text,
      attachments: args.attachments?.map((a) => ({
        filename: a.filename,
        content: Buffer.from(a.content, 'utf-8').toString('base64'),
        contentType: a.contentType,
      })),
    },
    { idempotencyKey: args.idempotencyKey },
  );
  if (error) throw new Error(`Resend error: ${error.name}`);
}

async function branchLocation(branchId: string): Promise<{ address: string; phone: string | null; wazeUrl: string | null }> {
  try {
    const catalog = await getCatalog();
    const branch = catalog.branches.find((b) => b.id === branchId);
    return { address: branch?.address ?? '', phone: branch?.phone ?? null, wazeUrl: branch?.wazeUrl ?? null };
  } catch {
    return { address: '', phone: null, wazeUrl: null };
  }
}

function icsEventFor(booking: BookingView, address: string, cancelled = false): IcsEvent {
  return {
    uid: booking.id,
    start: booking.startsAt,
    end: booking.endsAt,
    summary: `SpaceHub — ${booking.spaceName} (${booking.branchName})`,
    description: `מספר הזמנה ${booking.publicCode}. ניהול ההזמנה: ${env.NEXT_PUBLIC_SITE_URL}/account`,
    location: address,
    url: `${env.NEXT_PUBLIC_SITE_URL}/account`,
    cancelled,
    sequence: cancelled ? 1 : 0,
  };
}

export async function sendBookingConfirmation(booking: BookingView): Promise<void> {
  try {
    const { address } = await branchLocation(booking.branchId);
    const event = icsEventFor(booking, address);
    const element = BookingConfirmationEmail({
      booking,
      manageUrl: `${env.NEXT_PUBLIC_SITE_URL}/account`,
      calendarUrl: googleCalendarUrl(event),
    });
    await send({
      to: booking.customerEmail,
      subject: `ההזמנה אושרה: ${booking.spaceName}, ${booking.dateLabel}`,
      html: await render(element),
      text: await render(element, { plainText: true }),
      attachments: [{ filename: `spacehub-${booking.publicCode}.ics`, content: buildIcs(event), contentType: 'text/calendar; charset=utf-8; method=PUBLISH' }],
      idempotencyKey: `confirm-${booking.id}`,
    });
  } catch (error) {
    logError('email.confirmation', error, { bookingId: booking.id });
  }
}

export async function sendBookingCancelled(booking: BookingView, refunded: boolean): Promise<void> {
  try {
    const { address } = await branchLocation(booking.branchId);
    const element = BookingCancelledEmail({ booking, refunded });
    await send({
      to: booking.customerEmail,
      subject: `ההזמנה ${booking.publicCode} בוטלה`,
      html: await render(element),
      text: await render(element, { plainText: true }),
      attachments: [
        { filename: `spacehub-${booking.publicCode}-cancel.ics`, content: buildIcs(icsEventFor(booking, address, true)), contentType: 'text/calendar; charset=utf-8; method=CANCEL' },
      ],
      idempotencyKey: `cancel-${booking.id}`,
    });
  } catch (error) {
    logError('email.cancelled', error, { bookingId: booking.id });
  }
}

export async function sendBookingReleased(booking: BookingView): Promise<void> {
  try {
    const element = BookingReleasedEmail({ booking });
    await send({
      to: booking.customerEmail,
      subject: `שחררת את ${booking.spaceName} — תודה!`,
      html: await render(element),
      text: await render(element, { plainText: true }),
      idempotencyKey: `release-${booking.id}`,
    });
  } catch (error) {
    logError('email.released', error, { bookingId: booking.id });
  }
}

export async function sendBookingReminder(booking: BookingView): Promise<boolean> {
  try {
    const { phone, wazeUrl } = await branchLocation(booking.branchId);
    const element = BookingReminderEmail({ booking, branchPhone: phone, wazeUrl });
    await send({
      to: booking.customerEmail,
      subject: `תזכורת: ${booking.spaceName} היום ב-${booking.timeLabel.split('–')[0]}`,
      html: await render(element),
      text: await render(element, { plainText: true }),
      idempotencyKey: `reminder-${booking.id}`,
    });
    return true;
  } catch (error) {
    logError('email.reminder', error, { bookingId: booking.id });
    return false;
  }
}

export async function sendPointsExpiring(args: {
  to: string;
  name: string | null;
  points: number;
  expiresAt: Date;
  idempotencyKey: string;
}): Promise<boolean> {
  try {
    const expiresLabel = formatDateHebrew(utcToIsrael(args.expiresAt).date);
    const element = PointsExpiringEmail({
      name: args.name,
      points: args.points,
      expiresLabel,
      rewardsUrl: `${env.NEXT_PUBLIC_SITE_URL}/account/rewards`,
    });
    await send({
      to: args.to,
      subject: `${args.points.toLocaleString('he-IL')} נקודות יפוגו ב-${expiresLabel}`,
      html: await render(element),
      text: await render(element, { plainText: true }),
      idempotencyKey: args.idempotencyKey,
    });
    return true;
  } catch (error) {
    logError('email.points-expiring', error);
    return false;
  }
}

/** Account-change alerts (e.g. email/phone changed). Never includes the new value in full. */
export async function sendSecurityNotice(args: { to: string; title: string; body: string; idempotencyKey: string }): Promise<void> {
  try {
    const element = SecurityNoticeEmail({ title: args.title, body: args.body });
    await send({
      to: args.to,
      subject: args.title,
      html: await render(element),
      text: await render(element, { plainText: true }),
      idempotencyKey: args.idempotencyKey,
    });
  } catch (error) {
    logError('email.security', error);
  }
}

export async function sendConflictRefund(booking: BookingView): Promise<void> {
  try {
    const element = BookingConflictRefundEmail({ booking });
    await send({
      to: booking.customerEmail,
      subject: 'לא הצלחנו לשמור את החלל — החזר מלא בדרך',
      html: await render(element),
      text: await render(element, { plainText: true }),
      idempotencyKey: `conflict-${booking.id}`,
    });
  } catch (error) {
    logError('email.conflict', error, { bookingId: booking.id });
  }
}
