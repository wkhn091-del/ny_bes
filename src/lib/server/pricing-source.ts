import 'server-only';
import { z } from 'zod';
import { SEED_ADDONS, SEED_BRANCHES, SEED_SETTINGS, SEED_SPACES } from '@/content/seed-data';
import { isConfigured } from '@/lib/env.server';
import { logError } from '@/lib/logger';
import { SPACE_TYPES, type DayHours, type SpaceType } from '@/lib/domain/types';
import type { PricingAddon, PricingSettings } from '@/lib/domain/pricing';
import { getSanityFreshClient } from '@/sanity/lib/client';
import { PRICING_SOURCE_QUERY } from '@/sanity/lib/queries';

export interface PricingSource {
  space: {
    id: string;
    name: string;
    type: SpaceType;
    branchId: string;
    capacity: number;
    hourlyPrice: number;
    dayPassPrice: number | null;
    poolSize: number | null;
  };
  branch: { id: string; name: string; hours: DayHours[] };
  addons: (PricingAddon & { spaceTypes: SpaceType[] })[];
  settings: PricingSettings;
}

const hours = z.array(
  z.object({ day: z.number().int(), closed: z.boolean(), open: z.string(), close: z.string() }),
);

const sourceSchema = z.object({
  space: z
    .object({
      id: z.string(),
      name: z.string(),
      type: z.enum(SPACE_TYPES),
      branchId: z.string(),
      capacity: z.number().int().positive(),
      hourlyPrice: z.number().int().nonnegative(),
      dayPassPrice: z.number().int().nonnegative().nullable(),
      poolSize: z.number().int().positive().nullable(),
      branch: z.object({ id: z.string(), name: z.string(), hours }),
    })
    .nullable(),
  addons: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      price: z.number().int().nonnegative(),
      pricingMode: z.enum(['perBooking', 'perHour']),
      spaceTypes: z.array(z.enum(SPACE_TYPES)),
    }),
  ),
  settings: z
    .object({
      vatRate: z.number().min(0).max(0.5),
      autoDiscountMinHours: z.number().min(1),
      autoDiscountPercent: z.number().min(0).max(50),
    })
    .nullable(),
});

/**
 * Loads prices fresh from Sanity (no CDN, no cache) — the only price source used to charge.
 * Returns null when the space does not exist or is inactive.
 */
export async function loadPricingSource(spaceId: string, addonIds: string[]): Promise<PricingSource | null> {
  if (!isConfigured.sanity()) {
    const space = SEED_SPACES.find((s) => s.id === spaceId);
    const branch = space && SEED_BRANCHES.find((b) => b.id === space.branchId);
    if (!space || !branch) return null;
    return {
      space: {
        id: space.id,
        name: space.name,
        type: space.type,
        branchId: space.branchId,
        capacity: space.capacity,
        hourlyPrice: space.hourlyPrice,
        dayPassPrice: space.dayPassPrice,
        poolSize: space.poolSize,
      },
      branch: { id: branch.id, name: branch.name, hours: branch.hours },
      addons: SEED_ADDONS.filter((a) => addonIds.includes(a.id)),
      settings: {
        vatRate: SEED_SETTINGS.vatRate,
        autoDiscountMinHours: SEED_SETTINGS.autoDiscountMinHours,
        autoDiscountPercent: SEED_SETTINGS.autoDiscountPercent,
      },
    };
  }

  const raw = await getSanityFreshClient().fetch(PRICING_SOURCE_QUERY, { spaceId, addonIds }, { cache: 'no-store' });
  const parsed = sourceSchema.safeParse(raw);
  if (!parsed.success) {
    logError('pricing-source', new Error('Invalid pricing source'), {
      issues: parsed.error.issues.slice(0, 5).map((i) => i.path.join('.')).join(','),
    });
    throw new Error('Pricing source unavailable');
  }
  const { space, addons, settings } = parsed.data;
  if (!space || !settings) return null;
  const { branch, ...spaceFields } = space;
  return { space: spaceFields, branch, addons, settings };
}
