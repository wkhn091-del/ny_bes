import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

/** Deliveries older (or further in the future) than this are rejected as replays. */
export const WEBHOOK_TOLERANCE_SECONDS = 300;

const eventSchema = z.object({
  id: z.uuid(),
  type: z.enum(['user.created', 'user.updated', 'user.deleted']),
  userId: z.uuid(),
  occurredAt: z.string().max(64),
});

export type AuthWebhookEvent = z.infer<typeof eventSchema>;

export type VerifyResult =
  | { ok: true; event: AuthWebhookEvent }
  | { ok: false; reason: 'malformed' | 'stale' | 'signature' };

export function signAuthWebhook(secret: string, id: string, timestamp: string, body: string): string {
  return 'v1,' + createHmac('sha256', secret).update(`${id}.${timestamp}.${body}`).digest('base64');
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function verifyAuthWebhook(input: {
  secret: string;
  id: string | null;
  timestamp: string | null;
  signature: string | null;
  body: string;
  now?: number;
}): VerifyResult {
  const { secret, id, timestamp, signature, body } = input;
  if (!id || !timestamp || !signature || id.length > 64 || signature.length > 512 || !/^\d{1,12}$/.test(timestamp)) {
    return { ok: false, reason: 'malformed' };
  }

  const nowSeconds = Math.floor((input.now ?? Date.now()) / 1000);
  if (Math.abs(nowSeconds - Number(timestamp)) > WEBHOOK_TOLERANCE_SECONDS) return { ok: false, reason: 'stale' };

  const expected = signAuthWebhook(secret, id, timestamp, body);
  // The header may carry several space-separated signatures during secret rotation.
  const matches = signature.split(' ').some((candidate) => safeEqual(candidate, expected));
  if (!matches) return { ok: false, reason: 'signature' };

  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  const parsed = eventSchema.safeParse(json);
  if (!parsed.success || parsed.data.id !== id) return { ok: false, reason: 'malformed' };
  return { ok: true, event: parsed.data };
}
