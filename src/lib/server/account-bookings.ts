import 'server-only';
import { isConfigured } from '@/lib/env.server';
import { logError } from '@/lib/logger';
import { BOOKING_VIEW_SELECT, toBookingView, type BookingRow, type BookingView } from '@/lib/notifications/booking-view';
import { createSupabaseAdminClient } from '@/lib/supabase/server';

export interface OwnBookings {
  upcoming: BookingView[];
  history: BookingView[];
}

export function isUpcoming(b: BookingView, now = Date.now()): boolean {
  return b.endsAt.getTime() > now && b.status === 'active';
}

/** The signed-in customer's bookings (session user id only — never an id from the request). */
export async function listOwnBookings(userId: string, limit = 200): Promise<OwnBookings | null> {
  if (!isConfigured.supabase()) return { upcoming: [], history: [] };
  const { data, error } = await createSupabaseAdminClient()
    .from('bookings')
    .select(BOOKING_VIEW_SELECT)
    .eq('user_id', userId)
    .in('status', ['active', 'cancelled', 'released'])
    .order('starts_at', { ascending: false })
    .limit(limit);
  if (error) {
    logError('account.bookings', error);
    return null;
  }
  const all = (data as unknown as BookingRow[]).map(toBookingView);
  const now = Date.now();
  return {
    upcoming: all.filter((b) => isUpcoming(b, now)).reverse(),
    history: all.filter((b) => !isUpcoming(b, now)),
  };
}
