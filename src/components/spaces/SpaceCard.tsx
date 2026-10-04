import { Maximize2, Users } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { Badge } from '@/components/ui/Badge';
import { RenderBadge } from '@/components/ui/RenderBadge';
import { FavoriteButton } from './FavoriteButton';
import { formatIls } from '@/lib/domain/pricing';
import { SPACE_TYPE_LABELS, type Branch, type Space } from '@/lib/domain/types';

interface Props {
  space: Space;
  branch: Branch;
  /** real seats left for the searched range (hot desks only) */
  remaining?: number;
  /** real bookings in the last 7 days, shown only when meaningful */
  recentBookings?: number;
  priority?: boolean;
  /** carried to the space page, e.g. "?date=2026-10-05" */
  query?: string;
  /** honest, data-backed reason this card is recommended */
  reason?: string;
}

/** The heart is a sibling of the link (not nested) so both stay valid, separately focusable controls. */
export function SpaceCard({ space, branch, remaining, recentBookings, priority, query = '', reason }: Props) {
  const image = space.images[0];
  const capacityLabel = space.type === 'hotDesk' ? `עד ${space.capacity} עמדות בהזמנה` : `עד ${space.capacity} אנשים`;

  return (
    <div className="group relative flex flex-col transition-transform hover:-translate-y-0.5">
      <Link
        href={`/spaces/${space.slug}${query}`}
        className="flex flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-card transition-all group-hover:border-border-strong group-hover:shadow-lg group-hover:shadow-black/5"
      >
        <div className="relative aspect-[4/3] overflow-hidden bg-subtle">
          {image && (
            <Image
              src={image.url}
              alt={image.alt}
              fill
              sizes="(min-width: 1280px) 25vw, (min-width: 768px) 33vw, 100vw"
              className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
              priority={priority}
            />
          )}
          <RenderBadge image={image} />
          <div className="absolute right-3 top-3 flex gap-1.5">
            <Badge tone="neutral" className="bg-bg/90 backdrop-blur">
              {SPACE_TYPE_LABELS[space.type]}
            </Badge>
            {branch.isFlagship && (
              <Badge tone="accent" className="backdrop-blur">
                סניף הדגל
              </Badge>
            )}
          </div>
        </div>
        <div className="flex flex-1 flex-col gap-2 p-4">
          {reason && <p className="text-xs font-medium text-accent-text">{reason}</p>}
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="truncate font-semibold">{space.name}</h3>
              <p className="truncate text-sm text-muted">
                {branch.city.name} · {branch.name}
              </p>
            </div>
            <p className="shrink-0 text-left text-sm">
              <span className="font-bold">{formatIls(space.hourlyPrice)}</span>
              <span className="text-muted"> / שעה</span>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
            <span className="flex items-center gap-1">
              <Users className="h-3.5 w-3.5" aria-hidden="true" />
              {capacityLabel}
            </span>
            <span className="flex items-center gap-1">
              <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
              {space.type === 'hotDesk' ? `${space.poolSize} עמדות בסניף` : `${space.sizeSqm} מ״ר`}
            </span>
            {space.dayPassPrice !== null && <span>יום שלם {formatIls(space.dayPassPrice)}</span>}
          </div>
          {(remaining !== undefined || (recentBookings ?? 0) >= 3) && (
            <div className="mt-auto flex flex-wrap gap-1.5 pt-1">
              {remaining !== undefined && remaining <= 5 && (
                <Badge tone="warning">נותרו {remaining} עמדות בשעות שבחרתם</Badge>
              )}
              {(recentBookings ?? 0) >= 3 && <Badge tone="neutral">הוזמן {recentBookings} פעמים בשבוע האחרון</Badge>}
            </div>
          )}
        </div>
      </Link>
      <FavoriteButton spaceId={space.id} spaceName={space.name} className="absolute left-3 top-3" />
    </div>
  );
}
