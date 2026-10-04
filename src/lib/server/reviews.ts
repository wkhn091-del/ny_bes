import 'server-only';
import { createHash } from 'node:crypto';
import { getCatalog } from '@/lib/content/catalog';
import { isConfigured } from '@/lib/env.server';
import { logError } from '@/lib/logger';
import { REVIEWS_CACHE_TAG, reviewsTagFor, reviewerDisplayName, summarizeRatings, type RatingSummary, type ReviewFields } from '@/lib/reviews/review';
import { sanitizeReviewImage } from '@/lib/server/review-images';
import { createSupabaseAdminClient } from '@/lib/supabase/server';
import { getSanityCustomersWriteClient } from '@/sanity/lib/client';

export interface PublicReview {
  id: string;
  rating: number;
  text: string;
  authorName: string;
  verified: boolean;
  submittedAt: string;
  photos: { url: string }[];
}

export interface SpaceReviews {
  summary: RatingSummary;
  reviews: PublicReview[];
}

const APPROVED_QUERY = `*[_type == "review" && spaceId == $spaceId && status == "approved"] | order(submittedAt desc) [0...60] {
  "id": _id, rating, text, authorName, verified, submittedAt,
  "photos": coalesce(photos[]{ "url": asset->url }, [])
}`;

const EMPTY: SpaceReviews = { summary: summarizeRatings([]), reviews: [] };

/** Approved reviews only, explicit projection (no user id, booking id or moderation notes leave the server). */
export async function getApprovedReviews(spaceId: string): Promise<SpaceReviews> {
  if (!isConfigured.sanityWrite()) return EMPTY;
  try {
    const rows = await getSanityCustomersWriteClient().fetch<PublicReview[]>(
      APPROVED_QUERY,
      { spaceId },
      { next: { revalidate: 600, tags: [REVIEWS_CACHE_TAG, reviewsTagFor(spaceId) ?? REVIEWS_CACHE_TAG] } },
    );
    const reviews = rows.filter((r) => r.photos.every((p) => typeof p.url === 'string' && p.url.startsWith('https://cdn.sanity.io/')));
    return { summary: summarizeRatings(reviews.map((r) => r.rating)), reviews };
  } catch (error) {
    logError('reviews.read', error, { spaceId });
    return EMPTY;
  }
}

export function reviewDocumentId(userId: string, spaceId: string): string {
  return `review-${createHash('sha256').update(`${userId}|${spaceId}`).digest('hex').slice(0, 40)}`;
}

export type Eligibility = { status: 'eligible'; bookingId: string } | { status: 'noBooking' } | { status: 'alreadyReviewed' } | { status: 'unavailable' };

/** Only customers with a paid booking that has already started may review — this is what "verified" means. */
export async function getReviewEligibility(userId: string, spaceId: string): Promise<Eligibility> {
  if (!isConfigured.supabase() || !isConfigured.sanityWrite()) return { status: 'unavailable' };
  try {
    const [{ data, error }, existing] = await Promise.all([
      createSupabaseAdminClient()
        .from('bookings')
        .select('id')
        .eq('user_id', userId)
        .eq('space_id', spaceId)
        .in('status', ['active', 'released'])
        .lte('starts_at', new Date().toISOString())
        .order('starts_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      getSanityCustomersWriteClient().fetch<string | null>('*[_id == $id][0]._id', { id: reviewDocumentId(userId, spaceId) }, { cache: 'no-store' }),
    ]);
    if (error) throw error;
    if (existing) return { status: 'alreadyReviewed' };
    return data ? { status: 'eligible', bookingId: data.id as string } : { status: 'noBooking' };
  } catch (error) {
    logError('reviews.eligibility', error, { spaceId });
    return { status: 'unavailable' };
  }
}

export type SubmitResult =
  | { ok: true }
  | { ok: false; error: 'not_eligible' | 'already_reviewed' | 'photo_invalid' | 'unavailable' };

export async function submitReview(userId: string, fields: ReviewFields, photos: File[]): Promise<SubmitResult> {
  const eligibility = await getReviewEligibility(userId, fields.spaceId);
  if (eligibility.status === 'alreadyReviewed') return { ok: false, error: 'already_reviewed' };
  if (eligibility.status === 'noBooking') return { ok: false, error: 'not_eligible' };
  if (eligibility.status !== 'eligible') return { ok: false, error: 'unavailable' };

  const catalog = await getCatalog();
  const space = catalog.spaces.find((s) => s.id === fields.spaceId);
  if (!space) return { ok: false, error: 'not_eligible' };

  const cleaned = await Promise.all(photos.map(sanitizeReviewImage));
  if (cleaned.some((c) => c === null)) return { ok: false, error: 'photo_invalid' };

  const client = getSanityCustomersWriteClient();
  const { data: profile } = await createSupabaseAdminClient().from('profiles').select('full_name').eq('id', userId).maybeSingle();

  const uploadedIds: string[] = [];
  try {
    for (const image of cleaned) {
      const asset = await client.assets.upload('image', image!.buffer, { filename: image!.filename, contentType: image!.contentType });
      uploadedIds.push(asset._id);
    }
    await client.create({
      _id: reviewDocumentId(userId, fields.spaceId),
      _type: 'review',
      status: 'pending',
      spaceId: space.id,
      spaceName: space.name,
      rating: fields.rating,
      text: fields.text,
      authorName: reviewerDisplayName(profile?.full_name as string | null | undefined),
      supabaseUserId: userId,
      bookingId: eligibility.bookingId,
      verified: true,
      submittedAt: new Date().toISOString(),
      photos: uploadedIds.map((id, i) => ({ _key: `p${i}`, _type: 'image', asset: { _type: 'reference', _ref: id } })),
    });
    return { ok: true };
  } catch (error) {
    await Promise.allSettled(uploadedIds.map((id) => client.delete(id)));
    const conflict = (error as { statusCode?: number }).statusCode === 409;
    if (!conflict) logError('reviews.submit', error, { spaceId: fields.spaceId });
    return { ok: false, error: conflict ? 'already_reviewed' : 'unavailable' };
  }
}

/** Account deletion: remove every review by the user and the photos attached to them. */
export async function deleteUserReviews(userId: string): Promise<void> {
  if (!isConfigured.sanityWrite()) return;
  const client = getSanityCustomersWriteClient();
  const rows = await client.fetch<{ _id: string; assets: string[] | null }[]>(
    '*[_type == "review" && supabaseUserId == $userId]{ _id, "assets": photos[].asset._ref }',
    { userId },
    { cache: 'no-store' },
  );
  if (rows.length === 0) return;
  const tx = client.transaction();
  for (const row of rows) tx.delete(row._id);
  await tx.commit();
  await Promise.allSettled(rows.flatMap((r) => r.assets ?? []).map((id) => client.delete(id)));
}
