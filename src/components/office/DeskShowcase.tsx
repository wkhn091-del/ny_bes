'use client';

import { clsx } from 'clsx';
import { Hand } from 'lucide-react';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import { useCallback, useEffect, useState } from 'react';
import { use3DCapable } from '@/components/three/capability';

const DeskScene = dynamic(() => import('./DeskScene'), { ssr: false });

export const DESK_POSTER = '/images/renders/desk-poster.webp';

/** Mounts the 3D when the stage nears the viewport and pauses rendering when it scrolls away. */
function useInView(el: HTMLElement | null, margin: string): boolean {
  const [inView, setInView] = useState(false);
  useEffect(() => {
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => setInView(!!entry?.isIntersecting), { rootMargin: margin });
    observer.observe(el);
    return () => observer.disconnect();
  }, [el, margin]);
  return inView;
}

export function DeskShowcase({ className }: { className?: string }) {
  const capable = use3DCapable();
  const [stage, setStage] = useState<HTMLDivElement | null>(null);
  const near = useInView(stage, '300px');
  const [mounted, setMounted] = useState(false);
  const [ready, setReady] = useState(false);
  const onReady = useCallback(() => setReady(true), []);
  if (capable && near && !mounted) setMounted(true);

  return (
    <div ref={setStage} className={clsx('relative overflow-hidden rounded-3xl border border-border bg-zinc-950', className)}>
      <Image
        src={DESK_POSTER}
        alt="הדמיה של עמדת עבודה: שולחן עם מסך, מקלדת וכלי כתיבה מול קיר בטון"
        fill
        sizes="(min-width: 1024px) 80vw, 100vw"
        className={clsx(
          'object-cover transition-opacity duration-(--dur-reveal) ease-(--ease-out)',
          ready && 'opacity-0',
        )}
      />
      {mounted && (
        <div
          className={clsx('absolute inset-0 transition-opacity duration-(--dur-reveal) ease-(--ease-out)', ready ? 'opacity-100' : 'opacity-0')}
          aria-hidden="true"
        >
          <DeskScene active={near} onReady={onReady} />
        </div>
      )}
      <span className="pointer-events-none absolute left-3 top-3 rounded-full bg-black/60 px-2.5 py-1 text-xs font-medium text-white">
        הדמיה
      </span>
      {capable && ready && (
        <span className="pointer-events-none absolute bottom-3 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-black/55 px-3 py-1.5 text-xs text-white/90 backdrop-blur">
          <Hand className="h-3.5 w-3.5" aria-hidden="true" />
          גררו כדי להסתובב, גללו כדי להתקרב
        </span>
      )}
    </div>
  );
}
