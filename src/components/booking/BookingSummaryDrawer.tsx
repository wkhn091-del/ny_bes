'use client';

import { clsx } from 'clsx';
import { Check, Loader2, Plus, ShieldCheck } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { RollingNumber } from '@/components/ui/RollingNumber';
import { SideDrawer } from '@/components/ui/SideDrawer';
import { formatIls, type PriceBreakdown } from '@/lib/domain/pricing';
import { formatDateHebrew } from '@/lib/domain/time';
import type { Addon } from '@/lib/domain/types';

interface RecommendationItem {
  slug: string;
  name: string;
  typeLabel: string;
  place: string;
  image: { url: string; alt: string } | null;
  priceFrom: number;
  priceUnit: string;
  label: string;
  href: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  navigating: boolean;
  isLoggedIn: boolean;
  spaceId: string;
  date: string;
  startMinute: number;
  endMinute: number;
  seats: number;
  timeLabel: string;
  price: PriceBreakdown;
  addons: Addon[];
  addonIds: string[];
  onToggleAddon: (id: string) => void;
}

type RecState = { key: string; items: RecommendationItem[] } | null;

export function BookingSummaryDrawer(props: Props) {
  const { open, onClose, onConfirm, navigating, isLoggedIn, spaceId, date, startMinute, endMinute, seats, timeLabel, price, addons, addonIds, onToggleAddon } = props;
  const [recs, setRecs] = useState<RecState>(null);
  const recKey = `${spaceId}|${date}|${startMinute}|${endMinute}|${seats}`;

  useEffect(() => {
    if (!open || recs?.key === recKey) return;
    const controller = new AbortController();
    const query = new URLSearchParams({ space: spaceId, date, start: String(startMinute), end: String(endMinute), seats: String(seats) });
    fetch(`/api/recommendations?${query}`, { signal: controller.signal, cache: 'no-store' })
      .then((res) => (res.ok ? (res.json() as Promise<{ items: RecommendationItem[] }>) : { items: [] }))
      .then((data) => setRecs({ key: recKey, items: data.items.slice(0, 2) }))
      .catch((error: Error) => {
        if (error.name !== 'AbortError') setRecs({ key: recKey, items: [] });
      });
    return () => controller.abort();
  }, [open, recKey, recs?.key, spaceId, date, startMinute, endMinute, seats]);

  const recItems = recs?.key === recKey ? recs.items : null;

  return (
    <SideDrawer
      open={open}
      onClose={onClose}
      title="סיכום ההזמנה"
      footer={
        <>
          <div className="mb-3 flex items-baseline justify-between">
            <span className="text-sm text-muted">סה״כ לתשלום</span>
            <RollingNumber value={price.total} className="text-2xl font-bold" />
          </div>
          <Button size="lg" className="w-full" onClick={onConfirm} disabled={navigating}>
            {navigating ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            {isLoggedIn ? 'להמשך לתשלום מאובטח' : 'התחברות והמשך לתשלום'}
          </Button>
          <p className="mt-2 flex items-center justify-center gap-1.5 text-xs text-muted">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
            המחיר הסופי מאומת בשרת · ביטול חינם עד 24 שעות לפני
          </p>
        </>
      }
    >
      <section aria-labelledby="summary-when" className="rounded-2xl border border-border bg-subtle p-4">
        <h3 id="summary-when" className="font-semibold">
          {formatDateHebrew(date)}
        </h3>
        <p className="mt-0.5 text-sm text-muted">{timeLabel}</p>
        <dl className="mt-3 space-y-1.5 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted">החלל</dt>
            <dd className="tabular-nums">{formatIls(price.base)}</dd>
          </div>
          {price.discountSource === 'auto' && (
            <div className="flex justify-between text-success">
              <dt>הנחת הזמנה ארוכה</dt>
              <dd className="tabular-nums">−{formatIls(price.discount)}</dd>
            </div>
          )}
          {price.addonLines.map((line) => (
            <div key={line.addonId} className="flex justify-between">
              <dt className="text-muted">{line.name}</dt>
              <dd className="tabular-nums">{formatIls(line.lineTotal)}</dd>
            </div>
          ))}
        </dl>
      </section>

      {addons.length > 0 && (
        <section aria-labelledby="summary-addons" className="mt-6">
          <h3 id="summary-addons" className="mb-1 font-semibold">
            להשלים את החוויה
          </h3>
          <p className="mb-3 text-xs text-muted">אופציונלי לגמרי — נוסף בלחיצה ומתעדכן בסכום מיד.</p>
          <ul className="space-y-2">
            {addons.map((addon) => {
              const on = addonIds.includes(addon.id);
              return (
                <li key={addon.id}>
                  <button
                    type="button"
                    onClick={() => onToggleAddon(addon.id)}
                    aria-pressed={on}
                    className={clsx(
                      'flex w-full items-center gap-3 rounded-xl border p-3 text-start transition-colors',
                      on ? 'border-accent bg-accent-soft' : 'border-border hover:border-border-strong',
                    )}
                  >
                    <span
                      className={clsx(
                        'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border',
                        on ? 'border-accent bg-accent text-accent-fg' : 'border-border',
                      )}
                      aria-hidden="true"
                    >
                      {on ? <Check className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">{addon.name}</span>
                      <span className="block truncate text-xs text-muted">{addon.description}</span>
                    </span>
                    <span className="shrink-0 text-sm tabular-nums">
                      {formatIls(addon.price)}
                      <span className="text-xs text-muted">{addon.pricingMode === 'perHour' ? ' / שעה' : ''}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <section aria-label="חללים נוספים פנויים" className="mt-6" aria-busy={recItems === null}>
        {recItems === null ? (
          <div className="space-y-2">
            <div className="h-4 w-32 animate-pulse rounded bg-subtle" />
            <div className="h-16 animate-pulse rounded-xl bg-subtle" />
          </div>
        ) : (
          recItems.length > 0 && (
            <>
              <h3 className="mb-1 font-semibold">
                פנוי גם בשעות שבחרתם
              </h3>
              <p className="mb-3 text-xs text-muted">הזמנה נפרדת, אותו תאריך ושעות כבר מולאו בשבילכם.</p>
              <ul className="space-y-2">
                {recItems.map((item) => (
                  <li key={item.slug}>
                    <Link href={item.href} onClick={onClose} className="flex items-center gap-3 rounded-xl border border-border p-2.5 transition-colors hover:border-border-strong">
                      <span className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-subtle">
                        {item.image && <Image src={item.image.url} alt="" fill sizes="56px" className="object-cover" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-xs font-medium text-accent-text">{item.label}</span>
                        <span className="block truncate text-sm font-semibold">{item.name}</span>
                        <span className="block truncate text-xs text-muted">
                          {item.typeLabel} · {item.place}
                        </span>
                      </span>
                      <span className="shrink-0 text-left text-xs text-muted">
                        <span className="block text-sm font-bold text-fg tabular-nums">{formatIls(item.priceFrom)}</span>
                        {item.priceUnit}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )
        )}
      </section>
    </SideDrawer>
  );
}
