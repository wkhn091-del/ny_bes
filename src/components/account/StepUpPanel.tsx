'use client';

import { KeyRound, Loader2, ShieldCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { requestStepUpCode, verifyStepUp } from '@/app/actions/account';
import { Button } from '@/components/ui/Button';

const inputCls =
  'h-11 w-full rounded-lg border border-border bg-bg px-3 text-center font-mono text-lg tracking-[0.4em] outline-none focus:border-accent';

/** Re-verifies the account email before sensitive changes; the grant lasts 10 minutes (server-enforced). */
export function StepUpPanel({ active, expiresLabel }: { active: boolean; expiresLabel: string | null }) {
  const router = useRouter();
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState('');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  if (active) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-success/30 bg-success-soft p-4 text-sm text-success">
        <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
        הזהות אומתה{expiresLabel ? ` עד ${expiresLabel}` : ''}. אפשר לשנות טלפון, אימייל ופרטי חשבונית.
      </div>
    );
  }

  function send() {
    setMessage(null);
    startTransition(async () => {
      const res = await requestStepUpCode();
      if (res.ok) setSent(true);
      setMessage({ ok: res.ok, text: res.message ?? '' });
    });
  }

  function verify() {
    setMessage(null);
    startTransition(async () => {
      const res = await verifyStepUp({ code });
      setMessage({ ok: res.ok, text: res.message ?? '' });
      if (res.ok) {
        setCode('');
        router.refresh();
      }
    });
  }

  return (
    <div className="rounded-xl border border-border bg-subtle p-4">
      <p className="flex items-center gap-2 text-sm font-medium">
        <KeyRound className="h-4 w-4 text-accent-text" aria-hidden="true" />
        שינוי טלפון, אימייל או פרטי חשבונית דורש אימות נוסף בקוד לאימייל.
      </p>
      {!sent ? (
        <Button variant="outline" size="sm" className="mt-3" onClick={send} disabled={pending}>
          {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          שליחת קוד אימות
        </Button>
      ) : (
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="w-44 text-sm">
            <span className="mb-1 block text-muted">קוד מהמייל</span>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 8))}
              inputMode="numeric"
              autoComplete="one-time-code"
              dir="ltr"
              className={inputCls}
              aria-label="קוד אימות"
            />
          </label>
          <Button size="md" className="h-11" onClick={verify} disabled={pending || code.length < 6}>
            {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            אימות
          </Button>
          <Button variant="ghost" size="md" className="h-11" onClick={send} disabled={pending}>
            קוד חדש
          </Button>
        </div>
      )}
      {message && (
        <p className={`mt-2 text-sm ${message.ok ? 'text-success' : 'text-danger'}`} role={message.ok ? 'status' : 'alert'}>
          {message.text}
        </p>
      )}
    </div>
  );
}
