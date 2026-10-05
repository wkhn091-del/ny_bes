import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  AVENUE_HALF,
  AVENUE_Z,
  LANES,
  RIVER,
  ROAD_HALF,
  SIDE_X,
  SIGNAL_CYCLE,
  approachSpeed,
  gridStrips,
  junctionExit,
  junctionStopLine,
  mustStop,
  nearGrid,
  signalAt,
} from './roads';

test('grid streets continue the signalled streets, stay out of the river and off the blocked areas', () => {
  const blocked = (x: number, z: number) => Math.abs(x) < 50 && Math.abs(z) < 30;
  const strips = gridStrips(blocked);
  assert.ok(strips.length > 20);
  for (const s of strips) {
    assert.ok(s.to > s.from);
    for (let t = s.from + 1; t < s.to; t += 5) {
      const [x, z] = s.axis === 'x' ? [t, s.at] : [s.at, t];
      assert.ok(!(z > RIVER.z1 && z < RIVER.z0), `strip in river at ${x},${z}`);
      assert.ok(!blocked(x, z), `strip in blocked area at ${x},${z}`);
      if (s.axis === 'z' && Math.abs(x) < ROAD_HALF) assert.ok(Math.abs(z - AVENUE_Z) > AVENUE_HALF, `strip over the avenue at ${x},${z}`);
    }
  }
  assert.ok(strips.some((s) => s.axis === 'z' && s.at === SIDE_X && s.to > ROAD_HALF), 'side street continues south');
  assert.ok(strips.some((s) => s.axis === 'x' && s.at === AVENUE_Z && s.from < -ROAD_HALF), 'avenue continues west');
  assert.ok(nearGrid(SIDE_X + 150, 300, 0));
});

test('the two roads are never green or yellow at the same time, with an all-red pause between them', () => {
  let sawAllRed = 0;
  for (let t = 0; t < SIGNAL_CYCLE * 2; t += 0.1) {
    const s = signalAt(t);
    assert.ok(s.avenue === 'red' || s.side === 'red', `conflict at ${t}: ${JSON.stringify(s)}`);
    if (s.avenue === 'red' && s.side === 'red') sawAllRed++;
  }
  assert.ok(sawAllRed > 0);
  assert.deepEqual(signalAt(0), { avenue: 'green', side: 'red' });
  assert.deepEqual(signalAt(-1), signalAt(SIGNAL_CYCLE - 1));
});

test('each road goes green, then yellow, then red', () => {
  const order: string[] = [];
  for (let t = 0; t < SIGNAL_CYCLE; t += 0.25) {
    const l = signalAt(t).side;
    if (order.at(-1) !== l) order.push(l);
  }
  assert.deepEqual(order, ['red', 'green', 'yellow', 'red']);
});

test('stop lines sit before the junction and the exit beyond it, in the direction of travel', () => {
  for (const lane of LANES) {
    const stop = junctionStopLine(lane);
    const exit = junctionExit(lane);
    assert.ok((exit - stop) * lane.dir > 0, `lane ${JSON.stringify(lane)}`);
  }
});

test('cars stop for red, run a yellow only when too close to stop comfortably, and ignore green', () => {
  assert.equal(mustStop('green', 20, 14), false);
  assert.equal(mustStop('red', 30, 14), true);
  assert.equal(mustStop('red', 1, 14), false);
  assert.equal(mustStop('yellow', 60, 14), true);
  assert.equal(mustStop('yellow', 8, 14), false);
  assert.equal(approachSpeed(2.6), 0);
  assert.ok(approachSpeed(20) > 10);
});
