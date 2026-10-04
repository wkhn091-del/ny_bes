export const publicEnv = {
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000',
  sanityProjectId: process.env.NEXT_PUBLIC_SANITY_PROJECT_ID || '',
  sanityDataset: process.env.NEXT_PUBLIC_SANITY_DATASET || 'production',
  sanityApiVersion: process.env.NEXT_PUBLIC_SANITY_API_VERSION || '2026-10-01',
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
  turnstileSiteKey: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || '',
  sentryDsn: process.env.NEXT_PUBLIC_SENTRY_DSN || '',
  ga4Id: /^G-[A-Z0-9]{4,16}$/.test(process.env.NEXT_PUBLIC_GA4_ID ?? '') ? process.env.NEXT_PUBLIC_GA4_ID! : '',
} as const;

export const isSupabasePublicConfigured = Boolean(publicEnv.supabaseUrl && publicEnv.supabaseAnonKey);
