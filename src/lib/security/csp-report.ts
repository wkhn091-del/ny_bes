import { z } from 'zod';

export const CSP_REPORT_MAX_BYTES = 16_384;

export interface CspViolation {
  directive: string;
  blocked: string;
  page: string;
}

const field = z.string().max(2048).optional();

const legacySchema = z.object({
  'csp-report': z.object({
    'effective-directive': field,
    'violated-directive': field,
    'blocked-uri': field,
    'document-uri': field,
  }),
});

const reportingApiSchema = z
  .array(
    z.object({
      type: z.string().max(64),
      body: z
        .object({
          effectiveDirective: field,
          blockedURL: field,
          documentURL: field,
        })
        .optional(),
    }),
  )
  .max(20);

/** Keeps only scheme + host (+ path for same-origin pages): query strings can carry tokens or personal data. */
function scrubUrl(raw: string | undefined): string {
  if (!raw) return 'unknown';
  if (/^(inline|eval|wasm-eval|trusted-types-sink|self|data|blob)$/.test(raw)) return raw;
  try {
    const url = new URL(raw);
    if (url.protocol === 'data:' || url.protocol === 'blob:') return url.protocol.slice(0, -1);
    return `${url.protocol}//${url.host}`;
  } catch {
    return 'invalid';
  }
}

function scrubPage(raw: string | undefined): string {
  if (!raw) return 'unknown';
  try {
    return new URL(raw).pathname.slice(0, 200);
  } catch {
    return 'invalid';
  }
}

function clean(value: string | undefined): string {
  return (value ?? 'unknown').replace(/[^a-z-]/gi, '').slice(0, 64) || 'unknown';
}

/** Parses both the legacy `report-uri` body and the Reporting API batch into scrubbed, bounded records. */
export function parseCspReports(contentType: string, raw: string): CspViolation[] {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return [];
  }
  if (contentType.includes('application/csp-report')) {
    const parsed = legacySchema.safeParse(json);
    if (!parsed.success) return [];
    const r = parsed.data['csp-report'];
    return [
      {
        directive: clean(r['effective-directive'] ?? r['violated-directive']?.split(' ')[0]),
        blocked: scrubUrl(r['blocked-uri']),
        page: scrubPage(r['document-uri']),
      },
    ];
  }
  if (contentType.includes('application/reports+json')) {
    const parsed = reportingApiSchema.safeParse(json);
    if (!parsed.success) return [];
    return parsed.data
      .filter((r) => r.type === 'csp-violation' && r.body)
      .map((r) => ({
        directive: clean(r.body!.effectiveDirective),
        blocked: scrubUrl(r.body!.blockedURL),
        page: scrubPage(r.body!.documentURL),
      }));
  }
  return [];
}
