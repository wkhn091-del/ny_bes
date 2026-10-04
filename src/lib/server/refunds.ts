import 'server-only';
import { logError } from '@/lib/logger';
import { getStripe } from '@/lib/stripe';
import { createSupabaseAdminClient } from '@/lib/supabase/server';

/**
 * Refunds a booking's payment in full. Idempotent per booking (Stripe idempotency key), so
 * retries and duplicate webhook deliveries never double-refund.
 */
export async function refundBookingPayment(bookingId: string, paymentIntentId: string | null, reason: string): Promise<boolean> {
  const admin = createSupabaseAdminClient();
  if (!paymentIntentId) {
    await admin.from('bookings').update({ refund_status: 'none' }).eq('id', bookingId);
    return false;
  }
  try {
    const refund = await getStripe().refunds.create(
      { payment_intent: paymentIntentId, reason: 'requested_by_customer', metadata: { bookingId, reason } },
      { idempotencyKey: `refund-${bookingId}` },
    );
    await admin
      .from('bookings')
      .update({ refund_status: refund.status === 'failed' ? 'failed' : 'succeeded', stripe_refund_id: refund.id })
      .eq('id', bookingId);
    return refund.status !== 'failed';
  } catch (error) {
    logError('refunds', error, { bookingId });
    await admin.from('bookings').update({ refund_status: 'failed' }).eq('id', bookingId);
    return false;
  }
}
