'use client';

import { clsx } from 'clsx';
import { X } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}

/** Slides in from the right (the reading start in RTL), traps focus, closes on Esc / backdrop, restores focus. */
export function SideDrawer({ open, onClose, title, children, footer }: Props) {
  const [mounted, setMounted] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  if (open && !mounted) setMounted(true);

  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const root = document.documentElement;
    const previousOverflow = root.style.overflow;
    root.style.overflow = 'hidden';
    const raf = requestAnimationFrame(() => panel?.querySelector<HTMLElement>('[data-autofocus]')?.focus());

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab' || !panel) return;
      const focusable = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('keydown', onKey);
      root.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, [open]);

  if (!mounted) return null;

  return createPortal(
    <div className={clsx('fixed inset-0 z-50', !open && 'pointer-events-none')} inert={!open}>
      <div
        className={clsx(
          'absolute inset-0 bg-black/50 backdrop-blur-[2px] transition-opacity duration-(--dur-base) ease-(--ease-out)',
          open ? 'opacity-100' : 'opacity-0',
        )}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={clsx(
          'absolute inset-y-0 right-0 flex w-[min(28rem,92vw)] flex-col border-s border-border bg-bg shadow-2xl',
          'transition-transform duration-(--dur-base) ease-(--ease-out)',
          open ? 'translate-x-0' : 'translate-x-full',
        )}
      >
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-border px-5">
          <h2 className="text-lg font-bold">{title}</h2>
          <button
            type="button"
            data-autofocus
            onClick={onClose}
            className="inline-flex h-11 w-11 items-center justify-center rounded-lg hover:bg-subtle"
            aria-label="סגירה"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>
        {footer && <div className="shrink-0 border-t border-border bg-card px-5 py-4">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
