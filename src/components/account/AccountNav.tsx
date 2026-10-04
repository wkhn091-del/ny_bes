'use client';

import { clsx } from 'clsx';
import { CalendarDays, Gift, Heart, LayoutDashboard, ShieldCheck, UserRound } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const ITEMS = [
  { href: '/account', label: 'סקירה', icon: LayoutDashboard, exact: true },
  { href: '/account/bookings', label: 'ההזמנות שלי', icon: CalendarDays },
  { href: '/account/favorites', label: 'מועדפים', icon: Heart },
  { href: '/account/rewards', label: 'נקודות מועדון', icon: Gift },
  { href: '/account/profile', label: 'פרטים וחשבונית', icon: UserRound },
  { href: '/account/security', label: 'אבטחה', icon: ShieldCheck },
] as const;

export function AccountNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="ניווט האזור האישי" className="-mx-4 overflow-x-auto px-4 lg:mx-0 lg:overflow-visible lg:px-0">
      <ul className="flex gap-1 lg:flex-col">
        {ITEMS.map((item) => {
          const active = 'exact' in item ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <li key={item.href} className="shrink-0">
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={clsx(
                  'flex items-center gap-2.5 whitespace-nowrap rounded-lg px-3 py-2 text-sm transition-colors',
                  active ? 'bg-accent-soft font-semibold text-accent-text' : 'text-muted hover:bg-subtle hover:text-fg',
                )}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
