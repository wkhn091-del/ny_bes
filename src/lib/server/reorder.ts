import 'server-only';
import { validateSlotRequest } from '@/lib/domain/booking-rules';
import { addDays, nowInIsrael } from '@/lib/domain/time';
import type { Branch, Catalog, Space } from '@/lib/domain/types';
import type { BookingView } from '@/lib/notifications/booking-view';
import { getOccupancyForDate, isRangeAvailable } from './availability';

export const REORDER_SCAN_DAYS = 14;

export interface ReorderSlot {
  space: Space;
  date: string;
  startMinute: number;
  endMinute: number;
  seats: number;
  isDayPass: boolean;
  addonIds: string[];
}

export type ReorderPlan =
  | { kind: 'same'; slot: ReorderSlot }
  | { kind: 'similar'; reason: 'removed' | 'unavailable'; branch: Branch | null; options: ReorderSlot[] };

export function reorderHref(slot: ReorderSlot): string {
  const p = new URLSearchParams({
    reorder: '1',
    date: slot.date,
    start: String(slot.startMinute),
    end: String(slot.endMinute),
    seats: String(slot.seats),
  });
  if (slot.isDayPass) p.set('dayPass', '1');
  if (slot.addonIds.length) p.set('addons', slot.addonIds.join(','));
  return `/spaces/${slot.space.slug}?${p}`;
}

/**
 * "Book again": the same space, hours and add-ons on the nearest free date within 14 days; otherwise
 * other spaces in the same branch that are free at those hours. Availability is advisory here — the
 * database re-checks atomically when the hold is created.
 */
export async function planReorder(booking: BookingView, catalog: Catalog, now = new Date()): Promise<ReorderPlan> {
  const today = nowInIsrael(now).date;
  const dates = Array.from({ length: REORDER_SCAN_DAYS }, (_, i) => addDays(today, i));
  const branch = catalog.branches.find((b) => b.id === booking.branchId) ?? null;
  const original = catalog.spaces.find((s) => s.id === booking.spaceId) ?? null;
  const previousAddons = booking.addons.map((a) => a.addonId);

  const slotFor = (space: Space, date: string): ReorderSlot | null => {
    const spaceBranch = catalog.branches.find((b) => b.id === space.branchId);
    if (!spaceBranch) return null;
    const isDayPass = booking.isDayPass && space.type === 'privateOffice' && space.dayPassPrice !== null;
    const seats = space.type === 'hotDesk' ? booking.seats : 1;
    const check = validateSlotRequest(space, spaceBranch, {
      date,
      startMinute: booking.startMinute,
      endMinute: booking.endMinute,
      seats,
      isDayPass,
    });
    if (!check.ok) return null;
    const allowed = new Set(catalog.addons.filter((a) => a.spaceTypes.includes(space.type)).map((a) => a.id));
    return {
      space,
      date,
      startMinute: check.startMinute,
      endMinute: check.endMinute,
      seats: check.seats,
      isDayPass,
      addonIds: previousAddons.filter((id) => allowed.has(id)),
    };
  };

  const candidates = branch
    ? catalog.spaces
        .filter((s) => s.branchId === branch.id && s.id !== booking.spaceId)
        .filter((s) => (s.type === 'hotDesk' ? Math.min(s.poolSize ?? 0, s.capacity) >= booking.seats : true))
        .sort((a, b) => Number(b.type === booking.spaceType) - Number(a.type === booking.spaceType))
    : [];
  const scanned = original ? [original, ...candidates] : candidates;
  if (scanned.length === 0) {
    return { kind: 'similar', reason: original ? 'unavailable' : 'removed', branch, options: [] };
  }

  const occupancyByDate = await Promise.all(
    dates.map((date) => getOccupancyForDate(scanned.map((s) => s.id), date).catch(() => null)),
  );

  const firstFree = (space: Space): ReorderSlot | null => {
    for (let i = 0; i < dates.length; i += 1) {
      const occupancy = occupancyByDate[i];
      if (!occupancy) continue;
      const slot = slotFor(space, dates[i]);
      if (slot && isRangeAvailable(space, occupancy.get(space.id), slot.startMinute, slot.endMinute, slot.seats)) return slot;
    }
    return null;
  };

  if (original) {
    const slot = firstFree(original);
    if (slot) return { kind: 'same', slot };
  }

  const options = candidates
    .map(firstFree)
    .filter((s): s is ReorderSlot => s !== null)
    .slice(0, 6);
  return { kind: 'similar', reason: original ? 'unavailable' : 'removed', branch, options };
}
