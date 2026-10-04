import type { AddonPricingMode, SpaceType } from './types';

export interface PricingSpace {
  type: SpaceType;
  hourlyPrice: number;
  dayPassPrice: number | null;
}

export interface PricingAddon {
  id: string;
  name: string;
  price: number;
  pricingMode: AddonPricingMode;
}

export interface PricingCoupon {
  discountType: 'percent' | 'fixed';
  /** percent: 1–100, fixed: agorot */
  value: number;
}

export interface PricingSettings {
  vatRate: number;
  autoDiscountMinHours: number;
  autoDiscountPercent: number;
}

export interface PricingInput {
  space: PricingSpace;
  durationMinutes: number;
  seats: number;
  isDayPass: boolean;
  addons: PricingAddon[];
  coupon: PricingCoupon | null;
  settings: PricingSettings;
  /** points the customer chose to redeem from (their current balance); 0/undefined = none */
  pointsAvailable?: number;
}

/** Loyalty rules (mirrored in supabase/migrations/0003_customer_portal.sql). */
export const POINTS_BLOCK = 100;
export const POINTS_BLOCK_VALUE = 500;
export const POINTS_MAX_SHARE = 0.5;

/** Largest points discount allowed for a base price: whole ₪5 blocks, capped at 50% of the base. */
export function maxPointsRedemption(base: number, pointsAvailable: number): { points: number; discount: number } {
  const blocksByBalance = Math.floor(Math.max(0, pointsAvailable) / POINTS_BLOCK);
  const blocksByCap = Math.floor((Math.max(0, base) * POINTS_MAX_SHARE) / POINTS_BLOCK_VALUE);
  const blocks = Math.min(blocksByBalance, blocksByCap);
  return { points: blocks * POINTS_BLOCK, discount: blocks * POINTS_BLOCK_VALUE };
}

export function pointsValue(points: number): number {
  return Math.floor(Math.max(0, points) / POINTS_BLOCK) * POINTS_BLOCK_VALUE;
}

export interface AddonLine {
  addonId: string;
  name: string;
  pricingMode: AddonPricingMode;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
}

export interface PriceBreakdown {
  hours: number;
  seats: number;
  base: number;
  autoDiscount: number;
  couponDiscount: number;
  /** the discount the requested points would give (before choosing the best discount) */
  pointsDiscount: number;
  discount: number;
  discountSource: 'auto' | 'coupon' | 'points' | null;
  /** points actually redeemed (only when discountSource === 'points') */
  pointsRedeemed: number;
  addonLines: AddonLine[];
  addonsTotal: number;
  total: number;
  vatIncluded: number;
  /** what the same booking would cost hourly (anchor for the day-pass comparison) */
  hourlyEquivalent: number | null;
}

const AUTO_DISCOUNT_TYPES: SpaceType[] = ['meetingRoom', 'privateOffice'];

/**
 * Single pricing function shared by the browser (live display) and the server (authoritative
 * amount sent to Stripe). All values are integer agorot, VAT-inclusive.
 *
 * Rules: base = hours × hourly × seats (or the fixed day-pass price). Discount = the highest of
 * the automatic long-booking discount, the coupon and a points redemption — never combined — and
 * applies to the base only. Points are spent only when they beat the other discounts (ties keep
 * the coupon/automatic discount, so no points are spent). Add-ons are always full price.
 */
export function calculatePrice(input: PricingInput): PriceBreakdown {
  const { space, durationMinutes, isDayPass, addons, coupon, settings } = input;
  const seats = space.type === 'hotDesk' ? Math.max(1, Math.floor(input.seats)) : 1;
  const hours = durationMinutes / 60;

  const useDayPass = isDayPass && space.type === 'privateOffice' && space.dayPassPrice !== null;
  const hourlyEquivalent = Math.round(space.hourlyPrice * hours) * seats;
  const base = useDayPass ? (space.dayPassPrice as number) : hourlyEquivalent;

  const autoEligible =
    !useDayPass && AUTO_DISCOUNT_TYPES.includes(space.type) && hours >= settings.autoDiscountMinHours;
  const autoDiscount = autoEligible ? Math.round((base * settings.autoDiscountPercent) / 100) : 0;

  let couponDiscount = 0;
  if (coupon) {
    couponDiscount =
      coupon.discountType === 'percent'
        ? Math.round((base * Math.min(100, Math.max(0, coupon.value))) / 100)
        : Math.max(0, coupon.value);
  }
  couponDiscount = Math.min(couponDiscount, base);

  let discount = 0;
  let discountSource: PriceBreakdown['discountSource'] = null;
  if (couponDiscount > 0 || autoDiscount > 0) {
    if (couponDiscount >= autoDiscount) {
      discount = couponDiscount;
      discountSource = 'coupon';
    } else {
      discount = autoDiscount;
      discountSource = 'auto';
    }
  }

  const points = maxPointsRedemption(base, input.pointsAvailable ?? 0);
  let pointsRedeemed = 0;
  if (points.discount > discount) {
    discount = points.discount;
    discountSource = 'points';
    pointsRedeemed = points.points;
  }

  const addonLines: AddonLine[] = addons.map((addon) => {
    const quantity = addon.pricingMode === 'perHour' ? hours : 1;
    return {
      addonId: addon.id,
      name: addon.name,
      pricingMode: addon.pricingMode,
      unitPrice: addon.price,
      quantity,
      lineTotal: Math.round(addon.price * quantity),
    };
  });
  const addonsTotal = addonLines.reduce((sum, line) => sum + line.lineTotal, 0);

  const total = base - discount + addonsTotal;
  const vatIncluded = Math.round((total * settings.vatRate) / (1 + settings.vatRate));

  return {
    hours,
    seats,
    base,
    autoDiscount,
    couponDiscount,
    pointsDiscount: points.discount,
    discount,
    discountSource,
    pointsRedeemed,
    addonLines,
    addonsTotal,
    total,
    vatIncluded,
    hourlyEquivalent: useDayPass ? hourlyEquivalent : null,
  };
}

const ILS = new Intl.NumberFormat('he-IL', {
  style: 'currency',
  currency: 'ILS',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

export function formatIls(agorot: number): string {
  return ILS.format(agorot / 100);
}
