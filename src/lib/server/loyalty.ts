import 'server-only';
import { isConfigured } from '@/lib/env.server';
import { createSupabaseAdminClient } from '@/lib/supabase/server';

export type LoyaltyKind = 'earn' | 'redeem' | 'restore' | 'expire';

export interface LoyaltyEntry {
  id: string;
  kind: LoyaltyKind;
  points: number;
  createdAt: string;
  expiresAt: string | null;
  remaining: number | null;
  bookingCode: string | null;
  spaceName: string | null;
}

export interface LoyaltySummary {
  balance: number;
  /** points from lots expiring within the next 30 days */
  expiringSoon: number;
  nextExpiry: string | null;
  entries: LoyaltyEntry[];
}

export async function getPointsBalance(userId: string): Promise<number> {
  if (!isConfigured.supabase()) return 0;
  const { data, error } = await createSupabaseAdminClient().rpc('loyalty_balance', { p_user_id: userId });
  if (error) throw error;
  return typeof data === 'number' ? data : 0;
}

export async function getLoyaltySummary(userId: string): Promise<LoyaltySummary> {
  const empty: LoyaltySummary = { balance: 0, expiringSoon: 0, nextExpiry: null, entries: [] };
  if (!isConfigured.supabase()) return empty;
  const admin = createSupabaseAdminClient();
  const nowIso = new Date().toISOString();

  const [lotsRes, entriesRes] = await Promise.all([
    admin
      .from('loyalty_ledger')
      .select('remaining, expires_at')
      .eq('user_id', userId)
      .eq('kind', 'earn')
      .gt('remaining', 0)
      .gt('expires_at', nowIso)
      .order('expires_at', { ascending: true }),
    admin
      .from('loyalty_ledger')
      .select('id, kind, points, created_at, expires_at, remaining, bookings(public_code, space_name)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(100),
  ]);
  if (lotsRes.error) throw lotsRes.error;
  if (entriesRes.error) throw entriesRes.error;

  const soon = Date.now() + 30 * 24 * 60 * 60 * 1000;
  let balance = 0;
  let expiringSoon = 0;
  for (const lot of lotsRes.data ?? []) {
    balance += lot.remaining ?? 0;
    if (lot.expires_at && new Date(lot.expires_at).getTime() <= soon) expiringSoon += lot.remaining ?? 0;
  }

  type Row = {
    id: string;
    kind: LoyaltyKind;
    points: number;
    created_at: string;
    expires_at: string | null;
    remaining: number | null;
    bookings: { public_code: string; space_name: string } | { public_code: string; space_name: string }[] | null;
  };
  const entries = ((entriesRes.data ?? []) as Row[]).map((r) => {
    const booking = Array.isArray(r.bookings) ? r.bookings[0] : r.bookings;
    return {
      id: r.id,
      kind: r.kind,
      points: r.points,
      createdAt: r.created_at,
      expiresAt: r.expires_at,
      remaining: r.remaining,
      bookingCode: booking?.public_code ?? null,
      spaceName: booking?.space_name ?? null,
    };
  });

  return { balance, expiringSoon, nextExpiry: lotsRes.data?.[0]?.expires_at ?? null, entries };
}
