import { NextResponse, type NextRequest } from 'next/server';
import { rateLimit } from '@/lib/security/rate-limit';
import { getClientIpFromRequest } from '@/lib/security/request-meta';

/** Liveness only: no versions, environment, dependency status or timings. */
export async function GET(request: NextRequest) {
  if (!(await rateLimit('health', getClientIpFromRequest(request)))) {
    return new NextResponse(null, { status: 429, headers: { 'Cache-Control': 'no-store' } });
  }
  return NextResponse.json({ status: 'ok' }, { headers: { 'Cache-Control': 'no-store' } });
}
