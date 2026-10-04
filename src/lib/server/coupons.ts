import 'server-only';
import { isConfigured } from '@/lib/env.server';
import { logError } from '@/lib/logger';
import type { PricingCoupon } from '@/lib/domain/pricing';
import { createSupabaseAdminClient } from '@/lib/supabase/server';

export interface ValidCoupon extends PricingCoupon {
  id: string;
  code: string;
}

/** Returns the coupon only if it is active, in its validity window, under its usage cap and (if one-per-user) unused by this user. */
export async function findValidCoupon(code: string, userId: string | null): Promise<ValidCoupon | null> {
  if (!isConfigured.supabase()) return null;
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from('coupons')
    .select('id, code, discount_type, value, valid_from, valid_until, max_uses, used_count, one_per_user, active')
    .eq('code', code)
    .maybeSingle();
  if (error) {
    logError('coupons.lookup', error);
    return null;
  }
  if (!data || !data.active) return null;
  const now = Date.now();
  if (data.valid_from && new Date(data.valid_from).getTime() > now) return null;
  if (data.valid_until && new Date(data.valid_until).getTime() <= now) return null;
  if (data.max_uses !== null && data.used_count >= data.max_uses) return null;

  if (data.one_per_user && userId) {
    const { count, error: countError } = await admin
      .from('coupon_redemptions')
      .select('booking_id', { count: 'exact', head: true })
      .eq('coupon_id', data.id)
      .eq('user_id', userId);
    if (countError) {
      logError('coupons.redemptions', countError);
      return null;
    }
    if ((count ?? 0) > 0) return null;
  }

  return {
    id: data.id,
    code: data.code,
    discountType: data.discount_type as 'percent' | 'fixed',
    value: data.value,
  };
}
