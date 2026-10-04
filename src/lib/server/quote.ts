import 'server-only';
import { SLOT_ERROR_MESSAGES, validateSlotRequest } from '@/lib/domain/booking-rules';
import { calculatePrice, maxPointsRedemption } from '@/lib/domain/pricing';
import type { QuoteRequest } from '@/lib/domain/schemas';
import type { AddonPricingMode } from '@/lib/domain/types';
import { logError } from '@/lib/logger';
import { getOccupancyForDate, isRangeAvailable } from './availability';
import { findValidCoupon } from './coupons';
import { getPointsBalance } from './loyalty';
import { loadPricingSource } from './pricing-source';

/** Serializable, display-only summary. The amount charged is recomputed again inside createCheckout. */
export interface QuoteSummary {
  spaceId: string;
  spaceName: string;
  branchName: string;
  date: string;
  startMinute: number;
  endMinute: number;
  isDayPass: boolean;
  seats: number;
  hours: number;
  base: number;
  discount: number;
  discountSource: 'auto' | 'coupon' | 'points' | null;
  couponCode: string | null;
  /** set when a coupon was entered but another discount was higher */
  couponOutranked: boolean;
  /** customer's redeemable balance (0 for guests) */
  pointsBalance: number;
  /** discount the balance could give on this booking (whole ₪5 blocks, ≤50% of the base) */
  pointsPotentialDiscount: number;
  pointsRedeemed: number;
  /** set when points were requested but the coupon/automatic discount was at least as high */
  pointsOutranked: boolean;
  addonLines: { addonId: string; name: string; pricingMode: AddonPricingMode; quantity: number; lineTotal: number }[];
  total: number;
  vatIncluded: number;
  vatRate: number;
  autoDiscountPercent: number;
  available: boolean;
}

export type QuoteResult =
  | { ok: true; quote: QuoteSummary }
  | { ok: false; code: 'NOT_FOUND' | 'SLOT' | 'ADDON' | 'COUPON' | 'ERROR'; message: string };

export async function buildQuote(req: QuoteRequest, userId: string | null): Promise<QuoteResult> {
  try {
    const source = await loadPricingSource(req.spaceId, req.addonIds);
    if (!source) return { ok: false, code: 'NOT_FOUND', message: 'החלל הזה לא זמין כרגע להזמנה.' };

    const addons = req.addonIds.map((id) => source.addons.find((a) => a.id === id));
    if (addons.some((a) => !a || !a.spaceTypes.includes(source.space.type))) {
      return { ok: false, code: 'ADDON', message: 'אחת התוספות שנבחרו לא זמינה לחלל הזה.' };
    }

    const slot = validateSlotRequest(source.space, source.branch, req);
    if (!slot.ok) return { ok: false, code: 'SLOT', message: SLOT_ERROR_MESSAGES[slot.code] };

    let coupon = null;
    if (req.couponCode) {
      coupon = await findValidCoupon(req.couponCode, userId);
      if (!coupon) return { ok: false, code: 'COUPON', message: 'קוד הקופון לא תקף.' };
    }

    let pointsBalance = 0;
    if (userId) {
      try {
        pointsBalance = await getPointsBalance(userId);
      } catch (error) {
        logError('quote.points', error);
      }
    }

    const price = calculatePrice({
      space: source.space,
      durationMinutes: slot.durationMinutes,
      seats: slot.seats,
      isDayPass: req.isDayPass,
      addons: addons.filter((a): a is NonNullable<typeof a> => Boolean(a)),
      coupon,
      settings: source.settings,
      pointsAvailable: req.usePoints ? pointsBalance : 0,
    });
    const potential = maxPointsRedemption(price.base, pointsBalance);

    let available = true;
    try {
      const occupancy = await getOccupancyForDate([source.space.id], req.date);
      available = isRangeAvailable(source.space, occupancy.get(source.space.id), slot.startMinute, slot.endMinute, slot.seats);
    } catch {
      // Availability is re-checked atomically in the database when the hold is created.
      available = true;
    }

    return {
      ok: true,
      quote: {
        spaceId: source.space.id,
        spaceName: source.space.name,
        branchName: source.branch.name,
        date: req.date,
        startMinute: slot.startMinute,
        endMinute: slot.endMinute,
        isDayPass: req.isDayPass,
        seats: slot.seats,
        hours: price.hours,
        base: price.base,
        discount: price.discount,
        discountSource: price.discountSource,
        couponCode: coupon && price.discountSource === 'coupon' ? coupon.code : null,
        couponOutranked: Boolean(coupon) && price.discountSource !== 'coupon',
        pointsBalance,
        pointsPotentialDiscount: potential.discount,
        pointsRedeemed: price.pointsRedeemed,
        pointsOutranked: Boolean(req.usePoints) && potential.discount > 0 && price.discountSource !== 'points',
        addonLines: price.addonLines.map((l) => ({
          addonId: l.addonId,
          name: l.name,
          pricingMode: l.pricingMode,
          quantity: l.quantity,
          lineTotal: l.lineTotal,
        })),
        total: price.total,
        vatIncluded: price.vatIncluded,
        vatRate: source.settings.vatRate,
        autoDiscountPercent: source.settings.autoDiscountPercent,
        available,
      },
    };
  } catch (error) {
    logError('quote', error, { spaceId: req.spaceId });
    return { ok: false, code: 'ERROR', message: 'לא הצלחנו לחשב את ההזמנה כרגע. נסו שוב בעוד רגע.' };
  }
}
