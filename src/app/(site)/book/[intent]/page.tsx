import { Check } from 'lucide-react';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { WhyUs } from '@/components/home/WhyUs';
import { SpaceCard } from '@/components/spaces/SpaceCard';
import { ButtonLink } from '@/components/ui/Button';
import { getCatalog } from '@/lib/content/catalog';
import { LANDING_PAGES, getLandingPage, landingSpaces } from '@/lib/content/landing';
import { FREE_CANCELLATION_HOURS } from '@/lib/domain/booking-rules';
import { formatIls } from '@/lib/domain/pricing';

export const dynamicParams = false;

export function generateStaticParams() {
  return LANDING_PAGES.map((p) => ({ intent: p.slug }));
}

export async function generateMetadata({ params }: PageProps<'/book/[intent]'>): Promise<Metadata> {
  const page = getLandingPage((await params).intent);
  if (!page) return { title: 'העמוד לא נמצא' };
  return {
    title: page.title,
    description: page.description,
    alternates: { canonical: `/book/${page.slug}` },
  };
}

export default async function LandingPage({ params }: PageProps<'/book/[intent]'>) {
  const page = getLandingPage((await params).intent);
  if (!page) notFound();

  const catalog = await getCatalog();
  const branchById = new Map(catalog.branches.map((b) => [b.id, b]));
  const spaces = landingSpaces(page, catalog.spaces, (id) => branchById.get(id)?.city.slug);
  const fromPrice = spaces[0]?.hourlyPrice;
  const listHref = `/spaces?type=${page.type}${page.citySlug ? `&city=${page.citySlug}` : ''}`;

  return (
    <div>
      <section className="grid-backdrop hero-glow border-b border-border">
        <div className="mx-auto max-w-4xl px-4 py-16 text-center sm:px-6 lg:py-24">
          <p className="text-sm font-semibold text-accent-text">{page.eyebrow}</p>
          <h1 className="mt-3 text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">{page.h1}</h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg leading-8 text-muted">{page.lead}</p>
          <ul className="mt-6 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm">
            {fromPrice !== undefined && (
              <li className="flex items-center gap-1.5">
                <Check className="h-4 w-4 text-success" aria-hidden="true" />
                החל מ-{formatIls(fromPrice)} לשעה, כולל מע״מ
              </li>
            )}
            <li className="flex items-center gap-1.5">
              <Check className="h-4 w-4 text-success" aria-hidden="true" />
              ביטול חינם עד {FREE_CANCELLATION_HOURS} שעות לפני
            </li>
            <li className="flex items-center gap-1.5">
              <Check className="h-4 w-4 text-success" aria-hidden="true" />
              אישור מיידי במייל
            </li>
          </ul>
          <ButtonLink href="#spaces" size="lg" className="glow-accent mt-8">
            לבחירת חלל ושעות
          </ButtonLink>
        </div>
      </section>

      <section id="spaces" className="mx-auto max-w-7xl scroll-mt-24 px-4 py-16 sm:px-6" aria-labelledby="spaces-title">
        <h2 id="spaces-title" className="text-2xl font-bold tracking-tight">
          {spaces.length > 0 ? `${spaces.length} חללים שמתאימים` : 'אין כרגע חללים שמתאימים'}
        </h2>
        {spaces.length > 0 ? (
          <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {spaces.map((space, i) => {
              const branch = branchById.get(space.branchId);
              return branch ? <SpaceCard key={space.id} space={space} branch={branch} priority={i < 3} /> : null;
            })}
          </div>
        ) : (
          <p className="mt-3 text-muted">אפשר לראות את כל החללים הפנויים בקטלוג.</p>
        )}
        <ButtonLink href={listHref} variant="secondary" className="mt-8">
          לכל החללים עם סינון מלא
        </ButtonLink>
      </section>

      <WhyUs />

      <section className="mx-auto max-w-3xl px-4 pb-20 sm:px-6" aria-labelledby="lp-faq-title">
        <h2 id="lp-faq-title" className="text-2xl font-bold tracking-tight">
          שאלות על {page.eyebrow}
        </h2>
        <div className="mt-6 divide-y divide-border rounded-2xl border border-border bg-card">
          {page.faqs.map((f) => (
            <details key={f.q} className="group p-5 [&_summary::-webkit-details-marker]:hidden">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-semibold">
                {f.q}
                <span className="text-xl text-muted transition-transform group-open:rotate-45" aria-hidden="true">
                  +
                </span>
              </summary>
              <p className="mt-3 text-sm leading-7 text-muted">{f.a}</p>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}
