'use client';

import { clsx } from 'clsx';
import { AlertCircle, CalendarDays, Loader2, Minus, Plus, RefreshCw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { BookingSummaryDrawer } from './BookingSummaryDrawer';
import { calculatePrice, formatIls, type PricingSettings } from '@/lib/domain/pricing';
import {
  MIN_BOOKING_MINUTES,
  SLOT_MINUTES,
  addDays,
  formatDateHebrew,
  formatMinutes,
  formatWeekdayShort,
  hoursForDate,
} from '@/lib/domain/time';
import type { Addon, DayHours, SpaceType } from '@/lib/domain/types';
import { checkoutHref, useCart } from '@/stores/cart';
import { track } from '@/lib/analytics/gtag';

interface WidgetSpace {
  id: string;
  name: string;
  type: SpaceType;
  hourlyPrice: number;
  dayPassPrice: number | null;
  capacity: number;
  poolSize: number | null;
}

interface Props {
  space: WidgetSpace;
  hours: DayHours[];
  addons: Addon[];
  settings: PricingSettings;
  today: string;
  maxDate: string;
  initialDate: string;
  dateFromUrl: boolean;
  initialSeats: number;
  isLoggedIn: boolean;
  /** "Book again": server-validated selection from a past booking; takes precedence over the saved cart */
  prefill?: WidgetPrefill | null;
}

export interface WidgetPrefill {
  date: string;
  startMinute: number;
  endMinute: number;
  seats: number;
  isDayPass: boolean;
  addonIds: string[];
}

interface Slot {
  start: number;
  remaining: number;
  available: boolean;
}

type SlotsState =
  | { status: 'loading' }
  | { status: 'ready'; date: string; slots: Slot[] }
  | { status: 'error' };

const STRIP_DAYS = 14;
const REFRESH_MS = 60_000;

export function BookingWidget({
  space,
  hours,
  addons,
  settings,
  today,
  maxDate,
  initialDate,
  dateFromUrl,
  initialSeats,
  isLoggedIn,
  prefill = null,
}: Props) {
  const router = useRouter();
  const setCart = useCart((s) => s.setSelection);
  const isHotDesk = space.type === 'hotDesk';
  const maxSeats = isHotDesk ? Math.min(space.capacity, space.poolSize ?? 0) : 1;

  const [date, setDate] = useState(prefill?.date ?? initialDate);
  const [slotsState, setSlotsState] = useState<SlotsState>({ status: 'loading' });
  const [reloadToken, setReloadToken] = useState(0);
  const [start, setStart] = useState<number | null>(prefill && !prefill.isDayPass ? prefill.startMinute : null);
  const [end, setEnd] = useState<number | null>(prefill && !prefill.isDayPass ? prefill.endMinute : null);
  const [seats, setSeats] = useState(Math.min(Math.max(1, prefill?.seats ?? initialSeats), Math.max(1, maxSeats)));
  const [isDayPass, setIsDayPass] = useState(prefill?.isDayPass ?? false);
  const [addonIds, setAddonIds] = useState<string[]>(
    prefill ? prefill.addonIds.filter((id) => addons.some((a) => a.id === id)) : [],
  );
  const [notice, setNotice] = useState<string | null>(
    prefill ? 'מילאנו את פרטי ההזמנה הקודמת במועד הפנוי הקרוב. אפשר לשנות לפני שממשיכים.' : null,
  );
  const [navigating, setNavigating] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const hasPrefill = prefill !== null;

  const stripDates = useMemo(() => Array.from({ length: STRIP_DAYS }, (_, i) => addDays(today, i)), [today]);

  useEffect(() => {
    if (hasPrefill) return;
    let cancelled = false;
    void Promise.resolve(useCart.persist.rehydrate()).then(() => {
      const saved = useCart.getState().selection;
      if (cancelled || !saved || saved.spaceId !== space.id || saved.date < today || saved.date > maxDate) return;
      if (dateFromUrl && saved.date !== initialDate) return;
      setDate(saved.date);
      setStart(saved.isDayPass ? null : saved.startMinute);
      setEnd(saved.isDayPass ? null : saved.endMinute);
      setSeats(Math.min(Math.max(1, saved.seats), Math.max(1, maxSeats)));
      setIsDayPass(saved.isDayPass);
      setAddonIds(saved.addonIds.filter((id) => addons.some((a) => a.id === id)));
    });
    return () => {
      cancelled = true;
    };
  }, [space.id, today, maxDate, initialDate, dateFromUrl, maxSeats, addons, hasPrefill]);

  useEffect(() => {
    const controller = new AbortController();
    async function load(background: boolean) {
      if (!background) setSlotsState({ status: 'loading' });
      try {
        const res = await fetch(`/api/availability?spaceId=${encodeURIComponent(space.id)}&date=${date}`, {
          signal: controller.signal,
          cache: 'no-store',
        });
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as { slots: Slot[] };
        setSlotsState({ status: 'ready', date, slots: data.slots });
      } catch (error) {
        if ((error as Error).name !== 'AbortError' && !background) setSlotsState({ status: 'error' });
      }
    }
    void load(false);
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load(true);
    }, REFRESH_MS);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [space.id, date, reloadToken]);

  const slots = useMemo(
    () => (slotsState.status === 'ready' && slotsState.date === date ? slotsState.slots : []),
    [slotsState, date],
  );
  const needed = isHotDesk ? seats : 1;
  const slotMap = useMemo(() => new Map(slots.map((s) => [s.start, s])), [slots]);
  const selectable = useCallback((m: number) => (slotMap.get(m)?.remaining ?? 0) >= needed, [slotMap, needed]);
  const rangeSelectable = useCallback(
    (a: number, b: number) => {
      for (let m = a; m < b; m += SLOT_MINUTES) if (!selectable(m)) return false;
      return true;
    },
    [selectable],
  );

  const dayWindow = hoursForDate(hours, date);
  const dayPassAvailable =
    space.type === 'privateOffice' &&
    space.dayPassPrice !== null &&
    dayWindow !== null &&
    slots.length > 0 &&
    slots[0].start === dayWindow.open &&
    rangeSelectable(dayWindow.open, dayWindow.close);

  // A selection that became invalid (slot taken by someone else, seats changed) is dropped, not silently kept.
  const selectionValid = isDayPass ? dayPassAvailable : start !== null && end !== null && rangeSelectable(start, end);
  const selectionComplete =
    slotsState.status === 'ready' && selectionValid && (isDayPass || (start !== null && end !== null && end - start >= MIN_BOOKING_MINUTES));
  const staleSelection = slotsState.status === 'ready' && !selectionValid && (isDayPass || start !== null);

  const effectiveStart = isDayPass && dayWindow ? dayWindow.open : start;
  const effectiveEnd = isDayPass && dayWindow ? dayWindow.close : end;
  const duration = effectiveStart !== null && effectiveEnd !== null ? effectiveEnd - effectiveStart : 0;

  const price = selectionComplete
    ? calculatePrice({
        space,
        durationMinutes: duration,
        seats,
        isDayPass,
        addons: addons.filter((a) => addonIds.includes(a.id)),
        coupon: null,
        settings,
      })
    : null;

  function chooseDate(next: string) {
    if (next === date || next < today || next > maxDate) return;
    setDate(next);
    setStart(null);
    setEnd(null);
    setIsDayPass(false);
    setNotice(null);
  }

  function beginAt(m: number) {
    const minEnd = m + MIN_BOOKING_MINUTES;
    setStart(m);
    if (rangeSelectable(m, minEnd)) {
      setEnd(minEnd);
    } else {
      setEnd(m + SLOT_MINUTES);
      setNotice('מינימום הזמנה הוא שעה, והחצי שעה הבאה תפוסה. בחרו שעת התחלה אחרת.');
    }
  }

  function clickSlot(m: number) {
    if (!selectable(m)) return;
    setNotice(null);
    setIsDayPass(false);
    if (start === null || m <= start) return beginAt(m);
    const nextEnd = m + SLOT_MINUTES;
    if (!rangeSelectable(start, nextEnd)) return beginAt(m);
    setEnd(Math.max(nextEnd, start + MIN_BOOKING_MINUTES));
  }

  function toggleDayPass() {
    setNotice(null);
    setIsDayPass((v) => !v);
    setStart(null);
    setEnd(null);
  }

  function changeSeats(next: number) {
    setSeats(Math.min(Math.max(1, next), Math.max(1, maxSeats)));
  }

  function toggleAddon(id: string) {
    setAddonIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  }

  function review() {
    if (!selectionComplete || effectiveStart === null || effectiveEnd === null) return;
    setReviewOpen(true);
  }

  function proceed() {
    if (!selectionComplete || effectiveStart === null || effectiveEnd === null) return;
    const selection = {
      spaceId: space.id,
      date,
      startMinute: effectiveStart,
      endMinute: effectiveEnd,
      seats: isHotDesk ? seats : 1,
      isDayPass,
      addonIds,
    };
    setCart(selection);
    if (price) {
      track('add_to_cart', {
        currency: 'ILS',
        value: price.total / 100,
        items: [{ item_id: space.id, item_name: space.name, item_category: space.type, price: price.total / 100, quantity: 1 }],
      });
    }
    setNavigating(true);
    router.push(checkoutHref(selection));
  }

  const lowStockThreshold = isHotDesk ? Math.max(3, Math.ceil((space.poolSize ?? 0) * 0.15)) : 0;

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-xl shadow-black/5">
      <div className="flex items-baseline justify-between">
        <p>
          <span className="text-2xl font-bold">{formatIls(space.hourlyPrice)}</span>
          <span className="text-sm text-muted"> / שעה{isHotDesk && ' לעמדה'}</span>
        </p>
        {space.dayPassPrice !== null && <span className="text-sm text-muted">יום שלם {formatIls(space.dayPassPrice)}</span>}
      </div>

      <div className="mt-5">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold">תאריך</h3>
          <label className="flex items-center gap-1 text-xs font-medium text-accent-text">
            <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="sr-only">בחירת תאריך אחר</span>
            <input
              type="date"
              min={today}
              max={maxDate}
              value={date}
              onChange={(e) => chooseDate(e.target.value)}
              className="w-[8.5rem] bg-transparent text-xs"
            />
          </label>
        </div>
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" role="listbox" aria-label="בחירת יום">
          {stripDates.map((d) => {
            const closed = hoursForDate(hours, d) === null;
            const selected = d === date;
            return (
              <button
                key={d}
                type="button"
                role="option"
                aria-selected={selected}
                disabled={closed}
                onClick={() => chooseDate(d)}
                className={clsx(
                  'flex min-w-[3.6rem] shrink-0 flex-col items-center rounded-xl border px-2 py-2 text-xs transition-colors',
                  selected ? 'border-accent bg-accent text-accent-fg' : 'border-border hover:border-border-strong',
                  closed && 'cursor-not-allowed opacity-40',
                )}
              >
                <span>{formatWeekdayShort(d)}</span>
                <span className="text-base font-semibold">{Number(d.slice(8))}</span>
                {closed && <span className="text-[10px]">סגור</span>}
              </button>
            );
          })}
        </div>
      </div>

      {isHotDesk && (
        <div className="mt-5 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold">מספר עמדות</h3>
            <p className="text-xs text-muted">עד {maxSeats} בהזמנה אחת</p>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => changeSeats(seats - 1)} disabled={seats <= 1} className="flex h-8 w-8 items-center justify-center rounded-full border border-border disabled:opacity-40" aria-label="פחות עמדות">
              <Minus className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
            <span className="w-6 text-center font-semibold" aria-live="polite">
              {seats}
            </span>
            <button type="button" onClick={() => changeSeats(seats + 1)} disabled={seats >= maxSeats} className="flex h-8 w-8 items-center justify-center rounded-full border border-border disabled:opacity-40" aria-label="יותר עמדות">
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}

      {space.type === 'privateOffice' && space.dayPassPrice !== null && (
        <label
          className={clsx(
            'mt-5 flex cursor-pointer items-center justify-between gap-3 rounded-xl border p-3 transition-colors',
            isDayPass ? 'border-accent bg-accent-soft' : 'border-border',
            !dayPassAvailable && 'cursor-not-allowed opacity-50',
          )}
        >
          <span>
            <span className="block text-sm font-semibold">יום שלם · {formatIls(space.dayPassPrice)}</span>
            <span className="block text-xs text-muted">
              {dayWindow ? `${formatMinutes(dayWindow.open)}–${formatMinutes(dayWindow.close)}` : 'הסניף סגור'}
              {dayWindow &&
                ` · במקום ${formatIls(space.hourlyPrice * ((dayWindow.close - dayWindow.open) / 60))} לפי שעה`}
            </span>
            {!dayPassAvailable && slotsState.status === 'ready' && dayWindow && (
              <span className="block text-xs text-muted">לא זמין בתאריך הזה — חלק מהשעות כבר תפוסות או עברו.</span>
            )}
          </span>
          <input type="checkbox" checked={isDayPass} onChange={toggleDayPass} disabled={!dayPassAvailable} className="h-4 w-4 accent-[var(--accent)]" />
        </label>
      )}

      {!isDayPass && (
        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold">שעות</h3>
            <span className="text-xs text-muted">לחיצה על שעת התחלה ואז על שעת הסיום</span>
          </div>
          {slotsState.status === 'loading' && (
            <div className="grid grid-cols-4 gap-1.5" aria-busy="true">
              {Array.from({ length: 12 }, (_, i) => (
                <div key={i} className="h-9 animate-pulse rounded-lg bg-subtle" />
              ))}
            </div>
          )}
          {slotsState.status === 'error' && (
            <div className="flex items-center justify-between rounded-xl border border-danger/30 bg-danger-soft p-3 text-sm text-danger">
              <span>לא הצלחנו לטעון את השעות הפנויות.</span>
              <button type="button" onClick={() => setReloadToken((t) => t + 1)} className="flex items-center gap-1 font-semibold">
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> לנסות שוב
              </button>
            </div>
          )}
          {slotsState.status === 'ready' && slots.length === 0 && (
            <p className="rounded-xl border border-dashed border-border p-4 text-center text-sm text-muted">
              {dayWindow ? 'אין יותר שעות פנויות היום. נסו תאריך אחר.' : 'הסניף סגור בתאריך הזה.'}
            </p>
          )}
          {slots.length > 0 && (
            <div className="grid grid-cols-4 gap-1.5" role="group" aria-label={`שעות פנויות ב${formatDateHebrew(date)}`}>
              {slots.map((slot) => {
                const free = selectable(slot.start);
                const inRange = start !== null && end !== null && slot.start >= start && slot.start < end;
                const isEdge = slot.start === start || (end !== null && slot.start === end - SLOT_MINUTES);
                const low = isHotDesk && free && slot.remaining <= lowStockThreshold;
                return (
                  <button
                    key={slot.start}
                    type="button"
                    disabled={!free}
                    onClick={() => clickSlot(slot.start)}
                    aria-pressed={inRange}
                    aria-label={`${formatMinutes(slot.start)}${free ? (isHotDesk ? `, ${slot.remaining} עמדות פנויות` : ', פנוי') : ', תפוס'}`}
                    title={!free ? (isHotDesk && slot.remaining > 0 ? `נותרו רק ${slot.remaining} עמדות` : 'תפוס') : undefined}
                    className={clsx(
                      'relative h-9 rounded-lg border text-xs font-medium tabular-nums transition-colors',
                      !free && 'cursor-not-allowed border-transparent bg-subtle text-muted line-through opacity-60',
                      free && !inRange && 'border-border hover:border-accent hover:text-accent-text',
                      inRange && (isEdge ? 'border-accent bg-accent text-accent-fg' : 'border-accent bg-accent-soft text-accent-text'),
                    )}
                  >
                    {formatMinutes(slot.start)}
                    {low && !inRange && <span className="absolute -top-1 left-1 h-1.5 w-1.5 rounded-full bg-warning" aria-hidden="true" />}
                  </button>
                );
              })}
            </div>
          )}
          {isHotDesk && slots.some((s) => selectable(s.start) && s.remaining <= lowStockThreshold) && (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-muted">
              <span className="h-1.5 w-1.5 rounded-full bg-warning" aria-hidden="true" /> נותרו {lowStockThreshold} עמדות או פחות בשעה זו
            </p>
          )}
        </div>
      )}

      {(notice || staleSelection) && (
        <p className="mt-3 flex items-start gap-1.5 text-xs text-warning" role="status">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {staleSelection ? 'חלק מהשעות שבחרתם כבר לא פנויות. בחרו שעות אחרות.' : notice}
        </p>
      )}

      {addons.length > 0 && (
        <fieldset className="mt-5">
          <legend className="mb-2 text-sm font-semibold">תוספות</legend>
          <div className="space-y-2">
            {addons.map((addon) => (
              <label
                key={addon.id}
                className={clsx(
                  'flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors',
                  addonIds.includes(addon.id) ? 'border-accent bg-accent-soft' : 'border-border hover:border-border-strong',
                )}
              >
                <input
                  type="checkbox"
                  checked={addonIds.includes(addon.id)}
                  onChange={() => toggleAddon(addon.id)}
                  className="mt-0.5 h-4 w-4 accent-[var(--accent)]"
                />
                <span className="flex-1">
                  <span className="flex justify-between gap-2 text-sm font-medium">
                    {addon.name}
                    <span className="shrink-0">
                      {formatIls(addon.price)}
                      <span className="text-xs font-normal text-muted">{addon.pricingMode === 'perHour' ? ' / שעה' : ' להזמנה'}</span>
                    </span>
                  </span>
                  <span className="mt-0.5 block text-xs text-muted">{addon.description}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <div className="mt-5 border-t border-border pt-4" aria-live="polite">
        {price ? (
          <dl className="space-y-1.5 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted">
                {isDayPass
                  ? 'יום שלם'
                  : `${formatMinutes(effectiveStart!)}–${formatMinutes(effectiveEnd!)} · ${price.hours} שעות${isHotDesk && seats > 1 ? ` × ${seats} עמדות` : ''}`}
              </dt>
              <dd>{formatIls(price.base)}</dd>
            </div>
            {price.discountSource === 'auto' && (
              <div className="flex justify-between text-success">
                <dt>הנחת הזמנה ארוכה ({settings.autoDiscountPercent}%)</dt>
                <dd>−{formatIls(price.discount)}</dd>
              </div>
            )}
            {price.addonLines.map((line) => (
              <div key={line.addonId} className="flex justify-between">
                <dt className="text-muted">
                  {line.name}
                  {line.pricingMode === 'perHour' && ` × ${line.quantity} ש׳`}
                </dt>
                <dd>{formatIls(line.lineTotal)}</dd>
              </div>
            ))}
            <div className="flex justify-between border-t border-border pt-2 text-base font-bold">
              <dt>סה״כ</dt>
              <dd>{formatIls(price.total)}</dd>
            </div>
          </dl>
        ) : null}
        {price ? (
          <div className="mt-1.5 space-y-1.5">
            <p className="text-xs text-muted">כולל מע״מ {formatIls(price.vatIncluded)}. קופון אפשר להזין בשלב הבא.</p>
            {!isDayPass &&
              space.type !== 'hotDesk' &&
              price.discountSource === null &&
              price.hours < settings.autoDiscountMinHours &&
              price.hours >= settings.autoDiscountMinHours - 1 && (
                <p className="text-xs text-accent-text">
                  בהזמנה של {settings.autoDiscountMinHours} שעות ומעלה מקבלים {settings.autoDiscountPercent}% הנחה על החדר.
                </p>
              )}
          </div>
        ) : (
          <p className="text-sm text-muted">{isDayPass ? 'טוען זמינות…' : 'בחרו תאריך ושעות כדי לראות מחיר סופי.'}</p>
        )}
      </div>

      <Button size="lg" className="mt-4 w-full" disabled={!selectionComplete || navigating} onClick={review} aria-haspopup="dialog">
        {navigating ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
        {isLoggedIn ? 'להמשך הזמנה' : 'התחברות והמשך הזמנה'}
      </Button>
      {price && effectiveStart !== null && effectiveEnd !== null && (
        <BookingSummaryDrawer
          open={reviewOpen && selectionComplete}
          onClose={() => setReviewOpen(false)}
          onConfirm={proceed}
          navigating={navigating}
          isLoggedIn={isLoggedIn}
          spaceId={space.id}
          date={date}
          startMinute={effectiveStart}
          endMinute={effectiveEnd}
          seats={isHotDesk ? seats : 1}
          timeLabel={
            isDayPass
              ? `יום שלם · ${formatMinutes(effectiveStart)}–${formatMinutes(effectiveEnd)}`
              : `${formatMinutes(effectiveStart)}–${formatMinutes(effectiveEnd)} · ${price.hours} שעות${isHotDesk && seats > 1 ? ` × ${seats} עמדות` : ''}`
          }
          price={price}
          addons={addons}
          addonIds={addonIds}
          onToggleAddon={toggleAddon}
        />
      )}
      <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5">
        <Badge tone="neutral">ביטול חינם עד 24 שעות לפני</Badge>
        <Badge tone="neutral">לא תחויבו עדיין</Badge>
      </div>
    </div>
  );
}
