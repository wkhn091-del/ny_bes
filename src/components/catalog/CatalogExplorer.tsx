'use client';

import { clsx } from 'clsx';
import { Loader2, SlidersHorizontal, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { createStore, useStore } from 'zustand';
import { SpaceCard } from '@/components/spaces/SpaceCard';
import { Button } from '@/components/ui/Button';
import {
  EMPTY_FILTERS,
  SORT_OPTIONS,
  applyStaticFilters,
  countActiveFilters,
  filtersToSearch,
  type CatalogFilters,
  type SortKey,
} from '@/lib/catalog-filters';
import { formatDateHebrew, formatMinutes } from '@/lib/domain/time';
import { buildCatalogSearchIndex } from '@/lib/search/catalog-index';
import { search } from '@/lib/search/fuzzy';
import { SPACE_TYPES, SPACE_TYPE_LABELS, type Amenity, type Branch, type City, type Space, type SpaceType } from '@/lib/domain/types';

interface FilterStore {
  filters: CatalogFilters;
  set: (patch: Partial<CatalogFilters>) => void;
  reset: () => void;
}

const makeStore = (initial: CatalogFilters) =>
  createStore<FilterStore>((set) => ({
    filters: initial,
    set: (patch) => set((s) => ({ filters: { ...s.filters, ...patch } })),
    reset: () => set({ filters: EMPTY_FILTERS }),
  }));

interface Props {
  initialFilters: CatalogFilters;
  spaces: Space[];
  branches: Branch[];
  cities: City[];
  amenities: Amenity[];
  recentBookings: Record<string, number>;
  minDate: string;
  maxDate: string;
  priceBounds: { min: number; max: number };
}

type AvailabilityState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; key: string; ids: Set<string>; remaining: Record<string, number> }
  | { status: 'error' };

const TIME_OPTIONS = Array.from({ length: (21 - 7) * 2 + 1 }, (_, i) => 7 * 60 + i * 30);

export function CatalogExplorer(props: Props) {
  const [store] = useState(() => makeStore(props.initialFilters));
  const filters = useStore(store, (s) => s.filters);
  const setFilters = useStore(store, (s) => s.set);
  const reset = useStore(store, (s) => s.reset);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [availability, setAvailability] = useState<AvailabilityState>({ status: 'idle' });

  const branchMap = useMemo(() => new Map(props.branches.map((b) => [b.id, b])), [props.branches]);
  const amenitySlugToId = useMemo(() => new Map(props.amenities.map((a) => [a.slug, a.id])), [props.amenities]);

  useEffect(() => {
    const url = `${window.location.pathname}${filtersToSearch(filters)}`;
    if (url !== `${window.location.pathname}${window.location.search}`) window.history.replaceState(null, '', url);
  }, [filters]);

  const availabilityKey = filters.date
    ? `${filters.date}|${filters.start ?? ''}|${filters.end ?? ''}|${filters.people}|${filters.city}`
    : '';

  useEffect(() => {
    if (!availabilityKey) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setAvailability({ status: 'loading' });
      const [date, start, end, people, city] = availabilityKey.split('|');
      const params = new URLSearchParams({ date, seats: people });
      if (start && end) {
        params.set('startMinute', start);
        params.set('endMinute', end);
      }
      if (city) params.set('city', city);
      try {
        const res = await fetch(`/api/availability/search?${params}`, { signal: controller.signal, cache: 'no-store' });
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as { availableSpaceIds: string[]; remaining: Record<string, number> };
        setAvailability({ status: 'ready', key: availabilityKey, ids: new Set(data.availableSpaceIds), remaining: data.remaining });
      } catch (error) {
        if ((error as Error).name !== 'AbortError') setAvailability({ status: 'error' });
      }
    }, 250);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [availabilityKey]);

  const searchIndex = useMemo(
    () => buildCatalogSearchIndex({ spaces: props.spaces, branches: props.branches, cities: props.cities, amenities: props.amenities }),
    [props.spaces, props.branches, props.cities, props.amenities],
  );
  const relevance = useMemo(
    () => (filters.q ? new Map(search(searchIndex.spaces, filters.q, props.spaces.length).map((r) => [r.item.space.id, r.score])) : null),
    [filters.q, searchIndex, props.spaces.length],
  );
  const staticResults = useMemo(
    () => applyStaticFilters(props.spaces, branchMap, amenitySlugToId, filters, relevance),
    [props.spaces, branchMap, amenitySlugToId, filters, relevance],
  );

  const liveReady = availability.status === 'ready' && availability.key === availabilityKey && Boolean(availabilityKey);
  const results = liveReady ? staticResults.filter((s) => availability.ids.has(s.id)) : staticResults;
  const checking = Boolean(availabilityKey) && !liveReady && availability.status !== 'error';
  const activeCount = countActiveFilters(filters);

  const panel = (
    <FilterPanel
      filters={filters}
      setFilters={setFilters}
      cities={props.cities}
      amenities={props.amenities}
      minDate={props.minDate}
      maxDate={props.maxDate}
      priceBounds={props.priceBounds}
    />
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:py-12">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">חללי עבודה</h1>
          <p className="mt-1 text-sm text-muted" aria-live="polite">
            {checking ? (
              <span className="inline-flex items-center gap-1.5">
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> בודקים זמינות בזמן אמת…
              </span>
            ) : (
              <>
                {results.length} חללים
                {filters.date && liveReady && (
                  <>
                    {' '}
                    פנויים ב{formatDateHebrew(filters.date)}
                    {filters.start !== null && filters.end !== null && ` · ${formatMinutes(filters.start)}–${formatMinutes(filters.end)}`}
                  </>
                )}
              </>
            )}
          </p>
          {filters.q && (
            <p className="mt-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-accent-soft py-1 pe-1 ps-3 text-sm text-accent-text">
                חיפוש: &quot;{filters.q}&quot;
                <button
                  type="button"
                  onClick={() => setFilters({ q: '' })}
                  className="grid h-6 w-6 place-items-center rounded-full hover:bg-accent/15"
                  aria-label={`הסרת החיפוש "${filters.q}"`}
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </span>
            </p>
          )}
          {availability.status === 'error' && filters.date && (
            <p className="mt-1 text-sm text-warning">לא הצלחנו לבדוק זמינות כרגע — מוצגים כל החללים. הזמינות תיבדק שוב בעמוד החלל.</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="lg:hidden" onClick={() => setDrawerOpen(true)} aria-expanded={drawerOpen}>
            <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
            סינון{activeCount > 0 && ` (${activeCount})`}
          </Button>
          <label className="flex items-center gap-2 text-sm">
            <span className="text-muted">מיון</span>
            <select
              value={filters.sort}
              onChange={(e) => setFilters({ sort: e.target.value as SortKey })}
              className="h-10 rounded-lg border border-border bg-card px-3 text-sm"
            >
              {Object.entries(SORT_OPTIONS).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="hidden lg:block" aria-label="סינון חללים">
          <div className="sticky top-24 max-h-[calc(100dvh-7rem)] overflow-y-auto rounded-2xl border border-border bg-card p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-semibold">סינון</h2>
              {activeCount > 0 && (
                <button type="button" onClick={reset} className="text-xs font-medium text-accent-text hover:underline">
                  ניקוי הכל
                </button>
              )}
            </div>
            {panel}
          </div>
        </aside>

        <section aria-label="תוצאות">
          {results.length === 0 && !checking ? (
            <div className="rounded-2xl border border-dashed border-border-strong p-12 text-center">
              <p className="font-semibold">לא מצאנו חלל שמתאים לכל הסינונים</p>
              <p className="mt-1 text-sm text-muted">נסו לשנות תאריך, להרחיב את טווח המחיר או להסיר חלק מהציוד.</p>
              <Button variant="outline" className="mt-5" onClick={reset}>
                ניקוי סינונים
              </Button>
            </div>
          ) : (
            <ul className={clsx('grid gap-5 sm:grid-cols-2 xl:grid-cols-3', checking && 'opacity-60 transition-opacity')}>
              {results.map((space, i) => (
                <li key={space.id}>
                  <SpaceCard
                    space={space}
                    branch={branchMap.get(space.branchId)!}
                    remaining={liveReady && filters.start !== null ? availability.remaining[space.id] : undefined}
                    recentBookings={props.recentBookings[space.id]}
                    priority={i < 3}
                    query={filters.date ? `?date=${filters.date}${filters.people > 1 ? `&people=${filters.people}` : ''}` : ''}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {drawerOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="סינון חללים">
          <button type="button" className="absolute inset-0 bg-black/50" aria-label="סגירה" onClick={() => setDrawerOpen(false)} />
          <div className="absolute inset-y-0 right-0 flex w-[88%] max-w-sm flex-col bg-bg shadow-2xl">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <h2 className="font-semibold">סינון</h2>
              <button type="button" onClick={() => setDrawerOpen(false)} aria-label="סגירת סינון" className="rounded-md p-1 hover:bg-subtle">
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5">{panel}</div>
            <div className="flex gap-2 border-t border-border p-4">
              <Button variant="outline" className="flex-1" onClick={reset}>
                ניקוי
              </Button>
              <Button className="flex-1" onClick={() => setDrawerOpen(false)}>
                הצגת {results.length} חללים
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface PanelProps {
  filters: CatalogFilters;
  setFilters: (patch: Partial<CatalogFilters>) => void;
  cities: City[];
  amenities: Amenity[];
  minDate: string;
  maxDate: string;
  priceBounds: { min: number; max: number };
}

const sectionCls = 'border-b border-border pb-5 mb-5 last:border-0 last:mb-0 last:pb-0';
const legendCls = 'mb-3 text-sm font-semibold';
const inputCls = 'h-10 w-full rounded-lg border border-border bg-bg px-3 text-sm';

function FilterPanel({ filters, setFilters, cities, amenities, minDate, maxDate, priceBounds }: PanelProps) {
  const toggleType = (t: SpaceType) =>
    setFilters({ types: filters.types.includes(t) ? filters.types.filter((x) => x !== t) : [...filters.types, t] });
  const toggleAmenity = (slug: string) =>
    setFilters({
      amenities: filters.amenities.includes(slug) ? filters.amenities.filter((x) => x !== slug) : [...filters.amenities, slug],
    });

  return (
    <div>
      <fieldset className={sectionCls}>
        <legend className={legendCls}>זמינות</legend>
        <label className="mb-2 block text-xs text-muted">
          תאריך
          <input
            type="date"
            min={minDate}
            max={maxDate}
            value={filters.date}
            onChange={(e) => setFilters({ date: e.target.value, ...(e.target.value ? {} : { start: null, end: null }) })}
            className={`${inputCls} mt-1`}
          />
        </label>
        {filters.date && (
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs text-muted">
              משעה
              <select
                value={filters.start ?? ''}
                onChange={(e) => {
                  const start = e.target.value === '' ? null : Number(e.target.value);
                  const end = start !== null && (filters.end === null || filters.end <= start) ? start + 60 : filters.end;
                  setFilters({ start, end: start === null ? null : end });
                }}
                className={`${inputCls} mt-1`}
              >
                <option value="">כל היום</option>
                {TIME_OPTIONS.slice(0, -2).map((m) => (
                  <option key={m} value={m}>
                    {formatMinutes(m)}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-muted">
              עד שעה
              <select
                value={filters.end ?? ''}
                disabled={filters.start === null}
                onChange={(e) => setFilters({ end: Number(e.target.value) })}
                className={`${inputCls} mt-1 disabled:opacity-50`}
              >
                {filters.start === null && <option value="">—</option>}
                {TIME_OPTIONS.filter((m) => filters.start !== null && m >= filters.start + 60).map((m) => (
                  <option key={m} value={m}>
                    {formatMinutes(m)}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
        <p className="mt-2 text-xs text-muted">{filters.date ? 'מוצגים רק חללים שפנויים בפועל.' : 'בחרו תאריך כדי לראות רק מה שפנוי.'}</p>
      </fieldset>

      <fieldset className={sectionCls}>
        <legend className={legendCls}>עיר</legend>
        <select value={filters.city} onChange={(e) => setFilters({ city: e.target.value })} className={inputCls}>
          <option value="">כל הערים</option>
          {cities.map((c) => (
            <option key={c.id} value={c.slug}>
              {c.name}
            </option>
          ))}
        </select>
      </fieldset>

      <fieldset className={sectionCls}>
        <legend className={legendCls}>סוג חלל</legend>
        <div className="space-y-2">
          {SPACE_TYPES.map((t) => (
            <label key={t} className="flex cursor-pointer items-center gap-2 text-sm">
              <input type="checkbox" checked={filters.types.includes(t)} onChange={() => toggleType(t)} className="h-4 w-4 accent-(--accent)" />
              {SPACE_TYPE_LABELS[t]}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className={sectionCls}>
        <legend className={legendCls}>מספר אנשים</legend>
        <input
          type="number"
          min={1}
          max={50}
          value={filters.people}
          onChange={(e) => setFilters({ people: Math.min(50, Math.max(1, Number(e.target.value) || 1)) })}
          className={inputCls}
        />
      </fieldset>

      <fieldset className={sectionCls}>
        <legend className={legendCls}>מחיר לשעה (₪)</legend>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs text-muted">
            מ-
            <input
              type="number"
              min={0}
              step={5}
              placeholder={String(priceBounds.min)}
              value={filters.priceMin ?? ''}
              onChange={(e) => setFilters({ priceMin: e.target.value === '' ? null : Math.max(0, Number(e.target.value)) })}
              className={`${inputCls} mt-1`}
            />
          </label>
          <label className="text-xs text-muted">
            עד
            <input
              type="number"
              min={0}
              step={5}
              placeholder={String(priceBounds.max)}
              value={filters.priceMax ?? ''}
              onChange={(e) => setFilters({ priceMax: e.target.value === '' ? null : Math.max(0, Number(e.target.value)) })}
              className={`${inputCls} mt-1`}
            />
          </label>
        </div>
        <input
          type="range"
          min={priceBounds.min}
          max={priceBounds.max}
          step={5}
          value={filters.priceMax ?? priceBounds.max}
          onChange={(e) => setFilters({ priceMax: Number(e.target.value) >= priceBounds.max ? null : Number(e.target.value) })}
          className="mt-3 w-full accent-(--accent)"
          aria-label="מחיר מקסימלי לשעה"
        />
      </fieldset>

      <fieldset className={sectionCls}>
        <legend className={legendCls}>גודל מינימלי (מ״ר)</legend>
        <select
          value={filters.sizeMin ?? ''}
          onChange={(e) => setFilters({ sizeMin: e.target.value === '' ? null : Number(e.target.value) })}
          className={inputCls}
        >
          <option value="">כל גודל</option>
          {[10, 15, 20, 25].map((s) => (
            <option key={s} value={s}>
              {s}+ מ״ר
            </option>
          ))}
        </select>
        {filters.sizeMin !== null && <p className="mt-2 text-xs text-muted">עמדות חמות אינן מוצגות בסינון לפי גודל.</p>}
      </fieldset>

      <fieldset className={sectionCls}>
        <legend className={legendCls}>ציוד</legend>
        <div className="space-y-2">
          {amenities.map((a) => (
            <label key={a.id} className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={filters.amenities.includes(a.slug)}
                onChange={() => toggleAmenity(a.slug)}
                className="h-4 w-4 accent-(--accent)"
              />
              {a.name}
            </label>
          ))}
        </div>
      </fieldset>
    </div>
  );
}
