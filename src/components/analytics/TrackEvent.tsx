'use client';

import { useEffect } from 'react';
import { track, type GtagItem } from '@/lib/analytics/gtag';

type Params = Record<string, string | number | GtagItem[] | undefined>;

/**
 * Fires one GA4 event after mount (no-op without consent, since gtag is never loaded).
 * `onceKey` dedupes per tab — e.g. a purchase is not re-sent when the success page is refreshed.
 */
export function TrackEvent({ name, params, onceKey }: { name: string; params: Params; onceKey?: string }) {
  const serialized = JSON.stringify(params);
  useEffect(() => {
    const key = onceKey ? `spacehub:tracked:${onceKey}` : null;
    try {
      if (key && window.sessionStorage.getItem(key)) return;
    } catch {
      // sessionStorage unavailable — send anyway; GA4 dedupes purchases by transaction_id.
    }
    const send = () => {
      if (!window.gtag) return false;
      track(name, JSON.parse(serialized) as Params);
      try {
        if (key) window.sessionStorage.setItem(key, '1');
      } catch {}
      return true;
    };
    if (send()) return;
    const timer = window.setInterval(() => send() && window.clearInterval(timer), 500);
    const stop = window.setTimeout(() => window.clearInterval(timer), 10_000);
    return () => {
      window.clearInterval(timer);
      window.clearTimeout(stop);
    };
  }, [name, serialized, onceKey]);
  return null;
}
