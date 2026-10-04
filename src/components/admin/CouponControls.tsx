'use client';

import { Loader2 } from 'lucide-react';
import { useState, useTransition, type FormEvent } from 'react';
import { createCoupon, setCouponActive } from '@/app/actions/admin';
import { Button } from '@/components/ui/Button';

const inputCls = 'h-10 w-full rounded-lg border border-border bg-bg px-3 text-sm';

export function CouponForm() {
  const [code, setCode] = useState('');
  const [discountType, setDiscountType] = useState<'percent' | 'fixed'>('percent');
  const [value, setValue] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [maxUses, setMaxUses] = useState('');
  const [onePerUser, setOnePerUser] = useState(true);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setFeedback(null);
    start(async () => {
      const res = await createCoupon({
        code,
        discountType,
        value: Number(value),
        validUntil,
        maxUses: maxUses ? Number(maxUses) : null,
        onePerUser,
      });
      setFeedback({ ok: res.ok, text: res.ok ? (res.message ?? 'נוצר.') : res.message });
      if (res.ok) {
        setCode('');
        setValue('');
        setMaxUses('');
        setValidUntil('');
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3 rounded-2xl border border-border bg-card p-5">
      <h2 className="font-semibold">קופון חדש</h2>
      <label className="block text-sm">
        <span className="mb-1 block text-muted">קוד</span>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 32))}
          required
          minLength={3}
          dir="ltr"
          className={inputCls}
          placeholder="OPENING20"
        />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="block text-sm">
          <span className="mb-1 block text-muted">סוג</span>
          <select value={discountType} onChange={(e) => setDiscountType(e.target.value as 'percent' | 'fixed')} className={inputCls}>
            <option value="percent">אחוז</option>
            <option value="fixed">סכום קבוע (₪)</option>
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-muted">{discountType === 'percent' ? 'אחוז הנחה' : 'סכום ב-₪'}</span>
          <input
            type="number"
            min={1}
            max={discountType === 'percent' ? 100 : 100000}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            required
            className={inputCls}
          />
        </label>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="block text-sm">
          <span className="mb-1 block text-muted">בתוקף עד</span>
          <input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} className={inputCls} />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-muted">מקסימום שימושים</span>
          <input type="number" min={1} value={maxUses} onChange={(e) => setMaxUses(e.target.value)} className={inputCls} placeholder="ללא הגבלה" />
        </label>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={onePerUser} onChange={(e) => setOnePerUser(e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />
        פעם אחת לכל משתמש
      </label>
      {feedback && <p className={`text-sm ${feedback.ok ? 'text-success' : 'text-danger'}`}>{feedback.text}</p>}
      <Button type="submit" className="w-full" disabled={pending}>
        {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
        יצירת קופון
      </Button>
    </form>
  );
}

export function CouponToggle({ couponId, active }: { couponId: string; active: boolean }) {
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() => start(async () => void (await setCouponActive({ couponId, active: !active })))}
    >
      {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />}
      {active ? 'השבתה' : 'הפעלה'}
    </Button>
  );
}
