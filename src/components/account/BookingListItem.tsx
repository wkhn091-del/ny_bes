import { ChevronLeft } from 'lucide-react';
import Link from 'next/link';
import { Badge } from '@/components/ui/Badge';
import { BOOKING_STATUS_LABELS, type BookingStatus } from '@/lib/domain/types';
import type { BookingView } from '@/lib/notifications/booking-view';

export const STATUS_TONE: Record<BookingStatus, 'success' | 'warning' | 'neutral' | 'danger'> = {
  active: 'success',
  pending_payment: 'warning',
  cancelled: 'danger',
  released: 'neutral',
  expired: 'neutral',
};

export function statusLabel(b: BookingView, now = Date.now()): string {
  if (b.status === 'active' && b.endsAt.getTime() <= now) return 'התקיימה';
  return BOOKING_STATUS_LABELS[b.status];
}

export function statusTone(b: BookingView, now = Date.now()) {
  if (b.status === 'active' && b.endsAt.getTime() <= now) return 'neutral' as const;
  return STATUS_TONE[b.status];
}

export function BookingListItem({ booking: b }: { booking: BookingView }) {
  return (
    <li>
      <Link
        href={`/account/bookings/${b.publicCode}`}
        className="flex flex-wrap items-center justify-between gap-3 p-4 transition-colors hover:bg-subtle"
      >
        <div className="min-w-0">
          <p className="font-medium">
            {b.spaceName} <span className="text-sm font-normal text-muted">· {b.branchName}</span>
          </p>
          <p className="text-sm text-muted">
            {b.dateLabel} · {b.isDayPass ? `יום שלם (${b.timeLabel})` : b.timeLabel}
            {b.seats > 1 && ` · ${b.seats} עמדות`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold">{b.formatted.total}</span>
          <Badge tone={statusTone(b)}>{statusLabel(b)}</Badge>
          <span className="font-mono text-xs text-muted">{b.publicCode}</span>
          <ChevronLeft className="h-4 w-4 text-muted" aria-hidden="true" />
        </div>
      </Link>
    </li>
  );
}
