'use server';

import { revalidatePath } from 'next/cache';
import { after } from 'next/server';
import { publicCodeSchema } from '@/lib/domain/schemas';
import { isConfigured } from '@/lib/env.server';
import { logError } from '@/lib/logger';
import { loadBookingView, loadOwnBookingByCode } from '@/lib/notifications/booking-view';
import { sendBookingCancelled, sendBookingReleased } from '@/lib/notifications/email';
import { notifyBranchStaff } from '@/lib/notifications/telegram';
import { rateLimit } from '@/lib/security/rate-limit';
import { getSessionUser } from '@/lib/server/auth';
import { syncCustomerCard } from '@/lib/server/customer-sync';
import { refundBookingPayment } from '@/lib/server/refunds';
import { getStripe } from '@/lib/stripe';
import { createSupabaseAdminClient } from '@/lib/supabase/server';

export type SimpleResult = { ok: true } | { ok: false; message: string };
export type MutationResult = { ok: true; message: string } | { ok: false; message: string };

const GENERIC = 'לא הצלחנו לבצע את הפעולה. נסו שוב בעוד רגע.';

/**
 * Releases the caller's own unpaid hold after they backed out of Stripe, so the slot (and their
 * ability to rebook it) frees immediately instead of waiting for the hold to expire.
 */
export async function abandonCheckout(input: unknown): Promise<SimpleResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, message: 'נדרשת התחברות.' };
  const parsed = publicCodeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: GENERIC };
  if (!isConfigured.supabase()) return { ok: false, message: GENERIC };
  if (!(await rateLimit('bookingMutation', `abandon:${user.id}`))) {
    return { ok: false, message: 'יותר מדי ניסיונות. נסו שוב בעוד כמה דקות.' };
  }

  const admin = createSupabaseAdminClient();
  const { data: booking, error } = await admin
    .from('bookings')
    .select('id, status, stripe_checkout_session_id')
    .eq('public_code', parsed.data)
    .eq('user_id', user.id)
    .maybeSingle();
  if (error) {
    logError('bookings.abandon.lookup', error);
    return { ok: false, message: GENERIC };
  }
  if (!booking || booking.status !== 'pending_payment') return { ok: true };

  if (booking.stripe_checkout_session_id && isConfigured.stripe()) {
    try {
      const session = await getStripe().checkout.sessions.retrieve(booking.stripe_checkout_session_id);
      if (session.status === 'complete') return { ok: true };
      if (session.status === 'open') await getStripe().checkout.sessions.expire(session.id);
    } catch (stripeError) {
      // If the session cannot be closed we must not release the slot: a payment could still land.
      logError('bookings.abandon.stripe', stripeError, { bookingId: booking.id });
      return { ok: false, message: GENERIC };
    }
  }

  const { error: updateError } = await admin
    .from('bookings')
    .update({ status: 'expired', stripe_session_closed_at: new Date().toISOString() })
    .eq('id', booking.id)
    .eq('user_id', user.id)
    .eq('status', 'pending_payment');
  if (updateError) {
    logError('bookings.abandon.update', updateError, { bookingId: booking.id });
    return { ok: false, message: GENERIC };
  }
  return { ok: true };
}

async function guardOwnMutation(input: unknown, action: string) {
  const user = await getSessionUser();
  if (!user) return { error: 'נדרשת התחברות.' } as const;
  const parsed = publicCodeSchema.safeParse(input);
  if (!parsed.success || !isConfigured.supabase()) return { error: GENERIC } as const;
  if (!(await rateLimit('bookingMutation', `${action}:${user.id}`))) {
    return { error: 'יותר מדי ניסיונות. נסו שוב בעוד כמה דקות.' } as const;
  }
  // Owner-scoped lookup: the code alone never grants access to someone else's booking.
  const booking = await loadOwnBookingByCode(parsed.data, user.id);
  if (!booking) return { error: 'ההזמנה לא נמצאה.' } as const;
  return { user, booking } as const;
}

/** Free cancellation (≥24h before start, or within 5 minutes of booking): full refund, points restored. */
export async function cancelMyBooking(input: unknown): Promise<MutationResult> {
  const guard = await guardOwnMutation(input, 'cancel');
  if ('error' in guard) return { ok: false, message: guard.error ?? GENERIC };
  const { user, booking } = guard;

  const { data, error } = await createSupabaseAdminClient().rpc('cancel_booking_by_customer', {
    p_booking_id: booking.id,
    p_user_id: user.id,
  });
  if (error) {
    logError('bookings.cancel', error, { bookingId: booking.id });
    return { ok: false, message: GENERIC };
  }
  const row = (data as { id: string; total_amount: number; stripe_payment_intent_id: string | null }[] | null)?.[0];
  if (!row) {
    return { ok: false, message: 'כבר לא ניתן לבטל את ההזמנה עם החזר. אפשר לשחרר אותה כדי לפנות את החלל לאחרים.' };
  }

  let refunded = false;
  if (row.total_amount > 0) refunded = await refundBookingPayment(row.id, row.stripe_payment_intent_id, 'customer_cancel');

  after(async () => {
    const view = await loadBookingView(row.id);
    if (view) await Promise.allSettled([sendBookingCancelled(view, refunded), notifyBranchStaff('cancelled', view)]);
    await syncCustomerCard(user.id);
  });

  revalidatePath('/account', 'layout');
  if (row.total_amount > 0 && !refunded) {
    return { ok: true, message: 'ההזמנה בוטלה. ההחזר יטופל ידנית על ידי הצוות בימים הקרובים.' };
  }
  return { ok: true, message: row.total_amount > 0 ? 'ההזמנה בוטלה וההחזר בדרך לכרטיס.' : 'ההזמנה בוטלה.' };
}

/** Late cancellation: no refund, but the space returns to inventory for others. */
export async function releaseMyBooking(input: unknown): Promise<MutationResult> {
  const guard = await guardOwnMutation(input, 'release');
  if ('error' in guard) return { ok: false, message: guard.error ?? GENERIC };
  const { user, booking } = guard;

  const { data, error } = await createSupabaseAdminClient().rpc('release_booking_by_customer', {
    p_booking_id: booking.id,
    p_user_id: user.id,
  });
  if (error) {
    logError('bookings.release', error, { bookingId: booking.id });
    return { ok: false, message: GENERIC };
  }
  const row = (data as { id: string }[] | null)?.[0];
  if (!row) return { ok: false, message: 'לא ניתן לשחרר את ההזמנה הזו.' };

  after(async () => {
    const view = await loadBookingView(row.id);
    if (view) await Promise.allSettled([sendBookingReleased(view), notifyBranchStaff('released', view)]);
  });

  revalidatePath('/account', 'layout');
  return { ok: true, message: 'החלל שוחרר. תודה שפיניתם אותו לאחרים!' };
}
