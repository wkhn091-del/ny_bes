import Link from 'next/link';
import { Logo } from '@/components/brand/Logo';
import { getSessionUser, getStaffContext, getUserProfile } from '@/lib/server/auth';
import { getFavoriteIds } from '@/lib/server/favorites';
import { NavbarClient } from './NavbarClient';

export async function Navbar() {
  const user = await getSessionUser();
  const [profile, staff, favoriteIds] = user
    ? await Promise.all([getUserProfile(user.id), getStaffContext(), getFavoriteIds(user.id)])
    : [null, null, [] as string[]];
  const displayName = profile?.fullName || user?.email?.split('@')[0] || '';

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-bg/80 backdrop-blur-md supports-[backdrop-filter]:bg-bg/70">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:right-4 focus:top-3 focus:z-50 focus:rounded-md focus:bg-accent focus:px-3 focus:py-2 focus:text-accent-fg"
      >
        דילוג לתוכן הראשי
      </a>
      <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6" aria-label="ניווט ראשי">
        <Link href="/" className="text-fg">
          <Logo />
        </Link>
        <NavbarClient
          user={user ? { displayName, avatarUrl: user.avatarUrl, isStaff: Boolean(staff) } : null}
          favoriteIds={favoriteIds}
        />
      </nav>
    </header>
  );
}
