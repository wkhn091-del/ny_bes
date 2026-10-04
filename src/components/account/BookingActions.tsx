'use client';

import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { cancelMyBooking, releaseMyBooking } from '@/app/actions/bookings';
import { Button } from '@/components/ui/Button';

interface Props {
  publicCode: string;
  mode: 'cancel' | 'release';
  totalLabel: string;
  paid: boolean;
  pointsRedeemed: number;
}

export function BookingActions({ publicCode, mode, totalLabel, paid, pointsRedeemed }: Props) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function run() {
    startTransition(async () => {
      const res = mode === 'cancel' ? await cancelMyBooking(publicCode) : await releaseMyBooking(publicCode);
      setResult(res);
      setConfirming(false);
      if (res.ok) router.refresh();
    });
  }

  const explanation =
    mode === 'cancel'
      ? [
          paid ? `ההזמנה תבוטל ויתבצע החזר מלא של ${totalLabel} לכרטיס.` : 'ההזמנה תבוטל.',
          pointsRedeemed > 0 ? `${pointsRedeemed.toLocaleString('he-IL')} הנקודות שמימשת יחזרו ליתרה.` : null,
        ]
          .filter(Boolean)
          .join(' ')
      : 'פחות מ-24 שעות לפני ההזמנה אין החזר כספי, אבל שחרור מחזיר את החלל למלאי כדי שאחרים יוכלו להשתמש בו.';

  return (
    <section className="mt-8 rounded-2xl border border-border bg-card p-5">
      <h2 className="font-semibold">{mode === 'cancel' ? 'ביטול ההזמנה' : 'שחרור החלל'}</h2>
      <p className="mt-1 text-sm text-muted">{explanation}</p>

      {result && (
        <p
          className={`mt-3 rounded-lg p-3 text-sm ${result.ok ? 'bg-success-soft text-success' : 'bg-danger-soft text-danger'}`}
          role={result.ok ? 'status' : 'alert'}
        >
          {result.message}
        </p>
      )}

      {!result?.ok &&
        (confirming ? (
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="danger" onClick={run} disabled={pending}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              {mode === 'cancel' ? 'כן, לבטל' : 'כן, לשחרר'}
            </Button>
            <Button variant="ghost" onClick={() => setConfirming(false)} disabled={pending}>
              חזרה
            </Button>
          </div>
        ) : (
          <Button variant="outline" className="mt-4" onClick={() => setConfirming(true)}>
            {mode === 'cancel' ? 'ביטול ההזמנה' : 'שחרור החלל'}
          </Button>
        ))}
    </section>
  );
}
