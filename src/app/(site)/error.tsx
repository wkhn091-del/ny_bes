'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';
import { Button, ButtonLink } from '@/components/ui/Button';

export default function SiteError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <section className="mx-auto flex max-w-xl flex-col items-center px-4 py-24 text-center">
      <p className="text-sm font-semibold text-accent-text">משהו השתבש</p>
      <h1 className="mt-2 text-3xl font-bold">לא הצלחנו לטעון את העמוד</h1>
      <p className="mt-3 text-muted">זו תקלה זמנית אצלנו. אפשר לנסות שוב, או לחזור לעמוד הבית.</p>
      {error.digest && <p className="mt-2 font-mono text-xs text-muted">קוד תקלה: {error.digest}</p>}
      <div className="mt-8 flex gap-3">
        <Button onClick={() => retry()}>לנסות שוב</Button>
        <ButtonLink href="/" variant="outline">
          לעמוד הבית
        </ButtonLink>
      </div>
    </section>
  );
}
