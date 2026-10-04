'use client';

import { Loader2, Mail } from 'lucide-react';
import { useActionState, useState } from 'react';
import { loginAction, type LoginState } from '@/app/actions/auth';
import { Turnstile } from '@/components/security/Turnstile';
import { Button } from '@/components/ui/Button';

const inputCls =
  'h-12 w-full rounded-xl border border-border bg-bg px-4 text-base outline-none transition-colors focus:border-accent aria-[invalid=true]:border-danger';

interface Props {
  returnUrl: string;
  turnstileSiteKey: string;
  nonce?: string;
}

export function LoginForm({ returnUrl, turnstileSiteKey, nonce }: Props) {
  const [state, action, pending] = useActionState<LoginState, FormData>(loginAction, { step: 'email', returnUrl });
  const [token, setToken] = useState<string | null>(null);
  const [submissions, setSubmissions] = useState(0);
  const needsCaptcha = Boolean(turnstileSiteKey);

  if (state.step === 'code') {
    return (
      <form action={action} className="space-y-4">
        <input type="hidden" name="email" value={state.email} />
        <input type="hidden" name="returnUrl" value={returnUrl} />
        <div className="flex items-start gap-3 rounded-xl border border-border bg-subtle p-4 text-sm">
          <Mail className="mt-0.5 h-4 w-4 shrink-0 text-accent-text" aria-hidden="true" />
          <p>
            {state.notice ?? 'הזינו את הקוד שקיבלתם במייל.'}
            <br />
            <span className="text-muted" dir="ltr">
              {state.email}
            </span>
          </p>
        </div>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">קוד אימות</span>
          <input
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="\d{6,8}"
            maxLength={8}
            required
            autoFocus
            dir="ltr"
            aria-invalid={Boolean(state.error)}
            aria-describedby={state.error ? 'code-error' : undefined}
            className={`${inputCls} text-center font-mono text-2xl tracking-[0.5em]`}
          />
        </label>
        {state.error && (
          <p id="code-error" className="text-sm text-danger" role="alert">
            {state.error}
          </p>
        )}
        <Button type="submit" name="intent" value="verify" size="lg" className="w-full" disabled={pending}>
          {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          כניסה
        </Button>
        <button
          type="submit"
          name="intent"
          value="restart"
          formNoValidate
          disabled={pending}
          className="w-full text-center text-sm text-muted hover:text-fg"
        >
          שליחת קוד חדש / שינוי אימייל
        </button>
      </form>
    );
  }

  return (
    <form action={action} onSubmit={() => setSubmissions((n) => n + 1)} className="space-y-4">
      <input type="hidden" name="returnUrl" value={returnUrl} />
      <input type="hidden" name="intent" value="send" />
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium">אימייל</span>
        <input
          name="email"
          type="email"
          autoComplete="email"
          required
          maxLength={254}
          dir="ltr"
          defaultValue={state.email}
          aria-invalid={Boolean(state.error)}
          aria-describedby={state.error ? 'email-error' : undefined}
          className={inputCls}
        />
      </label>
      <label className="block">
        <span className="mb-1.5 block text-sm font-medium">
          שם מלא <span className="font-normal text-muted">(למשתמשים חדשים)</span>
        </span>
        <input name="fullName" autoComplete="name" maxLength={120} className={inputCls} />
      </label>
      {needsCaptcha && (
        <>
          <Turnstile siteKey={turnstileSiteKey} action="login" nonce={nonce} onToken={setToken} resetKey={submissions} />
          <input type="hidden" name="cf-turnstile-response" value={token ?? ''} />
        </>
      )}
      {state.error && (
        <p id="email-error" className="text-sm text-danger" role="alert">
          {state.error}
        </p>
      )}
      <Button type="submit" size="lg" className="w-full" disabled={pending || (needsCaptcha && !token)}>
        {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
        שליחת קוד לאימייל
      </Button>
      <p className="text-center text-xs leading-5 text-muted">בלי סיסמאות. נשלח אליכם קוד חד-פעמי שתקף ל-5 דקות.</p>
    </form>
  );
}
