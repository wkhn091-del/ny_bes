import type { Metadata } from 'next';
import { CatalogExplorer } from '@/components/catalog/CatalogExplorer';
import { parseFilters } from '@/lib/catalog-filters';
import { getCatalog } from '@/lib/content/catalog';
import { maxBookableDate, nowInIsrael } from '@/lib/domain/time';
import { getRecentBookingCounts } from '@/lib/server/availability';

export const metadata: Metadata = {
  title: 'כל החללים',
  description: 'חדרי ישיבות, משרדים פרטיים ועמדות עבודה לפי שעה — סינון לפי עיר, מחיר, גודל, ציוד וזמינות בזמן אמת.',
};

export default async function SpacesPage({ searchParams }: PageProps<'/spaces'>) {
  const [catalog, recent, params] = await Promise.all([getCatalog(), getRecentBookingCounts(), searchParams]);
  const initialFilters = parseFilters(params);
  const prices = catalog.spaces.map((s) => s.hourlyPrice / 100);
  const priceBounds = {
    min: prices.length ? Math.floor(Math.min(...prices) / 5) * 5 : 0,
    max: prices.length ? Math.ceil(Math.max(...prices) / 5) * 5 : 500,
  };

  return (
    <CatalogExplorer
      initialFilters={initialFilters}
      spaces={catalog.spaces}
      branches={catalog.branches}
      cities={catalog.cities}
      amenities={catalog.amenities}
      recentBookings={Object.fromEntries(recent)}
      minDate={nowInIsrael().date}
      maxDate={maxBookableDate()}
      priceBounds={priceBounds}
    />
  );
}
