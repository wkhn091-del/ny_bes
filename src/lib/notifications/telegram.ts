import 'server-only';
import { env, isConfigured } from '@/lib/env.server';
import { logError, logInfo } from '@/lib/logger';
import { createSupabaseAdminClient } from '@/lib/supabase/server';
import type { BookingView } from './booking-view';

type StaffEvent = 'new' | 'cancelled' | 'released' | 'admin_cancelled';

const TITLES: Record<StaffEvent, string> = {
  new: '🟣 הזמנה חדשה',
  cancelled: '⚪️ ביטול הזמנה (עם החזר)',
  released: '🔓 חדר שוחרר — חזר למלאי',
  admin_cancelled: '🛑 ביטול על ידי מנהל',
};

function formatMessage(event: StaffEvent, booking: BookingView): string {
  const who =
    booking.customerName || booking.customerEmail?.replace(/(.{2}).*(@.*)/, '$1***$2') || 'חשבון שנמחק';
  const seats = booking.spaceType === 'hotDesk' ? ` · ${booking.seats} מקומות` : '';
  const lines = [
    TITLES[event],
    `${booking.spaceName} · ${booking.branchName}${seats}`,
    `${booking.dateLabel}, ${booking.isDayPass ? `יום שלם ${booking.timeLabel}` : booking.timeLabel}`,
    who,
    `#${booking.publicCode}`,
  ];
  return lines.join('\n').slice(0, 1000);
}

/** Sends plain text (no parse_mode) so user-supplied names can never inject formatting or links. */
export async function notifyBranchStaff(event: StaffEvent, booking: BookingView): Promise<void> {
  if (!isConfigured.telegram()) {
    logInfo('telegram', 'Bot not configured — skipping staff notification', { event });
    return;
  }
  try {
    const admin = createSupabaseAdminClient();
    const { data, error } = await admin
      .from('telegram_channels')
      .select('chat_id')
      .eq('branch_id', booking.branchId)
      .maybeSingle();
    if (error) throw error;
    if (!data?.chat_id) {
      logInfo('telegram', 'No chat configured for branch', { branchId: booking.branchId });
      return;
    }
    const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: data.chat_id, text: formatMessage(event, booking), disable_web_page_preview: true }),
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`Telegram responded ${res.status}`);
  } catch (error) {
    logError('telegram', error, { bookingId: booking.id, event });
  }
}
