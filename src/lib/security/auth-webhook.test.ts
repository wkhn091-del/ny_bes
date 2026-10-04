import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { signAuthWebhook, verifyAuthWebhook, WEBHOOK_TOLERANCE_SECONDS } from './auth-webhook';

const SECRET = 'test-secret-that-is-at-least-32-characters-long';
const ID = '6f1c2d3e-4b5a-4c7d-8e9f-0a1b2c3d4e5f';
const USER = '11111111-2222-4333-8444-555555555555';
const NOW = 1_790_000_000_000;
const TS = String(Math.floor(NOW / 1000));
const BODY = JSON.stringify({ id: ID, type: 'user.updated', userId: USER, occurredAt: '2026-10-04T00:00:00Z' });

function verify(overrides: Partial<Parameters<typeof verifyAuthWebhook>[0]> = {}) {
  return verifyAuthWebhook({
    secret: SECRET,
    id: ID,
    timestamp: TS,
    signature: signAuthWebhook(SECRET, ID, TS, BODY),
    body: BODY,
    now: NOW,
    ...overrides,
  });
}

describe('verifyAuthWebhook', () => {
  it('accepts a correctly signed, fresh event', () => {
    const result = verify();
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.event.type, 'user.updated');
  });

  it('rejects a tampered body', () => {
    const result = verify({ body: BODY.replace('user.updated', 'user.deleted') });
    assert.deepEqual(result, { ok: false, reason: 'signature' });
  });

  it('rejects a signature made with another secret', () => {
    const result = verify({ signature: signAuthWebhook('another-secret-another-secret-123456', ID, TS, BODY) });
    assert.deepEqual(result, { ok: false, reason: 'signature' });
  });

  it('rejects replays outside the tolerance window', () => {
    const result = verify({ now: NOW + (WEBHOOK_TOLERANCE_SECONDS + 1) * 1000 });
    assert.deepEqual(result, { ok: false, reason: 'stale' });
  });

  it('rejects missing headers', () => {
    assert.deepEqual(verify({ signature: null }), { ok: false, reason: 'malformed' });
    assert.deepEqual(verify({ timestamp: 'abc' }), { ok: false, reason: 'malformed' });
  });

  it('rejects a body whose id differs from the signed header id', () => {
    const otherId = '00000000-0000-4000-8000-000000000000';
    const result = verify({ id: otherId, signature: signAuthWebhook(SECRET, otherId, TS, BODY) });
    assert.deepEqual(result, { ok: false, reason: 'malformed' });
  });

  it('accepts one of several signatures during rotation', () => {
    const good = signAuthWebhook(SECRET, ID, TS, BODY);
    const result = verify({ signature: `v1,AAAA ${good}` });
    assert.equal(result.ok, true);
  });
});
