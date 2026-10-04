import 'server-only';
import { getCatalog } from '@/lib/content/catalog';
import type { Catalog } from '@/lib/domain/types';
import { buildCatalogSearchIndex, type CatalogSearchIndex } from '@/lib/search/catalog-index';

const indexes = new WeakMap<Catalog, CatalogSearchIndex>();

/** Index over the published, already-projected catalog. Rebuilt only when the cached catalog object changes. */
export async function getCatalogSearchIndex(): Promise<{ catalog: Catalog; index: CatalogSearchIndex }> {
  const catalog = await getCatalog();
  let index = indexes.get(catalog);
  if (!index) {
    index = buildCatalogSearchIndex(catalog);
    indexes.set(catalog, index);
  }
  return { catalog, index };
}
