import type { Metadata } from 'next';
import { AdminBookingRow } from '@/components/admin/AdminBookingRow';
import { AdminDayPicker } from '@/components/admin/AdminDayPicker';
import { getCatalog } from '@/lib/content/catalog';
import { addDays, formatDateHebrew, isValidDateString, israelToUtc, nowInIsrael } from '@/lib/domain/time';
import { logError } from '@/lib/logger';
import { BOOKING_VIEW_SELECT, toBookingView, type BookingRow } from '@/lib/notifications/booking-view';
import { requireStaff, staffCanAccessBranch } from '@/lib/server/auth';
import { createSupabaseAdminClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'ניהול · הזמנות יומיות', robots: { index: false } };

function monthRange(date: string): { from: string; to: string } {
  const [year, month] = date.split('-').map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const prefix = date.slice(0, 8);
  return { from: `${prefix}01`, to: `${prefix}${String(lastDay).padStart(2, '0')}` };
}

export default async function AdminDayPage({ searchParams }: PageProps<'/admin'>) {
  const staff = await requireStaff();
  const [catalog, params] = await Promise.all([getCatalog(), searchParams]);
  const branches = catalog.branches.filter((b) => staffCanAccessBranch(staff, b.id));

  if (branches.length === 0) {
    return <p className="text-muted">לא שויכו אליך סניפים. פנה/י למנהל המערכת.</p>;
  }

  const today = nowInIsrael().date;
  const rawDate = typeof params.date === 'string' ? params.date : '';
  const date = isValidDateString(rawDate) ? rawDate : today;
  const rawBranch = typeof params.branch === 'string' ? params.branch : '';
  const branch = branches.find((b) => b.slug === rawBranch) ?? branches[0];

  const from = israelToUtc(date, 0).toISOString();
  const to = israelToUtc(addDays(date, 1), 0).toISOString();
  const { data, error } = await createSupabaseAdminClient()
    .from('bookings')
    .select(BOOKING_VIEW_SELECT + ', checked_in_at')
    .eq('branch_id', branch.id)
    .gte('starts_at', from)
    .lt('starts_at', to)
    .in('status', ['active', 'pending_payment', 'released', 'cancelled'])
    .order('starts_at', { ascending: true })
    .limit(500);
  if (error) logError('admin.day', error, { branchId: branch.id, date });

  const rows = ((data ?? []) as unknown as (BookingRow & { checked_in_at: string | null })[]).map((r) => ({
    view: toBookingView(r),
    checkedIn: Boolean(r.checked_in_at),
  }));
  const active = rows.filter((r) => r.view.status === 'active');
  const revenue = active.reduce((sum, r) => sum + r.view.totalAmount, 0);

  return (
    <div>
      <AdminDayPicker branches={branches.map((b) => ({ slug: b.slug, label: `${b.city.name} · ${b.name}` }))} branch={branch.slug} date={date} />
      <h1 className="mt-6 text-2xl font-bold">
        {branch.city.name} · {branch.name} — {formatDateHebrew(date)}
      </h1>
      <dl className="mt-4 grid grid-cols-3 gap-3 text-sm sm:max-w-lg">
        <Stat label="הזמנות פעילות" value={String(active.length)} />
        <Stat label="הגיעו" value={String(active.filter((r) => r.checkedIn).length)} />
        <Stat label="הכנסה (כולל מע״מ)" value={new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(revenue / 100)} />
      </dl>
      <a
        href={`/api/admin/bookings-export?${new URLSearchParams({ ...monthRange(date), branch: branch.slug })}`}
        className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-accent-text hover:underline"
        download
      >
        ייצוא החודש ל-CSV (Excel / Google Sheets)
      </a>

      {error ? (
        <p className="mt-8 rounded-xl border border-danger/30 bg-danger-soft p-4 text-sm text-danger">לא הצלחנו לטעון הזמנות.</p>
      ) : rows.length === 0 ? (
        <p className="mt-8 rounded-xl border border-dashed border-border-strong p-8 text-center text-sm text-muted">אין הזמנות ליום הזה.</p>
      ) : (
        <ul className="mt-8 divide-y divide-border rounded-2xl border border-border bg-card">
          {rows.map(({ view, checkedIn }) => (
            <AdminBookingRow
              key={view.id}
              booking={{
                id: view.id,
                publicCode: view.publicCode,
                status: view.status,
                spaceName: view.spaceName,
                timeLabel: view.isDayPass ? `יום שלם ${view.timeLabel}` : view.timeLabel,
                seats: view.seats,
                customer: view.customerName || view.customerEmail || 'חשבון שנמחק',
                companyName: view.companyName,
                total: view.formatted.total,
                checkedIn,
                isToday: date === today,
              }}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-1 text-lg font-bold">{value}</dd>
    </div>
  );
}
