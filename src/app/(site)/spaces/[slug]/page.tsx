import { Check, ChevronLeft, MapPin, Maximize2, Navigation, Phone, Users } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { BookingWidget, type WidgetPrefill } from '@/components/booking/BookingWidget';
import { MobileBookBar } from '@/components/booking/MobileBookBar';
import { BranchHours } from '@/components/branches/BranchHours';
import { FavoriteButton } from '@/components/spaces/FavoriteButton';
import { Gallery } from '@/components/spaces/Gallery';
import { SpaceCard } from '@/components/spaces/SpaceCard';
import { Badge } from '@/components/ui/Badge';
import { getCatalog, getSpaceBySlug } from '@/lib/content/catalog';
import { FREE_CANCELLATION_HOURS, validateSlotRequest } from '@/lib/domain/booking-rules';
import { quoteRequestFromSearchParams, slugSchema } from '@/lib/domain/schemas';
import { isValidDateString, maxBookableDate, nextOpenDate, nowInIsrael } from '@/lib/domain/time';
import { formatIls } from '@/lib/domain/pricing';
import { SPACE_TYPE_LABELS, type Branch, type Space } from '@/lib/domain/types';
import { getSessionUser } from '@/lib/server/auth';
import { getRankedRecommendations } from '@/lib/server/recommendations';
import { getApprovedReviews, getReviewEligibility } from '@/lib/server/reviews';
import { publicEnv } from '@/lib/env.public';
import { ReviewsSection } from '@/components/reviews/ReviewsSection';
import { JsonLd } from '@/components/seo/JsonLd';
import { TrackEvent } from '@/components/analytics/TrackEvent';
import { breadcrumbJsonLd, spaceJsonLd } from '@/lib/seo/structured-data';
import { Stars } from '@/components/reviews/Stars';
import { headers } from 'next/headers';

async function load(slug: string) {
  if (!slugSchema.safeParse(slug).success) return null;
  return getSpaceBySlug(slug);
}

/** "Book again" link → widget prefill. Ids and times only; anything invalid is ignored. */
function parsePrefill(
  query: Record<string, string | string[] | undefined>,
  space: Space,
  branch: Branch,
  allowedAddonIds: string[],
): WidgetPrefill | null {
  const request = quoteRequestFromSearchParams({ ...query, space: space.id });
  if (!request) return null;
  const slot = validateSlotRequest(space, branch, request);
  if (!slot.ok) return null;
  return {
    date: request.date,
    startMinute: slot.startMinute,
    endMinute: slot.endMinute,
    seats: slot.seats,
    isDayPass: request.isDayPass,
    addonIds: request.addonIds.filter((id) => allowedAddonIds.includes(id)),
  };
}

export async function generateMetadata({ params }: PageProps<'/spaces/[slug]'>): Promise<Metadata> {
  const found = await load((await params).slug);
  if (!found) return { title: 'החלל לא נמצא' };
  const { space, branch } = found;
  const title = `${space.name} · ${branch.name}, ${branch.city.name}`;
  return {
    title,
    description: space.description.slice(0, 160),
    alternates: { canonical: `/spaces/${space.slug}` },
    openGraph: { title, description: space.description.slice(0, 160), images: space.images[0] ? [{ url: space.images[0].url, alt: space.images[0].alt }] : undefined },
  };
}

export default async function SpacePage({ params, searchParams }: PageProps<'/spaces/[slug]'>) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const found = await load(slug);
  if (!found) notFound();
  const { space, branch } = found;

  const [catalog, user, recommendations, reviews, nonce] = await Promise.all([
    getCatalog(),
    getSessionUser(),
    getRankedRecommendations(space.id, null).catch(() => []),
    getApprovedReviews(space.id),
    headers().then((h) => h.get('x-nonce') ?? undefined),
  ]);
  const eligibility = user ? await getReviewEligibility(user.id, space.id) : null;
  const amenities = catalog.amenities.filter((a) => space.amenityIds.includes(a.id));
  const addons = catalog.addons.filter((a) => a.spaceTypes.includes(space.type));

  const today = nowInIsrael().date;
  const maxDate = maxBookableDate();
  const rawDate = typeof query.date === 'string' ? query.date : '';
  const dateFromUrl = isValidDateString(rawDate) && rawDate >= today && rawDate <= maxDate;
  const initialDate = dateFromUrl ? rawDate : nextOpenDate(branch);
  const rawPeople = typeof query.people === 'string' ? Number(query.people) : 1;
  const initialSeats = Number.isInteger(rawPeople) && rawPeople >= 1 && rawPeople <= 50 ? rawPeople : 1;
  const prefill = query.reorder === '1' ? parsePrefill(query, space, branch, addons.map((a) => a.id)) : null;

  const base = publicEnv.siteUrl.replace(/\/$/, '');

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:py-10">
      <JsonLd
        data={[
          spaceJsonLd({ base, businessName: catalog.settings.businessName, space, branch, rating: reviews.summary, reviews: reviews.reviews }),
          breadcrumbJsonLd(base, [
            { name: 'כל החללים', path: '/spaces' },
            { name: `${branch.city.name} · ${branch.name}`, path: `/branches/${branch.slug}` },
            { name: space.name, path: `/spaces/${space.slug}` },
          ]),
        ]}
      />
      <TrackEvent
        name="view_item"
        params={{
          currency: 'ILS',
          value: space.hourlyPrice / 100,
          items: [{ item_id: space.id, item_name: space.name, item_category: SPACE_TYPE_LABELS[space.type], item_brand: branch.name, price: space.hourlyPrice / 100 }],
        }}
      />
      <nav aria-label="פירורי לחם" className="mb-4 flex items-center gap-1 text-sm text-muted">
        <Link href="/spaces" className="hover:text-fg">
          כל החללים
        </Link>
        <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
        <Link href={`/branches/${branch.slug}`} className="hover:text-fg">
          {branch.city.name} · {branch.name}
        </Link>
      </nav>

      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="mb-2 flex flex-wrap gap-1.5">
            <Badge tone="accent">{SPACE_TYPE_LABELS[space.type]}</Badge>
            {branch.isFlagship && <Badge>סניף הדגל</Badge>}
          </div>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{space.name}</h1>
          <p className="mt-1 flex items-center gap-1 text-muted">
            <MapPin className="h-4 w-4" aria-hidden="true" />
            {branch.address}
          </p>
          {reviews.summary.count > 0 && (
            <a href="#reviews" className="mt-1 inline-flex items-center gap-1.5 text-sm hover:underline">
              <Stars value={reviews.summary.average} />
              <span className="font-semibold tabular-nums">{reviews.summary.average.toFixed(1)}</span>
              <span className="text-muted">({reviews.summary.count} ביקורות)</span>
            </a>
          )}
        </div>
        <FavoriteButton spaceId={space.id} spaceName={space.name} variant="inline" />
      </div>

      <Gallery images={space.images} title={space.name} />

      <div className="mt-10 grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_400px]">
        <div className="min-w-0 space-y-10">
          <section>
            <ul className="flex flex-wrap gap-x-6 gap-y-2 border-b border-border pb-6 text-sm">
              <li className="flex items-center gap-1.5">
                <Users className="h-4 w-4 text-accent-text" aria-hidden="true" />
                {space.type === 'hotDesk' ? `עד ${space.capacity} עמדות בהזמנה` : `עד ${space.capacity} אנשים`}
              </li>
              <li className="flex items-center gap-1.5">
                <Maximize2 className="h-4 w-4 text-accent-text" aria-hidden="true" />
                {space.type === 'hotDesk' ? `${space.poolSize} עמדות באזור הפתוח` : `${space.sizeSqm} מ״ר`}
              </li>
            </ul>
            <p className="mt-6 whitespace-pre-line leading-8 text-fg/90">{space.description}</p>
          </section>

          {amenities.length > 0 && (
            <section aria-labelledby="amenities-title">
              <h2 id="amenities-title" className="mb-4 text-xl font-semibold">
                מה יש בחלל
              </h2>
              <ul className="grid gap-3 sm:grid-cols-2">
                {amenities.map((a) => (
                  <li key={a.id} className="flex items-center gap-2 text-sm">
                    <Check className="h-4 w-4 text-accent-text" aria-hidden="true" />
                    {a.name}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section aria-labelledby="policy-title" className="rounded-2xl border border-border bg-subtle p-6">
            <h2 id="policy-title" className="mb-3 text-xl font-semibold">
              מדיניות ביטול
            </h2>
            <ul className="space-y-2 text-sm leading-6 text-muted">
              <li>ביטול עד {FREE_CANCELLATION_HOURS} שעות לפני תחילת ההזמנה — החזר מלא.</li>
              <li>הזמנתם ברגע האחרון? 5 דקות מרגע התשלום לביטול בהחזר מלא.</li>
              <li>פחות מ-{FREE_CANCELLATION_HOURS} שעות לפני — אפשר לשחרר את החדר לאחרים, ללא החזר.</li>
            </ul>
            <Link href="/legal/terms" className="mt-3 inline-block text-sm font-medium text-accent-text hover:underline">
              לתקנון המלא
            </Link>
          </section>

          <section aria-labelledby="branch-title">
            <h2 id="branch-title" className="mb-4 text-xl font-semibold">
              הסניף: {branch.name}, {branch.city.name}
            </h2>
            <p className="leading-7 text-muted">{branch.description}</p>
            <div className="mt-5 grid gap-6 sm:grid-cols-2">
              <BranchHours hours={branch.hours} />
              <div className="space-y-2 text-sm">
                <a href={`tel:${branch.phone.replace(/[^\d+]/g, '')}`} className="flex items-center gap-2 hover:text-accent-text">
                  <Phone className="h-4 w-4" aria-hidden="true" />
                  {branch.phone}
                </a>
                {branch.wazeUrl && (
                  <a href={branch.wazeUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 hover:text-accent-text">
                    <Navigation className="h-4 w-4" aria-hidden="true" />
                    ניווט עם Waze
                  </a>
                )}
                <Link href={`/branches/${branch.slug}`} className="flex items-center gap-2 font-medium text-accent-text hover:underline">
                  לכל החללים בסניף
                </Link>
              </div>
            </div>
          </section>

          <ReviewsSection
            spaceId={space.id}
            spaceSlug={space.slug}
            data={reviews}
            eligibility={eligibility}
            turnstileSiteKey={publicEnv.turnstileSiteKey}
            nonce={nonce}
          />
        </div>

        <aside id="booking" aria-label="הזמנה" className="min-w-0 scroll-mt-24 lg:sticky lg:top-24 lg:self-start">
          <BookingWidget
            space={{
              id: space.id,
              name: space.name,
              type: space.type,
              hourlyPrice: space.hourlyPrice,
              dayPassPrice: space.dayPassPrice,
              capacity: space.capacity,
              poolSize: space.poolSize,
            }}
            hours={branch.hours}
            addons={addons}
            settings={{
              vatRate: catalog.settings.vatRate,
              autoDiscountMinHours: catalog.settings.autoDiscountMinHours,
              autoDiscountPercent: catalog.settings.autoDiscountPercent,
            }}
            today={today}
            maxDate={maxDate}
            initialDate={initialDate}
            dateFromUrl={dateFromUrl}
            initialSeats={initialSeats}
            isLoggedIn={Boolean(user)}
            prefill={prefill}
          />
        </aside>
      </div>

      {recommendations.length > 0 && (
        <section className="mt-16 border-t border-border pt-10" aria-labelledby="similar-title">
          <h2 id="similar-title" className="mb-1 text-2xl font-bold">
            משלים את ההזמנה שלכם
          </h2>
          <p className="mb-6 text-sm text-muted">נבחר לפי מה שלקוחות באמת מזמינים יחד ולפי מה שקרוב אליכם — בלי קידום ממומן.</p>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {recommendations.map((r) => (
              <SpaceCard key={r.space.id} space={r.space} branch={r.branch} reason={r.label} />
            ))}
          </div>
        </section>
      )}

      <div className="h-20 lg:hidden" aria-hidden="true" />
      <MobileBookBar
        targetId="booking"
        priceLabel={formatIls(space.hourlyPrice)}
        unitLabel={space.type === 'hotDesk' ? '/ שעה לעמדה' : '/ שעה'}
        reassurance={`מחיר סופי כולל מע״מ · ביטול חינם עד ${FREE_CANCELLATION_HOURS} שעות לפני`}
      />
    </div>
  );
}
