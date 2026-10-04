import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canCancelWithRefund, canRelease, validateSlotRequest } from './booking-rules';
import type { DayHours } from './types';

// Sunday 4 Oct 2026, 09:00 in Israel (UTC+3).
const NOW = new Date('2026-10-04T06:00:00Z');
const MONDAY = '2026-10-05';
const SATURDAY = '2026-10-10';

const hours: DayHours[] = [
  ...[0, 1, 2, 3, 4].map((day) => ({ day, closed: false, open: '08:00', close: '20:00' })),
  { day: 5, closed: false, open: '08:00', close: '13:00' },
  { day: 6, closed: true, open: '00:00', close: '00:00' },
];
const branch = { hours };
const room = { type: 'meetingRoom' as const, poolSize: null, capacity: 6 };
const desk = { type: 'hotDesk' as const, poolSize: 10, capacity: 10 };
const office = { type: 'privateOffice' as const, poolSize: null, capacity: 4 };

const req = (o: Partial<Parameters<typeof validateSlotRequest>[2]> = {}) => ({
  date: MONDAY,
  startMinute: 10 * 60,
  endMinute: 12 * 60,
  seats: 1,
  isDayPass: false,
  ...o,
});

function code(r: ReturnType<typeof validateSlotRequest>) {
  return r.ok ? 'OK' : r.code;
}

test('B1 a valid slot inside opening hours passes', () => {
  const r = validateSlotRequest(room, branch, req(), NOW);
  assert.equal(code(r), 'OK');
  assert.ok(r.ok && r.durationMinutes === 120);
});

test('B2 closed day and outside hours are rejected', () => {
  assert.equal(code(validateSlotRequest(room, branch, req({ date: SATURDAY }), NOW)), 'BRANCH_CLOSED');
  assert.equal(code(validateSlotRequest(room, branch, req({ startMinute: 19 * 60, endMinute: 21 * 60 }), NOW)), 'OUTSIDE_HOURS');
});

test('B3 minimum one hour, half-hour steps', () => {
  assert.equal(code(validateSlotRequest(room, branch, req({ endMinute: 10 * 60 + 30 }), NOW)), 'TOO_SHORT');
  assert.equal(code(validateSlotRequest(room, branch, req({ startMinute: 10 * 60 + 15 }), NOW)), 'MISALIGNED');
});

test('B4 past times and beyond the 60-day window are rejected', () => {
  assert.equal(code(validateSlotRequest(room, branch, req({ date: '2026-10-04', startMinute: 8 * 60, endMinute: 10 * 60 }), NOW)), 'IN_PAST');
  assert.equal(code(validateSlotRequest(room, branch, req({ date: '2026-10-03' }), NOW)), 'IN_PAST');
  assert.equal(code(validateSlotRequest(room, branch, req({ date: '2026-12-10' }), NOW)), 'TOO_FAR');
});

test('B5 day pass only for private offices and covers the full opening hours', () => {
  assert.equal(code(validateSlotRequest(room, branch, req({ isDayPass: true }), NOW)), 'DAY_PASS_NOT_ALLOWED');
  const r = validateSlotRequest(office, branch, req({ isDayPass: true }), NOW);
  assert.ok(r.ok && r.startMinute === 480 && r.endMinute === 1200);
});

test('B6 hot desk seats must be a whole number within the pool', () => {
  assert.equal(code(validateSlotRequest(desk, branch, req({ seats: 3 }), NOW)), 'OK');
  assert.equal(code(validateSlotRequest(desk, branch, req({ seats: 11 }), NOW)), 'INVALID_SEATS');
  assert.equal(code(validateSlotRequest(desk, branch, req({ seats: 0 }), NOW)), 'INVALID_SEATS');
  assert.equal(code(validateSlotRequest(desk, branch, req({ seats: 1.5 }), NOW)), 'INVALID_SEATS');
});

const HOUR = 3_600_000;
const booking = (startInHours: number, confirmedMinutesAgo: number | null = null, status = 'active') => ({
  status,
  start: new Date(NOW.getTime() + startInHours * HOUR),
  end: new Date(NOW.getTime() + (startInHours + 2) * HOUR),
  confirmedAt: confirmedMinutesAgo === null ? null : new Date(NOW.getTime() - confirmedMinutesAgo * 60_000),
});

test('C1 free cancellation 24 hours or more before the start', () => {
  assert.equal(canCancelWithRefund(booking(24), NOW), true);
  assert.equal(canCancelWithRefund(booking(23.9), NOW), false);
});

test('C2 5-minute grace after confirming, even close to the start', () => {
  assert.equal(canCancelWithRefund(booking(2, 4), NOW), true);
  assert.equal(canCancelWithRefund(booking(2, 6), NOW), false);
});

test('C3 no refund after the start or for a non-active booking', () => {
  assert.equal(canCancelWithRefund(booking(-1, 1), NOW), false);
  assert.equal(canCancelWithRefund(booking(48, null, 'cancelled'), NOW), false);
});

test('C4 release (no refund) only when refund is not possible and the booking has not ended', () => {
  assert.equal(canRelease(booking(5), NOW), true);
  assert.equal(canRelease(booking(48), NOW), false);
  assert.equal(canRelease(booking(-3), NOW), false);
});
