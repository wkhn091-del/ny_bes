import Link from 'next/link';
import { requireStaff } from '@/lib/server/auth';

export default async function AdminLayout({ children }: LayoutProps<'/admin'>) {
  const staff = await requireStaff();
  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-accent-text">ניהול</p>
          <p className="text-sm text-muted">
            {staff.role === 'super_admin' ? 'מנהל מערכת · כל הסניפים' : `מנהל סניף · ${staff.branchIds?.length ?? 0} סניפים`}
          </p>
        </div>
        <nav className="flex gap-1 text-sm" aria-label="ניווט ניהול">
          <Link href="/admin" className="rounded-md px-3 py-1.5 hover:bg-subtle">
            הזמנות יומיות
          </Link>
          {staff.role === 'super_admin' && (
            <Link href="/admin/coupons" className="rounded-md px-3 py-1.5 hover:bg-subtle">
              קופונים
            </Link>
          )}
        </nav>
      </div>
      {children}
    </div>
  );
}
