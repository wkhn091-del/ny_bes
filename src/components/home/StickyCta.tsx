'use client';

import { clsx } from 'clsx';
import { Search } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

/**
 * Mobile-only booking button that appears once the hero search has scrolled away and steps
 * aside when the footer arrives, so it never covers content at the end of the page (A35).
 */
export function StickyCta() {
  const [heroGone, setHeroGone] = useState(false);
  const [footerIn, setFooterIn] = useState(false);

  useEffect(() => {
    const hero = document.getElementById('hero-search');
    const footer = document.querySelector('footer');
    const observers: IntersectionObserver[] = [];
    if (hero) {
      const o = new IntersectionObserver(([entry]) => {
        if (entry) setHeroGone(!entry.isIntersecting && entry.boundingClientRect.top < 0);
      });
      o.observe(hero);
      observers.push(o);
    }
    if (footer) {
      const o = new IntersectionObserver(([entry]) => setFooterIn(Boolean(entry?.isIntersecting)));
      o.observe(footer);
      observers.push(o);
    }
    return () => observers.forEach((o) => o.disconnect());
  }, []);

  const visible = heroGone && !footerIn;

  return (
    <div
      className={clsx(
        'fixed bottom-5 left-24 right-4 z-30 transition-[opacity,translate] duration-(--dur-base) ease-(--ease-out) lg:hidden',
        visible ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-4 opacity-0',
      )}
      inert={!visible}
    >
      <Link
        href="/spaces"
        className="flex h-14 items-center justify-center gap-2 rounded-full bg-accent font-semibold text-accent-fg shadow-lg shadow-accent/30"
      >
        <Search className="h-4 w-4" aria-hidden="true" />
        מה פנוי עכשיו?
      </Link>
    </div>
  );
}
