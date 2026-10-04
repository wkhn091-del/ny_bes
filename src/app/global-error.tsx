'use client';

import * as Sentry from '@sentry/nextjs';
import { useEffect } from 'react';

export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="he" dir="rtl">
      <body style={{ fontFamily: 'system-ui, sans-serif', display: 'grid', placeItems: 'center', minHeight: '100vh', margin: 0 }}>
        <div style={{ textAlign: 'center', padding: 24 }}>
          <h1 style={{ fontSize: 24 }}>האתר אינו זמין כרגע</h1>
          <p style={{ color: '#666' }}>אנחנו כבר מטפלים בזה. נסו שוב בעוד כמה רגעים.</p>
          <button
            type="button"
            onClick={() => retry()}
            style={{ marginTop: 16, padding: '10px 20px', borderRadius: 8, border: 0, background: '#7c3aed', color: '#fff', cursor: 'pointer' }}
          >
            לנסות שוב
          </button>
        </div>
      </body>
    </html>
  );
}
