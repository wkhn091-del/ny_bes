import 'server-only';
import { isConfigured } from '@/lib/env.server';
import { logError } from '@/lib/logger';
import { createSupabaseAdminClient } from '@/lib/supabase/server';

export interface UserSession {
  id: string;
  createdAt: string;
  lastActiveAt: string;
  device: string;
  /** partially masked */
  ip: string | null;
}

export function describeUserAgent(ua: string | null): string {
  if (!ua) return 'מכשיר לא מזוהה';
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\//.test(ua)
      ? 'Opera'
      : /Firefox\//.test(ua)
        ? 'Firefox'
        : /Chrome\//.test(ua)
          ? 'Chrome'
          : /Safari\//.test(ua)
            ? 'Safari'
            : 'דפדפן';
  const os = /iPhone|iPad/.test(ua)
    ? 'iOS'
    : /Android/.test(ua)
      ? 'Android'
      : /Windows/.test(ua)
        ? 'Windows'
        : /Mac OS X/.test(ua)
          ? 'macOS'
          : /Linux/.test(ua)
            ? 'Linux'
            : 'מערכת לא מזוהה';
  return `${browser} · ${os}`;
}

export function maskIp(ip: string | null): string | null {
  if (!ip) return null;
  if (ip.includes('.')) return ip.split('.').slice(0, 2).join('.') + '.x.x';
  return ip.split(':').slice(0, 3).join(':') + ':…';
}

export async function listUserSessions(userId: string): Promise<UserSession[] | null> {
  if (!isConfigured.supabase()) return [];
  const { data, error } = await createSupabaseAdminClient().rpc('list_user_sessions', { p_user_id: userId });
  if (error) {
    logError('sessions.list', error);
    return null;
  }
  return ((data ?? []) as { id: string; created_at: string; last_active_at: string; user_agent: string | null; ip: string | null }[]).map(
    (s) => ({
      id: s.id,
      createdAt: s.created_at,
      lastActiveAt: s.last_active_at,
      device: describeUserAgent(s.user_agent),
      ip: maskIp(s.ip),
    }),
  );
}
