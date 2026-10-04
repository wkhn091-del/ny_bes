import 'server-only';
import { isConfigured } from '@/lib/env.server';
import { logError } from '@/lib/logger';
import { deleteUserReviews } from '@/lib/server/reviews';
import { getSanityCustomersWriteClient } from '@/sanity/lib/client';
import { createSupabaseAdminClient } from '@/lib/supabase/server';

/**
 * Upserts the lean customer card in the private Sanity `customers` dataset.
 * Deterministic document id → idempotent; no phone / tax id / payment data leaves Supabase.
 */
export async function syncCustomerCard(userId: string): Promise<void> {
  try {
    await syncCustomerCardOrThrow(userId);
  } catch (error) {
    logError('customer-sync', error, { userId });
  }
}

/** Same as syncCustomerCard but throws, so the webhook can ask for a retry instead of marking the event done. */
export async function syncCustomerCardOrThrow(userId: string): Promise<void> {
  if (!isConfigured.sanityWrite() || !isConfigured.supabase()) return;
  const admin = createSupabaseAdminClient();
  const [{ data: authUser, error: userError }, { data: profile, error: profileError }, { count, error: countError }] =
    await Promise.all([
      admin.auth.admin.getUserById(userId),
      admin.from('profiles').select('full_name, created_at').eq('id', userId).maybeSingle(),
      admin
        .from('bookings')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .in('status', ['active', 'released']),
    ]);
  if (profileError) throw profileError;
  if (countError) throw countError;
  if (userError) {
    if (userError.status === 404) return;
    throw userError;
  }
  if (!authUser?.user) return;

  await getSanityCustomersWriteClient().createOrReplace({
    _id: `customer.${userId}`,
    _type: 'customer',
    supabaseUserId: userId,
    name: profile?.full_name ?? '',
    email: authUser.user.email ?? '',
    joinedAt: profile?.created_at ?? authUser.user.created_at,
    bookingsCount: count ?? 0,
  });
}

/** Removes the customer card when the account is deleted. Throws so the caller can stop the deletion. */
export async function deleteCustomerCard(userId: string): Promise<void> {
  if (!isConfigured.sanityWrite()) return;
  await deleteUserReviews(userId);
  await getSanityCustomersWriteClient().delete(`customer.${userId}`);
}
