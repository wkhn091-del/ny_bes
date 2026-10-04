import 'server-only';
import { getCatalog } from '@/lib/content/catalog';
import { isConfigured } from '@/lib/env.server';
import { logError } from '@/lib/logger';
import { hoursForDate } from '@/lib/domain/time';
import { SPACE_TYPE_LABELS } from '@/lib/domain/types';
import { rankRecommendations, type Recommendation } from '@/lib/recommendations/rank';
import { getOccupancyForDate, isRangeAvailable } from '@/lib/server/availability';
import { createSupabaseAdminClient } from '@/lib/supabase/server';

export interface SlotContext {
  date: string;
  startMinute: number;
  endMinute: number;
  seats: number;
}

/** Public-safe shape: catalog fields only, price straight from the published catalog (agorot, VAT-inclusive). */
export interface RecommendationCard {
  slug: string;
  name: string;
  typeLabel: string;
  place: string;
  image: { url: string; alt: string } | null;
  priceFrom: number;
  priceUnit: string;
  reason: Recommendation['reason'];
  label: string;
  href: string;
}

async function loadCoBookings(spaceId: string): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (!isConfigured.supabase()) return map;
  const { data, error } = await createSupabaseAdminClient().rpc('space_co_bookings', { p_space_id: spaceId });
  if (error) {
    logError('recommendations.co', error);
    return map;
  }
  for (const row of (data ?? []) as { space_id: string; customers: number }[]) map.set(row.space_id, row.customers);
  return map;
}

export async function getRankedRecommendations(spaceId: string, slot: SlotContext | null, limit = 3): Promise<Recommendation[]> {
  const catalog = await getCatalog();
  const target = catalog.spaces.find((s) => s.id === spaceId);
  if (!target) return [];

  const coBookings = await loadCoBookings(spaceId);

  let isBookable: ((space: (typeof catalog.spaces)[number], branch: (typeof catalog.branches)[number]) => boolean) | undefined;
  if (slot) {
    const candidateIds = catalog.spaces.filter((s) => s.id !== spaceId).map((s) => s.id);
    let occupancy: Awaited<ReturnType<typeof getOccupancyForDate>> | null = null;
    try {
      occupancy = await getOccupancyForDate(candidateIds, slot.date);
    } catch {
      // Without live data we cannot promise availability, so recommend nothing rather than something full.
      return [];
    }
    isBookable = (space, branch) => {
      const hours = hoursForDate(branch.hours, slot.date);
      if (!hours || slot.startMinute < hours.open || slot.endMinute > hours.close) return false;
      const seats = space.type === 'hotDesk' ? Math.min(slot.seats, space.capacity) : 1;
      if (space.type !== 'hotDesk' && space.capacity < slot.seats) return false;
      return isRangeAvailable(space, occupancy?.get(space.id), slot.startMinute, slot.endMinute, seats);
    };
  }

  return rankRecommendations({ target, spaces: catalog.spaces, branches: catalog.branches, coBookings, isBookable, limit });
}

export async function getRecommendations(spaceId: string, slot: SlotContext | null, limit = 3): Promise<RecommendationCard[]> {
  const ranked = await getRankedRecommendations(spaceId, slot, limit);
  return ranked.map(({ space, branch, reason, label }) => {
    const query = new URLSearchParams();
    if (slot) {
      query.set('reorder', '1');
      query.set('date', slot.date);
      query.set('start', String(slot.startMinute));
      query.set('end', String(slot.endMinute));
      query.set('seats', String(space.type === 'hotDesk' ? Math.min(slot.seats, space.capacity) : 1));
    }
    const qs = query.toString();
    return {
      slug: space.slug,
      name: space.name,
      typeLabel: SPACE_TYPE_LABELS[space.type],
      place: `${branch.name}, ${branch.city.name}`,
      image: space.images[0] ? { url: space.images[0].url, alt: space.images[0].alt } : null,
      priceFrom: space.hourlyPrice,
      priceUnit: space.type === 'hotDesk' ? 'לשעה לעמדה' : 'לשעה',
      reason,
      label,
      href: `/spaces/${space.slug}${qs ? `?${qs}` : ''}`,
    };
  });
}
