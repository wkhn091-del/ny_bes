import 'server-only';
import { logError } from '@/lib/logger';
import { deleteCustomerCard, syncCustomerCardOrThrow } from '@/lib/server/customer-sync';
import { createSupabaseAdminClient } from '@/lib/supabase/server';

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;
export type AuthEventType = 'user.created' | 'user.updated' | 'user.deleted';

export const MAX_AUTH_EVENT_ATTEMPTS = 10;

/** Runs one recorded auth event. Marks it processed on success; on failure keeps it pending for the cron retry. */
export async function processAuthEvent(
  admin: AdminClient,
  event: { id: string; type: AuthEventType; userId: string },
  attempts: number,
): Promise<boolean> {
  try {
    if (event.type === 'user.deleted') await deleteCustomerCard(event.userId);
    else await syncCustomerCardOrThrow(event.userId);
  } catch (error) {
    logError('auth.event.sync', error, { type: event.type });
    await admin
      .from('auth_webhook_events')
      .update({ attempts: attempts + 1, last_error: 'sync_failed' })
      .eq('event_id', event.id);
    return false;
  }
  await admin
    .from('auth_webhook_events')
    .update({ processed_at: new Date().toISOString(), attempts: attempts + 1, last_error: null })
    .eq('event_id', event.id);
  return true;
}

/** Re-runs events whose first delivery failed. Called by the 5-minute maintenance cron. */
export async function retryPendingAuthEvents(admin: AdminClient): Promise<number> {
  const cutoff = new Date(Date.now() - 2 * 60_000).toISOString();
  const { data, error } = await admin
    .from('auth_webhook_events')
    .select('event_id, event_type, user_id, attempts')
    .is('processed_at', null)
    .lt('received_at', cutoff)
    .lt('attempts', MAX_AUTH_EVENT_ATTEMPTS)
    .order('received_at', { ascending: true })
    .limit(20);
  if (error) {
    logError('auth.event.retry.query', error);
    return 0;
  }
  let done = 0;
  for (const row of data ?? []) {
    const ok = await processAuthEvent(
      admin,
      { id: row.event_id as string, type: row.event_type as AuthEventType, userId: row.user_id as string },
      (row.attempts as number) ?? 0,
    );
    if (ok) done += 1;
  }
  return done;
}
