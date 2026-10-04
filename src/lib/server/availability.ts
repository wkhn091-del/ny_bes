import 'server-only';
import { isConfigured } from '@/lib/env.server';
import { logError } from '@/lib/logger';
import { SLOT_MINUTES, israelToUtc, slotStartsForDate, utcToIsrael } from '@/lib/domain/time';
import type { Branch, Space } from '@/lib/domain/types';
import type { LiveSpace } from '@/components/home/floor-types';
import { createSupabaseAdminClient } from '@/lib/supabase/server';

/** spaceId → (minute-of-day → seats used) for one Israel calendar date. */
export type OccupancyMap = Map<string, Map<number, number>>;

export class AvailabilityUnavailableError extends Error {
  constructor() {
    super('Availability temporarily unavailable');
    this.name = 'AvailabilityUnavailableError';
  }
}

export async function getOccupancyForDate(spaceIds: string[], date: string): Promise<OccupancyMap> {
  const result: OccupancyMap = new Map(spaceIds.map((id) => [id, new Map()]));
  if (spaceIds.length === 0 || !isConfigured.supabase()) return result;

  const from = israelToUtc(date, 0);
  const to = israelToUtc(date, 24 * 60 - SLOT_MINUTES);
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc('space_occupancy', {
    p_space_ids: spaceIds,
    p_from: from.toISOString(),
    p_to: new Date(to.getTime() + SLOT_MINUTES * 60_000).toISOString(),
  });
  if (error) {
    logError('availability.occupancy', error, { date });
    throw new AvailabilityUnavailableError();
  }
  for (const row of (data ?? []) as { space_id: string; slot_start: string; used: number }[]) {
    const { minutes } = utcToIsrael(row.slot_start);
    result.get(row.space_id)?.set(minutes, row.used);
  }
  return result;
}

export interface SlotAvailability {
  start: number;
  /** seats still free (exclusive spaces: 1 or 0) */
  remaining: number;
  available: boolean;
}

export function capacityOf(space: Pick<Space, 'type' | 'poolSize'>): number {
  return space.type === 'hotDesk' ? (space.poolSize ?? 0) : 1;
}

/** The branch on the live floor map: the requested one, else the flagship. */
export function liveMapBranch<B extends Pick<Branch, 'slug' | 'isFlagship'>>(branches: B[], slug: string | null): B | undefined {
  return branches.find((b) => b.slug === slug) ?? branches.find((b) => b.isFlagship) ?? branches[0];
}

export function liveMapSpaces(spaces: Space[], branchId: string, usedOf: (spaceId: string) => number = () => 0): LiveSpace[] {
  return spaces
    .filter((s) => s.branchId === branchId)
    .map((s) => {
      const capacity = capacityOf(s);
      return { id: s.id, slug: s.slug, name: s.name, type: s.type, capacity, used: Math.min(usedOf(s.id), capacity), seats: s.capacity };
    });
}

export function buildSlotAvailability(
  space: Pick<Space, 'type' | 'poolSize'>,
  branch: Pick<Branch, 'hours'>,
  date: string,
  usage: Map<number, number> | undefined,
  now: Date = new Date(),
): SlotAvailability[] {
  const capacity = capacityOf(space);
  return slotStartsForDate(branch, date, now).map((start) => {
    const remaining = Math.max(0, capacity - (usage?.get(start) ?? 0));
    return { start, remaining, available: remaining > 0 };
  });
}

/** True when every 30-minute slot in [start, end) has at least `seats` free. */
export function isRangeAvailable(
  space: Pick<Space, 'type' | 'poolSize'>,
  usage: Map<number, number> | undefined,
  startMinute: number,
  endMinute: number,
  seats: number,
): boolean {
  const capacity = capacityOf(space);
  const needed = space.type === 'hotDesk' ? seats : 1;
  for (let m = startMinute; m < endMinute; m += SLOT_MINUTES) {
    if (capacity - (usage?.get(m) ?? 0) < needed) return false;
  }
  return true;
}

export async function getRecentBookingCounts(): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (!isConfigured.supabase()) return counts;
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc('recent_booking_counts', { p_days: 7 });
  if (error) {
    logError('availability.recent', error);
    return counts;
  }
  for (const row of (data ?? []) as { space_id: string; bookings: number }[]) {
    counts.set(row.space_id, row.bookings);
  }
  return counts;
}
