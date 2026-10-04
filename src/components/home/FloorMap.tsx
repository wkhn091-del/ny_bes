'use client';

import { clsx } from 'clsx';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useEffect, useRef, useState, useSyncExternalStore, type RefObject } from 'react';
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

const FloorMap3D = dynamic(() => import('./FloorMap3D'), {
  ssr: false,
  loading: () => <MapLoading />,
});

const POLL_MS = 30_000;

function subscribeMotion(cb: () => void) {
  const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
}

/** CPU-emulated WebGL renders the scene on the main thread and freezes the page; those devices get the 2D map. */
const SOFTWARE_RENDERER = /swiftshader|llvmpipe|softpipe|software|basic render/i;

let webglSupport: boolean | null = null;
function hasHardwareWebGL(): boolean {
  if (webglSupport !== null) return webglSupport;
  try {
    const canvas = document.createElement('canvas');
    const gl = (canvas.getContext('webgl2') || canvas.getContext('webgl')) as WebGLRenderingContext | null;
    if (!gl) {
      webglSupport = false;
    } else {
      const info = gl.getExtension('WEBGL_debug_renderer_info');
      const renderer = String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER) ?? '');
      webglSupport = !SOFTWARE_RENDERER.test(renderer);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
  } catch {
    webglSupport = false;
  }
  return webglSupport;
}

function use3DCapable(): boolean {
  return useSyncExternalStore(
    subscribeMotion,
    () => !window.matchMedia('(prefers-reduced-motion: reduce)').matches && hasHardwareWebGL() && (navigator.hardwareConcurrency ?? 4) >= 4,
    () => false,
  );
}

/**
 * Holds the 3D back until the map is near the viewport and the browser is idle, so the hero, search and
 * LCP image never compete with WebGL setup (on phones the map starts below the fold).
 */
function useDeferredMount(enabled: boolean, target: RefObject<HTMLElement | null>): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const el = target.current;
    if (!enabled || ready || !el) return;
    let idleId: number | undefined;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      const done = () => setReady(true);
      if (typeof window.requestIdleCallback === 'function') idleId = window.requestIdleCallback(done, { timeout: 2500 });
      else timeoutId = setTimeout(done, 1200);
    };
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        observer.disconnect();
        schedule();
      },
      { rootMargin: '200px' },
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      if (idleId !== undefined) window.cancelIdleCallback(idleId);
      if (timeoutId !== undefined) clearTimeout(timeoutId);
    };
  }, [enabled, ready, target]);
  return ready;
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

export function FloorMap({ initial }: { initial: LiveFloor | null }) {
  const [floor, setFloor] = useState<LiveFloor | null>(initial);
  const [failed, setFailed] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(initial ? new Date() : null);
  const capable3D = use3DCapable();
  const stageRef = useRef<HTMLDivElement>(null);
  const idle = useDeferredMount(capable3D, stageRef);

  useEffect(() => {
    let cancelled = false;
    async function load(force = false) {
      if (!force && document.visibilityState === 'hidden') return;
      try {
        const res = await fetch('/api/availability/now', { cache: 'no-store' });
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as LiveFloor;
        if (!cancelled) {
          setFloor(data);
          setFailed(false);
          setUpdatedAt(new Date());
        }
      } catch {
        if (!cancelled) setFailed(true);
      }
    }
    const onTick = () => void load();
    const id = window.setInterval(onTick, POLL_MS);
    document.addEventListener('visibilitychange', onTick);
    if (!initial) void load(true);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onTick);
    };
  }, [initial]);

  if (!floor) {
    return (
      <div className="flex h-full items-center justify-center rounded-2xl border border-border bg-card p-6 text-sm text-muted">
        {failed ? 'המפה החיה אינה זמינה כרגע.' : 'טוען מפה חיה…'}
      </div>
    );
  }

  const freeNow = floor.spaces.reduce((sum, s) => sum + spaceStatus(s, floor).free, 0);

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
            {snapshotCaption(floor, freeNow)}
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

      <div ref={stageRef} className="relative min-h-[280px] flex-1" aria-hidden={capable3D ? 'true' : undefined}>
        {!capable3D ? (
          <FloorMap2D floor={floor} />
        ) : idle ? (
          <FloorMap3D floor={floor} statusOf={(space) => spaceStatus(space, floor).label} />
        ) : (
          <MapLoading />
        )}
      </div>

      <ul className={clsx(capable3D ? 'sr-only' : 'grid gap-1 border-t border-border p-3 text-xs sm:grid-cols-2')}>
        {floor.spaces.map((space) => {
          const status = spaceStatus(space, floor);
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
