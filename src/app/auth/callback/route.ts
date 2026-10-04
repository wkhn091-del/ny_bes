import { after, NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';
import { env, isConfigured } from '@/lib/env.server';
import { logError, logWarn } from '@/lib/logger';
import { safeReturnUrl } from '@/lib/security/redirect';
import { syncCustomerCard } from '@/lib/server/customer-sync';
import { readLoginContext, registerLoginDevice } from '@/lib/server/devices';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const codeSchema = z.string().min(8).max(512).regex(/^[A-Za-z0-9._~-]+$/);

function redirectTo(path: string): NextResponse {
  const response = NextResponse.redirect(new URL(path, env.NEXT_PUBLIC_SITE_URL), { status: 303 });
  response.headers.set('Cache-Control', 'private, no-store, max-age=0');
  return response;
}

/** Google sign-in return point: exchanges the one-time code (PKCE verifier cookie) for a session. */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const returnUrl = safeReturnUrl(params.get('returnUrl'));
  const failure = `/login?error=oauth&returnUrl=${encodeURIComponent(returnUrl)}`;

  const code = codeSchema.safeParse(params.get('code'));
  if (!code.success || !isConfigured.supabase()) {
    if (params.get('error')) logWarn('auth.oauth.callback', 'Provider returned an error', { error: params.get('error')?.slice(0, 64) });
    return redirectTo(failure);
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code.data);
    if (error || !data.user) {
      logWarn('auth.oauth.callback', error?.message ?? 'No user after exchange', { status: error?.status });
      return redirectTo(failure);
    }
    const userId = data.user.id;
    const login = await readLoginContext(userId, data.user.email ?? '');
    after(async () => {
      await syncCustomerCard(userId);
      await registerLoginDevice(login);
    });
  } catch (error) {
    logError('auth.oauth.callback', error);
    return redirectTo(failure);
  }

  return redirectTo(returnUrl);
}
