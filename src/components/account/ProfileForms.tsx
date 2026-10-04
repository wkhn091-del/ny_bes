'use client';

import { Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition, type FormEvent, type ReactNode } from 'react';
import {
  confirmEmailChange,
  startEmailChange,
  updateBillingDefaults,
  updateFullName,
  updatePhone,
  type AccountResult,
} from '@/app/actions/account';
import { Button } from '@/components/ui/Button';
import { isValidIsraeliId } from '@/lib/domain/israeli-id';

const inputCls =
  'h-11 w-full rounded-lg border border-border bg-bg px-3 text-sm outline-none transition-colors focus:border-accent disabled:opacity-60 aria-[invalid=true]:border-danger';

interface Props {
  fullName: string;
  email: string;
  phone: string;
  companyName: string;
  companyTaxId: string;
  stepUpActive: boolean;
}

function useAction() {
  const router = useRouter();
  const [result, setResult] = useState<AccountResult | null>(null);
  const [pending, startTransition] = useTransition();
  const run = (fn: () => Promise<AccountResult>, onOk?: () => void) => {
    setResult(null);
    startTransition(async () => {
      const res = await fn();
      setResult(res);
      if (res.ok) {
        onOk?.();
        router.refresh();
      }
    });
  };
  return { result, pending, run };
}

function Feedback({ result }: { result: AccountResult | null }) {
  if (!result?.message) return null;
  return (
    <p className={`text-sm ${result.ok ? 'text-success' : 'text-danger'}`} role={result.ok ? 'status' : 'alert'}>
      {result.message}
    </p>
  );
}

function Card({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <h2 className="font-semibold">{title}</h2>
      {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function ProfileForms({ fullName, email, phone, companyName, companyTaxId, stepUpActive }: Props) {
  return (
    <div className="space-y-6">
      <NameForm initial={fullName} />
      <PhoneForm initial={phone} stepUpActive={stepUpActive} />
      <EmailForm current={email} stepUpActive={stepUpActive} />
      <BillingForm initialName={companyName} initialTaxId={companyTaxId} stepUpActive={stepUpActive} />
    </div>
  );
}

function NameForm({ initial }: { initial: string }) {
  const [value, setValue] = useState(initial);
  const { result, pending, run } = useAction();
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    run(() => updateFullName({ fullName: value }));
  };
  return (
    <Card title="שם מלא" description="יופיע בהזמנות ובמיילים.">
      <form onSubmit={onSubmit} className="flex flex-wrap items-start gap-3">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value.slice(0, 120))}
          maxLength={120}
          autoComplete="name"
          aria-label="שם מלא"
          className={`${inputCls} max-w-sm flex-1`}
        />
        <Button type="submit" className="h-11" disabled={pending || value.trim().length < 2 || value.trim() === initial}>
          {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          שמירה
        </Button>
      </form>
      <div className="mt-2">
        <Feedback result={result} />
      </div>
    </Card>
  );
}

function PhoneForm({ initial, stepUpActive }: { initial: string; stepUpActive: boolean }) {
  const [value, setValue] = useState(initial);
  const { result, pending, run } = useAction();
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    run(() => updatePhone({ phone: value }));
  };
  return (
    <Card title="טלפון (לא חובה)" description="ליצירת קשר מהסניף במקרה הצורך. אפשר להשאיר ריק.">
      <form onSubmit={onSubmit} className="flex flex-wrap items-start gap-3">
        <input
          value={value}
          onChange={(e) => setValue(e.target.value.replace(/[^\d+\s()-]/g, '').slice(0, 20))}
          inputMode="tel"
          autoComplete="tel"
          dir="ltr"
          placeholder="050-0000000"
          aria-label="טלפון"
          disabled={!stepUpActive}
          className={`${inputCls} max-w-xs flex-1`}
        />
        <Button type="submit" className="h-11" disabled={pending || !stepUpActive || value === initial}>
          {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          שמירה
        </Button>
      </form>
      <div className="mt-2">
        <Feedback result={result} />
      </div>
    </Card>
  );
}

function EmailForm({ current, stepUpActive }: { current: string; stepUpActive: boolean }) {
  const [email, setEmail] = useState('');
  const [awaitingCode, setAwaitingCode] = useState(false);
  const [code, setCode] = useState('');
  const { result, pending, run } = useAction();

  const start = (e: FormEvent) => {
    e.preventDefault();
    run(() => startEmailChange({ email }), () => setAwaitingCode(true));
  };
  const confirm = (e: FormEvent) => {
    e.preventDefault();
    run(
      () => confirmEmailChange({ email, code }),
      () => {
        setAwaitingCode(false);
        setEmail('');
        setCode('');
      },
    );
  };

  return (
    <Card title="אימייל" description="קודי הכניסה נשלחים לכתובת הזו.">
      <p className="mb-3 text-sm">
        כתובת נוכחית: <span dir="ltr" className="font-medium">{current}</span>
      </p>
      {!awaitingCode ? (
        <form onSubmit={start} className="flex flex-wrap items-start gap-3">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value.slice(0, 254))}
            dir="ltr"
            autoComplete="email"
            placeholder="new@example.com"
            aria-label="אימייל חדש"
            disabled={!stepUpActive}
            className={`${inputCls} max-w-sm flex-1`}
          />
          <Button type="submit" variant="outline" className="h-11" disabled={pending || !stepUpActive || !email.includes('@')}>
            {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            שליחת קוד לכתובת החדשה
          </Button>
        </form>
      ) : (
        <form onSubmit={confirm} className="flex flex-wrap items-start gap-3">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 8))}
            inputMode="numeric"
            autoComplete="one-time-code"
            dir="ltr"
            aria-label={`קוד שנשלח ל-${email}`}
            className={`${inputCls} max-w-[12rem] text-center font-mono tracking-[0.3em]`}
          />
          <Button type="submit" className="h-11" disabled={pending || code.length < 6}>
            {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            אישור ההחלפה
          </Button>
          <Button variant="ghost" className="h-11" onClick={() => setAwaitingCode(false)} disabled={pending}>
            ביטול
          </Button>
        </form>
      )}
      <div className="mt-2">
        <Feedback result={result} />
      </div>
    </Card>
  );
}

function BillingForm({ initialName, initialTaxId, stepUpActive }: { initialName: string; initialTaxId: string; stepUpActive: boolean }) {
  const [companyName, setCompanyName] = useState(initialName);
  const [companyTaxId, setCompanyTaxId] = useState(initialTaxId);
  const { result, pending, run } = useAction();
  const taxIdInvalid = companyTaxId.length > 0 && !(/^\d{9}$/.test(companyTaxId) && isValidIsraeliId(companyTaxId));
  const unchanged = companyName === initialName && companyTaxId === initialTaxId;

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    run(() => updateBillingDefaults({ companyName, companyTaxId }));
  };

  return (
    <Card title="פרטי חשבונית ברירת מחדל" description="ימולאו אוטומטית בעמוד סיכום ההזמנה. אפשר לשנות בכל הזמנה.">
      <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm">
          <span className="mb-1 block text-muted">שם החברה / העסק</span>
          <input
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value.slice(0, 120))}
            maxLength={120}
            autoComplete="organization"
            disabled={!stepUpActive}
            className={inputCls}
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block text-muted">ח.פ / עוסק מורשה</span>
          <input
            value={companyTaxId}
            onChange={(e) => setCompanyTaxId(e.target.value.replace(/\D/g, '').slice(0, 9))}
            inputMode="numeric"
            dir="ltr"
            aria-invalid={taxIdInvalid}
            disabled={!stepUpActive}
            className={inputCls}
          />
          {taxIdInvalid && <span className="mt-1 block text-xs text-danger">המספר אינו תקין (9 ספרות עם ספרת ביקורת).</span>}
        </label>
        <div className="flex items-center gap-3 sm:col-span-2">
          <Button type="submit" disabled={pending || !stepUpActive || taxIdInvalid || unchanged}>
            {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            שמירה
          </Button>
          <Feedback result={result} />
        </div>
      </form>
    </Card>
  );
}
