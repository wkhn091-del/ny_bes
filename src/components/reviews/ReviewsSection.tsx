import { BadgeCheck, MessageSquareText } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import type { Eligibility, SpaceReviews } from '@/lib/server/reviews';
import { ReviewForm } from './ReviewForm';
import { Stars } from './Stars';

interface Props {
  spaceId: string;
  spaceSlug: string;
  data: SpaceReviews;
  /** null = signed out */
  eligibility: Eligibility | null;
  turnstileSiteKey: string;
  nonce?: string;
}

const dateFormat = new Intl.DateTimeFormat('he-IL', { month: 'long', year: 'numeric', timeZone: 'Asia/Jerusalem' });

export function ReviewsSection({ spaceId, spaceSlug, data, eligibility, turnstileSiteKey, nonce }: Props) {
  const { summary, reviews } = data;

  return (
    <section aria-labelledby="reviews-title" id="reviews" className="scroll-mt-24">
      <h2 id="reviews-title" className="mb-4 text-xl font-semibold">
        ביקורות של לקוחות
      </h2>

      {summary.count > 0 ? (
        <div className="mb-6 grid gap-6 rounded-2xl border border-border p-5 sm:grid-cols-[auto_1fr]">
          <div className="text-center sm:pe-6">
            <p className="text-4xl font-bold tabular-nums">{summary.average.toFixed(1)}</p>
            <Stars value={summary.average} size="md" />
            <p className="mt-1 text-xs text-muted">{summary.count === 1 ? 'ביקורת אחת' : `${summary.count} ביקורות`} מהזמנות מאומתות</p>
          </div>
          <ul className="space-y-1.5" aria-label="התפלגות הדירוגים">
            {[5, 4, 3, 2, 1].map((star) => {
              const n = summary.distribution[star - 1];
              const pct = summary.count ? Math.round((n / summary.count) * 100) : 0;
              return (
                <li key={star} className="flex items-center gap-2 text-xs">
                  <span className="w-8 tabular-nums text-muted">{star} ★</span>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-subtle">
                    <span className="block h-full rounded-full bg-warning" style={{ width: `${pct}%` }} />
                  </span>
                  <span className="w-8 text-left tabular-nums text-muted">{n}</span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <p className="mb-6 flex items-start gap-2 rounded-2xl border border-dashed border-border p-5 text-sm text-muted">
          <MessageSquareText className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          עדיין אין ביקורות מאושרות לחלל הזה. אנחנו מפרסמים רק ביקורות של מי שהזמין ושהה כאן בפועל — בלי ביקורות קנויות.
        </p>
      )}

      {reviews.length > 0 && (
        <ul className="mb-8 space-y-5">
          {reviews.map((r) => (
            <li key={r.id} className="border-b border-border pb-5 last:border-0">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <Stars value={r.rating} />
                <span className="text-sm font-semibold">{r.authorName}</span>
                {r.verified && (
                  <span className="inline-flex items-center gap-1 text-xs text-success">
                    <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" /> הזמנה מאומתת
                  </span>
                )}
                <span className="text-xs text-muted">{dateFormat.format(new Date(r.submittedAt))}</span>
              </div>
              <p className="mt-2 whitespace-pre-line text-sm leading-7 text-fg/90">{r.text}</p>
              {r.photos.length > 0 && (
                <ul className="mt-3 flex gap-2">
                  {r.photos.map((p, i) => (
                    <li key={p.url} className="relative h-20 w-20 overflow-hidden rounded-lg bg-subtle">
                      <Image src={p.url} alt={`תמונה ${i + 1} מהביקורת של ${r.authorName}`} fill sizes="80px" className="object-cover" />
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}

      {eligibility === null ? (
        <p className="text-sm text-muted">
          הזמנתם את החלל הזה?{' '}
          <Link href={`/login?returnUrl=${encodeURIComponent(`/spaces/${spaceSlug}#reviews`)}`} className="font-medium text-accent-text hover:underline">
            התחברו כדי לכתוב ביקורת
          </Link>
        </p>
      ) : eligibility.status === 'eligible' ? (
        <ReviewForm spaceId={spaceId} turnstileSiteKey={turnstileSiteKey} nonce={nonce} />
      ) : eligibility.status === 'alreadyReviewed' ? (
        <p className="rounded-xl bg-success-soft p-4 text-sm text-success">תודה! קיבלנו את הביקורת שלכם על החלל הזה.</p>
      ) : eligibility.status === 'noBooking' ? (
        <p className="text-sm text-muted">אפשר לכתוב ביקורת אחרי שההזמנה שלכם בחלל הזה מתחילה — כך כל הביקורות כאן אמיתיות.</p>
      ) : null}
    </section>
  );
}
