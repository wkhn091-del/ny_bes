import 'server-only';
import { timingSafeEqual } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { env, isConfigured } from '@/lib/env.server';
import { logError, logInfo } from '@/lib/logger';
import { BOOKING_VIEW_SELECT, toBookingView, type BookingRow } from '@/lib/notifications/booking-view';
import { sendBookingReminder, sendPointsExpiring } from '@/lib/notifications/email';
import { getStripe } from '@/lib/stripe';
import { createSupabaseAdminClient } from '@/lib/supabase/server';

export const maxDuration = 60;

function authorized(request: NextRequest): boolean {
  const secret = env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get('authorization') ?? '';
  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(header);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/**
 * Called every 5 minutes by Supabase pg_cron (see supabase/migrations/0002_cron.sql):
 * 1. expire lapsed payment holds, 2. close their Stripe sessions so they can no longer be paid,
 * 3. send 2-hour reminders, 4. warn customers 30 days before loyalty points expire.
 * (Earning and expiring the points themselves run inside the database ג€” see 0003_customer_portal.sql.)
 */
export async function POST(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!isConfigured.supabase()) return NextResponse.json({ error: 'not_configured' }, { status: 503 });

  const admin = createSupabaseAdminClient();
  const summary = { expired: 0, sessionsClosed: 0, reminders: 0, pointsReminders: 0 };

  try {
    const { data: expiredCount, error } = await admin.rpc('expire_stale_holds');
    if (error) throw error;
    summary.expired = (expiredCount as number) ?? 0;
  } catch (error) {
    logError('cron.expire', error);
  }

  if (isConfigured.stripe()) {
    const { data: toClose, error } = await admin
      .from('bookings')
      .select('id, stripe_checkout_session_id')
      .eq('status', 'expired')
      .not('stripe_checkout_session_id', 'is', null)
      .is('stripe_session_closed_at', null)
      .limit(50);
    if (error) logError('cron.sessions.query', error);
    for (const row of toClose ?? []) {
      try {
        const session = await getStripe().checkout.sessions.retrieve(row.stripe_checkout_session_id as string);
        if (session.status === 'open') await getStripe().checkout.sessions.expire(session.id);
        await admin.from('bookings').update({ stripe_session_closed_at: new Date().toISOString() }).eq('id', row.id);
        summary.sessionsClosed += 1;
      } catch (err) {
        logError('cron.sessions.expire', err, { bookingId: row.id as string });
      }
    }
  }

  const now = new Date();
  const windowEnd = new Date(now.getTime() + 2 * 3_600_000 + 5 * 60_000);
  const { data: due, error: dueError } = await admin
    .from('bookings')
    .select(BOOKING_VIEW_SELECT)
    .eq('status', 'active')
    .is('reminder_sent_at', null)
    .gt('starts_at', now.toISOString())
    .lte('starts_at', windowEnd.toISOString())
    .limit(50);
  if (dueError) logError('cron.reminders.query', dueError);

  for (const row of (due ?? []) as unknown as BookingRow[]) {
    const { data: claimed } = await admin
      .from('bookings')
      .update({ reminder_sent_at: new Date().toISOString() })
      .eq('id', row.id)
      .is('reminder_sent_at', null)
      .select('id');
    if (!claimed || claimed.length === 0) continue;
    const sent = await sendBookingReminder(toBookingView(row));
    if (sent) summary.reminders += 1;
    else await admin.from('bookings').update({ reminder_sent_at: null }).eq('id', row.id);
  }

  summary.pointsReminders = await remindExpiringPoints(admin, now);

  logInfo('cron.maintenance', 'Run complete', summary);
  return NextResponse.json(summary);
}

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

async function remindExpiringPoints(admin: AdminClient, now: Date): Promise<number> {
  const horizon = new Date(now.getTime() + 30 * 24 * 3_600_000);
  const { data: lots, error } = await admin
    .from('loyalty_ledger')
    .select('id, user_id, remaining, expires_at')
    .eq('kind', 'earn')
    .gt('remaining', 0)
    .is('expiry_reminder_sent_at', null)
    .gt('expires_at', now.toISOString())
    .lte('expires_at', horizon.toISOString())
    .order('expires_at', { ascending: true })
    .limit(200);
  if (error) {
    logError('cron.points.query', error);
    return 0;
  }

  const byUser = new Map<string, { ids: string[]; points: number; expiresAt: string }>();
  for (const lot of lots ?? []) {
    const entry = byUser.get(lot.user_id) ?? { ids: [], points: 0, expiresAt: lot.expires_at as string };
    entry.ids.push(lot.id);
    entry.points += lot.remaining ?? 0;
    byUser.set(lot.user_id, entry);
  }

  let sent = 0;
  for (const [userId, entry] of byUser) {
    const { data: claimed } = await admin
      .from('loyalty_ledger')
      .update({ expiry_reminder_sent_at: new Date().toISOString() })
      .in('id', entry.ids)
      .is('expiry_reminder_sent_at', null)
      .select('id');
    if (!claimed || claimed.length === 0) continue;

    const [{ data: authUser }, { data: profile }] = await Promise.all([
      admin.auth.admin.getUserById(userId),
      admin.from('profiles').select('full_name').eq('id', userId).maybeSingle(),
    ]);
    const email = authUser?.user?.email;
    if (!email) continue;

    const ok = await sendPointsExpiring({
      to: email,
      name: profile?.full_name ?? null,
      points: entry.points,
      expiresAt: new Date(entry.expiresAt),
      idempotencyKey: `points-expiry-${entry.ids[0]}`,
    });
    if (ok) sent += 1;
    else {
      await admin
        .from('loyalty_ledger')
        .update({ expiry_reminder_sent_at: null })
        .in('id', claimed.map((c) => c.id));
    }
  }
  return sent;
}
