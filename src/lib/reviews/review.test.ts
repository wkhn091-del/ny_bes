import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { sniffImage } from '@/lib/security/image-guard';
import { cleanReviewText, reviewFieldsSchema, reviewerDisplayName, summarizeRatings } from './review';

const valid = { spaceId: 'space-tlv-rothschild-meeting-small', rating: '5', text: 'חדר שקט ונקי, המסך עבד מהרגע הראשון והצוות היה נחמד.' };

describe('review validation', () => {
  it('accepts a normal review', () => {
    const parsed = reviewFieldsSchema.safeParse(valid);
    assert.ok(parsed.success);
    assert.equal(parsed.data.rating, 5);
  });

  it('rejects out-of-range ratings and short text', () => {
    assert.equal(reviewFieldsSchema.safeParse({ ...valid, rating: '6' }).success, false);
    assert.equal(reviewFieldsSchema.safeParse({ ...valid, rating: '0' }).success, false);
    assert.equal(reviewFieldsSchema.safeParse({ ...valid, text: 'קצר מדי' }).success, false);
  });

  it('rejects overlong text', () => {
    assert.equal(reviewFieldsSchema.safeParse({ ...valid, text: 'א'.repeat(1001) }).success, false);
  });

  it('rejects a filled honeypot', () => {
    assert.equal(reviewFieldsSchema.safeParse({ ...valid, website: 'http://spam' }).success, false);
  });

  it('rejects ids that could break out of a query', () => {
    assert.equal(reviewFieldsSchema.safeParse({ ...valid, spaceId: 'x" || true' }).success, false);
  });

  it('keeps HTML as inert text and strips bidi overrides', () => {
    const text = cleanReviewText('<img src=x onerror=alert(1)> \u202Eטקסט הפוך');
    assert.ok(text.includes('<img'));
    assert.ok(!text.includes('\u202E'));
  });
});

describe('reviewerDisplayName', () => {
  it('shows first name and last initial only', () => {
    assert.equal(reviewerDisplayName('דנה  כהן'), 'דנה כ.');
    assert.equal(reviewerDisplayName('Avi'), 'Avi');
    assert.equal(reviewerDisplayName(''), 'לקוח/ה מאומת/ת');
  });
});

describe('summarizeRatings', () => {
  it('averages to one decimal and ignores invalid values', () => {
    const s = summarizeRatings([5, 4, 4, 9, 0]);
    assert.equal(s.count, 3);
    assert.equal(s.average, 4.3);
    assert.deepEqual(s.distribution, [0, 0, 0, 2, 1]);
  });
});

describe('sniffImage', () => {
  const pad = (head: number[]) => new Uint8Array([...head, ...new Array(16).fill(0)]);
  it('detects real formats by magic bytes', () => {
    assert.equal(sniffImage(pad([0xff, 0xd8, 0xff, 0xe0])), 'jpeg');
    assert.equal(sniffImage(pad([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), 'png');
    const webp = new TextEncoder().encode('RIFF\0\0\0\0WEBPVP8 ');
    assert.equal(sniffImage(webp), 'webp');
  });

  it('rejects disguised files', () => {
    assert.equal(sniffImage(new TextEncoder().encode('<svg onload=alert(1)></svg>')), null);
    assert.equal(sniffImage(new TextEncoder().encode('GIF89a..........')), null);
    assert.equal(sniffImage(new Uint8Array([0xff, 0xd8])), null);
  });
});
