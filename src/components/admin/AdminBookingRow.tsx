'use client';

import { Check, Loader2 } from 'lucide-react';
import { useRef, useState, useTransition } from 'react';
import { checkInBooking, emergencyCancelBooking } from '@/app/actions/admin';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { BOOKING_STATUS_LABELS, type BookingStatus } from '@/lib/domain/types';

interface Props {
  booking: {
    id: string;
    publicCode: string;
    status: string;
    spaceName: string;
    timeLabel: string;
    seats: number;
    customer: string;
    companyName: string | null;
    total: string;
    checkedIn: boolean;
    isToday: boolean;
  };
}

export function AdminBookingRow({ booking }: Props) {
  const [pending, start] = useTransition();
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [reason, setReason] = useState('');
  const dialogRef = useRef<HTMLDialogElement>(null);
  const status = booking.status as BookingStatus;
  const cancellable = status === 'active' || status === 'pending_payment';

  function run(fn: () => Promise<{ ok: boolean; message?: string }>) {
    setFeedback(null);
    start(async () => {
      const res = await fn();
      setFeedback(res.message ? { ok: res.ok, text: res.message } : null);
    });
  }

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 p-4">
      <div className="min-w-0">
        <p className="font-medium">
          <span className="tabular-nums">{booking.timeLabel}</span> · {booking.spaceName}
          {booking.seats > 1 && <span className="text-muted"> · {booking.seats} עמדות</span>}
        </p>
        <p className="text-sm text-muted">
          {booking.customer}
          {booking.companyName && ` · ${booking.companyName}`} · <span className="font-mono">{booking.publicCode}</span> · {booking.total}
        </p>
        {feedback && <p className={`mt-1 text-xs ${feedback.ok ? 'text-success' : 'text-danger'}`}>{feedback.text}</p>}
      </div>
      <div className="flex items-center gap-2">
        <Badge tone={status === 'active' ? 'success' : status === 'pending_payment' ? 'warning' : 'neutral'}>
          {BOOKING_STATUS_LABELS[status] ?? booking.status}
        </Badge>
        {status === 'active' &&
          (booking.checkedIn ? (
            <Badge tone="accent">
              <Check className="h-3 w-3" aria-hidden="true" /> הגיע/ה
            </Badge>
          ) : (
            booking.isToday && (
              <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => checkInBooking({ bookingId: booking.id }))}>
                {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
                סימון הגעה
              </Button>
            )
          ))}
        {cancellable && (
          <Button size="sm" variant="ghost" className="text-danger" disabled={pending} onClick={() => dialogRef.current?.showModal()}>
            ביטול חירום
          </Button>
        )}
      </div>

      <dialog ref={dialogRef} className="m-auto w-[92%] max-w-md rounded-2xl border border-border bg-card p-6 text-fg backdrop:bg-black/50">
        <form
          method="dialog"
          onSubmit={(e) => {
            e.preventDefault();
            dialogRef.current?.close();
            run(() => emergencyCancelBooking({ bookingId: booking.id, reason }));
          }}
        >
          <h2 className="text-lg font-bold">ביטול הזמנה {booking.publicCode}</h2>
          <p className="mt-2 text-sm text-muted">
            ההזמנה תבוטל, הלקוח יקבל החזר מלא והודעה במייל. הפעולה אינה הפיכה.
          </p>
          <label className="mt-4 block text-sm">
            <span className="mb-1 block font-medium">סיבת הביטול (נשמרת ביומן)</span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value.slice(0, 300))}
              required
              minLength={3}
              maxLength={300}
              rows={3}
              className="w-full rounded-lg border border-border bg-bg p-2"
            />
          </label>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="outline" onClick={() => dialogRef.current?.close()}>
              חזרה
            </Button>
            <Button type="submit" variant="danger" disabled={reason.trim().length < 3}>
              ביטול ההזמנה
            </Button>
          </div>
        </form>
      </dialog>
    </li>
  );
}
