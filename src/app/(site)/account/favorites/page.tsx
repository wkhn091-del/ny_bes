import type { Metadata } from 'next';
import { SpaceCard } from '@/components/spaces/SpaceCard';
import { ButtonLink } from '@/components/ui/Button';
import { getCatalog } from '@/lib/content/catalog';
import { requireUser } from '@/lib/server/auth';
import { getFavoriteIds } from '@/lib/server/favorites';

export const metadata: Metadata = { title: 'מועדפים', robots: { index: false } };

export default async function FavoritesPage() {
  const user = await requireUser('/account/favorites');
  const [ids, catalog] = await Promise.all([getFavoriteIds(user.id), getCatalog()]);
  const branches = new Map(catalog.branches.map((b) => [b.id, b]));
  const spaces = ids
    .map((id) => catalog.spaces.find((s) => s.id === id))
    .filter((s): s is NonNullable<typeof s> => Boolean(s && branches.has(s.branchId)));

  return (
    <div>
      <h1 className="text-3xl font-bold tracking-tight">מועדפים</h1>
      <p className="mt-1 text-sm text-muted">חללים ששמרתם בלחיצה על הלב.</p>

      {spaces.length === 0 ? (
        <div className="mt-8 rounded-xl border border-dashed border-border-strong p-8 text-center text-sm text-muted">
          עדיין לא שמרתם חללים. לחצו על הלב בכרטיס של חלל כדי לשמור אותו כאן.
          <div className="mt-4">
            <ButtonLink href="/spaces" size="sm">
              לכל החללים
            </ButtonLink>
          </div>
        </div>
      ) : (
        <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {spaces.map((s) => (
            <SpaceCard key={s.id} space={s} branch={branches.get(s.branchId)!} />
          ))}
        </div>
      )}
    </div>
  );
}
