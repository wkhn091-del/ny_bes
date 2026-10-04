'use client';

type GtagParams = Record<string, string | number | boolean | GtagItem[] | undefined>;
export interface GtagItem {
  item_id: string;
  item_name: string;
  item_category?: string;
  item_brand?: string;
  price?: number;
  quantity?: number;
}

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

const GA_ID_RE = /^G-[A-Z0-9]{4,16}$/;

/** Loads gtag.js once. Only called after explicit consent; no-op for a malformed id. */
export function loadGtag(measurementId: string): void {
  if (!GA_ID_RE.test(measurementId) || window.gtag) return;
  window.dataLayer = window.dataLayer ?? [];
  window.gtag = function gtag() {
    // gtag.js reads the `arguments` object itself, not an array.
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer!.push(arguments);
  };
  window.gtag('js', new Date());
  window.gtag('config', measurementId, { send_page_view: false, allow_google_signals: false, allow_ad_personalization_signals: false });
  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
  document.head.appendChild(script);
}

export function track(event: string, params: GtagParams = {}): void {
  window.gtag?.('event', event, params);
}
