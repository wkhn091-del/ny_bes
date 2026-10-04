import { getCatalog } from '@/lib/content/catalog';
import { publicEnv } from '@/lib/env.public';

export const revalidate = 86400;

/** RFC 9116. Expires is regenerated daily and kept under one year ahead, as the RFC recommends. */
export async function GET() {
  const base = publicEnv.siteUrl.replace(/\/$/, '');
  const { settings } = await getCatalog();
  const expires = new Date(Date.now() + 180 * 24 * 60 * 60 * 1000);
  expires.setUTCHours(0, 0, 0, 0);

  const body = [
    `Contact: mailto:${settings.legal.email}`,
    `Expires: ${expires.toISOString()}`,
    'Preferred-Languages: he, en',
    `Canonical: ${base}/.well-known/security.txt`,
    '',
  ].join('\n');

  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=86400' },
  });
}
