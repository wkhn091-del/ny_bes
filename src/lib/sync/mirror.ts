import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { SPACE_TYPES } from '@/lib/domain/types';
import { isValidHHMM } from '@/lib/domain/time';

/**
 * Copies the integrity-relevant subset of Sanity content (branch hours, space type and pool size)
 * into Supabase so booking constraints run inside the database. Shared by the signed Sanity
 * webhook and the seed script, so it must not import `server-only`.
 */

const hoursSchema = z
  .array(
    z.object({
      day: z.number().int().min(0).max(6),
      closed: z.boolean(),
      open: z.string().refine(isValidHHMM),
      close: z.string().refine(isValidHHMM),
    }),
  )
  .length(7);

export const mirrorSourceSchema = z.object({
  branches: z.array(
    z.object({
      id: z.string().max(128),
      slug: z.string().regex(/^[a-z0-9-]{1,96}$/),
      name: z.string().max(120),
      active: z.boolean(),
      hours: hoursSchema,
    }),
  ),
  spaces: z.array(
    z.object({
      id: z.string().max(128),
      slug: z.string().regex(/^[a-z0-9-]{1,96}$/),
      name: z.string().max(120),
      type: z.enum(SPACE_TYPES),
      branchId: z.string().max(128),
      poolSize: z.number().int().min(1).max(500).nullable(),
      active: z.boolean(),
    }),
  ),
});

export type MirrorSource = z.infer<typeof mirrorSourceSchema>;

export interface MirrorResult {
  branches: number;
  spaces: number;
  skipped: string[];
}

export async function syncMirrors(supabase: SupabaseClient, source: MirrorSource): Promise<MirrorResult> {
  const skipped: string[] = [];
  const now = new Date().toISOString();

  const branchRows = source.branches.map((b) => ({
    id: b.id,
    slug: b.slug,
    name: b.name,
    hours: b.hours,
    active: b.active,
    updated_at: now,
  }));
  if (branchRows.length > 0) {
    const { error } = await supabase.from('branches_mirror').upsert(branchRows, { onConflict: 'id' });
    if (error) throw new Error(`branches_mirror upsert failed: ${error.message}`);
  }

  const branchIds = new Set(source.branches.map((b) => b.id));
  const spaceRows = source.spaces
    .filter((s) => {
      const valid = branchIds.has(s.branchId) && (s.type === 'hotDesk') === (s.poolSize !== null);
      if (!valid) skipped.push(s.id);
      return valid;
    })
    .map((s) => ({
      id: s.id,
      branch_id: s.branchId,
      slug: s.slug,
      name: s.name,
      type: s.type,
      pool_size: s.type === 'hotDesk' ? s.poolSize : null,
      active: s.active,
      updated_at: now,
    }));
  if (spaceRows.length > 0) {
    const { error } = await supabase.from('spaces_mirror').upsert(spaceRows, { onConflict: 'id' });
    if (error) throw new Error(`spaces_mirror upsert failed: ${error.message}`);
  }

  // Deleted in Sanity → deactivate (never delete: historical bookings reference them).
  const liveSpaceIds = spaceRows.map((s) => s.id);
  const { data: existing } = await supabase.from('spaces_mirror').select('id').eq('active', true);
  const stale = (existing ?? []).map((r) => r.id as string).filter((id) => !liveSpaceIds.includes(id));
  if (stale.length > 0) {
    await supabase.from('spaces_mirror').update({ active: false, updated_at: now }).in('id', stale);
  }

  return { branches: branchRows.length, spaces: spaceRows.length, skipped };
}
