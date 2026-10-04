import { SPACE_TYPE_LABELS, type Branch, type Space, type SpaceType } from '@/lib/domain/types';

export type RecommendationReason = 'coBooked' | 'complement' | 'alternative';

export interface Recommendation {
  space: Space;
  branch: Branch;
  reason: RecommendationReason;
  /** honest, data-backed explanation shown to the customer */
  label: string;
  score: number;
}

/** What naturally goes with what, inside the same branch (the customer is already coming there). */
const COMPLEMENTS: Record<SpaceType, { type: SpaceType; label: string }[]> = {
  meetingRoom: [{ type: 'hotDesk', label: 'מגיעים מוקדם? עמדה לשעה לפני או אחרי הפגישה' }],
  privateOffice: [{ type: 'meetingRoom', label: 'כשמגיעים לקוחות — חדר ישיבות באותו סניף' }],
  hotDesk: [
    { type: 'privateOffice', label: 'צריכים שקט לשיחה? משרד סגור באותו סניף' },
    { type: 'meetingRoom', label: 'פגישה באמצע היום? חדר ישיבות באותו סניף' },
  ],
};

export function rankRecommendations(input: {
  target: Space;
  spaces: Space[];
  branches: Branch[];
  /** space id → distinct customers who booked both (already k-anonymised server-side) */
  coBookings: Map<string, number>;
  /** optional: drop candidates that cannot be booked for the customer's slot */
  isBookable?: (space: Space, branch: Branch) => boolean;
  limit?: number;
}): Recommendation[] {
  const { target, spaces, coBookings, isBookable, limit = 3 } = input;
  const branchById = new Map(input.branches.map((b) => [b.id, b]));
  const targetBranch = branchById.get(target.branchId);
  if (!targetBranch) return [];

  const best = new Map<string, Recommendation>();
  const offer = (rec: Recommendation) => {
    const existing = best.get(rec.space.id);
    if (!existing || existing.score < rec.score) best.set(rec.space.id, rec);
  };

  for (const space of spaces) {
    if (space.id === target.id) continue;
    const branch = branchById.get(space.branchId);
    if (!branch) continue;

    const customers = coBookings.get(space.id);
    if (customers && customers >= 3) {
      offer({ space, branch, reason: 'coBooked', label: `${customers} לקוחות שהזמינו את החלל הזה הזמינו גם אותו`, score: 100 + customers });
    }

    if (branch.id === targetBranch.id) {
      const complement = COMPLEMENTS[target.type].find((c) => c.type === space.type);
      if (complement) offer({ space, branch, reason: 'complement', label: complement.label, score: 50 - space.hourlyPrice / 100_000 });
    }

    if (space.type === target.type && branch.id !== targetBranch.id && branch.city.id === targetBranch.city.id) {
      offer({
        space,
        branch,
        reason: 'alternative',
        label: `${SPACE_TYPE_LABELS[space.type]} גם בסניף ${branch.name}`,
        score: 20 - Math.abs(space.capacity - target.capacity) / 100,
      });
    }
  }

  return [...best.values()]
    .filter((r) => !isBookable || isBookable(r.space, r.branch))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
