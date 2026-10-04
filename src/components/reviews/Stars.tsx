import { clsx } from 'clsx';
import { Star } from 'lucide-react';

export function Stars({ value, size = 'sm', label }: { value: number; size?: 'sm' | 'md'; label?: string }) {
  const rounded = Math.round(value * 2) / 2;
  return (
    <span className="inline-flex items-center gap-0.5" role="img" aria-label={label ?? `${value} מתוך 5 כוכבים`}>
      {[1, 2, 3, 4, 5].map((i) => {
        const fill = rounded >= i ? 'full' : rounded >= i - 0.5 ? 'half' : 'none';
        return (
          <span key={i} className={clsx('relative inline-block', size === 'sm' ? 'h-4 w-4' : 'h-5 w-5')} aria-hidden="true">
            <Star className="absolute inset-0 h-full w-full text-border-strong" />
            {fill !== 'none' && (
              <span className={clsx('absolute inset-y-0 right-0 overflow-hidden', fill === 'half' ? 'w-1/2' : 'w-full')}>
                <Star className={clsx('absolute right-0 top-0 fill-warning text-warning', size === 'sm' ? 'h-4 w-4' : 'h-5 w-5')} />
              </span>
            )}
          </span>
        );
      })}
    </span>
  );
}
