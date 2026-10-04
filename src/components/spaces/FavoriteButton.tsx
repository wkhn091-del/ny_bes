'use client';

import { clsx } from 'clsx';
import { Heart } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { setFavorite } from '@/app/actions/account';
import { PENDING_FAVORITE_KEY, useFavorites } from '@/stores/favorites';

interface Props {
  spaceId: string;
  spaceName: string;
  className?: string;
  variant?: 'overlay' | 'inline';
}

/** Rapid toggles collapse into one request carrying the final intent. */
const SYNC_DELAY_MS = 350;

export function FavoriteButton({ spaceId, spaceName, className, variant = 'overlay' }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const loggedIn = useFavorites((s) => s.loggedIn);
  const favorited = useFavorites((s) => s.ids.has(spaceId));
  const mark = useFavorites((s) => s.set);
  const [error, setError] = useState('');
  const confirmed = useRef<boolean | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const inFlight = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => () => window.clearTimeout(timer.current), []);

  function sync(desired: boolean) {
    inFlight.current = inFlight.current.then(async () => {
      if (desired === confirmed.current) return;
      const result = await setFavorite({ spaceId, favorite: desired }).catch(() => null);
      if (result?.ok) {
        confirmed.current = desired;
        return;
      }
      if (confirmed.current !== null) mark(spaceId, confirmed.current);
      setError(result && !result.ok && result.message ? result.message : 'לא הצלחנו לעדכן את המועדפים. נסו שוב.');
    });
  }

  function onClick() {
    if (!loggedIn) {
      try {
        sessionStorage.setItem(PENDING_FAVORITE_KEY, spaceId);
      } catch {
        // Storage blocked: the visitor will simply save it again after signing in.
      }
      const search = typeof window === 'undefined' ? '' : window.location.search;
      router.push(`/login?reason=favorite&returnUrl=${encodeURIComponent(`${pathname}${search}`)}`);
      return;
    }
    if (confirmed.current === null) confirmed.current = favorited;
    const next = !favorited;
    mark(spaceId, next);
    setError('');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => sync(next), SYNC_DELAY_MS);
  }

  return (
    <>
      <button
        type="button"
        onClick={onClick}
        aria-pressed={favorited}
        aria-label={favorited ? `הסרת ${spaceName} מהמועדפים` : `שמירת ${spaceName} במועדפים`}
        className={clsx(
          'inline-flex items-center justify-center rounded-full transition-colors',
          variant === 'overlay'
            ? 'h-9 w-9 bg-bg/90 shadow-sm backdrop-blur hover:bg-bg'
            : 'h-10 gap-2 border border-border px-4 text-sm font-medium hover:bg-subtle',
          className,
        )}
      >
        <Heart
          className={clsx('h-4 w-4 transition-all motion-safe:active:scale-125', favorited ? 'fill-danger text-danger' : 'text-fg')}
          aria-hidden="true"
        />
        {variant === 'inline' && <span>{favorited ? 'שמור במועדפים' : 'שמירה למועדפים'}</span>}
      </button>
      <span className="sr-only" role="status" aria-live="polite">
        {error}
      </span>
    </>
  );
}
