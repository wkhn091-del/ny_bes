'use client';

import { AlertCircle, Gift, Loader2, Lock, Tag, X } from 'lucide-react';
import Link from 'next/link';
import { useState, useTransition, type FormEvent } from 'react';
import { createCheckout, quoteCheckout } from '@/app/actions/checkout';
import { Turnstile } from '@/components/security/Turnstile';
import { Button } from '@/components/ui/Button';
import { isValidIsraeliId } from '@/lib/domain/israeli-id';
import { formatIls } from '@/lib/domain/pricing';
import type { QuoteRequest } from '@/lib/domain/schemas';
import { HOLD_MINUTES, formatDateHebrew, formatMinutes } from '@/lib/domain/time';
import type { QuoteSummary } from '@/lib/server/quote';

interface Props {
  initialQuote: QuoteSummary;
  request: QuoteRequest;
  customerName: string;
  billingDefaults: { companyName: string; companyTaxId: string };
  turnstileSiteKey: string;
  nonce?: string;
  backHref: string;
}

function discountLabel(quote: QuoteSummary): string {
  if (quote.discountSource === 'coupon') return `קופון ${quote.couponCode}`;
  if (quote.discountSource === 'points') return `מימוש ${quote.pointsRedeemed.toLocaleString('he-IL')} נקודות`;
  return `הנחת הזמנה ארוכה (${quote.autoDiscountPercent}%)`;
}

const inputCls =
  'h-11 w-full rounded-lg border border-border bg-bg px-3 text-sm outline-none transition-colors focus:border-accent aria-[invalid=true]:border-danger';

export function CheckoutForm({ initialQuote, request, customerName, billingDefaults, turnstileSiteKey, nonce, backHref }: Props) {
  const [quote, setQuote] = useState(initialQuote);
  const [couponInput, setCouponInput] = useState('');
  const [couponError, setCouponError] = useState<string | null>(null);
  const [couponPending, startCoupon] = useTransition();
  const [usePoints, setUsePoints] = useState(false);
  const [pointsNote, setPointsNote] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState(billingDefaults.companyName);
  const [companyTaxId, setCompanyTaxId] = useState(billingDefaults.companyTaxId);
  const [agreed, setAgreed] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [turnstileReset, setTurnstileReset] = useState(0);
  const [error, setError] = useState<{ message: string; slot: boolean } | null>(null);
  const [submitting, startSubmit] = useTransition();

  const taxIdInvalid = companyTaxId.length > 0 && !(/^\d{9}$/.test(companyTaxId) && isValidIsraeliId(companyTaxId));
  const needsCaptcha = Boolean(turnstileSiteKey);
  const canSubmit = quote.available && agreed && !taxIdInvalid && (!needsCaptcha || token) && !submitting;

  function requote(code: string, points: boolean) {
    setCouponError(null);
    setPointsNote(null);
    startCoupon(async () => {
      const result = await quoteCheckout({ ...request, couponCode: code, usePoints: points });
      if (!result.ok) {
        setCouponError(result.message);
        return;
      }
      setQuote(result.quote);
      if (code && result.quote.couponOutranked) {
        setCouponError(
          result.quote.discountSource === 'points'
            ? 'הקופון תקף, אבל מימוש הנקודות נותן הנחה גבוהה יותר — הוא זה שנשמר.'
            : `הקופון תקף, אבל הנחת ההזמנה הארוכה (${result.quote.autoDiscountPercent}%) גבוהה יותר — היא זו שנשמרה.`,
        );
      }
      if (points && result.quote.pointsOutranked) {
        setPointsNote('ההנחה הקיימת גבוהה יותר או שווה למימוש הנקודות, ולכן הנקודות לא ינוצלו ויישארו ביתרה.');
      }
    });
  }

  function applyCoupon(code: string) {
    requote(code, usePoints);
  }

  function togglePoints(next: boolean) {
    setUsePoints(next);
    requote(quote.couponCode ?? '', next);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);
    startSubmit(async () => {
      const result = await createCheckout({
        ...request,
        couponCode: quote.couponCode ?? '',
        usePoints: usePoints && quote.discountSource === 'points',
        companyName,
        companyTaxId,
        turnstileToken: token ?? undefined,
      });
      if (result.ok) {
        window.location.assign(result.redirectUrl);
        return;
      }
      setError({ message: result.message, slot: result.code === 'SLOT' });
      if (needsCaptcha) setTurnstileReset((n) => n + 1);
      if (result.code === 'COUPON') requote('', usePoints);
      if (result.code === 'POINTS') requote(quote.couponCode ?? '', usePoints);
    });
  }

  const timeLabel = quote.isDayPass
    ? `יום שלם · ${formatMinutes(quote.startMinute)}–${formatMinutes(quote.endMinute)}`
    : `${formatMinutes(quote.startMinute)}–${formatMinutes(quote.endMinute)} · ${quote.hours} שעות`;

  return (
    <form onSubmit={onSubmit} className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_380px]" noValidate>
      <div className="space-y-6">
        {!quote.available && (
          <div className="flex items-start gap-2 rounded-xl border border-danger/30 bg-danger-soft p-4 text-sm text-danger" role="alert">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <div>
              <p className="font-semibold">השעות שבחרתם כבר נתפסו.</p>
              <Link href={backHref} className="mt-1 inline-block font-medium underline">
                חזרה לבחירת שעות אחרות
              </Link>
            </div>
          </div>
        )}

        <section className="rounded-2xl border border-border bg-card p-5">
          <h2 className="mb-4 font-semibold">פרטי חשבונית (לא חובה)</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm">
              <span className="mb-1 block text-muted">שם החברה / העסק</span>
              <input value={companyName} onChange={(e) => setCompanyName(e.target.value.slice(0, 120))} maxLength={120} className={inputCls} autoComplete="organization" />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-muted">ח.פ / עוסק מורשה</span>
              <input
                value={companyTaxId}
                onChange={(e) => setCompanyTaxId(e.target.value.replace(/\D/g, '').slice(0, 9))}
                inputMode="numeric"
                dir="ltr"
                aria-invalid={taxIdInvalid}
                aria-describedby="taxid-hint"
                className={inputCls}
              />
              <span id="taxid-hint" className={`mt-1 block text-xs ${taxIdInvalid ? 'text-danger' : 'text-muted'}`}>
                {taxIdInvalid ? 'המספר אינו תקין (9 ספרות עם ספרת ביקורת).' : '9 ספרות'}
              </span>
            </label>
          </div>
          {customerName && <p className="mt-3 text-xs text-muted">ההזמנה תירשם על שם {customerName}.</p>}
        </section>

        <section className="rounded-2xl border border-border bg-card p-5">
          <h2 className="mb-3 font-semibold">קוד קופון</h2>
          {quote.couponCode ? (
            <div className="flex items-center justify-between rounded-lg border border-success/30 bg-success-soft px-3 py-2 text-sm text-success">
              <span className="flex items-center gap-1.5 font-medium">
                <Tag className="h-4 w-4" aria-hidden="true" />
                {quote.couponCode} הופעל
              </span>
              <button type="button" onClick={() => applyCoupon('')} className="rounded p-1 hover:bg-success/10" aria-label="הסרת הקופון">
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <input
                value={couponInput}
                onChange={(e) => setCouponInput(e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 32))}
                placeholder="לדוגמה OPENING20"
                dir="ltr"
                className={inputCls}
                aria-label="קוד קופון"
                aria-describedby={couponError ? 'coupon-error' : undefined}
              />
              <Button
                variant="outline"
                size="lg"
                className="h-11 shrink-0"
                disabled={couponInput.length < 3 || couponPending}
                onClick={() => applyCoupon(couponInput)}
              >
                {couponPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : 'הפעלה'}
              </Button>
            </div>
          )}
          {couponError && (
            <p id="coupon-error" className="mt-2 text-xs text-warning" role="status">
              {couponError}
            </p>
          )}
        </section>

        {quote.pointsBalance > 0 && (
          <section className="rounded-2xl border border-border bg-card p-5">
            <h2 className="mb-1 flex items-center gap-2 font-semibold">
              <Gift className="h-4 w-4 text-accent-text" aria-hidden="true" />
              נקודות מועדון
            </h2>
            <p className="text-sm text-muted">
              יש לך {quote.pointsBalance.toLocaleString('he-IL')} נקודות. כל 100 נקודות = ₪5, עד 50% ממחיר החלל. לא ניתן לשלב עם קופון או הנחה
              אחרת — ההנחה הגבוהה מביניהן נבחרת.
            </p>
            {quote.pointsPotentialDiscount > 0 ? (
              <label className="mt-3 flex cursor-pointer items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={usePoints}
                  disabled={couponPending}
                  onChange={(e) => togglePoints(e.target.checked)}
                  className="h-4 w-4 accent-[var(--accent)]"
                />
                <span>מימוש נקודות להנחה של עד {formatIls(quote.pointsPotentialDiscount)}</span>
              </label>
            ) : (
              <p className="mt-3 text-xs text-muted">בהזמנה הזו אין מספיק נקודות למימוש (מינימום 100 נקודות).</p>
            )}
            {pointsNote && (
              <p className="mt-2 text-xs text-warning" role="status">
                {pointsNote}
              </p>
            )}
          </section>
        )}

        <section className="space-y-4">
          <label className="flex cursor-pointer items-start gap-3 text-sm">
            <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--accent)]" required />
            <span>
              קראתי ואני מסכים/ה ל
              <Link href="/legal/terms" target="_blank" className="font-medium text-accent-text underline">
                תקנון
              </Link>
              , ל
              <Link href="/legal/house-rules" target="_blank" className="font-medium text-accent-text underline">
                נהלי הבית
              </Link>{' '}
              ולמדיניות הביטול: החזר מלא עד 24 שעות לפני תחילת ההזמנה.
            </span>
          </label>
          {needsCaptcha && <Turnstile siteKey={turnstileSiteKey} action="checkout" nonce={nonce} onToken={setToken} resetKey={turnstileReset} />}
        </section>
      </div>

      <aside className="lg:sticky lg:top-24 lg:self-start">
        <div className="rounded-2xl border border-border bg-card p-5 shadow-xl shadow-black/5">
          <h2 className="font-semibold">{quote.spaceName}</h2>
          <p className="text-sm text-muted">סניף {quote.branchName}</p>
          <p className="mt-3 text-sm">{formatDateHebrew(quote.date)}</p>
          <p className="text-sm text-muted">
            {timeLabel}
            {quote.seats > 1 && ` · ${quote.seats} עמדות`}
          </p>

          <dl className="mt-4 space-y-1.5 border-t border-border pt-4 text-sm" aria-live="polite">
            <div className="flex justify-between">
              <dt className="text-muted">{quote.isDayPass ? 'יום שלם' : 'מחיר החלל'}</dt>
              <dd>{formatIls(quote.base)}</dd>
            </div>
            {quote.discount > 0 && (
              <div className="flex justify-between text-success">
                <dt>{discountLabel(quote)}</dt>
                <dd>−{formatIls(quote.discount)}</dd>
              </div>
            )}
            {quote.addonLines.map((l) => (
              <div key={l.addonId} className="flex justify-between">
                <dt className="text-muted">
                  {l.name}
                  {l.pricingMode === 'perHour' && ` × ${l.quantity} ש׳`}
                </dt>
                <dd>{formatIls(l.lineTotal)}</dd>
              </div>
            ))}
            <div className="flex justify-between border-t border-border pt-2 text-base font-bold">
              <dt>סה״כ לתשלום</dt>
              <dd>{formatIls(quote.total)}</dd>
            </div>
            <div className="flex justify-between text-xs text-muted">
              <dt>מתוכו מע״מ ({Math.round(quote.vatRate * 100)}%)</dt>
              <dd>{formatIls(quote.vatIncluded)}</dd>
            </div>
          </dl>

          {error && (
            <div className="mt-4 rounded-lg border border-danger/30 bg-danger-soft p-3 text-sm text-danger" role="alert">
              {error.message}
              {error.slot && (
                <Link href={backHref} className="mt-1 block font-medium underline">
                  לבחירת שעות אחרות
                </Link>
              )}
            </div>
          )}

          <Button type="submit" size="lg" className="mt-4 w-full" disabled={!canSubmit}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Lock className="h-4 w-4" aria-hidden="true" />}
            {quote.total === 0 ? 'אישור ההזמנה' : `לתשלום ${formatIls(quote.total)}`}
          </Button>
          <p className="mt-3 text-center text-xs leading-5 text-muted">
            המקום נשמר עבורך {HOLD_MINUTES} דקות להשלמת התשלום. התשלום מתבצע בעמוד המאובטח של Stripe.
          </p>
        </div>
      </aside>
    </form>
  );
}
