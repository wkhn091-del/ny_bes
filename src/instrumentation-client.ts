import * as Sentry from '@sentry/nextjs';
import { sentryDataCollection } from '@/lib/sentry-options';

if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.NODE_ENV,
    tracesSampleRate: 0.1,
    dataCollection: sentryDataCollection,
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
