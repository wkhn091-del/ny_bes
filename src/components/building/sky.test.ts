import assert from 'node:assert/strict';
import { test } from 'node:test';
import { daylightOf, skyTarget, sunPosition } from './sky';

const DEG = 180 / Math.PI;

test('summer solar noon in Tel Aviv is high in the south', () => {
  const { alt, az } = sunPosition(new Date('2026-06-21T09:45:00Z'));
  assert.ok(alt * DEG > 78 && alt * DEG < 83, `alt ${alt * DEG}`);
  assert.ok(Math.abs(az * DEG - 180) < 25, `az ${az * DEG}`);
});

test('the sun is below the horizon at midnight and in the east in the morning', () => {
  assert.ok(sunPosition(new Date('2026-06-21T21:00:00Z')).alt < 0);
  const morning = sunPosition(new Date('2026-10-05T05:00:00Z'));
  assert.ok(morning.alt > 0 && morning.az * DEG > 60 && morning.az * DEG < 130, `morning ${morning.alt * DEG} ${morning.az * DEG}`);
});

test('daylight blends through twilight and the manual modes override the clock', () => {
  assert.equal(daylightOf(-0.3), 0);
  assert.equal(daylightOf(0.5), 1);
  const dusk = daylightOf(0);
  assert.ok(dusk > 0.2 && dusk < 0.8);
  const midnight = new Date('2026-06-21T21:00:00Z');
  assert.equal(skyTarget('day', midnight).day, 1);
  assert.equal(skyTarget('night', new Date('2026-06-21T09:45:00Z')).day, 0);
  assert.equal(skyTarget('auto', midnight).day, 0);
});
