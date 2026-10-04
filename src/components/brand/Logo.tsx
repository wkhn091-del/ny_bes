import { clsx } from 'clsx';

/** Typographic wordmark + a 2×2 "floor plan" mark where one cell is lit — an available space. */
export function Logo({ className, withWordmark = true }: { className?: string; withWordmark?: boolean }) {
  return (
    <span className={clsx('inline-flex items-center gap-2', className)} dir="ltr">
      <svg width="26" height="26" viewBox="0 0 26 26" fill="none" aria-hidden="true" className="shrink-0">
        <rect x="1" y="1" width="11" height="11" rx="2.5" stroke="currentColor" strokeWidth="2" />
        <rect x="14" y="1" width="11" height="11" rx="2.5" fill="#7C3AED" />
        <rect x="1" y="14" width="11" height="11" rx="2.5" stroke="currentColor" strokeWidth="2" />
        <rect x="14" y="14" width="11" height="11" rx="2.5" stroke="currentColor" strokeWidth="2" />
      </svg>
      {withWordmark && (
        <span className="text-[1.15rem] font-black tracking-[-0.04em] leading-none">
          Space<span className="text-accent-text">Hub</span>
        </span>
      )}
      <span className="sr-only">SpaceHub — דף הבית</span>
    </span>
  );
}
