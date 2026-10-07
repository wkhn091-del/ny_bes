'use client';

import { clsx } from 'clsx';
import { ArrowLeft, Tag, X } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import type { FloorProgram } from '@/components/three/building-model';
import { PROGRAM_TYPE, type SalesInfo } from './offers';

/**
 * "Prices and booking" while walking the tour: the real spaces behind what the visitor is looking at,
 * with live "from" prices and a link to check availability. In the residence it pitches a desk near home.
 */
export function SalesPanel({ sales, program, residence }: { sales: SalesInfo; program: FloorProgram | null; residence: boolean }) {
  const [open, setOpen] = useState(false);
  if (sales.offers.length === 0) return null;
  const here = program ? PROGRAM_TYPE[program] : null;
  const offers = here ? [...sales.offers].sort((a, b) => Number(b.type === here) - Number(a.type === here)) : sales.offers;
  const desk = sales.offers.find((o) => o.type === 'hotDesk') ?? sales.offers[0]!;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="absolute left-3 top-11 flex items-center gap-1.5 rounded-full bg-accent px-3 py-1.5 text-2xs font-semibold text-accent-fg shadow-lg transition-transform hover:scale-[1.03] active:scale-[0.97] sm:text-xs"
      >
        <Tag className="h-3.5 w-3.5" aria-hidden="true" />
        {residence ? `עמדה ליד הבית מ-${desk.from}` : 'מחירים והזמנה'}
      </button>
    );
  }

  return (
    <section
      aria-label="מחירים והזמנה"
      className="absolute left-3 top-11 z-10 w-[min(19rem,calc(100%-1.5rem))] rounded-2xl border border-white/10 bg-black/85 p-3 text-white shadow-2xl backdrop-blur-md"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-bold">{residence ? 'עובדים מהבית? יש עמדה קרוב' : 'להזמין חלל אמיתי'}</p>
          <p className="mt-0.5 text-3xs text-white/60">{residence ? 'עמדות, משרדים וחדרי ישיבות לפי שעה, בלי מנוי.' : 'ההדמיה ממחישה את סוגי החללים; ההזמנה היא בסניפים שלנו.'}</p>
        </div>
        <button type="button" onClick={() => setOpen(false)} aria-label="סגירה" className="rounded-full p-1 text-white/70 hover:bg-white/10 hover:text-white">
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
      <ul className="mt-2.5 space-y-1.5">
        {offers.map((o) => (
          <li key={o.type}>
            <Link
              href={o.href}
              className={clsx(
                'flex items-center justify-between gap-2 rounded-xl px-3 py-2 transition-colors',
                o.type === here ? 'bg-accent text-accent-fg' : 'bg-white/10 hover:bg-white/15',
              )}
            >
              <span className="min-w-0">
                <span className="block text-xs font-semibold">
                  {o.title}
                  {o.type === here && <span className="ms-1.5 text-3xs font-medium opacity-80">· כמו בקומה הזו</span>}
                </span>
                <span className="block text-3xs opacity-80">
                  החל מ-{o.from} {o.unit} · {o.count} חללים
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-0.5 text-3xs font-semibold">
                לבדוק זמינות
                <ArrowLeft className="h-3 w-3" aria-hidden="true" />
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-center text-3xs text-white/55">
        מחיר סופי כולל מע״מ · ביטול חינם עד {sales.cancelHours} שעות לפני
        {sales.whatsapp && (
          <>
            {' · '}
            <a href={sales.whatsapp} target="_blank" rel="noopener noreferrer" className="font-semibold text-white/85 underline">
              שאלה בוואטסאפ
            </a>
          </>
        )}
      </p>
    </section>
  );
}
