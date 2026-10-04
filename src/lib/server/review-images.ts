import 'server-only';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { REVIEW_PHOTO_MAX_BYTES, REVIEW_PHOTO_MAX_PIXELS, sniffImage } from '@/lib/security/image-guard';

export interface CleanImage {
  buffer: Buffer;
  filename: string;
  contentType: 'image/webp';
}

/**
 * Accepts only real JPEG/PNG/WebP (by magic bytes), re-encodes to WebP, which drops EXIF/GPS/XMP/ICC metadata
 * (sharp keeps none unless asked), applies the EXIF orientation first, caps dimensions and assigns a random name.
 */
export async function sanitizeReviewImage(file: File): Promise<CleanImage | null> {
  if (file.size === 0 || file.size > REVIEW_PHOTO_MAX_BYTES) return null;
  const input = Buffer.from(await file.arrayBuffer());
  if (!sniffImage(input)) return null;
  try {
    const buffer = await sharp(input, { limitInputPixels: REVIEW_PHOTO_MAX_PIXELS, failOn: 'error', animated: false })
      .rotate()
      .resize(1600, 1600, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();
    return { buffer, filename: `${randomUUID()}.webp`, contentType: 'image/webp' };
  } catch {
    return null;
  }
}
