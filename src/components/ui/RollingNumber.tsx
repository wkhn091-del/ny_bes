'use client';

import { useEffect, useRef, useState } from 'react';
import { formatIls } from '@/lib/domain/pricing';

const DURATION_MS = 420;

/**
 * Rolls a shekel amount (agorot) to its new value when it changes. The animated digits are
 * hidden from screen readers; they get the final amount once, so live regions don't chatter.
 */
export function RollingNumber({ value, className }: { value: number; className?: string }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);

  useEffect(() => {
    const start = from.current;
    if (start === value || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      from.current = value;
      const id = requestAnimationFrame(() => setShown(value));
      return () => cancelAnimationFrame(id);
    }
    let raf = 0;
    const t0 = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / DURATION_MS);
      const eased = 1 - Math.pow(1 - t, 3);
      const current = Math.round(start + (value - start) * eased);
      from.current = current;
      setShown(current);
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);

  return (
    <span className={className}>
      <span aria-hidden="true" className="tabular-nums">
        {formatIls(shown)}
      </span>
      <span className="sr-only">{formatIls(value)}</span>
    </span>
  );
}
