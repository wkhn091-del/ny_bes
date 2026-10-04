'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

const INTERVAL_MS = 3000;
const MAX_ATTEMPTS = 20;

/** Payment confirmation arrives by webhook; refresh the server page until it lands. */
export function PendingPoller() {
  const router = useRouter();
  const [attempts, setAttempts] = useState(0);

  useEffect(() => {
    if (attempts >= MAX_ATTEMPTS) return;
    const id = window.setTimeout(() => {
      router.refresh();
      setAttempts((n) => n + 1);
    }, INTERVAL_MS);
    return () => window.clearTimeout(id);
  }, [attempts, router]);

  return attempts >= MAX_ATTEMPTS ? (
    <p className="mt-4 text-sm text-muted">
      האישור מתעכב מעט. אם התשלום עבר, תקבלו מייל אישור בדקות הקרובות — אין צורך לשלם שוב.
    </p>
  ) : null;
}
