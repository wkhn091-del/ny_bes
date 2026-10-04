'use server';

import { revalidatePath } from 'next/cache';
import { after } from 'next/server';
import { z } from 'zod';
import { couponCodeSchema } from '@/lib/domain/schemas';
import { isConfigured } from '@/lib/env.server';
import { logError, logInfo } from '@/lib/logger';
import { sendBookingCancelled } from '@/lib/notifications/email';
import { loadBookingView } from '@/lib/notifications/booking-view';
import { notifyBranchStaff } from '@/lib/notifications/telegram';
import { rateLimit } from '@/lib/security/rate-limit';
import { getStaffContext, staffCanAccessBranch, type StaffContext } from '@/lib/server/auth';
import { refundBookingPayment } from '@/lib/server/refunds';
import { getStripe } from '@/lib/stripe';
import { createSupabaseAdminClient } from '@/lib/supabase/server';

export type AdminResult = { ok: true; message?: string } | { ok: false; message: string };

const GENERIC = 'הפעולה נכשלה. נסו שוב בעוד רגע.';
const FORBIDDEN = 'אין לך הרשאה לפעולה הזו.';

async function staffGuard(): Promise<{ staff: StaffContext } | { error: AdminResult }> {
  if (!isConfigured.supabase()) return { error: { ok: false, message: GENERIC } };
  const staff = await getStaffContext();
  if (!staff) return { error: { ok: false, message: FORBIDDEN } };
  if (!(await rateLimit('admin', staff.user.id))) {
    return { error: { ok: false, message: 'יותר מדי פעולות. נסו שוב בעוד דקה.' } };
  }
  return { staff };
}

async function loadScopedBooking(staff: StaffContext, bookingId: string) {
  const { data, error } = await createSupabaseAdminClient()
    .from('bookings')
    .select('id, branch_id, status, total_amount, stripe_payment_intent_id, stripe_checkout_session_id, starts_at, ends_at')
    .eq('id', bookingId)
    .maybeSingle();
  if (error) {
    logError('admin.booking.lookup', error, { bookingId });
    return { found: false as const, error: GENERIC };
  }
  if (!data || !staffCanAccessBranch(staff, data.branch_id)) return { found: false as const, error: FORBIDDEN };
  return { found: true as const, booking: data };
}

const bookingIdInput = z.object({ bookingId: z.uuid() });

export async function checkInBooking(input: unknown): Promise<AdminResult> {
  const guard = await staffGuard();
  if ('error' in guard) return guard.error;
  const parsed = bookingIdInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: GENERIC };

  const found = await loadScopedBooking(guard.staff, parsed.data.bookingId);
  if (!found.found) return { ok: false, message: found.error };
  if (found.booking.status !== 'active') return { ok: false, message: 'אפשר לסמן הגעה רק בהזמנה פעילה.' };

  const { error } = await createSupabaseAdminClient()
    .from('bookings')
    .update({ checked_in_at: new Date().toISOString(), checked_in_by: guard.staff.user.id })
    .eq('id', found.booking.id)
    .eq('status', 'active')
    .is('checked_in_at', null);
  if (error) {
    logError('admin.checkin', error, { bookingId: found.booking.id });
    return { ok: false, message: GENERIC };
  }
  revalidatePath('/admin');
  return { ok: true, message: 'ההגעה סומנה.' };
}

const cancelInput = z.object({
  bookingId: z.uuid(),
  reason: z.string().trim().min(3).max(300),
});

export async function emergencyCancelBooking(input: unknown): Promise<AdminResult> {
  const guard = await staffGuard();
  if ('error' in guard) return guard.error;
  const parsed = cancelInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: 'יש לציין סיבת ביטול (3–300 תווים).' };

  const found = await loadScopedBooking(guard.staff, parsed.data.bookingId);
  if (!found.found) return { ok: false, message: found.error };
  const { booking } = found;
  if (booking.status !== 'active' && booking.status !== 'pending_payment') {
    return { ok: false, message: 'ההזמנה כבר אינה פעילה.' };
  }

  if (booking.status === 'pending_payment' && booking.stripe_checkout_session_id && isConfigured.stripe()) {
    try {
      const session = await getStripe().checkout.sessions.retrieve(booking.stripe_checkout_session_id);
      if (session.status === 'open') await getStripe().checkout.sessions.expire(session.id);
    } catch (error) {
      logError('admin.cancel.stripe-session', error, { bookingId: booking.id });
      return { ok: false, message: GENERIC };
    }
  }

  const wasPaid = booking.status === 'active' && booking.total_amount > 0;
  const { data: updated, error } = await createSupabaseAdminClient()
    .from('bookings')
    .update({
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
      cancelled_by: 'admin',
      refund_status: wasPaid ? 'pending' : 'none',
    })
    .eq('id', booking.id)
    .in('status', ['active', 'pending_payment'])
    .select('id')
    .maybeSingle();
  if (error || !updated) {
    if (error) logError('admin.cancel', error, { bookingId: booking.id });
    return { ok: false, message: error ? GENERIC : 'ההזמנה כבר עודכנה על ידי מישהו אחר.' };
  }

  logInfo('admin.cancel', 'Booking cancelled by staff', {
    bookingId: booking.id,
    staffId: guard.staff.user.id,
    reason: parsed.data.reason,
  });

  let refunded = false;
  if (wasPaid) refunded = await refundBookingPayment(booking.id, booking.stripe_payment_intent_id, `admin: ${parsed.data.reason}`);

  after(async () => {
    const view = await loadBookingView(booking.id);
    if (!view) return;
    if (wasPaid || booking.status === 'active') await sendBookingCancelled(view, refunded);
    await notifyBranchStaff('admin_cancelled', view);
  });

  revalidatePath('/admin');
  if (wasPaid && !refunded) return { ok: true, message: 'ההזמנה בוטלה, אבל ההחזר נכשל — יש לבצע החזר ידני ב-Stripe.' };
  return { ok: true, message: wasPaid ? 'ההזמנה בוטלה וההחזר בוצע.' : 'ההזמנה בוטלה.' };
}

const couponInput = z
  .object({
    code: couponCodeSchema,
    discountType: z.enum(['percent', 'fixed']),
    value: z.number().int().positive().max(100000),
    validUntil: z.union([z.iso.date(), z.literal('')]).optional(),
    maxUses: z.number().int().positive().max(100000).nullable(),
    onePerUser: z.boolean(),
  })
  .refine((v) => v.discountType !== 'percent' || v.value <= 100, 'Percent must be ≤ 100');

export async function createCoupon(input: unknown): Promise<AdminResult> {
  const guard = await staffGuard();
  if ('error' in guard) return guard.error;
  if (guard.staff.role !== 'super_admin') return { ok: false, message: FORBIDDEN };
  const parsed = couponInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: 'פרטי הקופון אינם תקינים.' };
  const c = parsed.data;

  const { error } = await createSupabaseAdminClient()
    .from('coupons')
    .insert({
      code: c.code,
      discount_type: c.discountType,
      // fixed coupons are entered in shekels, stored in agorot
      value: c.discountType === 'fixed' ? c.value * 100 : c.value,
      valid_until: c.validUntil ? new Date(`${c.validUntil}T23:59:59+03:00`).toISOString() : null,
      max_uses: c.maxUses,
      one_per_user: c.onePerUser,
      created_by: guard.staff.user.id,
    });
  if (error) {
    if (error.code === '23505') return { ok: false, message: 'קוד הקופון כבר קיים.' };
    logError('admin.coupon.create', error);
    return { ok: false, message: GENERIC };
  }
  revalidatePath('/admin/coupons');
  return { ok: true, message: `הקופון ${c.code} נוצר.` };
}

const toggleInput = z.object({ couponId: z.uuid(), active: z.boolean() });

export async function setCouponActive(input: unknown): Promise<AdminResult> {
  const guard = await staffGuard();
  if ('error' in guard) return guard.error;
  if (guard.staff.role !== 'super_admin') return { ok: false, message: FORBIDDEN };
  const parsed = toggleInput.safeParse(input);
  if (!parsed.success) return { ok: false, message: GENERIC };

  const { error } = await createSupabaseAdminClient()
    .from('coupons')
    .update({ active: parsed.data.active })
    .eq('id', parsed.data.couponId);
  if (error) {
    logError('admin.coupon.toggle', error);
    return { ok: false, message: GENERIC };
  }
  revalidatePath('/admin/coupons');
  return { ok: true };
}
