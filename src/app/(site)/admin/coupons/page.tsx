import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { CouponForm, CouponToggle } from '@/components/admin/CouponControls';
import { Badge } from '@/components/ui/Badge';
import { formatIls } from '@/lib/domain/pricing';
import { logError } from '@/lib/logger';
import { requireStaff } from '@/lib/server/auth';
import { createSupabaseAdminClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'ניהול · קופונים', robots: { index: false } };

export default async function CouponsPage() {
  const staff = await requireStaff();
  if (staff.role !== 'super_admin') redirect('/admin');

  const { data, error } = await createSupabaseAdminClient()
    .from('coupons')
    .select('id, code, discount_type, value, valid_until, max_uses, used_count, one_per_user, active, created_at')
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) logError('admin.coupons', error);

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_340px]">
      <section>
        <h1 className="mb-4 text-2xl font-bold">קופונים</h1>
        {error ? (
          <p className="text-sm text-danger">לא הצלחנו לטעון קופונים.</p>
        ) : (data ?? []).length === 0 ? (
          <p className="rounded-xl border border-dashed border-border-strong p-8 text-center text-sm text-muted">עדיין אין קופונים.</p>
        ) : (
          <ul className="divide-y divide-border rounded-2xl border border-border bg-card">
            {(data ?? []).map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <p className="font-mono font-semibold" dir="ltr">
                    {c.code}
                  </p>
                  <p className="text-sm text-muted">
                    {c.discount_type === 'percent' ? `${c.value}%` : formatIls(c.value)} הנחה · נוצל {c.used_count}
                    {c.max_uses !== null && `/${c.max_uses}`}
                    {c.one_per_user && ' · פעם אחת למשתמש'}
                    {c.valid_until && ` · עד ${new Date(c.valid_until).toLocaleDateString('he-IL', { timeZone: 'Asia/Jerusalem' })}`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={c.active ? 'success' : 'neutral'}>{c.active ? 'פעיל' : 'מושבת'}</Badge>
                  <CouponToggle couponId={c.id} active={c.active} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
      <aside>
        <CouponForm />
      </aside>
    </div>
  );
}
