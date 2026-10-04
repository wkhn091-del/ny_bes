import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { dateSchema, minuteSchema, sanityIdSchema } from '@/lib/domain/schemas';
import { logError } from '@/lib/logger';
import { rateLimit } from '@/lib/security/rate-limit';
import { getClientIpFromRequest } from '@/lib/security/request-meta';
import { getRecommendations } from '@/lib/server/recommendations';

const querySchema = z
  .object({
    space: sanityIdSchema,
    date: dateSchema.optional(),
    start: z.coerce.number().pipe(minuteSchema).optional(),
    end: z.coerce.number().pipe(minuteSchema).optional(),
    seats: z.coerce.number().int().min(1).max(50).default(1),
  })
  .refine((q) => (q.date === undefined) === (q.start === undefined) && (q.start === undefined) === (q.end === undefined), {
    message: 'date, start and end go together',
  })
  .refine((q) => q.start === undefined || q.end === undefined || q.end > q.start, { message: 'end must be after start' });

function reply(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const parsed = querySchema.safeParse({
    space: sp.get('space') ?? undefined,
    date: sp.get('date') ?? undefined,
    start: sp.get('start') ?? undefined,
    end: sp.get('end') ?? undefined,
    seats: sp.get('seats') ?? undefined,
  });
  if (!parsed.success) return reply({ error: 'invalid_request' }, 400);
  if (!(await rateLimit('recommendations', getClientIpFromRequest(request)))) return reply({ error: 'rate_limited' }, 429);

  const q = parsed.data;
  try {
    const slot =
      q.date !== undefined && q.start !== undefined && q.end !== undefined
        ? { date: q.date, startMinute: q.start, endMinute: q.end, seats: q.seats }
        : null;
    return reply({ items: await getRecommendations(q.space, slot) });
  } catch (error) {
    logError('recommendations', error);
    return reply({ items: [] });
  }
}
