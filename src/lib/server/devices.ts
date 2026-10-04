import 'server-only';
import { createHash } from 'node:crypto';
import { headers } from 'next/headers';
import { env, isConfigured } from '@/lib/env.server';
import { logError } from '@/lib/logger';
import { sendSecurityNotice } from '@/lib/notifications/email';
import { getClientIp } from '@/lib/security/request-meta';
import { describeUserAgent, maskIp } from '@/lib/server/sessions';
import { createSupabaseAdminClient } from '@/lib/supabase/server';

export interface LoginContext {
  userId: string;
  email: string;
  device: string;
  ip: string;
}

/** Reads the device description and IP while the request is still in scope (call before `after`). */
export async function readLoginContext(userId: string, email: string): Promise<LoginContext> {
  const h = await headers();
  return {
    userId,
    email,
    device: describeUserAgent(h.get('user-agent')?.slice(0, 512) ?? null),
    ip: await getClientIp(),
  };
}

/**
 * Remembers the device and, if it is new for an account that already had another device,
 * emails the account owner. Never throws: a failed alert must not block sign-in.
 */
export async function registerLoginDevice(ctx: LoginContext): Promise<void> {
  if (!isConfigured.supabase() || !ctx.email) return;
  try {
    const deviceKey = createHash('sha256').update(`${ctx.userId}|${ctx.device}`).digest('hex');
    const { data: isNew, error } = await createSupabaseAdminClient().rpc('register_device', {
      p_user_id: ctx.userId,
      p_device_key: deviceKey,
      p_label: ctx.device,
    });
    if (error) {
      logError('devices.register', error, { userId: ctx.userId });
      return;
    }
    if (isNew !== true) return;

    const when = new Intl.DateTimeFormat('he-IL', {
      timeZone: 'Asia/Jerusalem',
      dateStyle: 'full',
      timeStyle: 'short',
    }).format(new Date());
    const securityUrl = new URL('/account/security', env.NEXT_PUBLIC_SITE_URL).toString();
    const ip = maskIp(ctx.ip);

    await sendSecurityNotice({
      to: ctx.email,
      title: 'התחברות חדשה לחשבון SpaceHub שלך',
      body:
        `זיהינו התחברות ממכשיר שלא ראינו קודם: ${ctx.device}` +
        (ip ? ` (כתובת ${ip})` : '') +
        `, ${when}. אם זה היית את/ה — אין צורך לעשות דבר. ` +
        `אם לא — היכנסו ל-${securityUrl} ולחצו "ניתוק כל המכשירים".`,
      idempotencyKey: `new-device-${ctx.userId}-${deviceKey.slice(0, 16)}`,
    });
  } catch (error) {
    logError('devices.register', error, { userId: ctx.userId });
  }
}
