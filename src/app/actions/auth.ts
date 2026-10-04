'use server';

import { after } from 'next/server';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { env, isConfigured } from '@/lib/env.server';
import { logError, logWarn } from '@/lib/logger';
import { emailSchema, fullNameSchema, otpCodeSchema } from '@/lib/domain/schemas';
import { safeReturnUrl } from '@/lib/security/redirect';
import { rateLimit } from '@/lib/security/rate-limit';
import { getClientIp } from '@/lib/security/request-meta';
import { verifyTurnstile } from '@/lib/security/turnstile';
import { syncCustomerCard } from '@/lib/server/customer-sync';
import { readLoginContext, registerLoginDevice } from '@/lib/server/devices';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export type LoginState =
  | { step: 'email'; error?: string; email?: string; returnUrl: string }
  | { step: 'code'; email: string; returnUrl: string; error?: string; notice?: string };

const RATE_LIMIT_MESSAGE = 'יותר מדי ניסיונות. נסו שוב בעוד כמה דקות.';
const UNAVAILABLE_MESSAGE = 'ההתחברות אינה זמינה כרגע. נסו שוב מאוחר יותר.';
// Identical for existing and new addresses so the form cannot be used to probe accounts.
const CODE_SENT_NOTICE = 'אם הכתובת תקינה, שלחנו אליה קוד חד-פעמי. הקוד בתוקף ל-5 דקות.';

const sendSchema = z.object({
  email: emailSchema,
  fullName: z.union([fullNameSchema, z.literal('')]).optional(),
  returnUrl: z.string().max(512).optional(),
  turnstileToken: z.string().max(2048).optional(),
});

const verifySchema = z.object({
  email: emailSchema,
  code: otpCodeSchema,
  returnUrl: z.string().max(512).optional(),
});

function field(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  return typeof value === 'string' ? value : undefined;
}

export async function sendLoginCode(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const returnUrl = safeReturnUrl(field(formData, 'returnUrl'));
  const parsed = sendSchema.safeParse({
    email: field(formData, 'email'),
    fullName: field(formData, 'fullName') ?? '',
    returnUrl,
    turnstileToken: field(formData, 'cf-turnstile-response'),
  });
  if (!parsed.success) {
    return { step: 'email', returnUrl, email: field(formData, 'email')?.slice(0, 254), error: 'נא להזין כתובת אימייל תקינה.' };
  }
  const { email, fullName, turnstileToken } = parsed.data;

  if (!isConfigured.supabase()) return { step: 'email', returnUrl, email, error: UNAVAILABLE_MESSAGE };

  const ip = await getClientIp();
  const [ipOk, emailOk, budgetOk] = await Promise.all([
    rateLimit('otpSendIp', ip),
    rateLimit('otpSendEmail', email),
    rateLimit('otpDailyBudget', 'global'),
  ]);
  if (!budgetOk) logWarn('auth.otp', 'Daily OTP budget exhausted');
  if (!ipOk || !emailOk || !budgetOk) return { step: 'email', returnUrl, email, error: RATE_LIMIT_MESSAGE };

  if (!(await verifyTurnstile(turnstileToken, ip, 'login'))) {
    return { step: 'email', returnUrl, email, error: 'אימות האבטחה נכשל. רעננו את העמוד ונסו שוב.' };
  }

  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true,
        data: fullName ? { full_name: fullName } : undefined,
      },
    });
    // Provider errors (e.g. Supabase's own throttling) are logged but not revealed, to keep responses uniform.
    if (error) logWarn('auth.otp.send', error.message, { status: error.status });
  } catch (error) {
    logError('auth.otp.send', error);
  }

  return { step: 'code', email, returnUrl, notice: CODE_SENT_NOTICE };
}

export async function verifyLoginCode(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const returnUrl = safeReturnUrl(field(formData, 'returnUrl'));
  const rawEmail = field(formData, 'email') ?? '';
  const parsed = verifySchema.safeParse({ email: rawEmail, code: field(formData, 'code'), returnUrl });
  if (!parsed.success) {
    const email = emailSchema.safeParse(rawEmail);
    if (!email.success) return { step: 'email', returnUrl, error: 'נא להזין כתובת אימייל תקינה.' };
    return { step: 'code', email: email.data, returnUrl, error: 'הקוד צריך להכיל 6–8 ספרות.' };
  }
  const { email, code } = parsed.data;

  if (!isConfigured.supabase()) return { step: 'email', returnUrl, email, error: UNAVAILABLE_MESSAGE };

  const ip = await getClientIp();
  const [ipOk, emailOk] = await Promise.all([rateLimit('otpVerify', `ip:${ip}`), rateLimit('otpVerify', `e:${email}`)]);
  if (!ipOk || !emailOk) return { step: 'code', email, returnUrl, error: RATE_LIMIT_MESSAGE };

  let userId: string | null = null;
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.verifyOtp({ email, token: code, type: 'email' });
    if (error || !data.user) {
      return { step: 'code', email, returnUrl, error: 'הקוד שגוי או שפג תוקפו. אפשר לבקש קוד חדש.' };
    }
    userId = data.user.id;
  } catch (error) {
    logError('auth.otp.verify', error);
    return { step: 'code', email, returnUrl, error: UNAVAILABLE_MESSAGE };
  }

  const syncedUserId = userId;
  const login = await readLoginContext(syncedUserId, email);
  after(async () => {
    await syncCustomerCard(syncedUserId);
    await registerLoginDevice(login);
  });
  redirect(returnUrl);
}

/** Single entry point for the login form so both steps share one state machine. */
export async function loginAction(prev: LoginState, formData: FormData): Promise<LoginState> {
  const intent = field(formData, 'intent');
  if (intent === 'verify') return verifyLoginCode(prev, formData);
  if (intent === 'restart') {
    return { step: 'email', returnUrl: safeReturnUrl(field(formData, 'returnUrl')), email: prev.email };
  }
  return sendLoginCode(prev, formData);
}

/** Starts Google sign-in (PKCE). The verifier cookie is set here; /auth/callback completes the exchange. */
export async function signInWithGoogle(formData: FormData): Promise<void> {
  const returnUrl = safeReturnUrl(field(formData, 'returnUrl'));
  if (!isConfigured.supabase()) redirect(`/login?error=oauth&returnUrl=${encodeURIComponent(returnUrl)}`);

  const ip = await getClientIp();
  if (!(await rateLimit('oauthStart', ip))) redirect(`/login?error=rate&returnUrl=${encodeURIComponent(returnUrl)}`);

  let url: string | null = null;
  try {
    const supabase = await createSupabaseServerClient();
    const callback = new URL('/auth/callback', env.NEXT_PUBLIC_SITE_URL);
    callback.searchParams.set('returnUrl', returnUrl);
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: callback.toString(), queryParams: { prompt: 'select_account' } },
    });
    if (error) logWarn('auth.oauth.start', error.message, { status: error.status });
    url = data?.url ?? null;
  } catch (error) {
    logError('auth.oauth.start', error);
  }
  if (!url || !isSupabaseAuthorizeUrl(url)) redirect(`/login?error=oauth&returnUrl=${encodeURIComponent(returnUrl)}`);
  redirect(url);
}

function isSupabaseAuthorizeUrl(url: string): boolean {
  try {
    const target = new URL(url);
    return target.origin === new URL(env.NEXT_PUBLIC_SUPABASE_URL ?? '').origin && target.pathname.startsWith('/auth/v1/authorize');
  } catch {
    return false;
  }
}

export async function signOut(): Promise<void> {
  if (isConfigured.supabase()) {
    try {
      const supabase = await createSupabaseServerClient();
      await supabase.auth.signOut({ scope: 'local' });
    } catch (error) {
      logError('auth.signout', error);
    }
  }
  redirect('/');
}
