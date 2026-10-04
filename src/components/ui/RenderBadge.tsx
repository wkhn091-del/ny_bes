import { clsx } from 'clsx';
import { isRender } from '@/lib/domain/images';
import type { ImageRef } from '@/lib/domain/types';

/** Visible "illustration" label over render images; the alt text carries the same wording for screen readers. */
export function RenderBadge({ image, className }: { image: Pick<ImageRef, 'url' | 'alt'> | null | undefined; className?: string }) {
  if (!isRender(image)) return null;
  return (
    <span
      aria-hidden="true"
      className={clsx(
        'pointer-events-none absolute z-10 rounded-md bg-black/60 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur-sm',
        className ?? 'bottom-2 left-2',
      )}
    >
      הדמיה
    </span>
  );
}
