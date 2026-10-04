import { ArrowRight, Receipt, RotateCcw } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { BookingActions } from '@/components/account/BookingActions';
import { statusLabel, statusTone } from '@/components/account/BookingListItem';
import { Badge } from '@/components/ui/Badge';
import { buttonClasses } from '@/components/ui/Button';
import { canCancelWithRefund, canRelease } from '@/lib/domain/booking-rules';
import { publicCodeSchema } from '@/lib/domain/schemas';
import { discountLabel, loadOwnBookingByCode } from '@/lib/notifications/booking-view';
import { requireUser } from '@/lib/server/auth';

export const metadata: Metadata = { title: 'פרטי הזמנה', robots: { index: false } };

const REFUND_LABELS = {
  none: null,
  pending: 'ההחזר בטיפול',
  succeeded: 'ההחזר בוצע לכרטיס',
  failed: 'ההחזר יטופל ידנית על ידי הצוות',
} as const;

const RECEIPT_ERRORS: Record<string, string> = {
  none: 'לא נמצאה קבלה לתשלום הזה. אם שילמתם בכרטיס, פנו אלינו ונשלח אותה.',
  unavailable: 'לא הצלחנו להביא את הקבלה כרגע. נסו שוב בעוד רגע.',
  rate: 'יותר מדי בקשות. נסו שוב בעוד כמה דקות.',
};

export default async function BookingDetailPage({ params, searchParams }: PageProps<'/account/bookings/[code]'>) {
  const { code } = await params;
  const { receipt } = await searchParams;
  const receiptError = typeof receipt === 'string' ? RECEIPT_ERRORS[receipt] : undefined;
  const user = await requireUser(`/account/bookings/${encodeURIComponent(code)}`);
  const parsed = publicCodeSchema.safeParse(code);
  if (!parsed.success) notFound();

  // IDOR guard: looked up by code AND the session user id.
  const booking = await loadOwnBookingByCode(parsed.data, user.id);
  if (!booking || booking.status === 'pending_payment' || booking.status === 'expired') notFound();

  const now = new Date();
  const timing = { status: booking.status, start: booking.startsAt, end: booking.endsAt, confirmedAt: booking.confirmedAt };
  const cancellable = canCancelWithRefund(timing, now);
  const releasable = canRelease(timing, now);
  const refundLabel = REFUND_LABELS[booking.refundStatus];
  const hasReceipt = booking.totalAmount > 0 && Boolean(booking.stripePaymentIntentId);

  return (
    <div>
      <Link href="/account/bookings" className="inline-flex items-center gap-1 text-sm text-muted hover:text-fg">
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
        חזרה להזמנות
      </Link>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{booking.spaceName}</h1>
          <p className="mt-1 text-muted">
            {booking.spaceTypeLabel} · סניף {booking.branchName}
          </p>
        </div>
        <Badge tone={statusTone(booking, now.getTime())} className="text-sm">
          {statusLabel(booking, now.getTime())}
        </Badge>
      </div>

      <div className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-2">
        <section className="rounded-2xl border border-border bg-card p-5">
          <h2 className="mb-3 font-semibold">מתי</h2>
          <p>{booking.dateLabel}</p>
          <p className="text-muted">{booking.isDayPass ? `יום שלם · ${booking.timeLabel}` : booking.timeLabel}</p>
          {booking.spaceType === 'hotDesk' && <p className="text-muted">{booking.seats} עמדות</p>}
          <p className="mt-4 text-sm text-muted">
            מספר הזמנה: <span className="font-mono font-semibold text-fg">{booking.publicCode}</span>
          </p>
        </section>

        <section className="rounded-2xl border border-border bg-card p-5">
          <h2 className="mb-3 font-semibold">תשלום</h2>
          <dl className="space-y-1.5 text-sm">
            <Row label={booking.isDayPass ? 'יום שלם' : 'מחיר החלל'} value={booking.formatted.base} />
            {booking.discountAmount > 0 && (
              <Row
                label={`הנחה (${discountLabel(booking.discountSource, booking.pointsRedeemed)})`}
                value={`−${booking.formatted.discount}`}
                className="text-success"
              />
            )}
            {booking.addons.map((a) => (
              <Row key={a.addonId} label={a.name} value={new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS' }).format(a.lineTotal / 100)} />
            ))}
            <div className="flex justify-between border-t border-border pt-2 text-base font-bold">
              <dt>סה״כ</dt>
              <dd>{booking.formatted.total}</dd>
            </div>
            <Row label="מתוכו מע״מ" value={booking.formatted.vat} className="text-xs text-muted" />
          </dl>
          {booking.companyName && (
            <p className="mt-3 text-xs text-muted">
              חשבונית על שם {booking.companyName}
              {booking.companyTaxId && ` · ח.פ ${booking.companyTaxId}`}
            </p>
          )}
          {refundLabel && <p className="mt-3 text-sm font-medium text-accent-text">{refundLabel}</p>}
        </section>
      </div>

      {receiptError && (
        <p className="mt-6 rounded-lg border border-warning/30 bg-warning-soft p-3 text-sm text-warning" role="alert">
          {receiptError}
        </p>
      )}

      <div className="mt-6 flex flex-wrap gap-3">
        {hasReceipt && (
          <a href={`/account/bookings/${booking.publicCode}/receipt`} target="_blank" rel="noopener noreferrer" className={buttonClasses('outline')}>
            <Receipt className="h-4 w-4" aria-hidden="true" />
            קבלה על התשלום
          </a>
        )}
        <Link href={`/account/reorder/${booking.publicCode}`} className={buttonClasses('outline')}>
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          להזמין שוב
        </Link>
      </div>

      {(cancellable || releasable) && (
        <BookingActions
          publicCode={booking.publicCode}
          mode={cancellable ? 'cancel' : 'release'}
          totalLabel={booking.formatted.total}
          paid={booking.totalAmount > 0}
          pointsRedeemed={booking.pointsRedeemed}
        />
      )}

      <p className="mt-8 text-xs leading-5 text-muted">
        הקבלה מופקת על ידי Stripe ומאשרת את התשלום. חשבונית מס נשלחת בנפרד.
      </p>
    </div>
  );
}

function Row({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={`flex justify-between gap-3 ${className ?? ''}`}>
      <dt className={className ? undefined : 'text-muted'}>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
