import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { logError } from '@/lib/logger';
import { SPACE_TYPE_LABELS } from '@/lib/domain/types';
import { MAX_QUERY_LENGTH } from '@/lib/search/fuzzy';
import { scopeHref, scopeLabel, searchCatalog } from '@/lib/search/catalog-index';
import { rateLimit } from '@/lib/security/rate-limit';
import { getClientIpFromRequest } from '@/lib/security/request-meta';
import { getCatalogSearchIndex } from '@/lib/server/search-index';

const querySchema = z
  .string()
  .trim()
  .min(1)
  .max(MAX_QUERY_LENGTH)
  // Letters, digits, spaces and the punctuation people actually type in place names.
  .regex(/^[\p{L}\p{N}\s"'״׳.,\-]+$/u);

export interface SearchResponse {
  query: string;
  didYouMean: string | null;
  spaces: {
    slug: string;
    name: string;
    typeLabel: string;
    place: string;
    image: { url: string; alt: string } | null;
    /** agorot, VAT-inclusive */
    priceFrom: number;
    priceUnit: string;
  }[];
  scopes: { label: string; href: string; count: number }[];
}

function noStore(body: unknown, status: number): NextResponse {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function GET(request: NextRequest) {
  const parsed = querySchema.safeParse(request.nextUrl.searchParams.get('q') ?? '');
  if (!parsed.success) return noStore({ error: 'invalid_query' }, 400);

  if (!(await rateLimit('search', getClientIpFromRequest(request)))) {
    return noStore({ error: 'rate_limited' }, 429);
  }

  try {
    const { index } = await getCatalogSearchIndex();
    const result = searchCatalog(index, parsed.data);
    const body: SearchResponse = {
      query: parsed.data,
      didYouMean: result.didYouMean,
      spaces: result.spaces.map(({ space, branch }) => ({
        slug: space.slug,
        name: space.name,
        typeLabel: SPACE_TYPE_LABELS[space.type],
        place: `${branch.name}, ${branch.city.name}`,
        image: space.images[0] ? { url: space.images[0].url, alt: space.images[0].alt } : null,
        priceFrom: space.hourlyPrice,
        priceUnit: space.type === 'hotDesk' ? 'לשעה לעמדה' : 'לשעה',
      })),
      scopes: result.scopes.map((s) => ({ label: scopeLabel(s), href: scopeHref(s), count: s.count })),
    };
    return noStore(body, 200);
  } catch (error) {
    logError('search', error);
    return noStore({ error: 'unavailable' }, 503);
  }
}
