import 'server-only';
import { formatIls } from '@/lib/domain/pricing';
import { formatDateHebrew, formatMinutes, utcToIsrael } from '@/lib/domain/time';
import { SPACE_TYPE_LABELS, type BookingStatus, type SpaceType } from '@/lib/domain/types';
import { logError } from '@/lib/logger';
import { createSupabaseAdminClient } from '@/lib/supabase/server';

export type DiscountSource = 'auto' | 'coupon' | 'points';
export type RefundStatus = 'none' | 'pending' | 'succeeded' | 'failed';

export interface BookingView {
  id: string;
  publicCode: string;
  /** null once the account was deleted (row kept anonymised for tax records) */
  userId: string | null;
  status: BookingStatus;
  spaceId: string;
  spaceName: string;
  spaceType: SpaceType;
  spaceTypeLabel: string;
  branchId: string;
  branchName: string;
  startsAt: Date;
  endsAt: Date;
  /** Israel-local date (YYYY-MM-DD) and minutes of day */
  localDate: string;
  startMinute: number;
  endMinute: number;
  dateLabel: string;
  timeLabel: string;
  seats: number;
  isDayPass: boolean;
  customerEmail: string | null;
  customerName: string | null;
  companyName: string | null;
  companyTaxId: string | null;
  baseAmount: number;
  discountAmount: number;
  discountSource: DiscountSource | null;
  pointsRedeemed: number;
  addonsAmount: number;
  totalAmount: number;
  vatAmount: number;
  addons: { addonId: string; name: string; lineTotal: number }[];
  stripePaymentIntentId: string | null;
  refundStatus: RefundStatus;
  confirmedAt: Date | null;
  cancelledAt: Date | null;
  cancelledBy: 'customer' | 'admin' | 'system' | null;
  releasedAt: Date | null;
  formatted: { base: string; discount: string; addons: string; total: string; vat: string };
}

const SELECT = `id, public_code, user_id, status, space_id, space_name, space_type, branch_id, branch_name,
  starts_at, ends_at, seats, is_day_pass, customer_email, customer_name, company_name, company_tax_id,
  base_amount, discount_amount, discount_source, points_redeemed, addons_amount, total_amount, vat_amount,
  stripe_payment_intent_id, refund_status, confirmed_at, cancelled_at, cancelled_by, released_at,
  booking_addons ( addon_id, name, line_total )`;

interface Row {
  id: string;
  public_code: string;
  user_id: string | null;
  status: BookingStatus;
  space_id: string;
  space_name: string;
  space_type: SpaceType;
  branch_id: string;
  branch_name: string;
  starts_at: string;
  ends_at: string;
  seats: number;
  is_day_pass: boolean;
  customer_email: string | null;
  customer_name: string | null;
  company_name: string | null;
  company_tax_id: string | null;
  base_amount: number;
  discount_amount: number;
  discount_source: DiscountSource | null;
  points_redeemed: number;
  addons_amount: number;
  total_amount: number;
  vat_amount: number;
  stripe_payment_intent_id: string | null;
  refund_status: RefundStatus;
  confirmed_at: string | null;
  cancelled_at: string | null;
  cancelled_by: 'customer' | 'admin' | 'system' | null;
  released_at: string | null;
  booking_addons: { addon_id: string; name: string; line_total: number }[] | null;
}

export function toBookingView(row: Row): BookingView {
  const start = utcToIsrael(row.starts_at);
  const end = utcToIsrael(row.ends_at);
  return {
    id: row.id,
    publicCode: row.public_code,
    userId: row.user_id,
    status: row.status,
    spaceId: row.space_id,
    spaceName: row.space_name,
    spaceType: row.space_type,
    spaceTypeLabel: SPACE_TYPE_LABELS[row.space_type],
    branchId: row.branch_id,
    branchName: row.branch_name,
    startsAt: new Date(row.starts_at),
    endsAt: new Date(row.ends_at),
    localDate: start.date,
    startMinute: start.minutes,
    endMinute: end.minutes === 0 && end.date !== start.date ? 24 * 60 : end.minutes,
    dateLabel: formatDateHebrew(start.date),
    timeLabel: `${formatMinutes(start.minutes)}–${formatMinutes(end.minutes)}`,
    seats: row.seats,
    isDayPass: row.is_day_pass,
    customerEmail: row.customer_email,
    customerName: row.customer_name,
    companyName: row.company_name,
    companyTaxId: row.company_tax_id,
    baseAmount: row.base_amount,
    discountAmount: row.discount_amount,
    discountSource: row.discount_source,
    pointsRedeemed: row.points_redeemed ?? 0,
    addonsAmount: row.addons_amount,
    totalAmount: row.total_amount,
    vatAmount: row.vat_amount,
    addons: (row.booking_addons ?? []).map((a) => ({ addonId: a.addon_id, name: a.name, lineTotal: a.line_total })),
    stripePaymentIntentId: row.stripe_payment_intent_id,
    refundStatus: row.refund_status,
    confirmedAt: row.confirmed_at ? new Date(row.confirmed_at) : null,
    cancelledAt: row.cancelled_at ? new Date(row.cancelled_at) : null,
    cancelledBy: row.cancelled_by,
    releasedAt: row.released_at ? new Date(row.released_at) : null,
    formatted: {
      base: formatIls(row.base_amount),
      discount: formatIls(row.discount_amount),
      addons: formatIls(row.addons_amount),
      total: formatIls(row.total_amount),
      vat: formatIls(row.vat_amount),
    },
  };
}

export function discountLabel(source: DiscountSource | null, pointsRedeemed: number): string {
  if (source === 'coupon') return 'קופון';
  if (source === 'points') return `מימוש ${pointsRedeemed.toLocaleString('he-IL')} נקודות`;
  return 'הזמנה ארוכה';
}

export async function loadBookingView(bookingId: string): Promise<BookingView | null> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.from('bookings').select(SELECT).eq('id', bookingId).maybeSingle();
  if (error) {
    logError('booking-view', error, { bookingId });
    return null;
  }
  return data ? toBookingView(data as unknown as Row) : null;
}

/** Owner-scoped lookup by public code (IDOR-safe: filtered by the signed-in user id). */
export async function loadOwnBookingByCode(publicCode: string, userId: string): Promise<BookingView | null> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from('bookings')
    .select(SELECT)
    .eq('public_code', publicCode)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) {
    logError('booking-view.own', error);
    return null;
  }
  return data ? toBookingView(data as unknown as Row) : null;
}

export const BOOKING_VIEW_SELECT = SELECT;
export type BookingRow = Row;
