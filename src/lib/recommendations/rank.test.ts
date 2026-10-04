import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SEED_BRANCHES, SEED_SPACES } from '@/content/seed-data';
import { rankRecommendations } from './rank';

const meeting = SEED_SPACES.find((s) => s.type === 'meetingRoom')!;

describe('rankRecommendations', () => {
  it('never recommends the space itself', () => {
    const recs = rankRecommendations({ target: meeting, spaces: SEED_SPACES, branches: SEED_BRANCHES, coBookings: new Map(), limit: 10 });
    assert.ok(recs.every((r) => r.space.id !== meeting.id));
  });

  it('suggests a same-branch complement first when there is no co-booking data', () => {
    const [first] = rankRecommendations({ target: meeting, spaces: SEED_SPACES, branches: SEED_BRANCHES, coBookings: new Map() });
    assert.ok(first);
    assert.equal(first.reason, 'complement');
    assert.equal(first.space.branchId, meeting.branchId);
    assert.equal(first.space.type, 'hotDesk');
  });

  it('puts real co-booking signals above rules and shows the true count', () => {
    const other = SEED_SPACES.find((s) => s.branchId !== meeting.branchId)!;
    const [first] = rankRecommendations({
      target: meeting,
      spaces: SEED_SPACES,
      branches: SEED_BRANCHES,
      coBookings: new Map([[other.id, 7]]),
    });
    assert.equal(first?.space.id, other.id);
    assert.equal(first?.reason, 'coBooked');
    assert.match(first?.label ?? '', /^7 לקוחות/);
  });

  it('ignores co-booking counts below the k-anonymity floor', () => {
    const other = SEED_SPACES.find((s) => s.branchId !== meeting.branchId && s.type !== meeting.type)!;
    const recs = rankRecommendations({ target: meeting, spaces: SEED_SPACES, branches: SEED_BRANCHES, coBookings: new Map([[other.id, 2]]), limit: 10 });
    assert.ok(recs.every((r) => r.reason !== 'coBooked'));
  });

  it('drops candidates that are not bookable for the slot (sold out)', () => {
    const recs = rankRecommendations({
      target: meeting,
      spaces: SEED_SPACES,
      branches: SEED_BRANCHES,
      coBookings: new Map(),
      isBookable: (space) => space.type !== 'hotDesk',
      limit: 10,
    });
    assert.ok(recs.length > 0);
    assert.ok(recs.every((r) => r.space.type !== 'hotDesk'));
  });

  it('only recommends spaces present in the published catalog list', () => {
    const visible = SEED_SPACES.filter((s) => s.type !== 'privateOffice');
    const recs = rankRecommendations({ target: meeting, spaces: visible, branches: SEED_BRANCHES, coBookings: new Map(), limit: 10 });
    assert.ok(recs.every((r) => visible.includes(r.space)));
  });
});
