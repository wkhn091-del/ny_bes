import { z } from 'zod';

export const REVIEWS_CACHE_TAG = 'sanity:reviews';

const SANITY_ID = /^[A-Za-z0-9._-]{1,128}$/;

/** Per-space tag so a moderated review refreshes one page's data, not every space. Null for anything that isn't a plain document id. */
export function reviewsTagFor(spaceId: unknown): string | null {
  return typeof spaceId === 'string' && SANITY_ID.test(spaceId) ? `sanity:reviews:${spaceId}` : null;
}
export const REVIEW_TEXT_MIN = 20;
export const REVIEW_TEXT_MAX = 1000;

const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B-\u200F\u202A-\u202E\u2066-\u2069]/g;

/** Plain text only: control and bidi-override characters (used to spoof text direction) are stripped. */
export function cleanReviewText(raw: string): string {
  return raw.replace(CONTROL_CHARS, '').replace(/\r\n?/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

export const reviewFieldsSchema = z.object({
  spaceId: z.string().min(1).max(128).regex(/^[A-Za-z0-9._-]+$/),
  rating: z.coerce.number().int().min(1).max(5),
  text: z
    .string()
    .max(REVIEW_TEXT_MAX * 2)
    .transform(cleanReviewText)
    .pipe(z.string().min(REVIEW_TEXT_MIN).max(REVIEW_TEXT_MAX)),
  /** honeypot — real people never see or fill it */
  website: z.literal('').optional().default(''),
  turnstileToken: z.string().max(2048).optional().default(''),
});

export type ReviewFields = z.infer<typeof reviewFieldsSchema>;

/** "דנה כהן" → "דנה כ." — never the full name, never the email. */
export function reviewerDisplayName(fullName: string | null | undefined): string {
  const parts = cleanReviewText(fullName ?? '')
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return 'לקוח/ה מאומת/ת';
  const first = parts[0].slice(0, 24);
  const lastInitial = parts.length > 1 ? ` ${parts[parts.length - 1][0]}.` : '';
  return `${first}${lastInitial}`;
}

export interface RatingSummary {
  count: number;
  average: number;
  /** index 0 = one star … index 4 = five stars */
  distribution: [number, number, number, number, number];
}

export function summarizeRatings(ratings: number[]): RatingSummary {
  const distribution: RatingSummary['distribution'] = [0, 0, 0, 0, 0];
  let total = 0;
  for (const r of ratings) {
    if (!Number.isInteger(r) || r < 1 || r > 5) continue;
    distribution[r - 1] += 1;
    total += r;
  }
  const count = distribution.reduce((a, b) => a + b, 0);
  return { count, average: count ? Math.round((total / count) * 10) / 10 : 0, distribution };
}
