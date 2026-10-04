'use client';

import { useCallback, useEffect, useState } from 'react';

/** Mounts the 3D when the stage nears the viewport and pauses rendering when it scrolls away. */
export function useInView(el: HTMLElement | null, margin: string): boolean {
  const [inView, setInView] = useState(false);
  useEffect(() => {
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => setInView(!!entry?.isIntersecting), { rootMargin: margin });
    observer.observe(el);
    return () => observer.disconnect();
  }, [el, margin]);
  return inView;
}

export function useFullscreen(el: HTMLElement | null) {
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
