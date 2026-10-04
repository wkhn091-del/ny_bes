import { revalidateTag } from 'next/cache';
import { NextResponse, type NextRequest } from 'next/server';
import { parseBody } from 'next-sanity/webhook';
import { CONTENT_CACHE_TAG } from '@/lib/content/catalog';
import { isConfigured, requireEnv } from '@/lib/env.server';
import { logError, logInfo } from '@/lib/logger';
import { REVIEWS_CACHE_TAG, reviewsTagFor } from '@/lib/reviews/review';
import { mirrorSourceSchema, syncMirrors } from '@/lib/sync/mirror';
import { getSanityFreshClient } from '@/sanity/lib/client';
import { MIRROR_SOURCE_QUERY } from '@/sanity/lib/queries';
import { createSupabaseAdminClient } from '@/lib/supabase/server';

const MIRRORED_TYPES = new Set(['branch', 'space']);

/**
 * Signed GROQ-powered webhook from Sanity (configure in sanity.io/manage → API → Webhooks):
 * filter `_type in ["siteSettings","seo","legal","city","branch","space","amenity","addon"]`,
 * projection `{_type, _id}`, secret = SANITY_WEBHOOK_SECRET. To fire on spaces only when price/availability-relevant
 * fields change, use `_type != "space" || delta::changedAny((hourlyPrice, dayPassPrice, capacity, poolSize, active, slug))`.
 * A second webhook on the `customers` dataset with filter `_type == "review"` and projection `{_type, _id, spaceId}`
 * refreshes only that space's reviews. Content is one catalog query, so its tag refetches a single GROQ call — no rebuild.
 */
export async function POST(request: NextRequest) {
  if (!isConfigured.sanity()) return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  const { SANITY_WEBHOOK_SECRET } = requireEnv('sanity', 'SANITY_WEBHOOK_SECRET');

  let parsed;
  try {
    parsed = await parseBody<{ _type?: string; _id?: string; spaceId?: string }>(request, SANITY_WEBHOOK_SECRET, true);
  } catch {
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  }
  if (!parsed.isValidSignature) return NextResponse.json({ error: 'invalid_signature' }, { status: 401 });

  const type = typeof parsed.body?._type === 'string' ? parsed.body._type : '';
  if (type === 'review') {
    revalidateTag(reviewsTagFor(parsed.body?.spaceId) ?? REVIEWS_CACHE_TAG, 'max');
    return NextResponse.json({ revalidated: true });
  }
  revalidateTag(CONTENT_CACHE_TAG, 'max');

  if (MIRRORED_TYPES.has(type) && isConfigured.supabase()) {
    try {
      const raw = await getSanityFreshClient().fetch(MIRROR_SOURCE_QUERY, {}, { cache: 'no-store' });
      const source = mirrorSourceSchema.parse(raw);
      const result = await syncMirrors(createSupabaseAdminClient(), source);
      logInfo('sanity.webhook', 'Mirrors synced', { branches: result.branches, spaces: result.spaces, skipped: result.skipped.length });
    } catch (error) {
      logError('sanity.webhook.mirror', error, { type });
      return NextResponse.json({ error: 'sync_failed' }, { status: 500 });
    }
  }

  return NextResponse.json({ revalidated: true });
}
