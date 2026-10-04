import 'server-only';
import * as Sentry from '@sentry/nextjs';

type Context = Record<string, string | number | boolean | null | undefined>;

export function logError(scope: string, error: unknown, context: Context = {}): void {
  console.error(`[${scope}]`, error, context);
  Sentry.withScope((sentryScope) => {
    sentryScope.setTag('scope', scope);
    for (const [key, value] of Object.entries(context)) {
      sentryScope.setExtra(key, value);
    }
    Sentry.captureException(error);
  });
}

export function logWarn(scope: string, message: string, context: Context = {}): void {
  console.warn(`[${scope}] ${message}`, context);
}

export function logInfo(scope: string, message: string, context: Context = {}): void {
  console.info(`[${scope}] ${message}`, context);
}
