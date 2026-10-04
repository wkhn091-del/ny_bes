'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { after } from 'next/server';
import { z } from 'zod';
import {
  billingDefaultsSchema,
  emailSchema,
  fullNameSchema,
  otpCodeSchema,
  phoneSchema,
  sanityIdSchema,
} from '@/lib/domain/schemas';
import { isConfigured } from '@/lib/env.server';
import { logError, logInfo, logWarn } from '@/lib/logger';
import { sendSecurityNotice } from '@/lib/notifications/email';
import { rateLimit } from '@/lib/security/rate-limit';
import { getSessionUser, getUserProfile, type SessionUser } from '@/lib/server/auth';
import { deleteCustomerCard, syncCustomerCard } from '@/lib/server/customer-sync';
import { clearStepUp, hasStepUp, sendStepUpCode, verifyStepUpCode } from '@/lib/server/step-up';
import { createSupabaseAdminClient, createSupabaseServerClient } from '@/lib/supabase/server';

export type AccountResult =
  | { ok: true; message?: string }
  | { ok: false; message: string; code?: 'AUTH' | 'STEP_UP' | 'RATE_LIMIT' | 'INVALID' | 'ERROR' };

const GENERIC = 'לא הצלחנו לשמור. נסו שוב בעוד רגע.';
const RATE = 'יותר מדי ניסיונות. נסו שוב בעוד כמה דקות.';
const STEP_UP_REQUIRED: AccountResult = {
  ok: false,
  code: 'STEP_UP',
  message: 'לשינוי הזה צריך לאמת שוב את הזהות שלך עם קוד לאימייל.',
};

async function guard(limiterKey: string): Promise<{ user: SessionUser } | { error: AccountResult }> {
  const user = await getSessionUser();
  if (!user) return { error: { ok: false, code: 'AUTH', message: 'נדרשת התחברות מחדש.' } };
  if (!isConfigured.supabase()) return { error: { ok: false, code: 'ERROR', message: GENERIC } };
  if (!(await rateLimit('accountMutation', `${limiterKey}:${user.id}`))) {
    return { error: { ok: false, code: 'RATE_LIMIT', message: RATE } };
  }
  return { user };
}

function maskEmail(email: string): string {
  return email.replace(/^(.{2})[^@]*(@.*)$/, '$1***$2');
}

// ─── Profile ─────────────────────────────────────────────────────────────

export async function updateFullName(input: unknown): Promise<AccountResult> {
  const g = await guard('name');
  if ('error' in g) return g.error;
  const parsed = z.object({ fullName: fullNameSchema }).safeParse(input);
  if (!parsed.success) return { ok: false, code: 'INVALID', message: 'השם צריך להכיל 2–120 תווים.' };

  const { error } = await createSupabaseAdminClient()
    .from('profiles')
    .update({ full_name: parsed.data.fullName })
    .eq('id', g.user.id);
  if (error) {
    logError('account.name', error);
    return { ok: false, code: 'ERROR', message: GENERIC };
  }
  after(() => syncCustomerCard(g.user.id));
  revalidatePath('/account', 'layout');
  return { ok: true, message: 'השם עודכן.' };
}

export async function updatePhone(input: unknown): Promise<AccountResult> {
  const g = await guard('phone');
  if ('error' in g) return g.error;
  const parsed = z.object({ phone: phoneSchema }).safeParse(input);
  if (!parsed.success) return { ok: false, code: 'INVALID', message: 'מספר הטלפון אינו תקין. כתבו מספר ישראלי, למשל 050-1234567.' };
  if (!(await hasStepUp(g.user.id))) return STEP_UP_REQUIRED;

  const { error } = await createSupabaseAdminClient()
    .from('profiles')
    .update({ phone: parsed.data.phone })
    .eq('id', g.user.id);
  if (error) {
    logError('account.phone', error);
    return { ok: false, code: 'ERROR', message: GENERIC };
  }
  after(() =>
    sendSecurityNotice({
      to: g.user.email,
      title: 'מספר הטלפון בחשבון SpaceHub עודכן',
      body: parsed.data.phone ? 'מספר הטלפון בחשבון שלך שונה זה עתה.' : 'מספר הטלפון הוסר מהחשבון שלך זה עתה.',
      idempotencyKey: `phone-${g.user.id}-${Date.now()}`,
    }),
  );
  revalidatePath('/account', 'layout');
  return { ok: true, message: 'מספר הטלפון עודכן.' };
}

export async function updateBillingDefaults(input: unknown): Promise<AccountResult> {
  const g = await guard('billing');
  if ('error' in g) return g.error;
  const parsed = billingDefaultsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, code: 'INVALID', message: 'פרטי החשבונית אינם תקינים (ח.פ: 9 ספרות עם ספרת ביקורת).' };
  if (!(await hasStepUp(g.user.id))) return STEP_UP_REQUIRED;

  const { error } = await createSupabaseAdminClient()
    .from('profiles')
    .update({ company_name: parsed.data.companyName ?? null, company_tax_id: parsed.data.companyTaxId ?? null })
    .eq('id', g.user.id);
  if (error) {
    logError('account.billing', error);
    return { ok: false, code: 'ERROR', message: GENERIC };
  }
  after(() =>
    sendSecurityNotice({
      to: g.user.email,
      title: 'פרטי החשבונית בחשבון SpaceHub עודכנו',
      body: 'שם החברה או מספר ח.פ בחשבון שלך שונו זה עתה. אם זה לא אתם, היכנסו לחשבון ונתקו את כל המכשירים.',
      idempotencyKey: `billing-${g.user.id}-${Date.now()}`,
    }),
  );
  revalidatePath('/account', 'layout');
  return { ok: true, message: 'פרטי החשבונית נשמרו וימולאו אוטומטית בהזמנה הבאה.' };
}

// ─── Step-up ─────────────────────────────────────────────────────────────

export async function requestStepUpCode(): Promise<AccountResult> {
  const user = await getSessionUser();
  if (!user || !user.email) return { ok: false, code: 'AUTH', message: 'נדרשת התחברות מחדש.' };
  if (!isConfigured.supabase()) return { ok: false, code: 'ERROR', message: GENERIC };
  const [userOk, budgetOk] = await Promise.all([
    rateLimit('stepUpSend', user.id),
    rateLimit('otpDailyBudget', 'global'),
  ]);
  if (!userOk || !budgetOk) return { ok: false, code: 'RATE_LIMIT', message: RATE };

  try {
    await sendStepUpCode(user.email);
  } catch (error) {
    logError('account.stepup.send', error);
    return { ok: false, code: 'ERROR', message: GENERIC };
  }
  return { ok: true, message: `שלחנו קוד אימות ל-${maskEmail(user.email)}.` };
}

export async function verifyStepUp(input: unknown): Promise<AccountResult> {
  const user = await getSessionUser();
  if (!user || !user.email) return { ok: false, code: 'AUTH', message: 'נדרשת התחברות מחדש.' };
  const parsed = z.object({ code: otpCodeSchema }).safeParse(input);
  if (!parsed.success) return { ok: false, code: 'INVALID', message: 'הקוד צריך להכיל 6–8 ספרות.' };
  if (!(await rateLimit('otpVerify', `stepup:${user.id}`))) return { ok: false, code: 'RATE_LIMIT', message: RATE };

  try {
    const ok = await verifyStepUpCode(user.id, user.email, parsed.data.code);
    if (!ok) return { ok: false, code: 'INVALID', message: 'הקוד שגוי או שפג תוקפו.' };
  } catch (error) {
    logError('account.stepup.verify', error);
    return { ok: false, code: 'ERROR', message: GENERIC };
  }
  revalidatePath('/account', 'layout');
  return { ok: true, message: 'הזהות אומתה. אפשר לבצע שינויים רגישים ב-10 הדקות הקרובות.' };
}

// ─── Email change (step-up + code sent to the new address) ──────────────

const EMAIL_CHANGE_SENT = 'אם הכתובת זמינה, שלחנו אליה קוד אימות. הזינו אותו כדי להשלים את ההחלפה.';

export async function startEmailChange(input: unknown): Promise<AccountResult> {
  const g = await guard('email');
  if ('error' in g) return g.error;
  const parsed = z.object({ email: emailSchema }).safeParse(input);
  if (!parsed.success) return { ok: false, code: 'INVALID', message: 'נא להזין כתובת אימייל תקינה.' };
  if (parsed.data.email === g.user.email.toLowerCase()) {
    return { ok: false, code: 'INVALID', message: 'זו כבר כתובת האימייל של החשבון.' };
  }
  if (!(await hasStepUp(g.user.id))) return STEP_UP_REQUIRED;
  if (!(await rateLimit('otpSendEmail', parsed.data.email))) return { ok: false, code: 'RATE_LIMIT', message: RATE };

  try {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.updateUser({ email: parsed.data.email });
    // Same answer whether or not the address already belongs to another account.
    if (error) logWarn('account.email.start', error.message, { status: error.status });
  } catch (error) {
    logError('account.email.start', error);
  }
  return { ok: true, message: EMAIL_CHANGE_SENT };
}

export async function confirmEmailChange(input: unknown): Promise<AccountResult> {
  const g = await guard('email-confirm');
  if ('error' in g) return g.error;
  const parsed = z.object({ email: emailSchema, code: otpCodeSchema }).safeParse(input);
  if (!parsed.success) return { ok: false, code: 'INVALID', message: 'הקוד צריך להכיל 6–8 ספרות.' };
  if (!(await hasStepUp(g.user.id))) return STEP_UP_REQUIRED;
  if (!(await rateLimit('otpVerify', `email-change:${g.user.id}`))) return { ok: false, code: 'RATE_LIMIT', message: RATE };

  const previousEmail = g.user.email;
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.verifyOtp({
      email: parsed.data.email,
      token: parsed.data.code,
      type: 'email_change',
    });
    if (error || !data.user || data.user.id !== g.user.id) {
      return { ok: false, code: 'INVALID', message: 'הקוד שגוי או שפג תוקפו.' };
    }
  } catch (error) {
    logError('account.email.confirm', error);
    return { ok: false, code: 'ERROR', message: GENERIC };
  }

  await clearStepUp(g.user.id);
  after(async () => {
    await syncCustomerCard(g.user.id);
    if (previousEmail) {
      await sendSecurityNotice({
        to: previousEmail,
        title: 'כתובת האימייל בחשבון SpaceHub הוחלפה',
        body: `כתובת האימייל של החשבון הוחלפה ל-${maskEmail(parsed.data.email)}. מעכשיו קודי הכניסה יישלחו לכתובת החדשה.`,
        idempotencyKey: `email-change-${g.user.id}-${Date.now()}`,
      });
    }
  });
  revalidatePath('/', 'layout');
  return { ok: true, message: 'כתובת האימייל עודכנה.' };
}

// ─── Favorites ───────────────────────────────────────────────────────────

export type FavoriteResult = { ok: true; favorited: boolean } | { ok: false; message: string; code?: 'AUTH' };

export async function setFavorite(input: unknown): Promise<FavoriteResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false, code: 'AUTH', message: 'כדי לשמור למועדפים צריך להתחבר.' };
  const parsed = z.object({ spaceId: sanityIdSchema, favorite: z.boolean() }).safeParse(input);
  if (!parsed.success || !isConfigured.supabase()) return { ok: false, message: GENERIC };
  if (!(await rateLimit('accountMutation', `fav:${user.id}`))) return { ok: false, message: RATE };

  const admin = createSupabaseAdminClient();
  const { spaceId, favorite } = parsed.data;
  if (favorite) {
    const { error } = await admin
      .from('favorites')
      .upsert({ user_id: user.id, space_id: spaceId }, { onConflict: 'user_id,space_id', ignoreDuplicates: true });
    if (error) {
      // 23503: the space is not (or no longer) in the catalog mirror.
      if (error.code !== '23503') {
        logError('account.favorite.add', error);
        return { ok: false, message: GENERIC };
      }
      return { ok: false, message: 'החלל הזה כבר לא זמין לשמירה. רעננו את העמוד ונסו חלל אחר.' };
    }
  } else {
    const { error } = await admin.from('favorites').delete().eq('user_id', user.id).eq('space_id', spaceId);
    if (error) {
      logError('account.favorite.remove', error);
      return { ok: false, message: GENERIC };
    }
  }
  revalidatePath('/account/favorites');
  return { ok: true, favorited: favorite };
}

// ─── Sessions ────────────────────────────────────────────────────────────

/** Revoking a session is protective, so it does not require step-up. */
export async function revokeSession(input: unknown): Promise<AccountResult> {
  const g = await guard('session');
  if ('error' in g) return g.error;
  const parsed = z.object({ sessionId: z.uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, code: 'INVALID', message: GENERIC };
  if (parsed.data.sessionId === g.user.sessionId) {
    return { ok: false, code: 'INVALID', message: 'זה המכשיר הנוכחי. כדי לצאת ממנו השתמשו ב"התנתקות".' };
  }
  const { error } = await createSupabaseAdminClient().rpc('revoke_user_session', {
    p_user_id: g.user.id,
    p_session_id: parsed.data.sessionId,
  });
  if (error) {
    logError('account.session.revoke', error);
    return { ok: false, code: 'ERROR', message: GENERIC };
  }
  revalidatePath('/account/security');
  return { ok: true, message: 'המכשיר נותק.' };
}

/** Signs out every device including this one (refresh tokens revoked server-side). */
export async function signOutEverywhere(): Promise<void> {
  const user = await getSessionUser();
  if (user && isConfigured.supabase()) {
    try {
      const supabase = await createSupabaseServerClient();
      const { error } = await supabase.auth.signOut({ scope: 'global' });
      if (error) logWarn('account.signout.global', error.message);
      await clearStepUp(user.id);
      logInfo('account.signout.global', 'All sessions revoked', { userId: user.id });
    } catch (error) {
      logError('account.signout.global', error);
    }
  }
  redirect('/login?returnUrl=%2Faccount');
}

// ─── Account deletion ────────────────────────────────────────────────────

const DELETE_CONFIRMATION = 'מחיקה';

export async function deleteAccount(input: unknown): Promise<AccountResult> {
  const g = await guard('delete');
  if ('error' in g) return g.error;
  const parsed = z.object({ confirm: z.string().trim().max(20) }).safeParse(input);
  if (!parsed.success || parsed.data.confirm !== DELETE_CONFIRMATION) {
    return { ok: false, code: 'INVALID', message: `כדי לאשר יש להקליד "${DELETE_CONFIRMATION}".` };
  }
  if (!(await hasStepUp(g.user.id))) return STEP_UP_REQUIRED;

  const profile = await getUserProfile(g.user.id);
  if (profile && profile.role !== 'customer') {
    return { ok: false, code: 'INVALID', message: 'חשבון צוות לא נמחק מכאן. פנו למנהל המערכת.' };
  }

  const admin = createSupabaseAdminClient();
  const nowIso = new Date().toISOString();
  const { count, error: upcomingError } = await admin
    .from('bookings')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', g.user.id)
    .or(`status.eq.active,and(status.eq.pending_payment,hold_expires_at.gt."${nowIso}")`)
    .gt('ends_at', nowIso);
  if (upcomingError) {
    logError('account.delete.upcoming', upcomingError);
    return { ok: false, code: 'ERROR', message: GENERIC };
  }
  if ((count ?? 0) > 0) {
    return {
      ok: false,
      code: 'INVALID',
      message: 'יש לך הזמנות עתידיות. בטלו או שחררו אותן (או המתינו שיסתיימו) ואז אפשר יהיה למחוק את החשבון.',
    };
  }

  // Financial records stay (tax retention) but lose every personal detail.
  const { error: anonError } = await admin
    .from('bookings')
    .update({ user_id: null, customer_email: null, customer_name: null, company_name: null, company_tax_id: null })
    .eq('user_id', g.user.id);
  if (anonError) {
    logError('account.delete.anonymise', anonError);
    return { ok: false, code: 'ERROR', message: GENERIC };
  }

  try {
    await deleteCustomerCard(g.user.id);
  } catch (error) {
    logError('account.delete.sanity', error);
    return { ok: false, code: 'ERROR', message: GENERIC };
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(g.user.id);
  if (deleteError) {
    logError('account.delete.user', deleteError);
    return { ok: false, code: 'ERROR', message: GENERIC };
  }
  logInfo('account.delete', 'Account deleted', { userId: g.user.id });
  const deletedEmail = g.user.email;
  after(() =>
    sendSecurityNotice({
      to: deletedEmail,
      title: 'החשבון שלך ב-SpaceHub נמחק',
      body: 'החשבון והפרטים האישיים נמחקו. קבלות על הזמנות קודמות נשמרות בלי פרטים מזהים, כנדרש בחוק.',
      idempotencyKey: `delete-${g.user.id}`,
    }),
  );

  try {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut({ scope: 'local' });
  } catch {
    // The user no longer exists; clearing the cookie is best-effort.
  }
  redirect('/');
}
