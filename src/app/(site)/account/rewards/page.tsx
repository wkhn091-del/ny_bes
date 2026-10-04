import type { Metadata } from 'next';
import Link from 'next/link';
import { formatIls, pointsValue } from '@/lib/domain/pricing';
import { formatDateHebrew, utcToIsrael } from '@/lib/domain/time';
import { logError } from '@/lib/logger';
import { requireUser } from '@/lib/server/auth';
import { getLoyaltySummary, type LoyaltyEntry, type LoyaltySummary } from '@/lib/server/loyalty';

export const metadata: Metadata = { title: 'נקודות מועדון', robots: { index: false } };

const KIND_LABELS: Record<LoyaltyEntry['kind'], string> = {
  earn: 'צבירה',
  redeem: 'מימוש',
  restore: 'החזרה (ביטול)',
  expire: 'פקיעה',
};

function dateLabel(iso: string): string {
  return formatDateHebrew(utcToIsrael(iso).date, true);
}

export default async function RewardsPage() {
  const user = await requireUser('/account/rewards');
  let summary: LoyaltySummary | null = null;
  try {
    summary = await getLoyaltySummary(user.id);
  } catch (error) {
    logError('account.rewards', error);
  }

  return (
    <div>
      <h1 className="text-3xl font-bold tracking-tight">נקודות מועדון</h1>

      {summary === null ? (
        <p className="mt-8 rounded-xl border border-danger/30 bg-danger-soft p-4 text-sm text-danger">
          לא הצלחנו לטעון את הנקודות כרגע. נסו לרענן בעוד רגע.
        </p>
      ) : (
        <>
          <div className="mt-6 rounded-2xl border border-border bg-card p-6">
            <p className="text-sm text-muted">היתרה שלך</p>
            <p className="mt-1 text-4xl font-bold tabular-nums">{summary.balance.toLocaleString('he-IL')}</p>
            <p className="mt-1 text-sm text-muted">שווי מימוש עד {formatIls(pointsValue(summary.balance))}</p>
            {summary.expiringSoon > 0 && summary.nextExpiry && (
              <p className="mt-4 rounded-lg bg-warning-soft p-3 text-sm text-warning">
                {summary.expiringSoon.toLocaleString('he-IL')} נקודות יפוגו ב-30 הימים הקרובים (הראשונות ב-{dateLabel(summary.nextExpiry)}).
              </p>
            )}
          </div>

          <section className="mt-8 rounded-2xl border border-border bg-subtle p-6 text-sm leading-6">
            <h2 className="mb-2 text-base font-semibold">איך זה עובד</h2>
            <ul className="list-disc space-y-1 ps-5 text-muted">
              <li>על כל ₪1 ששולם על מחיר החלל (לא כולל תוספות) מקבלים נקודה אחת, אחרי שההזמנה התקיימה.</li>
              <li>כל 100 נקודות = ₪5 הנחה, עד 50% ממחיר החלל, בעמוד סיכום ההזמנה.</li>
              <li>לא משלבים עם קופון או הנחת הזמנה ארוכה — ההנחה הגבוהה נבחרת, ואם היא לא הנקודות, הן נשארות ביתרה.</li>
              <li>נקודות פוקעות 12 חודשים אחרי שנצברו. נשלח תזכורת במייל 30 יום לפני.</li>
              <li>ביטול עם החזר מחזיר את הנקודות שמומשו בהזמנה.</li>
            </ul>
          </section>

          <section className="mt-8">
            <h2 className="mb-4 text-xl font-semibold">תנועות</h2>
            {summary.entries.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border-strong p-8 text-center text-sm text-muted">
                עדיין אין תנועות. הנקודות הראשונות יגיעו אחרי ההזמנה הראשונה שתתקיים.
              </div>
            ) : (
              <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-card">
                {summary.entries.map((e) => (
                  <li key={e.id} className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
                    <div className="min-w-0">
                      <p className="font-medium">
                        {KIND_LABELS[e.kind]}
                        {e.spaceName && <span className="font-normal text-muted"> · {e.spaceName}</span>}
                      </p>
                      <p className="text-xs text-muted">
                        {dateLabel(e.createdAt)}
                        {e.kind === 'earn' && e.expiresAt && ` · בתוקף עד ${dateLabel(e.expiresAt)}`}
                        {e.bookingCode &&
                          (e.kind === 'earn' ? (
                            <>
                              {' · '}
                              <Link href={`/account/bookings/${e.bookingCode}`} className="font-mono hover:underline">
                                {e.bookingCode}
                              </Link>
                            </>
                          ) : (
                            <span className="font-mono"> · {e.bookingCode}</span>
                          ))}
                      </p>
                    </div>
                    <span className={`font-semibold tabular-nums ${e.points > 0 ? 'text-success' : 'text-muted'}`} dir="ltr">
                      {e.points > 0 ? '+' : ''}
                      {e.points.toLocaleString('he-IL')}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
