import 'server-only';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { env, isConfigured } from '@/lib/env.server';
import { logWarn } from '@/lib/logger';

export type LimiterName =
  | 'otpSendIp'
  | 'otpSendEmail'
  | 'otpVerify'
  | 'otpDailyBudget'
  | 'checkout'
  | 'bookingMutation'
  | 'availability'
  | 'admin'
  | 'oauthStart'
  | 'stepUpSend'
  | 'accountMutation'
  | 'search'
  | 'recommendations'
  | 'reviewSubmit'
  | 'reviewDaily'
  | 'cspReport'
  | 'health'
  | 'csvExport';

interface LimiterSpec {
  tokens: number;
  window: `${number} ${'s' | 'm' | 'h' | 'd'}`;
}

const SPECS: Record<LimiterName, LimiterSpec> = {
  otpSendIp: { tokens: 5, window: '15 m' },
  otpSendEmail: { tokens: 3, window: '15 m' },
  otpVerify: { tokens: 5, window: '15 m' },
  otpDailyBudget: { tokens: 2000, window: '1 d' },
  checkout: { tokens: 10, window: '10 m' },
  bookingMutation: { tokens: 20, window: '10 m' },
  availability: { tokens: 120, window: '1 m' },
  admin: { tokens: 120, window: '1 m' },
  oauthStart: { tokens: 10, window: '10 m' },
  stepUpSend: { tokens: 3, window: '15 m' },
  accountMutation: { tokens: 30, window: '10 m' },
  search: { tokens: 60, window: '1 m' },
  recommendations: { tokens: 60, window: '1 m' },
  reviewSubmit: { tokens: 5, window: '1 h' },
  reviewDaily: { tokens: 300, window: '1 d' },
  cspReport: { tokens: 20, window: '1 m' },
  health: { tokens: 60, window: '1 m' },
  csvExport: { tokens: 30, window: '1 h' },
};

let redis: Redis | null = null;
const limiters = new Map<LimiterName, Ratelimit>();

function getLimiter(name: LimiterName): Ratelimit | null {
  if (!isConfigured.redis()) return null;
  if (!redis) {
    redis = new Redis({ url: env.UPSTASH_REDIS_REST_URL!, token: env.UPSTASH_REDIS_REST_TOKEN! });
  }
  const existing = limiters.get(name);
  if (existing) return existing;
  const spec = SPECS[name];
  const limiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(spec.tokens, spec.window),
    prefix: `spacehub:rl:${name}`,
    analytics: false,
  });
  limiters.set(name, limiter);
  return limiter;
}

// Dev-only fallback so local work without Upstash still exercises the limits.
const memoryBuckets = new Map<string, { count: number; resetAt: number }>();

function windowToMs(window: LimiterSpec['window']): number {
  const [amount, unit] = window.split(' ') as [string, 's' | 'm' | 'h' | 'd'];
  const multiplier = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 }[unit];
  return Number(amount) * multiplier;
}

function memoryLimit(name: LimiterName, key: string): boolean {
  const spec = SPECS[name];
  const bucketKey = `${name}:${key}`;
  const now = Date.now();
  const bucket = memoryBuckets.get(bucketKey);
  if (!bucket || bucket.resetAt <= now) {
    memoryBuckets.set(bucketKey, { count: 1, resetAt: now + windowToMs(spec.window) });
    return true;
  }
  bucket.count += 1;
  return bucket.count <= spec.tokens;
}

export async function rateLimit(name: LimiterName, key: string): Promise<boolean> {
  const limiter = getLimiter(name);
  if (!limiter) {
    if (env.VERCEL_ENV === 'production' || env.VERCEL_ENV === 'preview') {
      logWarn('rate-limit', 'Upstash missing in deployed environment; failing closed', { name });
      return false;
    }
    return memoryLimit(name, key);
  }
  try {
    const result = await limiter.limit(key);
    return result.success;
  } catch (error) {
    logWarn('rate-limit', 'Limiter error; failing closed', { name, error: String(error) });
    return false;
  }
}
