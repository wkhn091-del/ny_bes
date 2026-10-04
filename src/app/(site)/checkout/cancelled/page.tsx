import { CircleSlash } from 'lucide-react';
import type { Metadata } from 'next';
import { AbandonButton } from '@/components/checkout/AbandonButton';
import { ButtonLink } from '@/components/ui/Button';
import { getCatalog } from '@/lib/content/catalog';
import { formatMinutes, utcToIsrael } from '@/lib/domain/time';
import { requireUser } from '@/lib/server/auth';
import { createSupabaseAdminClient } from '@/lib/supabase/server';
import { isConfigured } from '@/lib/env.server';
import { logError } from '@/lib/logger';

export const metadata: Metadata = { title: 'התשלום לא הושלם', robots: { index: false } };

const CODE_RE = /^[A-Z0-9]{8}$/;

export default async function CheckoutCancelledPage({ searchParams }: PageProps<'/checkout/cancelled'>) {
  const { booking: raw } = await searchParams;
  const code = typeof raw === 'string' && CODE_RE.test(raw) ? raw : null;
  const user = await requireUser(code ? `/checkout/cancelled?booking=${code}` : '/spaces');

  let hold: { status: string; space_id: string; hold_expires_at: string | null; starts_at: string } | null = null;
  if (code && isConfigured.supabase()) {
    const { data, error } = await createSupabaseAdminClient()
      .from('bookings')
      .select('status, space_id, hold_expires_at, starts_at')
      .eq('public_code', code)
      .eq('user_id', user.id)
      .maybeSingle();
    if (error) logError('checkout.cancelled', error);
    hold = data;
  }

  const catalog = await getCatalog();
  const slug = hold ? catalog.spaces.find((s) => s.id === hold.space_id)?.slug : undefined;
  const date = hold ? utcToIsrael(hold.starts_at).date : undefined;
  const backHref = slug ? `/spaces/${slug}${date ? `?date=${date}` : ''}` : '/spaces';
  const stillHeld = hold?.status === 'pending_payment' && hold.hold_expires_at && new Date(hold.hold_expires_at) > new Date();

  return (
    <div className="mx-auto flex max-w-lg flex-col items-center px-4 py-20 text-center">
      <CircleSlash className="h-12 w-12 text-muted" aria-hidden="true" />
      <h1 className="mt-4 text-3xl font-bold">התשלום לא הושלם</h1>
      <p className="mt-3 text-muted">לא חויבתם.</p>
      {stillHeld && code ? (
        <>
          <p className="mt-1 text-muted">
            השעות שמורות עבורכם עד {formatMinutes(utcToIsrael(hold!.hold_expires_at!).minutes)}, ואחר כך ישתחררו אוטומטית. רוצים לשנות
            שעות או תוספות? שחררו אותן עכשיו ובחרו מחדש.
          </p>
          <div className="mt-8">
            <AbandonButton code={code} nextHref={backHref} />
          </div>
        </>
      ) : (
        <ButtonLink href={backHref} size="lg" className="mt-8">
          חזרה לבחירת שעות
        </ButtonLink>
      )}
    </div>
  );
}
