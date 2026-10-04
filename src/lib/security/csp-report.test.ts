import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCspReports } from './csp-report';

test('legacy reports are scrubbed of query strings and paths', () => {
  const body = JSON.stringify({
    'csp-report': {
      'effective-directive': 'script-src-elem',
      'blocked-uri': 'https://evil.example/x.js?token=secret',
      'document-uri': 'https://spacehub.co.il/checkout?session=abc',
    },
  });
  assert.deepEqual(parseCspReports('application/csp-report', body), [
    { directive: 'script-src-elem', blocked: 'https://evil.example', page: '/checkout' },
  ]);
});

test('Reporting API batches keep only csp-violation entries', () => {
  const body = JSON.stringify([
    {
      type: 'csp-violation',
      body: { effectiveDirective: 'img-src', blockedURL: 'data:image/png;base64,AAA', documentURL: 'https://spacehub.co.il/' },
    },
    { type: 'deprecation', body: {} },
  ]);
  assert.deepEqual(parseCspReports('application/reports+json', body), [{ directive: 'img-src', blocked: 'data', page: '/' }]);
});

test('malformed, unknown or oversized batches are dropped', () => {
  assert.deepEqual(parseCspReports('application/csp-report', '{not json'), []);
  assert.deepEqual(parseCspReports('text/plain', '{}'), []);
  assert.deepEqual(parseCspReports('application/reports+json', JSON.stringify(new Array(50).fill({ type: 'x' }))), []);
});
