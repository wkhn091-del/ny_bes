'use server';

import { after } from 'next/server';
import { customAlphabet } from 'nanoid';
import { env, isConfigured } from '@/lib/env.server';
import { logError } from '@/lib/logger';
import { SLOT_ERROR_MESSAGES, validateSlotRequest } from '@/lib/domain/booking-rules';
import { calculatePrice, formatIls } from '@/lib/domain/pricing';
import { checkoutRequestSchema, quoteRequestSchema } from '@/lib/domain/schemas';
import { HOLD_MINUTES, formatDateHebrew, formatMinutes } from '@/lib/domain/time';
import { rateLimit } from '@/lib/security/rate-limit';
import { getClientIp } from '@/lib/security/request-meta';
import { verifyTurnstile } from '@/lib/security/turnstile';
import { getSessionUser, getUserProfile } from '@/lib/server/auth';
import { afterBookingConfirmed, confirmBookingPayment } from '@/lib/server/booking-lifecycle';
import { findValidCoupon } from '@/lib/server/coupons';
import { getPointsBalance } from '@/lib/server/loyalty';
import { loadPricingSource } from '@/lib/server/pricing-source';
import { buildQuote, type QuoteResult } from '@/lib/server/quote';
import { getStripe } from '@/lib/stripe';
import { createSupabaseAdminClient } from '@/lib/supabase/server';

export type CheckoutResult =
  | { ok: true; redirectUrl: string }
  | { ok: false; code: 'AUTH' | 'INVALID' | 'RATE_LIMIT' | 'CAPTCHA' | 'UNAVAILABLE' | 'SLOT' | 'COUPON' | 'POINTS' | 'ERROR'; message: string };

const publicCode = customAlphabet('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 8);
const STRIPE_MIN_ILS_AGOROT = 200;
const STRIPE_SESSION_MINUTES = 30;

const GENERIC_ERROR = 'משהו השתבש. נסו שוב בעוד רגע או פנו אלינו בוואטסאפ.';

const DB_ERROR_CODES = [
  'SPACE_NOT_FOUND',
  'BRANCH_NOT_FOUND',
  'MULTI_DAY',
  'MISALIGNED',
  'TOO_SHORT',
  'IN_PAST',
  'TOO_FAR',
  'BRANCH_CLOSED',
  'OUTSIDE_HOURS',
  'DAY_PASS_NOT_ALLOWED',
  'INVALID_SEATS',
  'CAPACITY_EXCEEDED',
  'SLOT_TAKEN',
  'COUPON_INVALID',
  'POINTS_INSUFFICIENT',
  'POINTS_INVALID',
] as const;

function mapDbError(message: string): CheckoutResult {
  const code = DB_ERROR_CODES.find((c) => message.includes(c));
  if (code === 'COUPON_INVALID') return { ok: false, code: 'COUPON', message: 'קוד הקופון כבר לא בתוקף.' };
  if (code === 'POINTS_INSUFFICIENT' || code === 'POINTS_INVALID') {
    return { ok: false, code: 'POINTS', message: 'יתרת הנקודות השתנתה. רעננו את העמוד ונסו שוב.' };
  }
  if (code === 'SPACE_NOT_FOUND' || code === 'BRANCH_NOT_FOUND') {
    return { ok: false, code: 'UNAVAILABLE', message: 'החלל הזה לא זמין כרגע להזמנה.' };
  }
  if (code && code in SLOT_ERROR_MESSAGES) {
    return { ok: false, code: 'SLOT', message: SLOT_ERROR_MESSAGES[code as keyof typeof SLOT_ERROR_MESSAGES] };
  }
  if (code === 'MULTI_DAY') return { ok: false, code: 'SLOT', message: SLOT_ERROR_MESSAGES.OUTSIDE_HOURS };
  return { ok: false, code: 'ERROR', message: GENERIC_ERROR };
}

export async function createCheckout(input: unknown): Promise<CheckoutResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, code: 'AUTH', message: 'כדי להזמין צריך להתחבר.' };

  const parsed = checkoutRequestSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: 'INVALID', message: 'חלק מהפרטים שנשלחו אינם תקינים.' };
  const req = parsed.data;

  const ip = await getClientIp();
  const [userOk, ipOk] = await Promise.all([rateLimit('checkout', `u:${user.id}`), rateLimit('checkout', `ip:${ip}`)]);
  if (!userOk || !ipOk) return { ok: false, code: 'RATE_LIMIT', message: 'יותר מדי ניסיונות. נסו שוב בעוד כמה דקות.' };

  if (!(await verifyTurnstile(req.turnstileToken, ip, 'checkout'))) {
    return { ok: false, code: 'CAPTCHA', message: 'אימות האבטחה נכשל. רעננו את העמוד ונסו שוב.' };
  }

  if (!isConfigured.supabase() || !isConfigured.stripe()) {
    return { ok: false, code: 'UNAVAILABLE', message: 'מערכת התשלומים עדיין לא מחוברת בסביבה הזו.' };
  }

  try {
    const source = await loadPricingSource(req.spaceId, req.addonIds);
    if (!source) return { ok: false, code: 'UNAVAILABLE', message: 'החלל הזה לא זמין כרגע להזמנה.' };

    const addons = req.addonIds.map((id) => source.addons.find((a) => a.id === id));
    if (addons.some((a) => !a || !a.spaceTypes.includes(source.space.type))) {
      return { ok: false, code: 'INVALID', message: 'אחת התוספות שנבחרו לא זמינה לחלל הזה.' };
    }

    const slot = validateSlotRequest(source.space, source.branch, {
      date: req.date,
      startMinute: req.startMinute,
      endMinute: req.endMinute,
      seats: req.seats,
      isDayPass: req.isDayPass,
    });
    if (!slot.ok) return { ok: false, code: 'SLOT', message: SLOT_ERROR_MESSAGES[slot.code] };

    let coupon = null;
    if (req.couponCode) {
      coupon = await findValidCoupon(req.couponCode, user.id);
      if (!coupon) return { ok: false, code: 'COUPON', message: 'קוד הקופון לא תקף.' };
    }

    const pointsBalance = req.usePoints ? await getPointsBalance(user.id) : 0;

    const price = calculatePrice({
      space: source.space,
      durationMinutes: slot.durationMinutes,
      seats: slot.seats,
      isDayPass: req.isDayPass,
      addons: addons.filter((a): a is NonNullable<typeof a> => Boolean(a)),
      coupon,
      settings: source.settings,
      pointsAvailable: pointsBalance,
    });

    if (price.total > 0 && price.total < STRIPE_MIN_ILS_AGOROT) {
      return { ok: false, code: 'INVALID', message: 'סכום ההזמנה נמוך מהמינימום לתשלום בכרטיס. פנו אלינו בוואטסאפ.' };
    }

    const profile = await getUserProfile(user.id);
    const admin = createSupabaseAdminClient();
    const code = publicCode();

    const { data: holdRows, error: holdError } = await admin.rpc('create_booking_hold', {
      p_user_id: user.id,
      p_space_id: source.space.id,
      p_start: slot.start.toISOString(),
      p_end: slot.end.toISOString(),
      p_seats: slot.seats,
      p_is_day_pass: req.isDayPass,
      p_base_amount: price.base,
      p_discount_amount: price.discount,
      p_discount_source: price.discountSource,
      p_addons_amount: price.addonsTotal,
      p_total_amount: price.total,
      p_vat_amount: price.vatIncluded,
      p_vat_rate: source.settings.vatRate,
      p_coupon_id: price.discountSource === 'coupon' && coupon ? coupon.id : null,
      p_company_name: req.companyName ?? null,
      p_company_tax_id: req.companyTaxId ?? null,
      p_customer_email: user.email,
      p_customer_name: profile?.fullName ?? null,
      p_addons: price.addonLines.map((l) => ({
        addon_id: l.addonId,
        name: l.name,
        pricing_mode: l.pricingMode,
        unit_price: l.unitPrice,
        quantity: Number(l.quantity.toFixed(2)),
        line_total: l.lineTotal,
      })),
      p_public_code: code,
      p_hold_minutes: HOLD_MINUTES,
      p_points_redeem: price.pointsRedeemed,
    });

    if (holdError) {
      const mapped = mapDbError(holdError.message ?? '');
      if (mapped.ok === false && mapped.code === 'ERROR') logError('checkout.hold', holdError, { spaceId: source.space.id });
      return mapped;
    }

    const hold = (holdRows as { booking_id: string; public_code: string }[] | null)?.[0];
    if (!hold) {
      logError('checkout.hold', new Error('Hold returned no row'), { spaceId: source.space.id });
      return { ok: false, code: 'ERROR', message: GENERIC_ERROR };
    }

    const successUrl = `${env.NEXT_PUBLIC_SITE_URL}/checkout/success?booking=${hold.public_code}`;

    if (price.total === 0) {
      const result = await confirmBookingPayment(hold.booking_id, null, null);
      if (result === 'confirmed') after(() => afterBookingConfirmed(hold.booking_id));
      return { ok: true, redirectUrl: successUrl };
    }

    const timeLabel = req.isDayPass
      ? `יום שלם ${formatMinutes(slot.startMinute)}–${formatMinutes(slot.endMinute)}`
      : `${formatMinutes(slot.startMinute)}–${formatMinutes(slot.endMinute)}`;

    try {
      const session = await getStripe().checkout.sessions.create(
        {
          mode: 'payment',
          currency: 'ils',
          customer_email: user.email || undefined,
          client_reference_id: hold.booking_id,
          line_items: [
            {
              quantity: 1,
              price_data: {
                currency: 'ils',
                unit_amount: price.total,
                product_data: {
                  name: `${source.space.name} · ${source.branch.name}`,
                  description: `${formatDateHebrew(req.date)} · ${timeLabel} · כולל מע״מ ${formatIls(price.vatIncluded)}`,
                },
              },
            },
          ],
          metadata: { bookingId: hold.booking_id, publicCode: hold.public_code },
          payment_intent_data: { metadata: { bookingId: hold.booking_id, publicCode: hold.public_code } },
          expires_at: Math.floor(Date.now() / 1000) + STRIPE_SESSION_MINUTES * 60,
          success_url: successUrl,
          cancel_url: `${env.NEXT_PUBLIC_SITE_URL}/checkout/cancelled?booking=${hold.public_code}`,
        },
        { idempotencyKey: `checkout-${hold.booking_id}` },
      );

      const { error: updateError } = await admin
        .from('bookings')
        .update({ stripe_checkout_session_id: session.id })
        .eq('id', hold.booking_id)
        .eq('status', 'pending_payment');
      if (updateError || !session.url) throw updateError ?? new Error('Stripe session missing url');

      return { ok: true, redirectUrl: session.url };
    } catch (error) {
      logError('checkout.stripe', error, { bookingId: hold.booking_id });
      await admin.from('bookings').update({ status: 'expired' }).eq('id', hold.booking_id).eq('status', 'pending_payment');
      return { ok: false, code: 'ERROR', message: GENERIC_ERROR };
    }
  } catch (error) {
    logError('checkout', error);
    return { ok: false, code: 'ERROR', message: GENERIC_ERROR };
  }
}

/** Server-computed quote for the checkout summary (e.g. after entering a coupon). Display only. */
export async function quoteCheckout(input: unknown): Promise<QuoteResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, code: 'ERROR', message: 'כדי להזמין צריך להתחבר.' };
  const parsed = quoteRequestSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: 'ERROR', message: 'חלק מהפרטים שנשלחו אינם תקינים.' };
  if (!(await rateLimit('bookingMutation', `quote:${user.id}`))) {
    return { ok: false, code: 'ERROR', message: 'יותר מדי ניסיונות. נסו שוב בעוד כמה דקות.' };
  }
  return buildQuote(parsed.data, user.id);
}
