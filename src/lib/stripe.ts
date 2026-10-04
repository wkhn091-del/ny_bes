import 'server-only';
import Stripe from 'stripe';
import { requireEnv } from '@/lib/env.server';

let stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (stripe) return stripe;
  const { STRIPE_SECRET_KEY } = requireEnv('stripe', 'STRIPE_SECRET_KEY');
  stripe = new Stripe(STRIPE_SECRET_KEY, {
    appInfo: { name: 'SpaceHub', version: '1.0.0' },
    maxNetworkRetries: 2,
  });
  return stripe;
}
