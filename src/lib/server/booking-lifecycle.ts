import 'server-only';
import { logError } from '@/lib/logger';
import { loadBookingView } from '@/lib/notifications/booking-view';
import { sendBookingConfirmation, sendConflictRefund } from '@/lib/notifications/email';
import { notifyBranchStaff } from '@/lib/notifications/telegram';
import { createSupabaseAdminClient } from '@/lib/supabase/server';
import { syncCustomerCard } from './customer-sync';
import { refundBookingPayment } from './refunds';

export type ConfirmResult = 'confirmed' | 'already' | 'conflict' | 'not_found';

export async function confirmBookingPayment(
  bookingId: string,
  sessionId: string | null,
  paymentIntentId: string | null,
): Promise<ConfirmResult> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc('confirm_booking_payment', {
    p_booking_id: bookingId,
    p_session_id: sessionId,
    p_payment_intent: paymentIntentId,
  });
  if (error) {
    logError('lifecycle.confirm', error, { bookingId });
    throw new Error('Confirm failed');
  }
  return data as ConfirmResult;
}

/** Side effects after a booking becomes active. Only the single caller that received 'confirmed' runs this. */
export async function afterBookingConfirmed(bookingId: string): Promise<void> {
  const booking = await loadBookingView(bookingId);
  if (!booking) return;
  await Promise.allSettled([
    sendBookingConfirmation(booking),
    notifyBranchStaff('new', booking),
    booking.userId ? syncCustomerCard(booking.userId) : Promise.resolve(),
  ]);
}

/** Payment arrived after the hold lapsed and the slot was taken: refund in full and tell the customer. */
export async function handleConfirmConflict(bookingId: string, paymentIntentId: string | null): Promise<void> {
  try {
    const admin = createSupabaseAdminClient();
    await admin
      .from('bookings')
      .update({ status: 'expired', stripe_payment_intent_id: paymentIntentId, refund_status: 'pending' })
      .eq('id', bookingId)
      .neq('status', 'active');
    await refundBookingPayment(bookingId, paymentIntentId, 'slot_conflict_after_hold');
    const booking = await loadBookingView(bookingId);
    if (booking) await sendConflictRefund(booking);
  } catch (error) {
    logError('lifecycle.conflict', error, { bookingId });
  }
}
