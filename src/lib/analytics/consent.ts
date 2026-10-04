'use client';

export type ConsentChoice = 'granted' | 'denied';

const KEY = 'spacehub:analytics-consent';
const EVENT = 'spacehub:consent';

export function readConsent(): ConsentChoice | null {
  try {
    const value = window.localStorage.getItem(KEY);
    return value === 'granted' || value === 'denied' ? value : null;
  } catch {
    return null;
  }
}

export function writeConsent(choice: ConsentChoice): void {
  try {
    window.localStorage.setItem(KEY, choice);
  } catch {
    // Private mode: the choice lasts for this page view only.
  }
  window.dispatchEvent(new CustomEvent<ConsentChoice>(EVENT, { detail: choice }));
}

export function onConsentChange(listener: (choice: ConsentChoice) => void): () => void {
  const handler = (e: Event) => listener((e as CustomEvent<ConsentChoice>).detail);
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}
