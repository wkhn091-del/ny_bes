'use client';

import { clsx } from 'clsx';
import { Building2, ChevronLeft, LayoutGrid, LogOut, Menu, Monitor, Search, Users, X, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Logo } from '@/components/brand/Logo';
import { signOut } from '@/app/actions/auth';
import { setFavorite } from '@/app/actions/account';
import { UserAvatar } from '@/components/account/UserAvatar';
import { buttonClasses } from '@/components/ui/Button';
import { PENDING_FAVORITE_KEY, useFavorites } from '@/stores/favorites';
import { initialsOf, useUserStore, type UserSummary } from '@/stores/user';
import { SmartSearch } from '@/components/search/SmartSearch';
import { ThemeToggle } from './ThemeToggle';

const LINKS: { href: string; label: string; hint: string; icon: LucideIcon }[] = [
  { href: '/spaces', label: 'כל החללים', hint: 'כל הסניפים, לפי זמינות', icon: LayoutGrid },
  { href: '/spaces?type=meetingRoom', label: 'חדרי ישיבות', hint: 'מסך, לוח וציוד וידאו', icon: Users },
  { href: '/spaces?type=privateOffice', label: 'משרדים פרטיים', hint: 'דלת סגורה, לשעה או ליום', icon: Building2 },
  { href: '/spaces?type=hotDesk', label: 'עמדות עבודה', hint: 'מתיישבים ועובדים, לפי שעה', icon: Monitor },
];

const ID_RE = /^[A-Za-z0-9._-]{1,128}$/;
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface Props {
  user: { displayName: string; avatarUrl: string | null; isStaff: boolean } | null;
  favoriteIds: string[];
}

export function NavbarClient({ user: serverUser, favoriteIds }: Props) {
  const [open, setOpen] = useState(false);
  const [drawerMounted, setDrawerMounted] = useState(false);
  const drawerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();
  const storeUser = useUserStore((s) => s.user);
  const hydrated = useUserStore((s) => s.hydrated);
  const setUser = useUserStore((s) => s.setUser);
  const hydrateFavorites = useFavorites((s) => s.hydrate);
  const markFavorite = useFavorites((s) => s.set);

  const summary: UserSummary | null = serverUser
    ? {
        displayName: serverUser.displayName,
        initials: initialsOf(serverUser.displayName),
        avatarUrl: serverUser.avatarUrl,
        isStaff: serverUser.isStaff,
      }
    : null;
  const summaryKey = JSON.stringify(summary);

  useEffect(() => {
    setUser(summaryKey === 'null' ? null : (JSON.parse(summaryKey) as UserSummary));
  }, [summaryKey, setUser]);

  const favoritesKey = favoriteIds.join(',');
  const loggedIn = Boolean(serverUser);
  useEffect(() => {
    hydrateFavorites(loggedIn, favoritesKey ? favoritesKey.split(',') : []);
  }, [loggedIn, favoritesKey, hydrateFavorites]);

  // A heart clicked while signed out: save that space once the visitor is back and signed in.
  useEffect(() => {
    if (!loggedIn) return;
    let pending: string | null = null;
    try {
      pending = sessionStorage.getItem(PENDING_FAVORITE_KEY);
      if (pending) sessionStorage.removeItem(PENDING_FAVORITE_KEY);
    } catch {
      return;
    }
    if (!pending || !ID_RE.test(pending)) return;
    const spaceId = pending;
    markFavorite(spaceId, true);
    void setFavorite({ spaceId, favorite: true }).then((result) => {
      if (!result.ok) markFavorite(spaceId, false);
    });
  }, [loggedIn, markFavorite]);

  useEffect(() => {
    if (!open) return;
    const panel = drawerRef.current;
    const trigger = triggerRef.current;
    const root = document.documentElement;
    const previousOverflow = root.style.overflow;
    root.style.overflow = 'hidden';
    panel?.querySelector<HTMLElement>('[data-autofocus]')?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
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
      document.removeEventListener('keydown', onKey);
      root.style.overflow = previousOverflow;
      trigger?.focus();
    };
  }, [open]);

  const user = hydrated ? storeUser : summary;
  const returnUrl = pathname || '/';

  const authArea = user ? (
    <div className="flex items-center gap-2">
      {user.isStaff && (
        <Link href="/admin" className={buttonClasses('ghost', 'sm')}>
          ניהול
        </Link>
      )}
      <Link href="/account" className={buttonClasses('outline', 'sm', 'max-w-[12rem] ps-1.5')}>
        <UserAvatar avatarUrl={user.avatarUrl} initials={user.initials} size={24} />
        <span className="truncate">{user.displayName || 'החשבון שלי'}</span>
      </Link>
      <form action={signOut}>
        <button type="submit" className={buttonClasses('ghost', 'sm')} aria-label="התנתקות">
          <LogOut className="h-4 w-4" aria-hidden="true" />
        </button>
      </form>
    </div>
  ) : (
    <Link href={`/login?returnUrl=${encodeURIComponent(returnUrl)}`} className={buttonClasses('secondary', 'sm')}>
      התחברות
    </Link>
  );

  return (
    <>
      <ul className="hidden items-center gap-1 lg:flex">
        {LINKS.map((link) => (
          <li key={link.href}>
            <Link href={link.href} className="rounded-md px-3 py-2 text-sm text-muted transition-colors hover:text-fg">
              {link.label}
            </Link>
          </li>
        ))}
      </ul>

      <div className="hidden items-center gap-2 lg:flex">
        <SmartSearch />
        <ThemeToggle />
        {authArea}
      </div>

      <div className="flex items-center gap-2 lg:hidden">
        <ThemeToggle />
        <button
          ref={triggerRef}
          type="button"
          onClick={() => {
            setDrawerMounted(true);
            setOpen(true);
          }}
          className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-border"
          aria-expanded={open}
          aria-controls="mobile-menu"
          aria-label="פתיחת תפריט"
        >
          <Menu className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>

      {drawerMounted &&
        createPortal(
          <div className={clsx('fixed inset-0 z-50 lg:hidden', !open && 'pointer-events-none')} inert={!open}>
            <div
              className={clsx(
                'absolute inset-0 bg-black/50 backdrop-blur-[2px] transition-opacity duration-(--dur-base) ease-(--ease-out)',
                open ? 'opacity-100' : 'opacity-0',
              )}
              onClick={() => setOpen(false)}
              aria-hidden="true"
            />
            <div
              ref={drawerRef}
              id="mobile-menu"
              role="dialog"
              aria-modal="true"
              aria-label="תפריט ראשי"
              className={clsx(
                'absolute inset-y-0 right-0 flex w-[min(22rem,88vw)] flex-col border-s border-border bg-bg shadow-2xl',
                'transition-transform duration-(--dur-base) ease-(--ease-out)',
                open ? 'translate-x-0' : 'translate-x-full',
              )}
            >
              <div className="flex h-16 shrink-0 items-center justify-between border-b border-border px-4">
                <Link href="/" onClick={() => setOpen(false)} className="text-fg">
                  <Logo />
                </Link>
                <button
                  type="button"
                  data-autofocus
                  onClick={() => setOpen(false)}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-lg hover:bg-subtle"
                  aria-label="סגירת תפריט"
                >
                  <X className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-3 py-4">
                <div className="mb-3">
                  <SmartSearch variant="drawer" onNavigate={() => setOpen(false)} />
                </div>
                <Link
                  href="/spaces"
                  onClick={() => setOpen(false)}
                  className={buttonClasses('primary', 'lg', 'mb-4 w-full justify-center')}
                >
                  <Search className="h-4 w-4" aria-hidden="true" />
                  מה פנוי עכשיו?
                </Link>
                <ul className="flex flex-col gap-1">
                  {LINKS.map((link, i) => (
                    <li
                      key={link.href}
                      className={clsx(
                        'transition-[opacity,translate] duration-(--dur-base) ease-(--ease-out)',
                        open ? 'translate-x-0 opacity-100' : 'translate-x-4 opacity-0',
                      )}
                      style={{ transitionDelay: open ? `${120 + i * 60}ms` : '0ms' }}
                    >
                      <Link
                        href={link.href}
                        onClick={() => setOpen(false)}
                        className="flex min-h-14 items-center gap-3 rounded-xl px-3 py-2 hover:bg-subtle"
                      >
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent-text">
                          <link.icon className="h-5 w-5" aria-hidden="true" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block font-semibold">{link.label}</span>
                          <span className="block text-xs text-muted">{link.hint}</span>
                        </span>
                        <ChevronLeft className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="shrink-0 border-t border-border p-4" onClick={() => setOpen(false)}>
                {authArea}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
