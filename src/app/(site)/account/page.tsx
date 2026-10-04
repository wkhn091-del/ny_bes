import { CalendarDays, Gift, Heart } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { BookingListItem } from '@/components/account/BookingListItem';
import { ButtonLink } from '@/components/ui/Button';
import { pointsValue, formatIls } from '@/lib/domain/pricing';
import { logError } from '@/lib/logger';
import { listOwnBookings } from '@/lib/server/account-bookings';
import { getUserProfile, requireUser } from '@/lib/server/auth';
import { getFavoriteIds } from '@/lib/server/favorites';
import { getPointsBalance } from '@/lib/server/loyalty';

export const metadata: Metadata = { title: 'האזור האישי', robots: { index: false } };

export default async function AccountOverviewPage() {
  const user = await requireUser('/account');
  const [profile, bookings, favoriteIds, points] = await Promise.all([
    getUserProfile(user.id),
    listOwnBookings(user.id, 50),
    getFavoriteIds(user.id),
    getPointsBalance(user.id).catch((error: unknown) => {
      logError('account.overview.points', error);
      return null;
    }),
  ]);
  const next = bookings?.upcoming.slice(0, 3) ?? [];

  return (
    <div>
      <h1 className="text-3xl font-bold tracking-tight">שלום{profile?.fullName ? `, ${profile.fullName}` : ''}</h1>
      <p className="mt-1 text-sm text-muted">כאן מנהלים הזמנות, מועדפים, נקודות ופרטי חשבון.</p>

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat
          href="/account/bookings"
          icon={<CalendarDays className="h-5 w-5" aria-hidden="true" />}
          label="הזמנות קרובות"
          value={bookings ? String(bookings.upcoming.length) : '—'}
        />
        <Stat
          href="/account/rewards"
          icon={<Gift className="h-5 w-5" aria-hidden="true" />}
          label="נקודות מועדון"
          value={points === null ? '—' : points.toLocaleString('he-IL')}
          hint={points ? `שווי עד ${formatIls(pointsValue(points))}` : undefined}
        />
        <Stat
          href="/account/favorites"
          icon={<Heart className="h-5 w-5" aria-hidden="true" />}
          label="חללים במועדפים"
          value={String(favoriteIds.length)}
        />
      </div>

      <section className="mt-10">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">ההזמנות הקרובות</h2>
          <Link href="/account/bookings" className="text-sm font-medium text-accent-text hover:underline">
            לכל ההזמנות
          </Link>
        </div>
        {bookings === null ? (
          <p className="rounded-xl border border-danger/30 bg-danger-soft p-4 text-sm text-danger">
            לא הצלחנו לטעון את ההזמנות כרגע. נסו לרענן בעוד רגע.
          </p>
        ) : next.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border-strong p-8 text-center text-sm text-muted">
            אין הזמנות קרובות.
            <div className="mt-4">
              <ButtonLink href="/spaces" size="sm">
                למציאת חלל
              </ButtonLink>
            </div>
          </div>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
            {next.map((b) => (
              <BookingListItem key={b.id} booking={b} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat({ href, icon, label, value, hint }: { href: string; icon: React.ReactNode; label: string; value: string; hint?: string }) {
  return (
    <Link href={href} className="rounded-2xl border border-border bg-card p-5 transition-colors hover:border-border-strong">
      <span className="flex items-center gap-2 text-sm text-muted">
        <span className="text-accent-text">{icon}</span>
        {label}
      </span>
      <span className="mt-2 block text-3xl font-bold tabular-nums">{value}</span>
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </Link>
  );
}
