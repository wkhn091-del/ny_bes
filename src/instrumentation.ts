import * as Sentry from '@sentry/nextjs';
import { sentryDataCollection } from '@/lib/sentry-options';

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Fails server start-up loudly if environment variables are malformed or missing on Vercel.
    await import('@/lib/env.server');

    if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
      Sentry.init({
        dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
        environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
        tracesSampleRate: 0.1,
        dataCollection: sentryDataCollection,
      });
    }
  }
}

export const onRequestError = Sentry.captureRequestError;
