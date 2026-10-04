import type { ImageRef } from './types';

/** Illustrative renders (not photos of the real room) live here and must be labelled as such in the UI. */
export const RENDER_PREFIX = '/images/renders/';
/** Alt-text marker that survives upload to Sanity (where the URL becomes a CDN URL). */
export const RENDER_ALT_MARKER = '(הדמיה)';

export function isRender(image: Pick<ImageRef, 'url' | 'alt'> | null | undefined): boolean {
  return !!image && (image.url.startsWith(RENDER_PREFIX) || image.alt.trim().endsWith(RENDER_ALT_MARKER));
}
