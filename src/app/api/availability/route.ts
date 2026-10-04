import { NextResponse, type NextRequest } from 'next/server';
import { getCatalog } from '@/lib/content/catalog';
import { availabilityQuerySchema } from '@/lib/domain/schemas';
import { logError } from '@/lib/logger';
import { rateLimit } from '@/lib/security/rate-limit';
import { getClientIpFromRequest } from '@/lib/security/request-meta';
import { buildSlotAvailability, capacityOf, getOccupancyForDate } from '@/lib/server/availability';

export async function GET(request: NextRequest) {
  const ip = getClientIpFromRequest(request);
  if (!(await rateLimit('availability', ip))) {
    return NextResponse.json({ error: 'too_many_requests' }, { status: 429 });
  }

  const parsed = availabilityQuerySchema.safeParse({
    spaceId: request.nextUrl.searchParams.get('spaceId'),
    date: request.nextUrl.searchParams.get('date'),
  });
  if (!parsed.success) return NextResponse.json({ error: 'invalid_request' }, { status: 400 });

  try {
    const catalog = await getCatalog();
    const space = catalog.spaces.find((s) => s.id === parsed.data.spaceId);
    const branch = space && catalog.branches.find((b) => b.id === space.branchId);
    if (!space || !branch) return NextResponse.json({ error: 'not_found' }, { status: 404 });

    const occupancy = await getOccupancyForDate([space.id], parsed.data.date);
    const slots = buildSlotAvailability(space, branch, parsed.data.date, occupancy.get(space.id));
    return NextResponse.json(
      { date: parsed.data.date, capacity: capacityOf(space), slots },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    logError('api.availability', error);
    return NextResponse.json({ error: 'unavailable' }, { status: 503 });
  }
}
