'use client';

import { ArrowUpLeft, Loader2, Search, X } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import type { SearchResponse } from '@/app/api/search/route';
import { clsx as cn } from 'clsx';
import { formatIls } from '@/lib/domain/pricing';

const DEBOUNCE_MS = 180;
const MAX_LENGTH = 60;

/** Real catalog shortcuts shown before typing (no invented "trending" claims). */
const QUICK_PICKS = [
  { label: 'חדרי ישיבות', query: 'חדר ישיבות' },
  { label: 'משרד פרטי ליום', query: 'משרד פרטי' },
  { label: 'עמדה בתל אביב', query: 'עמדה תל אביב' },
  { label: 'עם מקרן', query: 'מקרן' },
];

type Option =
  | { kind: 'space'; id: string; href: string; text: string; data: SearchResponse['spaces'][number] }
  | { kind: 'scope'; id: string; href: string; text: string; count: number }
  | { kind: 'all'; id: string; href: string; text: string };

type Status = 'idle' | 'loading' | 'done' | 'error' | 'rate';

export function SmartSearch({ variant = 'nav', onNavigate }: { variant?: 'nav' | 'drawer'; onNavigate?: () => void }) {
  const router = useRouter();
  const baseId = useId();
  const listId = `${baseId}-list`;
  const inputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  /** What the user actually typed; arrow keys only change `value` (the visible text). */
  const [typed, setTyped] = useState('');
  const [value, setValue] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [status, setStatus] = useState<Status>('idle');
  const [data, setData] = useState<SearchResponse | null>(null);

  const query = typed.trim();

  useEffect(() => {
    if (!query) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setStatus('loading');
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`, { signal: controller.signal });
        if (res.status === 429) {
          setStatus('rate');
          return;
        }
        if (!res.ok) {
          setStatus(res.status === 400 ? 'done' : 'error');
          setData(res.status === 400 ? { query, didYouMean: null, spaces: [], scopes: [] } : null);
          return;
        }
        setData((await res.json()) as SearchResponse);
        setStatus('done');
      } catch (error) {
        if ((error as Error).name !== 'AbortError') setStatus('error');
      }
    }, DEBOUNCE_MS);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  const options = useMemo<Option[]>(() => {
    if (!query) {
      return QUICK_PICKS.map((p) => ({
        kind: 'all' as const,
        id: `${baseId}-q-${p.query}`,
        href: `/spaces?q=${encodeURIComponent(p.query)}`,
        text: p.label,
      }));
    }
    if (!data) return [];
    const list: Option[] = [
      ...data.spaces.map((s) => ({ kind: 'space' as const, id: `${baseId}-s-${s.slug}`, href: `/spaces/${s.slug}`, text: s.name, data: s })),
      ...data.scopes.map((s) => ({ kind: 'scope' as const, id: `${baseId}-c-${s.href}`, href: s.href, text: s.label, count: s.count })),
    ];
    list.push({ kind: 'all', id: `${baseId}-all`, href: `/spaces?q=${encodeURIComponent(query)}`, text: `כל התוצאות ל"${query}"` });
    return list;
  }, [query, data, baseId]);

  function go(href: string) {
    setOpen(false);
    setActive(-1);
    onNavigate?.();
    router.push(href);
  }

  function onType(next: string) {
    const clipped = next.slice(0, MAX_LENGTH);
    setTyped(clipped);
    setValue(clipped);
    if (!clipped.trim()) {
      setData(null);
      setStatus('idle');
    }
    setActive(-1);
    setOpen(true);
  }

  function move(delta: number) {
    if (!options.length) return;
    setOpen(true);
    const next = active + delta;
    // Loops through the list and back to what the user typed (Baymard: copy suggestion into the field).
    const wrapped = next < -1 ? options.length - 1 : next >= options.length ? -1 : next;
    setActive(wrapped);
    const opt = options[wrapped];
    setValue(wrapped === -1 || !opt || opt.kind === 'all' ? typed : opt.text);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      move(1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      move(-1);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const opt = options[active];
      if (opt) go(opt.href);
      else if (query) go(`/spaces?q=${encodeURIComponent(query)}`);
    } else if (e.key === 'Escape') {
      if (open) {
        e.stopPropagation();
        setOpen(false);
        setActive(-1);
        setValue(typed);
      }
    }
  }

  const showPanel = open && (options.length > 0 || status === 'loading' || status === 'error' || status === 'rate' || (status === 'done' && !!query));
  const noResults = status === 'done' && !!query && data !== null && data.spaces.length === 0 && data.scopes.length === 0;

  return (
    <div ref={wrapRef} className={cn('relative', variant === 'nav' ? 'w-48 xl:w-72' : 'w-full')}>
      <label htmlFor={`${baseId}-input`} className="sr-only">
        חיפוש חלל, סניף או עיר
      </label>
      <div
        className={cn(
          'flex items-center gap-2 rounded-full border border-border bg-bg transition-[border-color,box-shadow] duration-[var(--dur-micro)] focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/25',
          variant === 'nav' ? 'h-10 px-3' : 'h-12 px-4',
        )}
      >
        {status === 'loading' ? (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted" aria-hidden="true" />
        ) : (
          <Search className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
        )}
        <input
          ref={inputRef}
          id={`${baseId}-input`}
          type="search"
          role="combobox"
          aria-expanded={showPanel}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={active >= 0 ? options[active]?.id : undefined}
          autoComplete="off"
          enterKeyHint="search"
          maxLength={MAX_LENGTH}
          placeholder="חדר ישיבות בתל אביב…"
          value={value}
          onChange={(e) => onType(e.target.value)}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted [&::-webkit-search-cancel-button]:hidden"
        />
        {value && (
          <button
            type="button"
            onClick={() => {
              onType('');
              inputRef.current?.focus();
            }}
            className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-muted hover:bg-subtle hover:text-fg"
            aria-label="ניקוי החיפוש"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        )}
      </div>

      <div
        className={cn(
          'absolute inset-x-0 top-full z-50 mt-2 overflow-hidden rounded-2xl border border-border bg-bg shadow-xl shadow-black/10',
          variant === 'nav' && 'right-auto w-[min(26rem,calc(100vw-2rem))]',
          !showPanel && 'hidden',
        )}
      >
        <p className="sr-only" aria-live="polite">
          {status === 'done' && query ? (noResults ? 'אין תוצאות' : `${data?.spaces.length ?? 0} חללים נמצאו`) : ''}
        </p>

        {!query && <p className="px-4 pt-3 text-xs font-medium text-muted">חיפושים מהירים</p>}

        {data?.didYouMean && query && (
          <button
            type="button"
            onClick={() => onType(data.didYouMean ?? '')}
            className="block w-full px-4 pt-3 text-start text-sm text-muted hover:text-fg"
          >
            התכוונת ל<span className="font-semibold text-accent-text">{data.didYouMean}</span>?
          </button>
        )}

        {noResults && (
          <div className="px-4 py-5 text-sm">
            <p className="font-medium">לא מצאנו חלל שמתאים ל&quot;{query}&quot;.</p>
            <p className="mt-1 text-muted">נסו שם עיר, סוג חלל או ציוד — למשל &quot;מקרן&quot; או &quot;משרד בחיפה&quot;.</p>
          </div>
        )}
        {status === 'error' && (
          <p className="px-4 py-4 text-sm text-muted">
            החיפוש לא זמין כרגע. אפשר לדפדף ב
            <Link className="text-accent-text underline" href="/spaces" onClick={() => go('/spaces')}>
              כל החללים
            </Link>
            .
          </p>
        )}
        {status === 'rate' && <p className="px-4 py-4 text-sm text-muted">יותר מדי חיפושים בדקה האחרונה. נסו שוב בעוד רגע.</p>}

        <ul id={listId} role="listbox" aria-label="תוצאות חיפוש" className="max-h-[min(70vh,28rem)] overflow-y-auto p-2">
          {options.map((opt, i) => (
            <li
              key={opt.id}
              id={opt.id}
              role="option"
              aria-selected={i === active}
              onPointerDown={(e) => e.preventDefault()}
              onClick={() => go(opt.href)}
              onPointerEnter={() => setActive(i)}
              className={cn(
                'flex cursor-pointer items-center gap-3 rounded-xl px-2 py-2 text-sm transition-colors duration-[var(--dur-micro)]',
                i === active ? 'bg-accent-soft' : 'hover:bg-subtle',
              )}
            >
              {opt.kind === 'space' ? (
                <>
                  <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-subtle">
                    {opt.data.image && (
                      <Image src={opt.data.image.url} alt="" fill sizes="48px" className="object-cover" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold">{opt.data.name}</span>
                    <span className="block truncate text-xs text-muted">
                      {opt.data.typeLabel} · {opt.data.place}
                    </span>
                  </span>
                  <span className="shrink-0 text-end">
                    <span className="block text-xs text-muted">החל מ-</span>
                    <span className="block font-semibold tabular-nums">{formatIls(opt.data.priceFrom)}</span>
                    <span className="block text-[11px] text-muted">{opt.data.priceUnit}</span>
                  </span>
                </>
              ) : (
                <>
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-subtle text-muted">
                    <Search className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1 truncate font-medium">{opt.text}</span>
                  {opt.kind === 'scope' && <span className="shrink-0 text-xs text-muted">{opt.count} חללים</span>}
                  <ArrowUpLeft className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
                </>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
