export type SniffedImage = 'jpeg' | 'png' | 'webp';

export const REVIEW_PHOTO_MAX_BYTES = 1_500_000;
export const REVIEW_PHOTO_MAX_COUNT = 3;
/** Pixel budget guards against decompression bombs (a tiny file that decodes to gigabytes). */
export const REVIEW_PHOTO_MAX_PIXELS = 40_000_000;

/** Identifies the real format from the file's leading bytes; the declared MIME type and extension are ignored. */
export function sniffImage(bytes: Uint8Array): SniffedImage | null {
  if (bytes.length < 12) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg';
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'png';
  }
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.subarray(from, to));
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'webp';
  return null;
}
