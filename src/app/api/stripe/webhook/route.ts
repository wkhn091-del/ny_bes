import { after, NextResponse, type NextRequest } from 'next/server';
import type Stripe from 'stripe';
import { z } from 'zod';
import { isConfigured, requireEnv } from '@/lib/env.server';
import { logError, logInfo } from '@/lib/logger';
import { afterBookingConfirmed, confirmBookingPayment, handleConfirmConflict } from '@/lib/server/booking-lifecycle';
import { getStripe } from '@/lib/stripe';
import { createSupabaseAdminClient } from '@/lib/supabase/server';

const bookingIdSchema = z.uuid();

function bookingIdFrom(metadata: Stripe.Metadata | null | undefined): string | null {
  const parsed = bookingIdSchema.safeParse(metadata?.bookingId);
  return parsed.success ? parsed.data : null;
}

function paymentIntentId(session: Stripe.Checkout.Session): string | null {
  if (!session.payment_intent) return null;
  return typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent.id;
}

async function handleCompleted(session: Stripe.Checkout.Session): Promise<void> {
  if (session.payment_status !== 'paid') return;
  const bookingId = bookingIdFrom(session.metadata);
  if (!bookingId) {
    logError('stripe.webhook', new Error('Session without bookingId metadata'), { sessionId: session.id });
    return;
  }
  const pi = paymentIntentId(session);
  const result = await confirmBookingPayment(bookingId, session.id, pi);
  if (result === 'confirmed') {
    after(() => afterBookingConfirmed(bookingId));
  } else if (result === 'conflict') {
    after(() => handleConfirmConflict(bookingId, pi));
  } else if (result === 'not_found') {
    logError('stripe.webhook', new Error('Paid session did not match a booking'), { sessionId: session.id });
  }
}

async function handleExpired(session: Stripe.Checkout.Session): Promise<void> {
  const bookingId = bookingIdFrom(session.metadata);
  if (!bookingId) return;
  const admin = createSupabaseAdminClient();
  await admin
    .from('bookings')
    .update({ status: 'expired', stripe_session_closed_at: new Date().toISOString() })
    .eq('id', bookingId)
    .eq('stripe_checkout_session_id', session.id)
    .eq('status', 'pending_payment');
  await admin
    .from('bookings')
    .update({ stripe_session_closed_at: new Date().toISOString() })
    .eq('id', bookingId)
    .is('stripe_session_closed_at', null);
}

async function handleRefunded(charge: Stripe.Charge): Promise<void> {
  const pi = typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id;
  if (!pi || !charge.refunded) return;
  const admin = createSupabaseAdminClient();
  await admin.from('bookings').update({ refund_status: 'succeeded' }).eq('stripe_payment_intent_id', pi);
}

export async function POST(request: NextRequest) {
  if (!isConfigured.stripe() || !isConfigured.supabase()) {
    return NextResponse.json({ error: 'not_configured' }, { status: 503 });
  }
  const { STRIPE_WEBHOOK_SECRET } = requireEnv('stripe', 'STRIPE_WEBHOOK_SECRET');

  const signature = request.headers.get('stripe-signature');
  if (!signature) return NextResponse.json({ error: 'invalid_signature' }, { status: 400 });

  const body = await request.text();
  if (body.length > 512_000) return NextResponse.json({ error: 'payload_too_large' }, { status: 413 });

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(body, signature, STRIPE_WEBHOOK_SECRET);
  } catch {
    return NextResponse.json({ error: 'invalid_signature' }, { status: 400 });
  }

  const admin = createSupabaseAdminClient();
  const { data: seen } = await admin.from('stripe_events').select('id').eq('id', event.id).maybeSingle();
  if (seen) return NextResponse.json({ received: true, duplicate: true });

  try {
    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded':
        await handleCompleted(event.data.object);
        break;
      case 'checkout.session.expired':
      case 'checkout.session.async_payment_failed':
        await handleExpired(event.data.object);
        break;
      case 'charge.refunded':
        await handleRefunded(event.data.object);
        break;
      default:
        logInfo('stripe.webhook', 'Ignored event type', { type: event.type });
    }
  } catch (error) {
    logError('stripe.webhook', error, { eventId: event.id, type: event.type });
    // Non-2xx makes Stripe retry; every handler is idempotent.
    return NextResponse.json({ error: 'processing_failed' }, { status: 500 });
  }

  await admin.from('stripe_events').upsert({ id: event.id, type: event.type }, { onConflict: 'id', ignoreDuplicates: true });
  return NextResponse.json({ received: true });
}
