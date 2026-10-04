import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { verifyAuthWebhook } from '@/lib/security/auth-webhook';
import { env, isConfigured, requireEnv } from '@/lib/env.server';
import { logError, logInfo, logWarn } from '@/lib/logger';
import { processAuthEvent } from '@/lib/server/auth-events';
import { createSupabaseAdminClient } from '@/lib/supabase/server';

const MAX_BODY_BYTES = 4096;

function reply(status: number, body: Record<string, string | boolean> = {}): NextResponse {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

/**
 * Signed user lifecycle events from the Supabase trigger in 0004_iam.sql.
 * Verifies HMAC + timestamp, records the event id once (idempotency), then syncs the Sanity customer card.
 */
export async function POST(request: NextRequest) {
  if (!isConfigured.supabase() || !env.AUTH_WEBHOOK_SECRET) return reply(503, { error: 'not_configured' });
  const { AUTH_WEBHOOK_SECRET } = requireEnv('auth-webhook', 'AUTH_WEBHOOK_SECRET');

  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    return reply(415, { error: 'unsupported_media_type' });
  }
  const declaredLength = Number(request.headers.get('content-length') ?? '0');
  if (declaredLength > MAX_BODY_BYTES) return reply(413, { error: 'payload_too_large' });

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) return reply(413, { error: 'payload_too_large' });

  const verified = verifyAuthWebhook({
    secret: AUTH_WEBHOOK_SECRET,
    id: request.headers.get('webhook-id'),
    timestamp: request.headers.get('webhook-timestamp'),
    signature: request.headers.get('webhook-signature'),
    body: raw,
  });
  if (!verified.ok) {
    logWarn('auth.webhook', 'Rejected webhook', { reason: verified.reason });
    return reply(verified.reason === 'malformed' ? 400 : 401, { error: 'invalid_request' });
  }
  const event = verified.event;

  const admin = createSupabaseAdminClient();
  const { error: ledgerError } = await admin
    .from('auth_webhook_events')
    .upsert(
      { event_id: event.id, event_type: event.type, user_id: event.userId },
      { onConflict: 'event_id', ignoreDuplicates: true },
    );
  const { data: row, error: readError } = ledgerError
    ? { data: null, error: ledgerError }
    : await admin
        .from('auth_webhook_events')
        .select('processed_at, attempts')
        .eq('event_id', event.id)
        .maybeSingle();
  if (readError || !row) {
    logError('auth.webhook.ledger', readError ?? new Error('ledger row missing'));
    return reply(500, { error: 'retry' });
  }
  if (row.processed_at) return reply(200, { duplicate: true });

  const ok = await processAuthEvent(admin, event, (row.attempts as number) ?? 0);
  if (!ok) return reply(500, { error: 'retry' });

  logInfo('auth.webhook', 'Processed', { type: event.type });
  return reply(200, { ok: true });
}
