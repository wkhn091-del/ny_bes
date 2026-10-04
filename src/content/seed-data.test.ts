import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { isRender } from '@/lib/domain/images';
import { SEED_BRANCHES, SEED_SETTINGS, SEED_SPACES } from './seed-data';

describe('seed images', () => {
  const spaceImages = SEED_SPACES.flatMap((s) => s.images.map((img) => ({ space: s.slug, img })));

  it('never shows the same image for two different spaces', () => {
    const owner = new Map<string, string>();
    for (const { space, img } of spaceImages) {
      const prev = owner.get(img.url);
      assert.ok(!prev || prev === space, `${img.url} is used by ${prev} and ${space}`);
      owner.set(img.url, space);
    }
  });

  it('labels every render as an illustration and ships the file locally', () => {
    const all = [...spaceImages.map((x) => x.img), ...SEED_BRANCHES.flatMap((b) => [b.image, ...b.gallery])];
    for (const img of all) {
      assert.ok(isRender(img), `${img.url} is not a local render`);
      assert.match(img.alt, /\(הדמיה\)$/);
      assert.ok(existsSync(join(process.cwd(), 'public', img.url)), `missing file ${img.url}`);
    }
  });

  it('branch galleries only show that branch’s own spaces', () => {
    for (const branch of SEED_BRANCHES) {
      const own = new Set(SEED_SPACES.filter((s) => s.branchId === branch.id).flatMap((s) => s.images.map((i) => i.url)));
      for (const img of [branch.image, ...branch.gallery]) assert.ok(own.has(img.url), `${branch.slug} shows ${img.url}`);
    }
  });

  it('has no hotlinked stock images', () => {
    assert.ok(!JSON.stringify([SEED_SPACES, SEED_BRANCHES, SEED_SETTINGS]).includes('unsplash'));
  });
});
