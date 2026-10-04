import { isValidDateString, isValidHHMM, parseHHMM, formatMinutes } from '@/lib/domain/time';
import { SPACE_TYPES, type Branch, type Space, type SpaceType } from '@/lib/domain/types';
import { MAX_QUERY_LENGTH } from '@/lib/search/fuzzy';

export const SORT_OPTIONS = {
  recommended: 'מומלץ',
  priceAsc: 'מחיר: מהנמוך לגבוה',
  priceDesc: 'מחיר: מהגבוה לנמוך',
  sizeDesc: 'גודל: מהגדול לקטן',
} as const;
export type SortKey = keyof typeof SORT_OPTIONS;

export interface CatalogFilters {
  /** free-text search (typo tolerant), max 60 chars */
  q: string;
  city: string;
  types: SpaceType[];
  date: string;
  start: number | null;
  end: number | null;
  people: number;
  /** whole shekels per hour */
  priceMin: number | null;
  priceMax: number | null;
  sizeMin: number | null;
  amenities: string[];
  sort: SortKey;
}

export const EMPTY_FILTERS: CatalogFilters = {
  q: '',
  city: '',
  types: [],
  date: '',
  start: null,
  end: null,
  people: 1,
  priceMin: null,
  priceMax: null,
  sizeMin: null,
  amenities: [],
  sort: 'recommended',
};

type RawParams = Record<string, string | string[] | undefined>;

const SLUG_RE = /^[a-z0-9-]{1,96}$/;

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

function int(v: string | undefined, min: number, max: number): number | null {
  if (!v || !/^\d{1,6}$/.test(v)) return null;
  const n = Number(v);
  return n >= min && n <= max ? n : null;
}

/** Lenient parser: invalid values are dropped, never thrown. Works for server searchParams and URLSearchParams. */
export function parseFilters(input: RawParams | URLSearchParams): CatalogFilters {
  const get = (k: string) => (input instanceof URLSearchParams ? (input.get(k) ?? undefined) : first(input[k]));
  const list = (k: string) =>
    (get(k) ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 20);

  const city = get('city') ?? '';
  const date = get('date') ?? '';
  const from = get('from') ?? '';
  const to = get('to') ?? '';
  let start = isValidHHMM(from) ? parseHHMM(from) : null;
  let end = isValidHHMM(to) ? parseHHMM(to) : null;
  if (start === null || end === null || end <= start) {
    start = null;
    end = null;
  }
  const sort = get('sort') ?? '';
  const q = (get('q') ?? '')
    .replace(/[\u0000-\u001f\u007f<>]/g, '')
    .trim()
    .slice(0, MAX_QUERY_LENGTH);

  return {
    q,
    city: SLUG_RE.test(city) ? city : '',
    types: list('type').filter((t): t is SpaceType => (SPACE_TYPES as readonly string[]).includes(t)),
    date: isValidDateString(date) ? date : '',
    start: isValidDateString(date) ? start : null,
    end: isValidDateString(date) ? end : null,
    people: int(get('people'), 1, 50) ?? 1,
    priceMin: int(get('pmin'), 0, 100000),
    priceMax: int(get('pmax'), 0, 100000),
    sizeMin: int(get('size'), 1, 10000),
    amenities: list('amenities').filter((s) => SLUG_RE.test(s)),
    sort: sort in SORT_OPTIONS ? (sort as SortKey) : 'recommended',
  };
}

export function filtersToSearch(f: CatalogFilters): string {
  const p = new URLSearchParams();
  if (f.q) p.set('q', f.q);
  if (f.city) p.set('city', f.city);
  if (f.types.length) p.set('type', f.types.join(','));
  if (f.date) p.set('date', f.date);
  if (f.date && f.start !== null && f.end !== null) {
    p.set('from', formatMinutes(f.start));
    p.set('to', formatMinutes(f.end));
  }
  if (f.people > 1) p.set('people', String(f.people));
  if (f.priceMin !== null) p.set('pmin', String(f.priceMin));
  if (f.priceMax !== null) p.set('pmax', String(f.priceMax));
  if (f.sizeMin !== null) p.set('size', String(f.sizeMin));
  if (f.amenities.length) p.set('amenities', f.amenities.join(','));
  if (f.sort !== 'recommended') p.set('sort', f.sort);
  const s = p.toString();
  return s ? `?${s}` : '';
}

export function countActiveFilters(f: CatalogFilters): number {
  let n = 0;
  if (f.q) n += 1;
  if (f.city) n += 1;
  if (f.types.length) n += 1;
  if (f.date) n += 1;
  if (f.people > 1) n += 1;
  if (f.priceMin !== null || f.priceMax !== null) n += 1;
  if (f.sizeMin !== null) n += 1;
  if (f.amenities.length) n += 1;
  return n;
}

export function fitsPeople(space: Space, people: number): boolean {
  return space.type === 'hotDesk' ? Math.min(space.capacity, space.poolSize ?? 0) >= people : space.capacity >= people;
}

/** Static (non-availability) filters + sorting. Availability is applied on top with live data. */
export function applyStaticFilters(
  spaces: Space[],
  branches: Map<string, Branch>,
  amenitySlugToId: Map<string, string>,
  f: CatalogFilters,
  /** space id → relevance for `f.q` (from the search index); null when there is no query */
  relevance: Map<string, number> | null = null,
): Space[] {
  const amenityIds = f.amenities.map((s) => amenitySlugToId.get(s)).filter((id): id is string => Boolean(id));
  const result = spaces.filter((space) => {
    const branch = branches.get(space.branchId);
    if (!branch) return false;
    if (relevance && !relevance.has(space.id)) return false;
    if (f.city && branch.city.slug !== f.city) return false;
    if (f.types.length && !f.types.includes(space.type)) return false;
    if (!fitsPeople(space, f.people)) return false;
    const shekels = space.hourlyPrice / 100;
    if (f.priceMin !== null && shekels < f.priceMin) return false;
    if (f.priceMax !== null && shekels > f.priceMax) return false;
    if (f.sizeMin !== null && space.type !== 'hotDesk' && space.sizeSqm < f.sizeMin) return false;
    if (f.sizeMin !== null && space.type === 'hotDesk') return false;
    if (amenityIds.some((id) => !space.amenityIds.includes(id))) return false;
    return true;
  });

  const typeOrder: Record<SpaceType, number> = { meetingRoom: 0, privateOffice: 1, hotDesk: 2 };
  return result.sort((a, b) => {
    switch (f.sort) {
      case 'priceAsc':
        return a.hourlyPrice - b.hourlyPrice;
      case 'priceDesc':
        return b.hourlyPrice - a.hourlyPrice;
      case 'sizeDesc':
        return b.sizeSqm - a.sizeSqm;
      default: {
        if (relevance) {
          const diff = (relevance.get(b.id) ?? 0) - (relevance.get(a.id) ?? 0);
          if (Math.abs(diff) > 1e-9) return diff;
        }
        const fa = branches.get(a.branchId)?.isFlagship ? 0 : 1;
        const fb = branches.get(b.branchId)?.isFlagship ? 0 : 1;
        return fa - fb || typeOrder[a.type] - typeOrder[b.type] || a.hourlyPrice - b.hourlyPrice;
      }
    }
  });
}
