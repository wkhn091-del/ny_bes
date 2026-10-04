import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { isConfigured } from '@/lib/env.server';
import { logError } from '@/lib/logger';
import { safeReturnUrl } from '@/lib/security/redirect';
import { createSupabaseAdminClient, createSupabaseServerClient } from '@/lib/supabase/server';

export type UserRole = 'customer' | 'branch_manager' | 'super_admin';

export interface SessionUser {
  id: string;
  email: string;
  /** Google profile picture (allow-listed host only); null → initials */
  avatarUrl: string | null;
  /** auth.sessions id of the current session (marks "this device" in the security tab) */
  sessionId: string | null;
}

const AVATAR_HOSTS = new Set(['lh3.googleusercontent.com']);

function pickAvatar(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const m = metadata as Record<string, unknown>;
  const raw = typeof m.avatar_url === 'string' ? m.avatar_url : typeof m.picture === 'string' ? m.picture : null;
  if (!raw || raw.length > 1024) return null;
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' && AVATAR_HOSTS.has(url.hostname) ? url.toString() : null;
  } catch {
    return null;
  }
}

export interface StaffContext {
  user: SessionUser;
  role: 'branch_manager' | 'super_admin';
  /** null = all branches (super admin) */
  branchIds: string[] | null;
}

/** Verifies the session JWT on the server (signature-checked via getClaims). */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  if (!isConfigured.supabase()) return null;
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.getClaims();
    if (error || !data?.claims?.sub) return null;
    const claims = data.claims as Record<string, unknown>;
    const email = typeof claims.email === 'string' ? claims.email : '';
    const sessionId = typeof claims.session_id === 'string' ? claims.session_id : null;
    return { id: data.claims.sub, email, avatarUrl: pickAvatar(claims.user_metadata), sessionId };
  } catch (error) {
    logError('auth', error);
    return null;
  }
});

/** Also opts the calling page out of static rendering/ISR explicitly, not only through the cookie read. */
export async function requireUser(returnTo: string): Promise<SessionUser> {
  await connection();
  const user = await getSessionUser();
  if (!user) redirect(`/login?returnUrl=${encodeURIComponent(safeReturnUrl(returnTo))}`);
  return user;
}

export interface UserProfile {
  fullName: string | null;
  phone: string | null;
  role: UserRole;
  companyName: string | null;
  companyTaxId: string | null;
}

export const getUserProfile = cache(async (userId: string): Promise<UserProfile | null> => {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from('profiles')
    .select('full_name, phone, role, company_name, company_tax_id')
    .eq('id', userId)
    .maybeSingle();
  if (error) {
    logError('auth.profile', error, { userId });
    return null;
  }
  if (!data) return null;
  return {
    fullName: data.full_name,
    phone: data.phone,
    role: data.role as UserRole,
    companyName: data.company_name,
    companyTaxId: data.company_tax_id,
  };
});

/** Role + branch scope check for /admin. Always called inside the page or action itself. */
export async function getStaffContext(): Promise<StaffContext | null> {
  const user = await getSessionUser();
  if (!user) return null;
  const profile = await getUserProfile(user.id);
  if (!profile) return null;
  if (profile.role === 'super_admin') return { user, role: 'super_admin', branchIds: null };
  if (profile.role !== 'branch_manager') return null;

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.from('branch_managers').select('branch_id').eq('user_id', user.id);
  if (error) {
    logError('auth.staff', error, { userId: user.id });
    return null;
  }
  return { user, role: 'branch_manager', branchIds: (data ?? []).map((r) => r.branch_id as string) };
}

export async function requireStaff(): Promise<StaffContext> {
  const user = await getSessionUser();
  if (!user) redirect('/login?returnUrl=%2Fadmin');
  const staff = await getStaffContext();
  if (!staff) redirect('/');
  return staff;
}

export function staffCanAccessBranch(staff: StaffContext, branchId: string): boolean {
  return staff.branchIds === null || staff.branchIds.includes(branchId);
}
