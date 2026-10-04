import { timingSafeEqual } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { getCatalog } from '@/lib/content/catalog';
import { addDays, israelToUtc, isValidDateString } from '@/lib/domain/time';
import { BOOKING_STATUS_LABELS } from '@/lib/domain/types';
import { env, isConfigured } from '@/lib/env.server';
import { toCsv, type CsvColumn } from '@/lib/export/csv';
import { logError } from '@/lib/logger';
import { BOOKING_VIEW_SELECT, toBookingView, type BookingRow, type BookingView } from '@/lib/notifications/booking-view';
import { rateLimit } from '@/lib/security/rate-limit';
import { getClientIpFromRequest } from '@/lib/security/request-meta';
import { getStaffContext, staffCanAccessBranch, type StaffContext } from '@/lib/server/auth';
import { createSupabaseAdminClient } from '@/lib/supabase/server';

const MAX_RANGE_DAYS = 92;
const MAX_ROWS = 5000;

const querySchema = z.object({
  from: z.string().refine(isValidDateString),
  to: z.string().refine(isValidDateString),
  branch: z
    .string()
    .regex(/^[a-z0-9-]{1,96}$/)
    .optional(),
});

const REFUND_LABELS: Record<BookingView['refundStatus'], string> = {
  none: '',
  pending: 'בתהליך',
  succeeded: 'הוחזר',
  failed: 'נכשל',
};

const COLUMNS: CsvColumn<BookingView>[] = [
  { header: 'קוד הזמנה', value: (b) => b.publicCode, ltr: true },
  { header: 'תאריך', value: (b) => b.localDate, ltr: true },
  { header: 'שעות', value: (b) => (b.isDayPass ? `יום שלם ${b.timeLabel}` : b.timeLabel), ltr: true },
  { header: 'סניף', value: (b) => b.branchName },
  { header: 'חלל', value: (b) => b.spaceName },
  { header: 'סוג', value: (b) => b.spaceTypeLabel },
  { header: 'סטטוס', value: (b) => BOOKING_STATUS_LABELS[b.status] ?? b.status },
  { header: 'מושבים', value: (b) => b.seats },
  { header: 'חברה', value: (b) => b.companyName },
  { header: 'ח.פ / ע.מ', value: (b) => b.companyTaxId, ltr: true },
  { header: 'לפני הנחה (₪)', value: (b) => b.baseAmount / 100 },
  { header: 'הנחה (₪)', value: (b) => b.discountAmount / 100 },
  { header: 'תוספות (₪)', value: (b) => b.addonsAmount / 100 },
  { header: 'סה״כ כולל מע״מ (₪)', value: (b) => b.totalAmount / 100 },
  { header: 'מתוכו מע״מ (₪)', value: (b) => b.vatAmount / 100 },
  { header: 'החזר', value: (b) => REFUND_LABELS[b.refundStatus] },
];

function bearerMatches(request: NextRequest): boolean {
  const expected = env.CSV_EXPORT_TOKEN;
  const header = request.headers.get('authorization') ?? '';
  if (!expected || !header.startsWith('Bearer ')) return false;
  const actual = Buffer.from(header.slice(7));
  const wanted = Buffer.from(expected);
  return actual.length === wanted.length && timingSafeEqual(actual, wanted);
}

const deny = (status: number) => new NextResponse(null, { status, headers: { 'Cache-Control': 'no-store' } });

/**
 * Booking export for accounting / Google Sheets. Two ways in:
 * a staff session (scoped to the staff member's branches), or a long bearer token for an Apps Script pull (all branches).
 * Customer email and phone are intentionally not exported.
 */
export async function GET(request: NextRequest) {
  if (!isConfigured.supabase()) return deny(503);

  let staff: StaffContext | null = null;
  const viaToken = bearerMatches(request);
  if (viaToken) {
    if (!(await rateLimit('csvExport', `token:${getClientIpFromRequest(request)}`))) return deny(429);
  } else {
    staff = await getStaffContext();
    if (!staff) return deny(403);
    if (!(await rateLimit('csvExport', staff.user.id))) return deny(429);
  }

  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success || parsed.data.from > parsed.data.to || addDays(parsed.data.from, MAX_RANGE_DAYS) < parsed.data.to) {
    return NextResponse.json({ error: 'invalid_range' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
  }
  const { from, to, branch: branchSlug } = parsed.data;

  const catalog = await getCatalog();
  let branchIds = catalog.branches.map((b) => b.id);
  if (staff) branchIds = branchIds.filter((id) => staffCanAccessBranch(staff, id));
  if (branchSlug) {
    const match = catalog.branches.find((b) => b.slug === branchSlug);
    branchIds = match && branchIds.includes(match.id) ? [match.id] : [];
  }
  if (branchIds.length === 0) return deny(403);

  const { data, error } = await createSupabaseAdminClient()
    .from('bookings')
    .select(BOOKING_VIEW_SELECT)
    .in('branch_id', branchIds)
    .gte('starts_at', israelToUtc(from, 0).toISOString())
    .lt('starts_at', israelToUtc(addDays(to, 1), 0).toISOString())
    .in('status', ['active', 'released', 'cancelled'])
    .order('starts_at', { ascending: true })
    .limit(MAX_ROWS);
  if (error) {
    logError('admin.export', error, { from, to, viaToken });
    return deny(500);
  }

  const rows = ((data ?? []) as unknown as BookingRow[]).map(toBookingView);
  return new NextResponse(toCsv(COLUMNS, rows), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="spacehub-bookings-${from}_${to}.csv"`,
      'Cache-Control': 'private, no-store',
      'X-Robots-Tag': 'noindex',
    },
  });
}
