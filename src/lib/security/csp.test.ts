import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildAppCsp } from './csp';

function directive(csp: string, name: string): string[] {
  const entry = csp.split('; ').find((part) => part.startsWith(`${name} `) || part === name);
  return entry ? entry.split(' ').slice(1) : [];
}

test('production script-src is nonce-locked without eval or inline', () => {
  const env = process.env as Record<string, string | undefined>;
  const previous = env.NODE_ENV;
  env.NODE_ENV = 'production';
  try {
    const csp = buildAppCsp('abc123');
    const scripts = directive(csp, 'script-src');
    assert.ok(scripts.includes("'nonce-abc123'"));
    assert.ok(scripts.includes("'strict-dynamic'"));
    assert.ok(!scripts.includes("'unsafe-eval'"));
    assert.ok(!scripts.includes("'unsafe-inline'"));
    assert.deepEqual(directive(csp, 'worker-src'), ["'self'", 'blob:']);
    assert.deepEqual(directive(csp, 'object-src'), ["'none'"]);
    assert.deepEqual(directive(csp, 'frame-ancestors'), ["'none'"]);
    assert.ok(csp.includes('upgrade-insecure-requests'));
  } finally {
    env.NODE_ENV = previous;
  }
});
