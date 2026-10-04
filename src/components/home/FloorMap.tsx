'use client';

import { clsx } from 'clsx';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { use3DCapable } from '@/components/three/capability';
import { formatDateHebrew, formatMinutes } from '@/lib/domain/time';
import { SPACE_TYPE_LABELS } from '@/lib/domain/types';
import type { LiveFloor, LiveSpace } from './floor-types';

/** Shown while the 3D chunk downloads: an isometric floor outline in the scene's position, so the layout never jumps or flashes white. */
function MapLoading() {
  return (
    <div className="grid-backdrop absolute inset-0 flex items-center justify-center" role="status">
      <div className="relative aspect-square w-[46%] max-w-[260px]" aria-hidden="true">
        <div className="absolute inset-0 rotate-45 scale-y-[0.58] rounded-2xl border border-border-strong bg-subtle/70 shadow-[0_24px_60px_-30px_rgba(0,0,0,0.35)]" />
        <div className="absolute inset-[22%] rotate-45 scale-y-[0.58] animate-pulse rounded-xl border border-dashed border-accent/50 bg-accent-soft/50 motion-reduce:animate-none" />
      </div>
      <p className="absolute bottom-4 inset-x-0 flex items-center justify-center gap-2 text-xs text-muted">
        <span className="h-3 w-3 animate-spin rounded-full border-2 border-accent border-t-transparent motion-reduce:animate-none" aria-hidden="true" />
        מכינים את המפה התלת־ממדית…
      </p>
    </div>
  );
}

const loadFloorMap3D = () => import('./FloorMap3D');

const FloorMap3D = dynamic(loadFloorMap3D, {
  ssr: false,
  loading: () => <MapLoading />,
});

const POLL_MS = 30_000;

/** Starts downloading the 3D chunk (and, through its module-level preload, the model) right after hydration. */
function usePrefetch3D(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    const start = () => void loadFloorMap3D();
    if (typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(start, { timeout: 300 });
      return () => window.cancelIdleCallback(id);
    }
    const id = setTimeout(start, 0);
    return () => clearTimeout(id);
  }, [enabled]);
}

/**
 * Mounts the 3D once the stage is near the viewport (on phones the map starts below the fold).
 * Takes the element itself, not a ref, so the observer attaches whenever the stage mounts.
 */
function useNearViewport(enabled: boolean, el: HTMLElement | null): boolean {
  const [near, setNear] = useState(false);
  useEffect(() => {
    if (!enabled || near || !el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        observer.disconnect();
        setNear(true);
      },
      { rootMargin: '300px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [enabled, near, el]);
  return near;
}

export function spaceStatus(space: LiveSpace, floor: Pick<LiveFloor, 'isOpen' | 'at'>): { free: number; label: string; available: boolean } {
  if (!floor.at) return { free: 0, label: 'סגור', available: false };
  const free = Math.max(0, space.capacity - space.used);
  const when = floor.isOpen ? 'עכשיו' : 'בפתיחה';
  if (space.type === 'hotDesk') return { free, label: `${free} מתוך ${space.capacity} עמדות פנויות ${when}`, available: free > 0 };
  return { free, label: free > 0 ? `פנוי ${when}` : `תפוס ${when}`, available: free > 0 };
}

function snapshotCaption(floor: LiveFloor, freeCount: number): string {
  if (floor.isOpen) return `${freeCount} מקומות פנויים ברגע זה`;
  if (!floor.at) return 'הסניף סגור כרגע';
  return `הסניף סגור כרגע · זמינות לפתיחה, ${formatDateHebrew(floor.at.date)} ${formatMinutes(floor.at.minute)}`;
}

/**
 * `layouts` are the static floors (no occupancy), one per branch, so the map draws immediately;
 * live occupancy replaces a floor when the API answers. Until then nothing is shown as free.
 */
export function FloorMap({ layouts }: { layouts: LiveFloor[] }) {
  const [branchSlug, setBranchSlug] = useState(layouts[0].branch.slug);
  const [liveBySlug, setLiveBySlug] = useState<Record<string, { floor: LiveFloor; at: Date }>>({});
  const [failed, setFailed] = useState(false);
  const layout = layouts.find((l) => l.branch.slug === branchSlug) ?? layouts[0];
  const live = liveBySlug[layout.branch.slug]?.floor ?? null;
  const updatedAt = liveBySlug[layout.branch.slug]?.at ?? null;
  const floor = live ?? layout;
  const pendingLabel = failed ? 'הזמינות אינה זמינה כרגע' : 'בודקים זמינות…';
  const statusOf = (space: LiveSpace) => (live ? spaceStatus(space, live) : { free: 0, label: pendingLabel, available: false });
  const capable3D = use3DCapable();
  const [stage, setStage] = useState<HTMLDivElement | null>(null);
  usePrefetch3D(capable3D);
  const visible = useNearViewport(capable3D, stage);

  useEffect(() => {
    let cancelled = false;
    async function load(force = false) {
      if (!force && document.visibilityState === 'hidden') return;
      try {
        const res = await fetch(`/api/availability/now?branch=${encodeURIComponent(branchSlug)}`, { cache: 'no-store' });
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as LiveFloor;
        if (!cancelled && data.branch?.slug === branchSlug) {
          setLiveBySlug((prev) => ({ ...prev, [branchSlug]: { floor: data, at: new Date() } }));
          setFailed(false);
        }
      } catch {
        if (!cancelled) setFailed(true);
      }
    }
    const onTick = () => void load();
    const id = window.setInterval(onTick, POLL_MS);
    document.addEventListener('visibilitychange', onTick);
    void load(true);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onTick);
    };
  }, [branchSlug]);

  const freeNow = floor.spaces.reduce((sum, s) => sum + statusOf(s).free, 0);

  return (
    <figure className="relative flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card">
      <figcaption className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold">
            <span className={clsx('relative flex h-2 w-2', !floor.isOpen && 'opacity-40')} aria-hidden="true">
              {floor.isOpen && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-60 motion-reduce:hidden" />}
              <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
            </span>
            מפה חיה · סניף {floor.branch.name}, {floor.branch.city}
          </p>
          <p className="mt-0.5 text-xs text-muted">
            {live ? snapshotCaption(live, freeNow) : pendingLabel}
            {updatedAt && ` · עודכן ${updatedAt.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}`}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3 text-xs text-muted">
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-sm bg-accent" aria-hidden="true" /> פנוי
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2.5 w-2.5 rounded-sm bg-border-strong" aria-hidden="true" /> תפוס
          </span>
        </div>
      </figcaption>

      {layouts.length > 1 && (
        <div role="group" aria-label="בחירת סניף במפה" className="flex gap-1.5 overflow-x-auto border-b border-border px-3 py-2 [scrollbar-width:none]">
          {layouts.map((l) => {
            const selected = l.branch.slug === layout.branch.slug;
            return (
              <button
                key={l.branch.slug}
                type="button"
                aria-pressed={selected}
                onClick={() => {
                  setBranchSlug(l.branch.slug);
                  setFailed(false);
                }}
                className={clsx(
                  'min-h-9 shrink-0 rounded-full border px-3 text-xs font-medium transition-[background-color,border-color,color,transform] duration-(--dur-micro) ease-(--ease-out) active:scale-95',
                  selected ? 'border-accent bg-accent text-white' : 'border-border bg-bg text-muted hover:border-border-strong hover:text-fg',
                )}
              >
                {l.branch.name}
                <span className={clsx('font-normal', selected ? 'text-white/75' : 'text-muted')}> · {l.branch.city}</span>
              </button>
            );
          })}
        </div>
      )}

      <div ref={setStage} className="relative min-h-[280px] flex-1" aria-hidden={capable3D ? 'true' : undefined}>
        {!capable3D ? (
          <FloorMap2D floor={floor} />
        ) : visible ? (
          <FloorMap3D floor={floor} statusOf={(space) => statusOf(space).label} />
        ) : (
          <MapLoading />
        )}
      </div>

      <ul className={clsx(capable3D ? 'sr-only' : 'grid gap-1 border-t border-border p-3 text-xs sm:grid-cols-2')}>
        {floor.spaces.map((space) => {
          const status = statusOf(space);
          return (
            <li key={space.id}>
              <Link href={`/spaces/${space.slug}`} className="flex items-center justify-between gap-2 rounded-md px-2 py-1 hover:bg-subtle">
                <span className="truncate">
                  {space.name} <span className="text-muted">· {SPACE_TYPE_LABELS[space.type]}</span>
                </span>
                <span className={clsx('shrink-0 font-medium', status.available ? 'text-accent-text' : 'text-muted')}>{status.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </figure>
  );
}

function FloorMap2D({ floor }: { floor: LiveFloor }) {
  const desks = floor.spaces.filter((s) => s.type === 'hotDesk');
  const rooms = floor.spaces.filter((s) => s.type !== 'hotDesk');
  return (
    <div className="grid-backdrop grid h-full grid-cols-5 gap-3 p-4">
      <div className="col-span-3 grid content-start gap-3">
        {desks.map((space) => (
          <Link key={space.id} href={`/spaces/${space.slug}`} className="rounded-xl border border-border bg-bg/60 p-3">
            <p className="mb-2 text-xs font-medium">{space.name}</p>
            <div className="grid grid-cols-5 gap-1.5">
              {Array.from({ length: space.capacity }, (_, i) => (
                <span
                  key={i}
                  className={clsx('aspect-square rounded', floor.at && i >= space.used ? 'bg-accent' : 'bg-border-strong')}
                />
              ))}
            </div>
          </Link>
        ))}
      </div>
      <div className="col-span-2 grid content-start gap-3">
        {rooms.map((space) => {
          const available = spaceStatus(space, floor).available;
          return (
            <Link
              key={space.id}
              href={`/spaces/${space.slug}`}
              className={clsx(
                'rounded-xl border p-3 text-xs font-medium transition-colors',
                available ? 'border-accent bg-accent-soft text-accent-text' : 'border-border bg-subtle text-muted',
              )}
            >
              {space.name}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
