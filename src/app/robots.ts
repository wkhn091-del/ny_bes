import type { MetadataRoute } from 'next';
import { publicEnv } from '@/lib/env.public';

export default function robots(): MetadataRoute.Robots {
  const isProduction = process.env.VERCEL_ENV === 'production' || (!process.env.VERCEL_ENV && process.env.NODE_ENV === 'production');
  const base = publicEnv.siteUrl.replace(/\/$/, '');
  return {
    rules: isProduction
      ? { userAgent: '*', allow: '/', disallow: ['/account', '/checkout', '/admin', '/login', '/studio', '/api/'] }
      : { userAgent: '*', disallow: '/' },
    sitemap: `${base}/sitemap.xml`,
  };
}
