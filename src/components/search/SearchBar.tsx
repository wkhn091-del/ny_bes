'use client';

import { CalendarDays, MapPin, Search, Users } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { buttonClasses } from '@/components/ui/Button';
import type { City } from '@/lib/domain/types';

interface Props {
  cities: City[];
  minDate: string;
  maxDate: string;
  defaultDate: string;
}

const fieldWrap =
  'flex flex-1 flex-col gap-1 rounded-xl px-4 py-2.5 transition-colors focus-within:bg-subtle hover:bg-subtle';
const labelCls = 'flex items-center gap-1.5 text-xs font-semibold text-fg';
const inputCls = 'w-full bg-transparent text-sm text-fg outline-none placeholder:text-muted';

export function SearchBar({ cities, minDate, maxDate, defaultDate }: Props) {
  const router = useRouter();
  const [city, setCity] = useState('');
  const [date, setDate] = useState(defaultDate);
  const [people, setPeople] = useState(1);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams();
    if (city) params.set('city', city);
    if (date >= minDate && date <= maxDate) params.set('date', date);
    if (people > 1) params.set('people', String(people));
    router.push(`/spaces${params.size ? `?${params}` : ''}`);
  }

  return (
    <form
      onSubmit={onSubmit}
      role="search"
      aria-label="חיפוש חלל עבודה"
      className="grid w-full grid-cols-2 gap-1 rounded-2xl border border-border bg-card p-2 shadow-xl shadow-black/5 md:flex md:flex-row md:items-center md:rounded-full md:p-1.5"
    >
      <label className={`${fieldWrap} col-span-2 md:rounded-full`}>
        <span className={labelCls}>
          <MapPin className="h-3.5 w-3.5 text-accent-text" aria-hidden="true" />
          עיר
        </span>
        <select value={city} onChange={(e) => setCity(e.target.value)} className={`${inputCls} cursor-pointer`}>
          <option value="">כל הערים</option>
          {cities.map((c) => (
            <option key={c.id} value={c.slug}>
              {c.name}
            </option>
          ))}
        </select>
      </label>

      <span className="hidden h-8 w-px bg-border md:block" aria-hidden="true" />

      <label className={`${fieldWrap} md:rounded-full`}>
        <span className={labelCls}>
          <CalendarDays className="h-3.5 w-3.5 text-accent-text" aria-hidden="true" />
          תאריך
        </span>
        <input
          type="date"
          value={date}
          min={minDate}
          max={maxDate}
          onChange={(e) => setDate(e.target.value)}
          className={`${inputCls} cursor-pointer`}
          required
        />
      </label>

      <span className="hidden h-8 w-px bg-border md:block" aria-hidden="true" />

      <label className={`${fieldWrap} md:rounded-full`}>
        <span className={labelCls}>
          <Users className="h-3.5 w-3.5 text-accent-text" aria-hidden="true" />
          מספר אנשים
        </span>
        <input
          type="number"
          inputMode="numeric"
          min={1}
          max={50}
          value={people}
          onChange={(e) => setPeople(Math.min(50, Math.max(1, Number(e.target.value) || 1)))}
          className={inputCls}
        />
      </label>

      <button type="submit" className={buttonClasses('primary', 'lg', 'glow-accent col-span-2 md:rounded-full md:px-7')}>
        <Search className="h-4 w-4" aria-hidden="true" />
        חיפוש
      </button>
    </form>
  );
}
