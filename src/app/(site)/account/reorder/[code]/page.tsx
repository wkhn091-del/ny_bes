import { ArrowRight } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { SpaceCard } from '@/components/spaces/SpaceCard';
import { ButtonLink } from '@/components/ui/Button';
import { getCatalog } from '@/lib/content/catalog';
import { publicCodeSchema } from '@/lib/domain/schemas';
import { formatDateHebrew, formatMinutes } from '@/lib/domain/time';
import { loadOwnBookingByCode } from '@/lib/notifications/booking-view';
import { rateLimit } from '@/lib/security/rate-limit';
import { requireUser } from '@/lib/server/auth';
import { planReorder, REORDER_SCAN_DAYS, reorderHref } from '@/lib/server/reorder';

export const metadata: Metadata = { title: 'הזמנה חוזרת', robots: { index: false } };

export default async function ReorderPage({ params }: PageProps<'/account/reorder/[code]'>) {
  const { code } = await params;
  const user = await requireUser(`/account/reorder/${encodeURIComponent(code)}`);
  const parsed = publicCodeSchema.safeParse(code);
  if (!parsed.success) notFound();

  const booking = await loadOwnBookingByCode(parsed.data, user.id);
  if (!booking) notFound();

  if (!(await rateLimit('availability', `reorder:${user.id}`))) {
    return <Message code={booking.publicCode} title="יותר מדי בקשות" text="נסו שוב בעוד דקה." />;
  }

  const catalog = await getCatalog();
  const plan = await planReorder(booking, catalog);
  if (plan.kind === 'same') redirect(reorderHref(plan.slot));

  const hours = booking.isDayPass ? 'יום שלם' : `${formatMinutes(booking.startMinute)}–${formatMinutes(booking.endMinute)}`;
  const intro =
    plan.reason === 'removed'
      ? `${booking.spaceName} כבר לא זמין להזמנה.`
      : `${booking.spaceName} תפוס ב-${REORDER_SCAN_DAYS} הימים הקרובים בשעות ${hours}.`;

  return (
    <div>
      <Link href={`/account/bookings/${booking.publicCode}`} className="inline-flex items-center gap-1 text-sm text-muted hover:text-fg">
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
        חזרה להזמנה
      </Link>
      <h1 className="mt-4 text-3xl font-bold tracking-tight">הזמנה חוזרת</h1>
      <p className="mt-2 text-muted">
        {intro}
        {plan.options.length > 0 && ` הנה חללים דומים${plan.branch ? ` בסניף ${plan.branch.name}` : ''} שפנויים באותן שעות:`}
      </p>

      {plan.options.length === 0 ? (
        <div className="mt-8 rounded-xl border border-dashed border-border-strong p-8 text-center text-sm text-muted">
          לא מצאנו חלל פנוי באותן שעות בסניף ב-{REORDER_SCAN_DAYS} הימים הקרובים.
          <div className="mt-4 flex justify-center gap-3">
            {plan.branch && (
              <ButtonLink href={`/branches/${plan.branch.slug}`} size="sm" variant="outline">
                לכל החללים בסניף
              </ButtonLink>
            )}
            <ButtonLink href="/spaces" size="sm">
              חיפוש בכל הסניפים
            </ButtonLink>
          </div>
        </div>
      ) : (
        <ul className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {plan.options.map((option) => {
            const branch = catalog.branches.find((b) => b.id === option.space.branchId);
            if (!branch) return null;
            return (
              <li key={option.space.id} className="flex flex-col gap-2">
                <SpaceCard space={option.space} branch={branch} query={reorderHref(option).slice(`/spaces/${option.space.slug}`.length)} />
                <p className="px-1 text-sm text-muted">
                  פנוי ב{formatDateHebrew(option.date)} ·{' '}
                  {option.isDayPass ? 'יום שלם' : `${formatMinutes(option.startMinute)}–${formatMinutes(option.endMinute)}`}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Message({ code, title, text }: { code: string; title: string; text: string }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-8 text-center">
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="mt-2 text-muted">{text}</p>
      <ButtonLink href={`/account/bookings/${code}`} className="mt-6" variant="outline">
        חזרה להזמנה
      </ButtonLink>
    </div>
  );
}
