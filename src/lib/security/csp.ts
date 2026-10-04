function originOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

function compact(policy: Record<string, (string | null | false | undefined)[]>): string {
  return Object.entries(policy)
    .map(([directive, sources]) => {
      const values = sources.filter(Boolean);
      return values.length > 0 ? `${directive} ${values.join(' ')}` : directive;
    })
    .join('; ');
}

export function buildAppCsp(nonce: string): string {
  const isDev = process.env.NODE_ENV === 'development';
  const supabase = originOf(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const sentryIngest = originOf(process.env.NEXT_PUBLIC_SENTRY_DSN);
  // GA4 hosts are allowed only when a measurement id is configured; the script itself still loads only after consent.
  const ga4 = /^G-[A-Z0-9]{4,16}$/.test(process.env.NEXT_PUBLIC_GA4_ID ?? '');

  const policy: Record<string, (string | null | false | undefined)[]> = {
    'default-src': ["'self'"],
    // 'wasm-unsafe-eval' only permits compiling WebAssembly (the self-hosted Draco decoder for the 3D map), not JS eval.
    'script-src': ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", "'wasm-unsafe-eval'", isDev && "'unsafe-eval'"],
    // Framer Motion and React `style` props emit inline style attributes; scripts stay nonce-locked.
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': [
      "'self'",
      'data:',
      'blob:',
      'https://images.unsplash.com',
      'https://cdn.sanity.io',
      ga4 && 'https://*.google-analytics.com',
      ga4 && 'https://www.googletagmanager.com',
    ],
    'font-src': ["'self'"],
    'connect-src': [
      "'self'",
      supabase,
      sentryIngest,
      'https://challenges.cloudflare.com',
      'https://vitals.vercel-insights.com',
      ga4 && 'https://*.google-analytics.com',
      ga4 && 'https://*.analytics.google.com',
      ga4 && 'https://www.googletagmanager.com',
      isDev && 'ws:',
    ],
    'frame-src': ['https://challenges.cloudflare.com'],
    'worker-src': ["'self'", 'blob:'],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    // Google sign-in: the form posts to us, then redirects via Supabase to Google (form-action covers redirects).
    'form-action': ["'self'", 'https://checkout.stripe.com', supabase, 'https://accounts.google.com'],
    'frame-ancestors': ["'none'"],
    // `report-to` for Reporting-API browsers (endpoint declared in next.config headers); `report-uri` for Firefox.
    'report-uri': ['/api/csp-report'],
    'report-to': ['csp'],
  };
  if (!isDev) policy['upgrade-insecure-requests'] = [];
  return compact(policy);
}

export function buildStudioCsp(): string {
  return compact({
    'default-src': ["'self'"],
    'script-src': ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
    'style-src': ["'self'", "'unsafe-inline'"],
    'img-src': ["'self'", 'data:', 'blob:', 'https://cdn.sanity.io', 'https://images.unsplash.com', 'https://lh3.googleusercontent.com'],
    'font-src': ["'self'", 'data:'],
    'connect-src': ["'self'", 'https://*.sanity.io', 'wss://*.sanity.io', 'https://*.api.sanity.io', 'wss://*.api.sanity.io'],
    'frame-src': ["'self'"],
    'worker-src': ["'self'", 'blob:'],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'frame-ancestors': ["'self'"],
  });
}
