import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import sharp from 'sharp';
import { sanitizeReviewImage } from './review-images';

async function jpegWithExif(): Promise<Buffer> {
  return sharp({ create: { width: 64, height: 48, channels: 3, background: '#3366cc' } })
    .jpeg()
    .withExif({ IFD0: { Make: 'SecretPhone', Copyright: 'home address 12' } })
    .toBuffer();
}

describe('sanitizeReviewImage', () => {
  it('re-encodes to webp with a random name and no EXIF', async () => {
    const input = await jpegWithExif();
    assert.ok((await sharp(input).metadata()).exif, 'fixture should carry EXIF');

    const out = await sanitizeReviewImage(new File([new Uint8Array(input)], 'IMG_0001.jpg', { type: 'image/jpeg' }));
    assert.ok(out);
    assert.equal(out.contentType, 'image/webp');
    assert.match(out.filename, /^[0-9a-f-]{36}\.webp$/);
    const meta = await sharp(out.buffer).metadata();
    assert.equal(meta.format, 'webp');
    assert.equal(meta.exif, undefined);
    assert.equal(meta.icc, undefined);
  });

  it('rejects an SVG renamed to .jpg', async () => {
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>');
    assert.equal(await sanitizeReviewImage(new File([svg], 'cat.jpg', { type: 'image/jpeg' })), null);
  });

  it('rejects a truncated jpeg', async () => {
    const input = await jpegWithExif();
    const broken = input.subarray(0, 40);
    assert.equal(await sanitizeReviewImage(new File([new Uint8Array(broken)], 'x.jpg')), null);
  });

  it('rejects files over the size cap', async () => {
    const big = new Uint8Array(1_600_000);
    big.set([0xff, 0xd8, 0xff, 0xe0]);
    assert.equal(await sanitizeReviewImage(new File([big], 'big.jpg')), null);
  });
});
