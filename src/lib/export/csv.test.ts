import { test } from 'node:test';
import assert from 'node:assert/strict';
import { csvCell, toCsv } from './csv';

test('formula-looking text is neutralised with a leading apostrophe', () => {
  for (const payload of ['=HYPERLINK("http://x","y")', '+1+1', '-2+3', '@SUM(A1)', '\t=1']) {
    assert.ok(csvCell(payload).startsWith(`"'`), payload);
  }
});

test('negative numbers stay numeric', () => {
  assert.equal(csvCell(-12.5), '"-12.5"');
});

test('quotes are doubled and newlines flattened', () => {
  assert.equal(csvCell('a "b"\nc'), '"a ""b"" c"');
});

test('LRM is added to LTR columns after the formula guard', () => {
  assert.equal(csvCell('AB12CD34', true), '"\u200EAB12CD34"');
  assert.equal(csvCell('=1', true), `"\u200E'=1"`);
});

test('toCsv writes BOM, header and CRLF rows', () => {
  const out = toCsv([{ header: 'קוד', value: (r: { c: string }) => r.c, ltr: true }], [{ c: 'X1' }]);
  assert.equal(out, '\uFEFF"קוד"\r\n"\u200EX1"\r\n');
});
