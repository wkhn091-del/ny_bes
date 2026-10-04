import type { MetadataRoute } from 'next';

/** Installability metadata only — no service worker, so nothing personal is ever cached offline. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'SpaceHub — חללי עבודה וחדרי ישיבות לפי שעה',
    short_name: 'SpaceHub',
    description: 'הזמנת חדרי ישיבות, משרדים ועמדות עבודה לפי שעה. זמינות בזמן אמת, מחיר סופי כולל מע״מ.',
    lang: 'he',
    dir: 'rtl',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#0b0b10',
    theme_color: '#7c3aed',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
