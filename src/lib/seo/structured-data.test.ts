import { test } from 'node:test';
import assert from 'node:assert/strict';
import { serializeJsonLd } from './structured-data';

test('serializeJsonLd cannot close the script tag or open an HTML comment', () => {
  const out = serializeJsonLd({ name: '</script><script>alert(1)</script><!-- & \u2028' });
  assert.ok(!out.includes('<'));
  assert.ok(!out.includes('>'));
  assert.ok(!out.includes('&'));
  assert.ok(!out.includes('\u2028'));
  assert.equal(JSON.parse(out).name, '</script><script>alert(1)</script><!-- & \u2028');
});

test('serializeJsonLd drops undefined fields', () => {
  assert.equal(serializeJsonLd({ a: 1, b: undefined }), '{"a":1}');
});
