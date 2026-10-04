import { NextResponse, type NextRequest } from 'next/server';
import { getCatalog } from '@/lib/content/catalog';
import { SLOT_MINUTES, hoursForDate, nextOpenDate, nowInIsrael, slotStartsForDate } from '@/lib/domain/time';
import { logError } from '@/lib/logger';
import { rateLimit } from '@/lib/security/rate-limit';
import { getClientIpFromRequest } from '@/lib/security/request-meta';
import { capacityOf, getOccupancyForDate } from '@/lib/server/availability';

/** Live "right now" occupancy for the 3D floor map. Aggregates only. */
export async function GET(request: NextRequest) {
  const ip = getClientIpFromRequest(request);
  if (!(await rateLimit('availability', ip))) {
    return NextResponse.json({ error: 'too_many_requests' }, { status: 429 });
  }

  const branchSlug = request.nextUrl.searchParams.get('branch');
  if (branchSlug !== null && !/^[a-z0-9-]{1,96}$/.test(branchSlug)) {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  }

  try {
    const catalog = await getCatalog();
    const branch =
      catalog.branches.find((b) => b.slug === branchSlug) ??
      catalog.branches.find((b) => b.isFlagship) ??
      catalog.branches[0];
    if (!branch) return NextResponse.json({ error: 'not_found' }, { status: 404 });

    const now = new Date();
    const { date, minutes } = nowInIsrael(now);
    const window = hoursForDate(branch.hours, date);
    const currentSlot = minutes - (minutes % SLOT_MINUTES);
    const isOpen = Boolean(window && currentSlot >= window.open && currentSlot < window.close);

    let at: { date: string; minute: number } | null = isOpen ? { date, minute: currentSlot } : null;
    if (!isOpen) {
      const nextDate = nextOpenDate(branch, now);
      const firstSlot = slotStartsForDate(branch, nextDate, now)[0];
      if (firstSlot !== undefined) at = { date: nextDate, minute: firstSlot };
    }

    const spaces = catalog.spaces.filter((s) => s.branchId === branch.id);
    const occupancy = at ? await getOccupancyForDate(spaces.map((s) => s.id), at.date) : new Map();
    const slot = at?.minute ?? -1;

    return NextResponse.json(
      {
        branch: { slug: branch.slug, name: branch.name, city: branch.city.name },
        isOpen,
        at,
        spaces: spaces.map((s) => {
          const capacity = capacityOf(s);
          const used = (occupancy.get(s.id) as Map<number, number> | undefined)?.get(slot) ?? 0;
          return {
            id: s.id,
            slug: s.slug,
            name: s.name,
            type: s.type,
            capacity,
            used: Math.min(used, capacity),
            seats: s.capacity,
          };
        }),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    logError('api.availability.now', error);
    return NextResponse.json({ error: 'unavailable' }, { status: 503 });
  }
}
