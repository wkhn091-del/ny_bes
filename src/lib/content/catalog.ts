import 'server-only';
import { cache } from 'react';
import type { PortableTextBlock } from '@portabletext/react';
import { LEGAL_DRAFTS, draftToPortableText } from '@/content/legal-drafts';
import {
  SEED_ADDONS,
  SEED_AMENITIES,
  SEED_BRANCHES,
  SEED_CITIES,
  SEED_SEO,
  SEED_SETTINGS,
  SEED_SPACES,
} from '@/content/seed-data';
import { isConfigured } from '@/lib/env.server';
import { logError } from '@/lib/logger';
import type { Branch, Catalog, Space } from '@/lib/domain/types';
import { getSanityPublicClient } from '@/sanity/lib/client';
import { CATALOG_QUERY, LEGAL_PAGE_QUERY } from '@/sanity/lib/queries';
import { catalogSchema } from './catalog-schema';

export const CONTENT_CACHE_TAG = 'sanity:content';

const SEED_CATALOG: Catalog = {
  cities: SEED_CITIES,
  branches: SEED_BRANCHES,
  spaces: SEED_SPACES,
  amenities: SEED_AMENITIES,
  addons: SEED_ADDONS,
  settings: SEED_SETTINGS,
  seo: SEED_SEO,
  legalPages: LEGAL_DRAFTS.map((d) => ({ slug: d.slug, title: d.title })),
};

export const getCatalog = cache(async (): Promise<Catalog> => {
  if (!isConfigured.sanity()) return SEED_CATALOG;
  try {
    const raw = await getSanityPublicClient().fetch(
      CATALOG_QUERY,
      {},
      { next: { revalidate: 3600, tags: [CONTENT_CACHE_TAG] } },
    );
    const parsed = catalogSchema.safeParse(raw);
    if (!parsed.success) {
      logError('catalog', new Error('Sanity catalog failed validation'), {
        issues: parsed.error.issues.slice(0, 5).map((i) => `${i.path.join('.')}: ${i.message}`).join(' | '),
      });
      throw new Error('Catalog unavailable');
    }
    const data = parsed.data;
    const branchIds = new Set(data.branches.map((b) => b.id));
    return { ...data, spaces: data.spaces.filter((s) => branchIds.has(s.branchId)) };
  } catch (error) {
    logError('catalog', error);
    throw new Error('Catalog unavailable');
  }
});

export const isUsingSeedContent = () => !isConfigured.sanity();

export async function getSpaceBySlug(slug: string): Promise<{ space: Space; branch: Branch } | null> {
  const catalog = await getCatalog();
  const space = catalog.spaces.find((s) => s.slug === slug);
  if (!space) return null;
  const branch = catalog.branches.find((b) => b.id === space.branchId);
  return branch ? { space, branch } : null;
}

export async function getBranchBySlug(slug: string): Promise<{ branch: Branch; spaces: Space[] } | null> {
  const catalog = await getCatalog();
  const branch = catalog.branches.find((b) => b.slug === slug);
  if (!branch) return null;
  return { branch, spaces: catalog.spaces.filter((s) => s.branchId === branch.id) };
}

export interface LegalPage {
  title: string;
  slug: string;
  lawyerReviewed: boolean;
  content: PortableTextBlock[];
}

export async function getLegalPage(slug: string): Promise<LegalPage | null> {
  if (!isConfigured.sanity()) {
    const draft = LEGAL_DRAFTS.find((d) => d.slug === slug);
    return draft
      ? { title: draft.title, slug: draft.slug, lawyerReviewed: false, content: draftToPortableText(draft) as PortableTextBlock[] }
      : null;
  }
  try {
    const page = await getSanityPublicClient().fetch<LegalPage | null>(
      LEGAL_PAGE_QUERY,
      { slug },
      { next: { revalidate: 3600, tags: [CONTENT_CACHE_TAG] } },
    );
    return page ?? null;
  } catch (error) {
    logError('legal-page', error, { slug });
    return null;
  }
}
