import { CalendarPlus, CheckCircle2, Clock, Loader2, MapPin, XCircle } from 'lucide-react';
import type { Metadata } from 'next';
import { TrackEvent } from '@/components/analytics/TrackEvent';
import { ClearCart } from '@/components/checkout/ClearCart';
import { PendingPoller } from '@/components/checkout/PendingPoller';
import { ButtonLink } from '@/components/ui/Button';
import { getCatalog } from '@/lib/content/catalog';
import { env } from '@/lib/env.server';
import { googleCalendarUrl } from '@/lib/notifications/ics';
import { loadOwnBookingByCode } from '@/lib/notifications/booking-view';
import { requireUser } from '@/lib/server/auth';

export const metadata: Metadata = { title: 'אישור הזמנה', robots: { index: false } };

const CODE_RE = /^[A-Z0-9]{8}$/;

export default async function CheckoutSuccessPage({ searchParams }: PageProps<'/checkout/success'>) {
  const { booking: raw } = await searchParams;
  const code = typeof raw === 'string' && CODE_RE.test(raw) ? raw : null;
  const user = await requireUser(code ? `/checkout/success?booking=${code}` : '/account');
  const booking = code ? await loadOwnBookingByCode(code, user.id) : null;

  if (!booking) {
    return (
      <Shell icon={<XCircle className="h-12 w-12 text-muted" aria-hidden="true" />} title="ההזמנה לא נמצאה">
        <p className="text-muted">ייתכן שהקישור שגוי או שההזמנה שייכת לחשבון אחר.</p>
        <ButtonLink href="/account" className="mt-6">
          להזמנות שלי
        </ButtonLink>
      </Shell>
    );
  }

  if (booking.status === 'pending_payment') {
    return (
      <Shell icon={<Loader2 className="h-12 w-12 animate-spin text-accent-text" aria-hidden="true" />} title="מאשרים את התשלום…">
        <p className="text-muted">זה לוקח בדרך כלל כמה שניות. אל תסגרו את העמוד.</p>
        <p className="mt-2 font-mono text-sm text-muted">הזמנה {booking.publicCode}</p>
        <PendingPoller />
      </Shell>
    );
  }

  if (booking.status !== 'active') {
    return (
      <Shell icon={<XCircle className="h-12 w-12 text-danger" aria-hidden="true" />} title="ההזמנה לא הושלמה">
        <p className="text-muted">
          {booking.status === 'cancelled'
            ? 'ההזמנה בוטלה. אם חויבתם, ההחזר בדרך לאמצעי התשלום.'
            : 'זמן שמירת המקום הסתיים לפני שהתשלום אושר. אם חויבתם, ההחזר בדרך לאמצעי התשלום.'}
        </p>
        <ButtonLink href="/spaces" className="mt-6">
          להזמנה חדשה
        </ButtonLink>
      </Shell>
    );
  }

  const catalog = await getCatalog();
  const branch = catalog.branches.find((b) => b.id === booking.branchId);
  const calendarUrl = googleCalendarUrl({
    uid: booking.id,
    start: booking.startsAt,
    end: booking.endsAt,
    summary: `SpaceHub · ${booking.spaceName}`,
    description: `הזמנה ${booking.publicCode}\n${env.NEXT_PUBLIC_SITE_URL}/account`,
    location: branch?.address ?? booking.branchName,
    url: `${env.NEXT_PUBLIC_SITE_URL}/account`,
  });

  return (
    <Shell icon={<CheckCircle2 className="h-12 w-12 text-success" aria-hidden="true" />} title="ההזמנה אושרה!">
      <ClearCart />
      <TrackEvent
        name="purchase"
        onceKey={`purchase:${booking.publicCode}`}
        params={{
          transaction_id: booking.publicCode,
          currency: 'ILS',
          value: booking.totalAmount / 100,
          tax: booking.vatAmount / 100,
          items: [{ item_id: booking.spaceId, item_name: booking.spaceName, item_category: booking.spaceTypeLabel, item_brand: booking.branchName, price: booking.totalAmount / 100, quantity: 1 }],
        }}
      />
      <p className="text-muted">
        שלחנו אישור ל-<span dir="ltr">{booking.customerEmail}</span>, כולל קובץ להוספה ליומן.
      </p>
      <div className="mt-8 w-full rounded-2xl border border-border bg-card p-5 text-right">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-semibold">{booking.spaceName}</p>
            <p className="text-sm text-muted">
              {booking.spaceTypeLabel} · סניף {booking.branchName}
            </p>
          </div>
          <span className="rounded-md bg-subtle px-2 py-1 font-mono text-xs">{booking.publicCode}</span>
        </div>
        <ul className="mt-4 space-y-2 text-sm">
          <li className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-accent-text" aria-hidden="true" />
            {booking.dateLabel} · {booking.isDayPass ? `יום שלם (${booking.timeLabel})` : booking.timeLabel}
            {booking.seats > 1 && ` · ${booking.seats} עמדות`}
          </li>
          {branch && (
            <li className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-accent-text" aria-hidden="true" />
              {branch.address}
            </li>
          )}
        </ul>
        <div className="mt-4 flex justify-between border-t border-border pt-3 text-sm">
          <span className="text-muted">שולם (כולל מע״מ {booking.formatted.vat})</span>
          <span className="font-bold">{booking.formatted.total}</span>
        </div>
      </div>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <ButtonLink href={calendarUrl} target="_blank" rel="noopener noreferrer" variant="outline">
          <CalendarPlus className="h-4 w-4" aria-hidden="true" />
          הוספה ליומן Google
        </ButtonLink>
        <ButtonLink href="/account">להזמנות שלי</ButtonLink>
      </div>
      {branch?.wazeUrl && (
        <a href={branch.wazeUrl} target="_blank" rel="noopener noreferrer" className="mt-4 text-sm font-medium text-accent-text hover:underline">
          ניווט לסניף עם Waze
        </a>
      )}
    </Shell>
  );
}

function Shell({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center px-4 py-20 text-center">
      {icon}
      <h1 className="mt-4 text-3xl font-bold">{title}</h1>
      <div className="mt-3 flex w-full flex-col items-center">{children}</div>
    </div>
  );
}
