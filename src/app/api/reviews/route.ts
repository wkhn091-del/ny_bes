import { NextResponse, type NextRequest } from 'next/server';
import { logError } from '@/lib/logger';
import { reviewFieldsSchema } from '@/lib/reviews/review';
import { REVIEW_PHOTO_MAX_BYTES, REVIEW_PHOTO_MAX_COUNT } from '@/lib/security/image-guard';
import { rateLimit } from '@/lib/security/rate-limit';
import { getClientIpFromRequest } from '@/lib/security/request-meta';
import { verifyTurnstile } from '@/lib/security/turnstile';
import { getSessionUser } from '@/lib/server/auth';
import { submitReview } from '@/lib/server/reviews';

/** Below Vercel's 4.5 MB function body cap; photos are downscaled in the browser before upload. */
const MAX_BODY_BYTES = REVIEW_PHOTO_MAX_BYTES * REVIEW_PHOTO_MAX_COUNT + 64 * 1024;

function reply(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

function sameOrigin(request: NextRequest): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  try {
    const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

async function readCapped(request: NextRequest, max: number): Promise<Uint8Array | null> {
  if (!request.body) return null;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.byteLength;
  }
  return out;
}

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return reply({ error: 'forbidden' }, 403);
  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.startsWith('multipart/form-data')) return reply({ error: 'unsupported_media_type' }, 415);
  if (Number(request.headers.get('content-length') ?? 0) > MAX_BODY_BYTES) return reply({ error: 'too_large' }, 413);

  const user = await getSessionUser();
  if (!user) return reply({ error: 'unauthorized' }, 401);

  const ip = getClientIpFromRequest(request);
  const [userOk, dailyOk] = await Promise.all([rateLimit('reviewSubmit', user.id), rateLimit('reviewDaily', 'global')]);
  if (!userOk || !dailyOk) return reply({ error: 'rate_limited' }, 429);

  const raw = await readCapped(request, MAX_BODY_BYTES);
  if (!raw) return reply({ error: 'too_large' }, 413);

  let form: FormData;
  try {
    form = await new Response(raw as BodyInit, { headers: { 'content-type': contentType } }).formData();
  } catch {
    return reply({ error: 'invalid_request' }, 400);
  }

  const text = (key: string) => {
    const v = form.get(key);
    return typeof v === 'string' ? v : undefined;
  };
  const parsed = reviewFieldsSchema.safeParse({
    spaceId: text('spaceId'),
    rating: text('rating'),
    text: text('text'),
    website: text('website') ?? '',
    turnstileToken: text('turnstileToken') ?? '',
  });
  if (!parsed.success) return reply({ error: 'invalid_request' }, 400);

  const photos = form.getAll('photos').filter((p): p is File => typeof p !== 'string' && p.size > 0);
  if (photos.length > REVIEW_PHOTO_MAX_COUNT) return reply({ error: 'too_many_photos' }, 400);

  if (!(await verifyTurnstile(parsed.data.turnstileToken, ip, 'review'))) return reply({ error: 'captcha' }, 400);

  try {
    const result = await submitReview(user.id, parsed.data, photos);
    if (result.ok) return reply({ ok: true });
    const status = result.error === 'unavailable' ? 503 : result.error === 'already_reviewed' ? 409 : result.error === 'not_eligible' ? 403 : 400;
    return reply({ error: result.error }, status);
  } catch (error) {
    logError('reviews.route', error);
    return reply({ error: 'unavailable' }, 503);
  }
}
