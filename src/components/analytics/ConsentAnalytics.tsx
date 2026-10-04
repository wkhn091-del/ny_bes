'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { onConsentChange, readConsent, writeConsent, type ConsentChoice } from '@/lib/analytics/consent';
import { loadGtag, track } from '@/lib/analytics/gtag';

function subscribe(callback: () => void) {
  return onConsentChange(() => callback());
}

/**
 * GA4 behind an explicit opt-in (Israeli Privacy Protection Amendment 13 / GDPR style):
 * nothing from Google loads until "מאשר/ת"; declining is one click with equal weight.
 */
export function ConsentAnalytics({ measurementId }: { measurementId: string }) {
  const consent = useSyncExternalStore<ConsentChoice | null | 'ssr'>(subscribe, readConsent, () => 'ssr');
  const pathname = usePathname();
  const granted = consent === 'granted';

  useEffect(() => {
    if (!granted) return;
    loadGtag(measurementId);
    track('page_view', { page_path: pathname, page_location: window.location.origin + pathname });
  }, [granted, measurementId, pathname]);

  if (consent !== null) return null;

  return (
    <div
      role="dialog"
      aria-labelledby="consent-title"
      className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-xl rounded-2xl border border-border bg-card p-4 shadow-2xl sm:inset-x-auto sm:left-5 sm:right-auto [html[data-bookbar]_&]:bottom-24 lg:[html[data-bookbar]_&]:bottom-3"
    >
      <p id="consent-title" className="text-sm font-semibold">
        עוגיות סטטיסטיקה
      </p>
      <p className="mt-1 text-sm leading-6 text-muted">
        נשמח למדוד באופן אנונימי באילו עמודים משתמשים, כדי לשפר את האתר. בלי פרסום מותאם ובלי מכירת מידע.{' '}
        <Link href="/legal/privacy" className="font-medium text-accent-text underline">
          מדיניות פרטיות
        </Link>
      </p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => writeConsent('granted')}
          className="rounded-xl border border-border-strong px-3 py-2 text-sm font-semibold hover:bg-subtle"
        >
          מאשר/ת
        </button>
        <button
          type="button"
          onClick={() => writeConsent('denied')}
          className="rounded-xl border border-border-strong px-3 py-2 text-sm font-semibold hover:bg-subtle"
        >
          רק הכרחיות
        </button>
      </div>
    </div>
  );
}
