import { clsx } from 'clsx';
import type { Metadata } from 'next';
import Link from 'next/link';
import { BookingListItem } from '@/components/account/BookingListItem';
import { ButtonLink } from '@/components/ui/Button';
import { listOwnBookings } from '@/lib/server/account-bookings';
import { requireUser } from '@/lib/server/auth';

export const metadata: Metadata = { title: 'ההזמנות שלי', robots: { index: false } };

export default async function AccountBookingsPage({ searchParams }: PageProps<'/account/bookings'>) {
  const user = await requireUser('/account/bookings');
  const { tab } = await searchParams;
  const showHistory = tab === 'history';
  const bookings = await listOwnBookings(user.id);
  const list = bookings ? (showHistory ? bookings.history : bookings.upcoming) : [];

  return (
    <div>
      <h1 className="text-3xl font-bold tracking-tight">ההזמנות שלי</h1>

      <div className="mt-6 flex gap-1 border-b border-border" role="tablist" aria-label="סוג הזמנות">
        <Tab href="/account/bookings" active={!showHistory} label={`קרובות${bookings ? ` (${bookings.upcoming.length})` : ''}`} />
        <Tab href="/account/bookings?tab=history" active={showHistory} label="היסטוריה" />
      </div>

      <div className="mt-6">
        {bookings === null ? (
          <p className="rounded-xl border border-danger/30 bg-danger-soft p-4 text-sm text-danger">
            לא הצלחנו לטעון את ההזמנות כרגע. נסו לרענן בעוד רגע.
          </p>
        ) : list.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border-strong p-8 text-center text-sm text-muted">
            {showHistory ? 'עדיין אין היסטוריית הזמנות.' : 'אין הזמנות קרובות.'}
            <div className="mt-4">
              <ButtonLink href="/spaces" size="sm">
                למציאת חלל
              </ButtonLink>
            </div>
          </div>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
            {list.map((b) => (
              <BookingListItem key={b.id} booking={b} />
            ))}
          </ul>
        )}
      </div>

      {!showHistory && (bookings?.upcoming.length ?? 0) > 0 && (
        <p className="mt-6 text-xs leading-5 text-muted">
          ביטול עם החזר מלא אפשרי עד 24 שעות לפני תחילת ההזמנה (או תוך 5 דקות מרגע ההזמנה). אחרי זה אפשר לשחרר את החלל לאחרים, ללא
          החזר.
        </p>
      )}
    </div>
  );
}

function Tab({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      role="tab"
      aria-selected={active}
      className={clsx(
        '-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition-colors',
        active ? 'border-accent text-fg' : 'border-transparent text-muted hover:text-fg',
      )}
    >
      {label}
    </Link>
  );
}
