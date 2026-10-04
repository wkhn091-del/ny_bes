'use client';

import { clsx } from 'clsx';
import { ArrowRight, Box, Hand } from 'lucide-react';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { FLOOR_COUNT, PROGRAM_COPY, programOf } from '@/components/three/building-model';
import { use3DCapable } from '@/components/three/capability';

const BuildingScene = dynamic(() => import('./BuildingScene'), { ssr: false });

export const BUILDING_POSTER = '/images/renders/building-poster.webp';

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

const FLOORS_TOP_DOWN = Array.from({ length: FLOOR_COUNT }, (_, k) => FLOOR_COUNT - 1 - k);
const chip = 'rounded-full bg-black/60 text-white backdrop-blur';

export function BuildingShowcase({ className }: { className?: string }) {
  const capable = use3DCapable();
  const [stage, setStage] = useState<HTMLDivElement | null>(null);
  const near = useInView(stage, '300px');
  const [mounted, setMounted] = useState(false);
  const [ready, setReady] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const onReady = useCallback(() => setReady(true), []);
  if (capable && near && !mounted) setMounted(true);

  useEffect(() => {
    if (selected === null) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setSelected(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected]);

  const program = selected === null ? null : programOf(selected);
  const copy = program ? PROGRAM_COPY[program] : null;

  const floorButton = (i: number, extra: string) => {
    const on = selected === i;
    return (
      <button
        key={i}
        type="button"
        onClick={() => setSelected(on ? null : i)}
        aria-pressed={on}
        title={`קומה ${i + 1} · ${PROGRAM_COPY[programOf(i)].title}`}
        className={clsx(
          'shrink-0 rounded-md font-semibold tabular-nums transition-colors',
          on ? 'bg-accent text-accent-fg' : 'bg-white/10 text-white/80 hover:bg-white/20 hover:text-white',
          extra,
        )}
      >
        {i + 1}
      </button>
    );
  };

  return (
    <div ref={setStage} className={clsx('relative overflow-hidden rounded-3xl border border-border bg-[#060912]', className)}>
      <Image
        src={BUILDING_POSTER}
        alt="הדמיה של מגדל משרדים בלילה: קומות מוארות, כתר סגול בגג, ועיר מסביב"
        fill
        sizes="(min-width: 1024px) 80vw, 100vw"
        className={clsx('object-cover transition-opacity duration-(--dur-reveal) ease-(--ease-out)', ready && 'opacity-0')}
      />
      {mounted && (
        <div
          className={clsx('absolute inset-0 transition-opacity duration-(--dur-reveal) ease-(--ease-out)', ready ? 'opacity-100' : 'opacity-0')}
          aria-hidden="true"
        >
          <BuildingScene active={near} selected={selected} onSelect={setSelected} onReady={onReady} />
        </div>
      )}

      <span className={clsx(chip, 'pointer-events-none absolute left-3 top-3 px-2.5 py-1 text-xs font-medium')}>הדמיה</span>
      {capable && ready && selected === null && (
        <span className={clsx(chip, 'pointer-events-none absolute left-1/2 top-3 flex -translate-x-1/2 items-center gap-1.5 whitespace-nowrap px-3 py-1.5 text-2xs text-white/90 sm:text-xs')}>
          <Hand className="h-3.5 w-3.5" aria-hidden="true" />
          גררו לסובב · בחרו קומה
        </span>
      )}

      <nav
        aria-label="בחירת קומה"
        className="absolute right-3 top-1/2 hidden -translate-y-1/2 flex-col gap-1 rounded-2xl bg-black/55 p-1.5 backdrop-blur sm:flex"
      >
        <span className="pb-0.5 text-center text-3xs font-semibold text-white/60">קומה</span>
        {FLOORS_TOP_DOWN.map((i) => floorButton(i, 'h-5 w-8 text-2xs'))}
        <button
          type="button"
          onClick={() => setSelected(null)}
          aria-pressed={selected === null}
          className={clsx(
            'mt-1 flex h-7 w-8 items-center justify-center rounded-md transition-colors',
            selected === null ? 'bg-accent text-accent-fg' : 'bg-white/10 text-white/80 hover:bg-white/20',
          )}
          aria-label="כל הבניין"
          title="כל הבניין"
        >
          <Box className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </nav>

      <nav aria-label="בחירת קומה" className="absolute inset-x-0 bottom-0 flex gap-1.5 overflow-x-auto bg-gradient-to-t from-black/70 to-transparent px-3 pb-3 pt-6 [scrollbar-width:none] sm:hidden">
        {Array.from({ length: FLOOR_COUNT }, (_, i) => floorButton(i, 'h-8 min-w-8 px-1 text-xs'))}
      </nav>

      {copy && selected !== null && (
        <section
          aria-live="polite"
          className="absolute inset-x-3 bottom-16 rounded-2xl border border-white/10 bg-black/75 p-3 text-white sm:p-4 shadow-2xl backdrop-blur-md sm:inset-x-auto sm:bottom-4 sm:left-4 sm:w-80"
        >
          <p className="text-2xs font-semibold text-violet-300">קומה {selected + 1}</p>
          <h2 className="mt-0.5 text-base font-bold sm:text-lg">{copy.title}</h2>
          <p className="mt-1.5 hidden text-sm leading-6 text-white/75 sm:block">{copy.text}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2 sm:mt-3">
            <Link href={copy.href} className="rounded-full bg-white px-3.5 py-2 text-xs font-semibold text-zinc-950 transition-transform hover:scale-[1.03] active:scale-[0.97]">
              {copy.cta}
            </Link>
            {program === 'offices' && (
              <Link href="/office" className="rounded-full border border-white/25 px-3.5 py-2 text-xs font-semibold text-white hover:border-white">
                להיכנס למשרד בתלת־ממד
              </Link>
            )}
            <button type="button" onClick={() => setSelected(null)} className="ms-auto flex items-center gap-1 text-xs text-white/70 hover:text-white">
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              לכל הבניין
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
