import { AccountNav } from '@/components/account/AccountNav';
import { UserAvatar } from '@/components/account/UserAvatar';
import { getUserProfile, requireUser } from '@/lib/server/auth';
import { initialsOf } from '@/stores/user';

/** Every page below also calls requireUser itself: layouts do not re-run on client-side navigation. */
export default async function AccountLayout({ children }: LayoutProps<'/account'>) {
  const user = await requireUser('/account');
  const profile = await getUserProfile(user.id);
  const name = profile?.fullName || user.email.split('@')[0] || '';

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:py-12">
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="min-w-0 lg:sticky lg:top-24 lg:self-start">
          <div className="mb-4 flex items-center gap-3 px-1">
            <UserAvatar avatarUrl={user.avatarUrl} initials={initialsOf(name)} size={40} />
            <div className="min-w-0">
              <p className="truncate font-semibold">{name}</p>
              <p className="truncate text-xs text-muted" dir="ltr">
                {user.email}
              </p>
            </div>
          </div>
          <AccountNav />
        </aside>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}
