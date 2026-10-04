import { HEBREW_DAY_NAMES } from '@/lib/domain/time';
import type { DayHours } from '@/lib/domain/types';

export function BranchHours({ hours }: { hours: DayHours[] }) {
  const sorted = [...hours].sort((a, b) => a.day - b.day);
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
      {sorted.map((h) => (
        <div key={h.day} className="contents">
          <dt className="text-muted">יום {HEBREW_DAY_NAMES[h.day]}</dt>
          <dd className="tabular-nums">{h.closed ? 'סגור' : `${h.open}–${h.close}`}</dd>
        </div>
      ))}
    </dl>
  );
}
