'use client';

import { clsx } from 'clsx';
import { DoorOpen, Hand, LogOut, Maximize2, Minimize2 } from 'lucide-react';
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

function useFullscreen(el: HTMLElement | null) {
  const [isFull, setIsFull] = useState(false);
  useEffect(() => {
    const sync = () => setIsFull(!!el && document.fullscreenElement === el);
    document.addEventListener('fullscreenchange', sync);
    return () => document.removeEventListener('fullscreenchange', sync);
  }, [el]);
  const toggle = useCallback(() => {
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen?.().catch(() => {});
  }, [el]);
  return { isFull, toggle, supported: typeof document !== 'undefined' && !!document.fullscreenEnabled };
}

const chip = 'flex items-center gap-1.5 rounded-full bg-black/60 text-white backdrop-blur';
const control =
  'flex items-center gap-2 rounded-full bg-white px-3.5 py-2 text-xs font-semibold sm:px-4 sm:py-2.5 sm:text-sm text-zinc-950 shadow-lg transition-transform hover:scale-[1.03] active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white';

export function DeskShowcase({ className }: { className?: string }) {
  const capable = use3DCapable();
  const [stage, setStage] = useState<HTMLDivElement | null>(null);
  const near = useInView(stage, '300px');
  const [mounted, setMounted] = useState(false);
  const [ready, setReady] = useState(false);
  const [inside, setInside] = useState(false);
  const onReady = useCallback(() => setReady(true), []);
  const { isFull, toggle, supported } = useFullscreen(stage);
  if (capable && near && !mounted) setMounted(true);

  useEffect(() => {
    if (!inside || isFull) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setInside(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [inside, isFull]);

  return (
    <div
      ref={setStage}
      className={clsx('relative overflow-hidden rounded-3xl border border-border bg-zinc-950 [&:fullscreen]:rounded-none', className)}
    >
      <Image
        src={DESK_POSTER}
        alt="הדמיה של משרד פרטי: חזית זכוכית עם דלת, ובפנים שולחן עבודה עם מסך ליד חלון"
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
          <DeskScene active={near} inside={inside} onReady={onReady} />
        </div>
      )}
      <span className={clsx(chip, 'pointer-events-none absolute left-3 top-3 px-2.5 py-1 text-xs font-medium')}>הדמיה</span>

      {capable && ready && (
        <>
          {supported && (
            <button
              type="button"
              onClick={toggle}
              className={clsx(chip, 'absolute right-3 top-3 p-2 hover:bg-black/75')}
              aria-label={isFull ? 'יציאה ממסך מלא' : 'מסך מלא'}
            >
              {isFull ? <Minimize2 className="h-4 w-4" aria-hidden="true" /> : <Maximize2 className="h-4 w-4" aria-hidden="true" />}
            </button>
          )}

          {inside ? (
            <>
              <button type="button" onClick={() => setInside(false)} className={clsx(control, 'absolute bottom-3 right-3 sm:bottom-4 sm:right-4')}>
                <LogOut className="h-4 w-4" aria-hidden="true" />
                לצאת מהחדר
              </button>
              <span
                className={clsx(
                  chip,
                  'pointer-events-none absolute left-1/2 top-14 -translate-x-1/2 whitespace-nowrap px-3 py-1.5 text-2xs text-white/90 sm:bottom-5 sm:top-auto sm:text-xs',
                )}
              >
                <Hand className="h-3.5 w-3.5" aria-hidden="true" />
                <span className="sm:hidden">גררו להסתכל · הקישו על הרצפה ללכת</span>
                <span className="hidden sm:inline">גררו כדי להסתכל, לחצו על הרצפה כדי ללכת · או W A S D</span>
              </span>
            </>
          ) : (
            <div className="absolute inset-x-0 bottom-4 flex flex-col items-center gap-1.5 sm:bottom-6 sm:gap-2">
              <button type="button" onClick={() => setInside(true)} className={control}>
                <DoorOpen className="h-4 w-4" aria-hidden="true" />
                להיכנס לחדר
              </button>
              <span className="pointer-events-none text-xs text-white/75">אפשר גם לגרור כדי להציץ פנימה</span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
