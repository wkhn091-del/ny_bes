'use client';

import { ChevronLeft, ChevronRight, Images, X } from 'lucide-react';
import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';
import { RenderBadge } from '@/components/ui/RenderBadge';
import type { ImageRef } from '@/lib/domain/types';

export function Gallery({ images, title }: { images: ImageRef[]; title: string }) {
  const [open, setOpen] = useState<number | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const count = images.length;

  const show = useCallback((i: number) => setOpen(((i % count) + count) % count), [count]);
  const close = useCallback(() => setOpen(null), []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open !== null && !dialog.open) dialog.showModal();
    if (open === null && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    if (open === null) return;
    const onKey = (e: KeyboardEvent) => {
      // RTL: the left arrow moves forward.
      if (e.key === 'ArrowLeft') show(open + 1);
      if (e.key === 'ArrowRight') show(open - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, show]);

  if (count === 0) return null;
  const [main, ...rest] = images;

  return (
    <>
      <div className="relative grid h-[280px] gap-2 overflow-hidden rounded-2xl sm:h-[420px] sm:grid-cols-4 sm:grid-rows-2">
        <button type="button" onClick={() => show(0)} className="relative sm:col-span-2 sm:row-span-2" aria-label={`הגדלת תמונה: ${main.alt}`}>
          <Image src={main.url} alt={main.alt} fill priority sizes="(min-width: 640px) 50vw, 100vw" className="object-cover transition-opacity hover:opacity-95" />
          <RenderBadge image={main} className="bottom-3 right-3" />
        </button>
        {rest.slice(0, 4).map((img, i) => (
          <button
            key={`${img.url}-${i}`}
            type="button"
            onClick={() => show(i + 1)}
            className="relative hidden sm:block"
            aria-label={`הגדלת תמונה: ${img.alt}`}
          >
            <Image src={img.url} alt={img.alt} fill sizes="25vw" className="object-cover transition-opacity hover:opacity-90" />
            <RenderBadge image={img} className="bottom-2 right-2" />
          </button>
        ))}
        {count > 1 && (
          <button
            type="button"
            onClick={() => show(0)}
            className="absolute bottom-3 left-3 flex items-center gap-1.5 rounded-lg border border-border bg-bg/90 px-3 py-1.5 text-xs font-semibold backdrop-blur"
          >
            <Images className="h-3.5 w-3.5" aria-hidden="true" />
            כל {count} התמונות
          </button>
        )}
      </div>

      <dialog
        ref={dialogRef}
        onClose={close}
        onClick={(e) => e.target === dialogRef.current && close()}
        aria-label={`גלריית תמונות: ${title}`}
        className="m-0 h-dvh max-h-none w-screen max-w-none bg-black/95 p-0 text-white backdrop:bg-black/80"
      >
        {open !== null && (
          <div className="relative flex h-full w-full items-center justify-center p-4 sm:p-12">
            <div className="relative h-full w-full max-w-5xl">
              <Image src={images[open].url} alt={images[open].alt} fill sizes="100vw" className="object-contain" />
              <RenderBadge image={images[open]} className="right-2 top-2" />
            </div>
            <p className="absolute bottom-4 inset-x-0 text-center text-sm opacity-80">
              {images[open].alt} · {open + 1}/{count}
            </p>
            <button type="button" onClick={close} className="absolute right-4 top-4 rounded-full bg-white/10 p-2 hover:bg-white/20" aria-label="סגירת הגלריה">
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
            {count > 1 && (
              <>
                <button type="button" onClick={() => show(open - 1)} className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2 hover:bg-white/20" aria-label="התמונה הקודמת">
                  <ChevronRight className="h-6 w-6" aria-hidden="true" />
                </button>
                <button type="button" onClick={() => show(open + 1)} className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2 hover:bg-white/20" aria-label="התמונה הבאה">
                  <ChevronLeft className="h-6 w-6" aria-hidden="true" />
                </button>
              </>
            )}
          </div>
        )}
      </dialog>
    </>
  );
}
