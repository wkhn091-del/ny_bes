'use client';

import { clsx } from 'clsx';
import { useEffect, useState } from 'react';

interface Props {
  targetId: string;
  priceLabel: string;
  unitLabel: string;
  reassurance: string;
}

/**
 * Phone-only bar that keeps the real starting price and the booking entry point in reach while the
 * visitor reads the page; it steps aside whenever the booking widget itself is on screen.
 */
export function MobileBookBar({ targetId, priceLabel, unitLabel, reassurance }: Props) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const target = document.getElementById(targetId);
    if (!target) return;
    const observer = new IntersectionObserver(([entry]) => setVisible(!entry?.isIntersecting), { rootMargin: '0px 0px -30% 0px' });
    observer.observe(target);
    return () => observer.disconnect();
  }, [targetId]);

  useEffect(() => {
    const root = document.documentElement;
    if (visible) root.dataset.bookbar = '';
    else delete root.dataset.bookbar;
    return () => {
      delete root.dataset.bookbar;
    };
  }, [visible]);

  return (
    <div
      className={clsx(
        'fixed inset-x-0 bottom-0 z-30 border-t border-border bg-bg/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-8px_24px_-12px_rgba(0,0,0,0.25)] backdrop-blur transition-transform duration-(--dur-base) ease-(--ease-out) motion-reduce:transition-none lg:hidden',
        visible ? 'translate-y-0' : 'pointer-events-none translate-y-full',
      )}
      aria-hidden={!visible}
      inert={!visible}
    >
      <div className="mx-auto flex max-w-xl items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-base font-bold leading-tight">
            {priceLabel} <span className="text-sm font-normal text-muted">{unitLabel}</span>
          </p>
          <p className="truncate text-xs text-success">{reassurance}</p>
        </div>
        <a
          href={`#${targetId}`}
          className="inline-flex h-11 shrink-0 items-center justify-center rounded-full bg-accent px-5 text-sm font-semibold text-accent-fg shadow-lg shadow-accent/25 transition-transform active:scale-95"
        >
          לבדוק שעות פנויות
        </a>
      </div>
    </div>
  );
}
