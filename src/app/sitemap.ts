import type { MetadataRoute } from 'next';
import { getCatalog } from '@/lib/content/catalog';
import { LANDING_PAGES } from '@/lib/content/landing';
import { publicEnv } from '@/lib/env.public';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = publicEnv.siteUrl.replace(/\/$/, '');
  const catalog = await getCatalog();
  return [
    { url: `${base}/`, changeFrequency: 'weekly', priority: 1 },
    { url: `${base}/spaces`, changeFrequency: 'daily', priority: 0.9 },
    ...LANDING_PAGES.map((p) => ({ url: `${base}/book/${p.slug}`, changeFrequency: 'weekly' as const, priority: 0.8 })),
    ...catalog.branches.map((b) => ({ url: `${base}/branches/${b.slug}`, changeFrequency: 'weekly' as const, priority: 0.8 })),
    ...catalog.spaces.map((s) => ({ url: `${base}/spaces/${s.slug}`, changeFrequency: 'weekly' as const, priority: 0.7 })),
    ...catalog.legalPages.map((p) => ({ url: `${base}/legal/${p.slug}`, changeFrequency: 'yearly' as const, priority: 0.2 })),
  ];
}
