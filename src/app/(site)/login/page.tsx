import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { GoogleSignInButton } from '@/components/auth/GoogleSignInButton';
import { LoginForm } from '@/components/auth/LoginForm';
import { publicEnv } from '@/lib/env.public';
import { safeReturnUrl } from '@/lib/security/redirect';
import { getSessionUser } from '@/lib/server/auth';

export const metadata: Metadata = { title: 'התחברות', robots: { index: false } };

const ERROR_MESSAGES: Record<string, string> = {
  oauth: 'ההתחברות עם Google לא הושלמה. נסו שוב או התחברו עם קוד לאימייל.',
  rate: 'יותר מדי ניסיונות. נסו שוב בעוד כמה דקות.',
};

export default async function LoginPage({ searchParams }: PageProps<'/login'>) {
  const { returnUrl: raw, error, reason } = await searchParams;
  const returnUrl = safeReturnUrl(typeof raw === 'string' ? raw : undefined);
  if (await getSessionUser()) redirect(returnUrl);
  const nonce = (await headers()).get('x-nonce') ?? undefined;
  const fromCheckout = returnUrl.startsWith('/checkout');
  const errorMessage = typeof error === 'string' ? ERROR_MESSAGES[error] : undefined;
  const forFavorite = reason === 'favorite';

  let subtitle = 'התחברו עם Google או קבלו קוד כניסה לאימייל.';
  if (fromCheckout) subtitle = 'כדי לשמור את ההזמנה על שמכם, התחברו. הבחירה שלכם נשמרה.';
  else if (forFavorite) subtitle = 'כדי לשמור חללים למועדפים צריך להתחבר. אחרי הכניסה החלל יישמר אוטומטית.';

  return (
    <div className="grid-backdrop flex min-h-[calc(100dvh-4rem)] items-center justify-center px-4 py-16">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-xl shadow-black/5">
        <h1 className="text-2xl font-bold">{fromCheckout ? 'עוד רגע מסיימים' : 'התחברות'}</h1>
        <p className="mb-6 mt-1 text-sm text-muted">{subtitle}</p>
        {errorMessage && (
          <p className="mb-4 rounded-lg border border-danger/30 bg-danger-soft p-3 text-sm text-danger" role="alert">
            {errorMessage}
          </p>
        )}
        <GoogleSignInButton returnUrl={returnUrl} />
        <div className="my-6 flex items-center gap-3 text-xs text-muted" aria-hidden="true">
          <span className="h-px flex-1 bg-border" />
          או עם קוד לאימייל
          <span className="h-px flex-1 bg-border" />
        </div>
        <LoginForm returnUrl={returnUrl} turnstileSiteKey={publicEnv.turnstileSiteKey} nonce={nonce} />
      </div>
    </div>
  );
}
