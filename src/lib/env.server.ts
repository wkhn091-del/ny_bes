import 'server-only';
import { z } from 'zod';

const optionalSecret = z.string().trim().min(1).max(4096).optional();

const serverEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  VERCEL_ENV: z.enum(['development', 'preview', 'production']).optional(),

  NEXT_PUBLIC_SITE_URL: z.url().default('http://localhost:3000'),

  NEXT_PUBLIC_SANITY_PROJECT_ID: z
    .string()
    .regex(/^[a-z0-9-]{1,64}$/)
    .optional(),
  NEXT_PUBLIC_SANITY_DATASET: z
    .string()
    .regex(/^[a-z0-9_-]{1,64}$/)
    .default('production'),
  NEXT_PUBLIC_SANITY_API_VERSION: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .default('2026-10-01'),
  SANITY_CUSTOMERS_DATASET: z
    .string()
    .regex(/^[a-z0-9_-]{1,64}$/)
    .default('customers'),
  SANITY_API_READ_TOKEN: optionalSecret,
  SANITY_API_WRITE_TOKEN: optionalSecret,
  SANITY_WEBHOOK_SECRET: optionalSecret,

  NEXT_PUBLIC_SUPABASE_URL: z.url().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: optionalSecret,
  SUPABASE_SERVICE_ROLE_KEY: optionalSecret,

  STRIPE_SECRET_KEY: z
    .string()
    .regex(/^sk_(test|live)_[A-Za-z0-9]+$/)
    .optional(),
  STRIPE_WEBHOOK_SECRET: z
    .string()
    .regex(/^whsec_[A-Za-z0-9]+$/)
    .optional(),

  RESEND_API_KEY: optionalSecret,
  EMAIL_FROM: z.string().min(3).max(200).default('SpaceHub <onboarding@resend.dev>'),

  TELEGRAM_BOT_TOKEN: optionalSecret,

  NEXT_PUBLIC_TURNSTILE_SITE_KEY: optionalSecret,
  TURNSTILE_SECRET_KEY: optionalSecret,

  UPSTASH_REDIS_REST_URL: z.url().optional(),
  UPSTASH_REDIS_REST_TOKEN: optionalSecret,

  CRON_SECRET: z.string().min(32).max(256).optional(),
  AUTH_WEBHOOK_SECRET: z.string().min(32).max(256).optional(),
  CSV_EXPORT_TOKEN: z.string().min(40).max(256).optional(),
  NEXT_SERVER_ACTIONS_ENCRYPTION_KEY: z
    .string()
    .regex(/^[A-Za-z0-9+/]{43}=$/)
    .optional(),

  NEXT_PUBLIC_SENTRY_DSN: z.url().optional(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

const REQUIRED_ON_VERCEL: (keyof ServerEnv)[] = [
  'SANITY_WEBHOOK_SECRET',
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'RESEND_API_KEY',
  'NEXT_PUBLIC_TURNSTILE_SITE_KEY',
  'TURNSTILE_SECRET_KEY',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
  'CRON_SECRET',
  'AUTH_WEBHOOK_SECRET',
  'NEXT_SERVER_ACTIONS_ENCRYPTION_KEY',
];

/** Staging may run on demo content without staff notifications; a production launch may not. */
const REQUIRED_IN_PRODUCTION_ONLY: (keyof ServerEnv)[] = [
  'NEXT_PUBLIC_SANITY_PROJECT_ID',
  'SANITY_API_READ_TOKEN',
  'SANITY_API_WRITE_TOKEN',
  'TELEGRAM_BOT_TOKEN',
];

function emptyToUndefined(source: NodeJS.ProcessEnv): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(source)) {
    out[key] = value === '' ? undefined : value;
  }
  return out;
}

function loadEnv(): ServerEnv {
  const parsed = serverEnvSchema.safeParse(emptyToUndefined(process.env));
  if (!parsed.success) {
    const fields = parsed.error.issues.map((i) => i.path.join('.')).join(', ');
    throw new Error(`Invalid environment variables: ${fields}`);
  }
  const env = parsed.data;
  if (env.VERCEL_ENV === 'production' || env.VERCEL_ENV === 'preview') {
    const required = env.VERCEL_ENV === 'production' ? [...REQUIRED_ON_VERCEL, ...REQUIRED_IN_PRODUCTION_ONLY] : REQUIRED_ON_VERCEL;
    const missing = required.filter((key) => !env[key]);
    if (missing.length > 0) {
      throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }
  }
  return env;
}

export const env = loadEnv();

export class ServiceNotConfiguredError extends Error {
  constructor(service: string) {
    super(`Service not configured: ${service}`);
    this.name = 'ServiceNotConfiguredError';
  }
}

export function requireEnv<K extends keyof ServerEnv>(
  service: string,
  ...keys: K[]
): { [P in K]-?: NonNullable<ServerEnv[P]> } {
  const result = {} as { [P in K]-?: NonNullable<ServerEnv[P]> };
  for (const key of keys) {
    const value = env[key];
    if (value === undefined || value === null || value === '') {
      throw new ServiceNotConfiguredError(service);
    }
    result[key] = value as NonNullable<ServerEnv[K]>;
  }
  return result;
}

export const isConfigured = {
  sanity: () => Boolean(env.NEXT_PUBLIC_SANITY_PROJECT_ID),
  sanityWrite: () => Boolean(env.NEXT_PUBLIC_SANITY_PROJECT_ID && env.SANITY_API_WRITE_TOKEN),
  supabase: () =>
    Boolean(
      env.NEXT_PUBLIC_SUPABASE_URL && env.NEXT_PUBLIC_SUPABASE_ANON_KEY && env.SUPABASE_SERVICE_ROLE_KEY,
    ),
  stripe: () => Boolean(env.STRIPE_SECRET_KEY && env.STRIPE_WEBHOOK_SECRET),
  resend: () => Boolean(env.RESEND_API_KEY),
  telegram: () => Boolean(env.TELEGRAM_BOT_TOKEN),
  turnstile: () => Boolean(env.TURNSTILE_SECRET_KEY && env.NEXT_PUBLIC_TURNSTILE_SITE_KEY),
  redis: () => Boolean(env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN),
};
