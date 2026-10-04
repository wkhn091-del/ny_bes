import { NextResponse, type NextRequest } from 'next/server';
import type Stripe from 'stripe';
import { publicCodeSchema } from '@/lib/domain/schemas';
import { env, isConfigured } from '@/lib/env.server';
import { logError } from '@/lib/logger';
import { rateLimit } from '@/lib/security/rate-limit';
import { getSessionUser } from '@/lib/server/auth';
import { getStripe } from '@/lib/stripe';
import { createSupabaseAdminClient } from '@/lib/supabase/server';

const RECEIPT_HOSTS = new Set(['pay.stripe.com']);

function noStore(response: NextResponse): NextResponse {
  response.headers.set('Cache-Control', 'private, no-store, max-age=0');
  return response;
}

function back(code: string, error: string): NextResponse {
  return noStore(
    NextResponse.redirect(new URL(`/account/bookings/${code}?receipt=${error}`, env.NEXT_PUBLIC_SITE_URL), { status: 303 }),
  );
}

/** Redirects the booking's owner to the Stripe-hosted receipt for their payment. */
export async function GET(_request: NextRequest, ctx: RouteContext<'/account/bookings/[code]/receipt'>) {
  const { code } = await ctx.params;
  const parsed = publicCodeSchema.safeParse(code);
  const user = await getSessionUser();
  if (!user) {
    const returnUrl = parsed.success ? `/account/bookings/${parsed.data}` : '/account/bookings';
    return noStore(NextResponse.redirect(new URL(`/login?returnUrl=${encodeURIComponent(returnUrl)}`, env.NEXT_PUBLIC_SITE_URL), { status: 303 }));
  }
  if (!parsed.success) return noStore(new NextResponse('Not found', { status: 404 }));
  if (!isConfigured.supabase() || !isConfigured.stripe()) return back(parsed.data, 'unavailable');
  if (!(await rateLimit('accountMutation', `receipt:${user.id}`))) return back(parsed.data, 'rate');

  const { data: booking, error } = await createSupabaseAdminClient()
    .from('bookings')
    .select('stripe_payment_intent_id')
    .eq('public_code', parsed.data)
    .eq('user_id', user.id)
    .maybeSingle();
  if (error) {
    logError('receipt.lookup', error);
    return back(parsed.data, 'unavailable');
  }
  if (!booking) return noStore(new NextResponse('Not found', { status: 404 }));
  if (!booking.stripe_payment_intent_id) return back(parsed.data, 'none');

  try {
    const intent = await getStripe().paymentIntents.retrieve(booking.stripe_payment_intent_id as string, {
      expand: ['latest_charge'],
    });
    const charge = intent.latest_charge as Stripe.Charge | string | null;
    const url = charge && typeof charge !== 'string' ? charge.receipt_url : null;
    if (!url || !RECEIPT_HOSTS.has(new URL(url).hostname)) return back(parsed.data, 'none');
    return noStore(NextResponse.redirect(url, { status: 303 }));
  } catch (err) {
    logError('receipt.stripe', err);
    return back(parsed.data, 'unavailable');
  }
}
