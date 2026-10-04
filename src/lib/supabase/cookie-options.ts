import type { CookieOptions } from '@supabase/ssr';

/**
 * The session cookie is re-issued on every token refresh (≈ hourly while active), so a 30-day
 * max-age means "signed out after 30 days without activity". The access token itself is short-lived.
 */
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

export const hardenedCookieOptions: CookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/',
  maxAge: SESSION_MAX_AGE_SECONDS,
};

/** Forces the security flags on every cookie write while keeping the library's maxAge (0 = delete). */
export function hardenCookie<T extends CookieOptions>(options: T | undefined): CookieOptions {
  return {
    ...options,
    httpOnly: hardenedCookieOptions.httpOnly,
    secure: hardenedCookieOptions.secure,
    sameSite: hardenedCookieOptions.sameSite,
    path: hardenedCookieOptions.path,
  };
}
