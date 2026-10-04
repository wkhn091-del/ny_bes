import type { Metadata } from 'next';
import { headers } from 'next/headers';
import Link from 'next/link';
import { TrackEvent } from '@/components/analytics/TrackEvent';
import { CheckoutForm } from '@/components/checkout/CheckoutForm';
import { ButtonLink } from '@/components/ui/Button';
import { getCatalog } from '@/lib/content/catalog';
import { publicEnv } from '@/lib/env.public';
import { quoteRequestFromSearchParams } from '@/lib/domain/schemas';
import { requireUser, getUserProfile } from '@/lib/server/auth';
import { buildQuote } from '@/lib/server/quote';

export const metadata: Metadata = { title: 'סיכום הזמנה', robots: { index: false } };

export default async function CheckoutPage({ searchParams }: PageProps<'/checkout'>) {
  const params = await searchParams;
  const qs = new URLSearchParams(
    Object.entries(params).flatMap(([k, v]) => (typeof v === 'string' ? [[k, v] as [string, string]] : [])),
  ).toString();
  const user = await requireUser(`/checkout${qs ? `?${qs}` : ''}`);

  const request = quoteRequestFromSearchParams(params);
  if (!request) {
    return (
      <Problem title="ההזמנה לא שלמה" text="חסרים פרטים בהזמנה. חזרו לעמוד החלל ובחרו תאריך ושעות." />
    );
  }

  const [result, profile, nonce, catalog] = await Promise.all([
    buildQuote(request, user.id),
    getUserProfile(user.id),
    headers().then((h) => h.get('x-nonce') ?? undefined),
    getCatalog(),
  ]);
  const slug = catalog.spaces.find((s) => s.id === request.spaceId)?.slug;
  const backHref = slug ? `/spaces/${slug}?date=${request.date}` : '/spaces';

  if (!result.ok) {
    return <Problem title="לא ניתן להמשיך בהזמנה" text={result.message} />;
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <TrackEvent
        name="begin_checkout"
        params={{
          currency: 'ILS',
          value: result.quote.total / 100,
          items: [{ item_id: result.quote.spaceId, item_name: result.quote.spaceName, price: result.quote.total / 100, quantity: 1 }],
        }}
      />
      <h1 className="text-3xl font-bold tracking-tight">סיכום והזמנה</h1>
      <p className="mt-1 text-sm text-muted">
        מחובר/ת כ-<span dir="ltr">{user.email}</span>
      </p>
      <CheckoutForm
        initialQuote={result.quote}
        request={request}
        customerName={profile?.fullName ?? ''}
        billingDefaults={{ companyName: profile?.companyName ?? '', companyTaxId: profile?.companyTaxId ?? '' }}
        turnstileSiteKey={publicEnv.turnstileSiteKey}
        nonce={nonce}
        backHref={backHref}
      />
    </div>
  );
}

function Problem({ title, text }: { title: string; text: string }) {
  return (
    <div className="mx-auto max-w-xl px-4 py-24 text-center">
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="mt-3 text-muted">{text}</p>
      <div className="mt-8 flex justify-center gap-3">
        <ButtonLink href="/spaces">לכל החללים</ButtonLink>
        <Link href="/" className="self-center text-sm text-muted hover:text-fg">
          לעמוד הבית
        </Link>
      </div>
    </div>
  );
}
