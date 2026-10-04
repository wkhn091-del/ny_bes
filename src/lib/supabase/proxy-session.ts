import { createServerClient, type CookieOptions } from '@supabase/ssr';
import type { NextRequest, NextResponse } from 'next/server';
import { hardenCookie, hardenedCookieOptions } from './cookie-options';

interface PendingCookie {
  name: string;
  value: string;
  options: CookieOptions;
}

export interface ProxySessionResult {
  userId: string | null;
  applyTo: (response: NextResponse) => NextResponse;
}

/**
 * Refreshes the Supabase session cookies. Mutates `request.cookies` so downstream
 * Server Components see the refreshed tokens, and returns a function that copies the
 * Set-Cookie headers onto whatever response the proxy finally builds.
 */
export async function refreshSupabaseSession(request: NextRequest): Promise<ProxySessionResult> {
  const pending: PendingCookie[] = [];
  const pendingHeaders: Record<string, string> = {};
  const applyTo = (response: NextResponse) => {
    for (const { name, value, options } of pending) {
      response.cookies.set(name, value, hardenCookie(options));
    }
    for (const [key, value] of Object.entries(pendingHeaders)) {
      response.headers.set(key, value);
    }
    return response;
  };

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return { userId: null, applyTo };

  const supabase = createServerClient(url, anonKey, {
    cookieOptions: hardenedCookieOptions,
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const cookie of cookiesToSet) {
          request.cookies.set(cookie.name, cookie.value);
          pending.push(cookie);
        }
        Object.assign(pendingHeaders, headers ?? {});
      },
    },
  });

  try {
    const { data } = await supabase.auth.getClaims();
    const sub = data?.claims?.sub;
    return { userId: typeof sub === 'string' ? sub : null, applyTo };
  } catch {
    return { userId: null, applyTo };
  }
}
