import 'server-only';
import { cache } from 'react';
import { isConfigured } from '@/lib/env.server';
import { logError } from '@/lib/logger';
import { createSupabaseAdminClient } from '@/lib/supabase/server';

/** Favorite space ids of the given (session-derived) user, newest first. */
export const getFavoriteIds = cache(async (userId: string): Promise<string[]> => {
  if (!isConfigured.supabase()) return [];
  const { data, error } = await createSupabaseAdminClient()
    .from('favorites')
    .select('space_id')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) {
    logError('favorites.list', error);
    return [];
  }
  return (data ?? []).map((r) => r.space_id as string);
});
