import { MapPin, Navigation, Phone } from 'lucide-react';
import type { Metadata } from 'next';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { BranchHours } from '@/components/branches/BranchHours';
import { SpaceCard } from '@/components/spaces/SpaceCard';
import { Badge } from '@/components/ui/Badge';
import { RenderBadge } from '@/components/ui/RenderBadge';
import { JsonLd } from '@/components/seo/JsonLd';
import { getBranchBySlug, getCatalog } from '@/lib/content/catalog';
import { slugSchema } from '@/lib/domain/schemas';
import { publicEnv } from '@/lib/env.public';
import { branchJsonLd, breadcrumbJsonLd } from '@/lib/seo/structured-data';

async function load(slug: string) {
  return slugSchema.safeParse(slug).success ? getBranchBySlug(slug) : null;
}

export async function generateMetadata({ params }: PageProps<'/branches/[slug]'>): Promise<Metadata> {
  const found = await load((await params).slug);
  if (!found) return { title: 'הסניף לא נמצא' };
  const { branch } = found;
  return {
    title: `סניף ${branch.name}, ${branch.city.name}`,
    description: branch.description.slice(0, 160),
    alternates: { canonical: `/branches/${branch.slug}` },
    openGraph: { images: [{ url: branch.image.url, alt: branch.image.alt }] },
  };
}

export default async function BranchPage({ params }: PageProps<'/branches/[slug]'>) {
  const found = await load((await params).slug);
  if (!found) notFound();
  const { branch, spaces } = found;
  const { settings } = await getCatalog();
  const base = publicEnv.siteUrl.replace(/\/$/, '');

  return (
    <div>
      <JsonLd
        data={[
          branchJsonLd({ base, businessName: settings.businessName, branch }),
          breadcrumbJsonLd(base, [
            { name: 'כל החללים', path: '/spaces' },
            { name: `${branch.city.name} · ${branch.name}`, path: `/branches/${branch.slug}` },
          ]),
        ]}
      />
      <section className="relative h-[320px] overflow-hidden sm:h-[420px]">
        <Image src={branch.image.url} alt={branch.image.alt} fill priority sizes="100vw" className="object-cover" />
        <RenderBadge image={branch.image} className="left-4 top-4" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 mx-auto max-w-7xl px-4 pb-8 text-white sm:px-6">
          <p className="text-sm opacity-80">{branch.city.name}</p>
          <h1 className="text-4xl font-bold">
            סניף {branch.name}
            {branch.isFlagship && <Badge tone="accent" className="mr-3 align-middle">סניף הדגל</Badge>}
          </h1>
          <p className="mt-2 flex items-center gap-1 opacity-90">
            <MapPin className="h-4 w-4" aria-hidden="true" />
            {branch.address}
          </p>
        </div>
      </section>

      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div>
          <p className="text-lg leading-8 text-muted">{branch.description}</p>
          <h2 className="mb-5 mt-10 text-2xl font-bold">החללים בסניף</h2>
          <div className="grid gap-5 sm:grid-cols-2">
            {spaces.map((s, i) => (
              <SpaceCard key={s.id} space={s} branch={branch} priority={i < 2} />
            ))}
          </div>
          {branch.gallery.length > 1 && (
            <>
              <h2 className="mb-5 mt-12 text-2xl font-bold">מבט מבפנים</h2>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {branch.gallery.map((img, i) => (
                  <div key={`${img.url}-${i}`} className="relative aspect-[4/3] overflow-hidden rounded-xl">
                    <Image src={img.url} alt={img.alt} fill sizes="(min-width: 640px) 25vw, 50vw" className="object-cover" />
                    <RenderBadge image={img} />
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
        <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-2xl border border-border bg-card p-5">
            <h2 className="mb-3 font-semibold">שעות פעילות</h2>
            <BranchHours hours={branch.hours} />
          </div>
          <div className="space-y-3 rounded-2xl border border-border bg-card p-5 text-sm">
            <h2 className="font-semibold">יצירת קשר והגעה</h2>
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
          </div>
        </aside>
      </div>
    </div>
  );
}
