import { NextResponse, type NextRequest } from 'next/server';
import { getCatalog } from '@/lib/content/catalog';
import { MIN_BOOKING_MINUTES, SLOT_MINUTES, hoursForDate, slotStartsForDate } from '@/lib/domain/time';
import { availabilitySearchSchema } from '@/lib/domain/schemas';
import { logError } from '@/lib/logger';
import { rateLimit } from '@/lib/security/rate-limit';
import { getClientIpFromRequest } from '@/lib/security/request-meta';
import { capacityOf, getOccupancyForDate, isRangeAvailable } from '@/lib/server/availability';

/**
 * Returns the ids of spaces with availability on a date. With a time range: spaces free for the
 * whole range. Without: spaces that have at least one bookable hour that day. No PII is exposed.
 */
export async function GET(request: NextRequest) {
  const ip = getClientIpFromRequest(request);
  if (!(await rateLimit('availability', ip))) {
    return NextResponse.json({ error: 'too_many_requests' }, { status: 429 });
  }

  const sp = request.nextUrl.searchParams;
  const parsed = availabilitySearchSchema.safeParse({
    date: sp.get('date'),
    startMinute: sp.get('startMinute') ?? undefined,
    endMinute: sp.get('endMinute') ?? undefined,
    seats: sp.get('seats') ?? undefined,
    city: sp.get('city') ?? undefined,
  });
  if (!parsed.success) return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  const { date, startMinute, endMinute, seats, city } = parsed.data;
  if ((startMinute === undefined) !== (endMinute === undefined) || (startMinute !== undefined && endMinute! <= startMinute)) {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  }

  try {
    const catalog = await getCatalog();
    const branches = new Map(catalog.branches.map((b) => [b.id, b]));
    const candidates = catalog.spaces.filter((s) => {
      const branch = branches.get(s.branchId);
      if (!branch) return false;
      if (city && branch.city.slug !== city) return false;
      return s.type === 'hotDesk' ? Math.min(s.capacity, s.poolSize ?? 0) >= seats : s.capacity >= seats;
    });

    const occupancy = await getOccupancyForDate(
      candidates.map((s) => s.id),
      date,
    );

    const availableSpaceIds: string[] = [];
    const remainingBySpace: Record<string, number> = {};
    for (const space of candidates) {
      const branch = branches.get(space.branchId)!;
      const usage = occupancy.get(space.id);
      const slots = slotStartsForDate(branch, date);
      const slotSet = new Set(slots);

      if (startMinute !== undefined && endMinute !== undefined) {
        const window = hoursForDate(branch.hours, date);
        if (!window || startMinute < window.open || endMinute > window.close) continue;
        let allFuture = true;
        for (let m = startMinute; m < endMinute; m += SLOT_MINUTES) if (!slotSet.has(m)) allFuture = false;
        if (!allFuture) continue;
        if (isRangeAvailable(space, usage, startMinute, endMinute, seats)) {
          availableSpaceIds.push(space.id);
          if (space.type === 'hotDesk') {
            let min = capacityOf(space);
            for (let m = startMinute; m < endMinute; m += SLOT_MINUTES) min = Math.min(min, capacityOf(space) - (usage?.get(m) ?? 0));
            remainingBySpace[space.id] = min;
          }
        }
        continue;
      }

      const need = MIN_BOOKING_MINUTES / SLOT_MINUTES;
      const needed = space.type === 'hotDesk' ? seats : 1;
      let run = 0;
      let prev = Number.NEGATIVE_INFINITY;
      let found = false;
      for (const m of slots) {
        const free = capacityOf(space) - (usage?.get(m) ?? 0) >= needed;
        run = free ? (m === prev + SLOT_MINUTES ? run + 1 : 1) : 0;
        prev = m;
        if (run >= need) {
          found = true;
          break;
        }
      }
      if (found) availableSpaceIds.push(space.id);
    }

    return NextResponse.json(
      { date, availableSpaceIds, remaining: remainingBySpace },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    logError('api.availability.search', error);
    return NextResponse.json({ error: 'unavailable' }, { status: 503 });
  }
}
