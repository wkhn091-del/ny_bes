import { SPACE_TYPE_LABELS, type Amenity, type Branch, type City, type Space, type SpaceType } from '@/lib/domain/types';
import { indexItems, search, suggestCorrection, tokenize, type Indexed } from './fuzzy';

export interface SpaceDoc {
  space: Space;
  branch: Branch;
}

export type ScopeDoc =
  | { kind: 'city'; city: City; count: number }
  | { kind: 'type'; type: SpaceType; count: number }
  | { kind: 'cityType'; city: City; type: SpaceType; count: number };

export interface CatalogSearchIndex {
  spaces: Indexed<SpaceDoc>[];
  scopes: Indexed<ScopeDoc>[];
  vocabulary: Set<string>;
  /** normalized token → how it is written in the catalog (for "did you mean") */
  display: Map<string, string>;
}

const TYPE_PLURALS: Record<SpaceType, string> = {
  meetingRoom: 'חדרי ישיבות',
  privateOffice: 'משרדים פרטיים',
  hotDesk: 'עמדות עבודה',
};

export function scopeLabel(scope: ScopeDoc): string {
  if (scope.kind === 'city') return `כל החללים ב${scope.city.name}`;
  if (scope.kind === 'type') return `כל ה${TYPE_PLURALS[scope.type]}`;
  return `${TYPE_PLURALS[scope.type]} ב${scope.city.name}`;
}

export function scopeHref(scope: ScopeDoc): string {
  const p = new URLSearchParams();
  if (scope.kind !== 'type') p.set('city', scope.city.slug);
  if (scope.kind !== 'city') p.set('type', scope.type);
  return `/spaces?${p}`;
}

export function buildCatalogSearchIndex(input: {
  spaces: Space[];
  branches: Branch[];
  cities: City[];
  amenities: Amenity[];
}): CatalogSearchIndex {
  const branchById = new Map(input.branches.map((b) => [b.id, b]));
  const amenityById = new Map(input.amenities.map((a) => [a.id, a]));

  const docs: SpaceDoc[] = [];
  for (const space of input.spaces) {
    const branch = branchById.get(space.branchId);
    if (branch) docs.push({ space, branch });
  }

  const spaces = indexItems(docs, ({ space, branch }) => [
    { text: space.name, weight: 1.5 },
    { text: `${SPACE_TYPE_LABELS[space.type]} ${TYPE_PLURALS[space.type]}`, weight: 1.3 },
    { text: `${branch.name} ${branch.city.name}`, weight: 1.2 },
    { text: branch.address, weight: 0.7 },
    { text: space.amenityIds.map((id) => amenityById.get(id)?.name ?? '').join(' '), weight: 0.8 },
  ]);

  const scopeDocs: ScopeDoc[] = [];
  const types = Object.keys(SPACE_TYPE_LABELS) as SpaceType[];
  for (const type of types) {
    const count = docs.filter((d) => d.space.type === type).length;
    if (count > 0) scopeDocs.push({ kind: 'type', type, count });
  }
  for (const city of input.cities) {
    const inCity = docs.filter((d) => d.branch.city.id === city.id);
    if (inCity.length === 0) continue;
    scopeDocs.push({ kind: 'city', city, count: inCity.length });
    for (const type of types) {
      const count = inCity.filter((d) => d.space.type === type).length;
      if (count > 0) scopeDocs.push({ kind: 'cityType', city, type, count });
    }
  }
  const scopes = indexItems(scopeDocs, (s) => [
    { text: s.kind === 'type' ? '' : s.city.name, weight: 1.2 },
    { text: s.kind === 'city' ? '' : `${SPACE_TYPE_LABELS[s.type]} ${TYPE_PLURALS[s.type]}`, weight: 1.2 },
  ]);

  const vocabulary = new Set<string>();
  const display = new Map<string, string>();
  const sourceTexts = [
    ...docs.flatMap(({ space, branch }) => [space.name, SPACE_TYPE_LABELS[space.type], TYPE_PLURALS[space.type], branch.name, branch.city.name]),
    ...input.amenities.map((a) => a.name),
  ];
  for (const text of sourceTexts) {
    for (const word of text.split(/\s+/)) {
      const [token] = tokenize(word);
      if (!token || token.length < 3) continue;
      vocabulary.add(token);
      if (!display.has(token)) display.set(token, word.replace(/[^\p{L}\p{N}׳״"'-]/gu, ''));
    }
  }

  return { spaces, scopes, vocabulary, display };
}

export interface CatalogSearchResult {
  spaces: SpaceDoc[];
  scopes: ScopeDoc[];
  didYouMean: string | null;
}

export function searchCatalog(index: CatalogSearchIndex, query: string): CatalogSearchResult {
  const spaces = search(index.spaces, query, 6).map((r) => r.item);
  const scopes = search(index.scopes, query, 3)
    .map((r) => r.item)
    // A scope is only useful when it narrows to more than the single space already listed.
    .filter((s) => s.count > 1);
  const exact = tokenize(query).every((t) => t.length < 3 || index.vocabulary.has(t));
  const corrected = exact ? null : suggestCorrection(query, index.vocabulary);
  const didYouMean = corrected
    ? corrected
        .split(' ')
        .map((t) => index.display.get(t) ?? t)
        .join(' ')
    : null;
  return { spaces, scopes, didYouMean };
}

export function spaceMatchesQuery(index: CatalogSearchIndex, spaceId: string, query: string): boolean {
  return search(index.spaces, query, index.spaces.length).some((r) => r.item.space.id === spaceId);
}
