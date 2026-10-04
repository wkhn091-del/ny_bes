import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { requireEnv } from '@/lib/env.server';
import { logError, logWarn } from '@/lib/logger';
import { createSupabaseAdminClient } from '@/lib/supabase/server';

export const STEP_UP_MINUTES = 10;

/** Stateless anon client: step-up codes must not replace the browser's session cookies. */
function statelessAuthClient() {
  const { NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY } = requireEnv(
    'supabase',
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  );
  return createClient(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, flowType: 'implicit' },
  });
}

export async function getStepUpExpiry(userId: string): Promise<Date | null> {
  const { data, error } = await createSupabaseAdminClient()
    .from('step_up_grants')
    .select('expires_at')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) {
    logError('step-up.read', error);
    return null;
  }
  if (!data) return null;
  const expires = new Date(data.expires_at as string);
  return expires.getTime() > Date.now() ? expires : null;
}

export async function hasStepUp(userId: string): Promise<boolean> {
  return (await getStepUpExpiry(userId)) !== null;
}

export async function sendStepUpCode(email: string): Promise<void> {
  const { error } = await statelessAuthClient().auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
  if (error) logWarn('step-up.send', error.message, { status: error.status });
}

/**
 * Verifies the code sent to the account's current email. The code must belong to the same user as
 * the session; the short-lived session that verifyOtp creates is revoked straight away.
 */
export async function verifyStepUpCode(userId: string, email: string, code: string): Promise<boolean> {
  const { data, error } = await statelessAuthClient().auth.verifyOtp({ email, token: code, type: 'email' });
  if (error || !data.user || !data.session) return false;

  const admin = createSupabaseAdminClient();
  const { error: revokeError } = await admin.auth.admin.signOut(data.session.access_token, 'local');
  if (revokeError) logWarn('step-up.revoke', revokeError.message);

  if (data.user.id !== userId) return false;

  const expires = new Date(Date.now() + STEP_UP_MINUTES * 60_000).toISOString();
  const { error: grantError } = await admin
    .from('step_up_grants')
    .upsert({ user_id: userId, expires_at: expires, created_at: new Date().toISOString() });
  if (grantError) {
    logError('step-up.grant', grantError);
    return false;
  }
  return true;
}

export async function clearStepUp(userId: string): Promise<void> {
  await createSupabaseAdminClient().from('step_up_grants').delete().eq('user_id', userId);
}
