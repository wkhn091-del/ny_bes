import { NextResponse, type NextRequest } from 'next/server';
import { logWarn } from '@/lib/logger';
import { CSP_REPORT_MAX_BYTES, parseCspReports } from '@/lib/security/csp-report';
import { rateLimit } from '@/lib/security/rate-limit';
import { getClientIpFromRequest } from '@/lib/security/request-meta';

const empty = () => new NextResponse(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });

export async function POST(request: NextRequest) {
  const contentType = request.headers.get('content-type') ?? '';
  if (!/application\/(csp-report|reports\+json)/.test(contentType)) return empty();
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (declared > CSP_REPORT_MAX_BYTES) return empty();
  if (!(await rateLimit('cspReport', getClientIpFromRequest(request)))) return empty();

  const raw = await request.text();
  if (raw.length > CSP_REPORT_MAX_BYTES) return empty();
  for (const violation of parseCspReports(contentType, raw)) {
    logWarn('csp.violation', `${violation.directive} blocked ${violation.blocked}`, { page: violation.page });
  }
  return empty();
}
