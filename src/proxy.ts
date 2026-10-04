import { NextResponse, type NextRequest } from 'next/server';
import { buildAppCsp, buildStudioCsp } from '@/lib/security/csp';
import { refreshSupabaseSession } from '@/lib/supabase/proxy-session';

const PROTECTED_PREFIXES = ['/checkout', '/account', '/admin'];
const PRIVATE_PREFIXES = ['/checkout', '/account', '/admin', '/login', '/auth'];

function matchesPrefix(pathname: string, prefixes: string[]): boolean {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (pathname === '/studio' || pathname.startsWith('/studio/')) {
    const response = NextResponse.next();
    response.headers.set('Content-Security-Policy', buildStudioCsp());
    response.headers.set('Cache-Control', 'private, no-store');
    return response;
  }

  const session = await refreshSupabaseSession(request);

  // First layer only: every protected page and Server Action re-checks the session on the server.
  if (matchesPrefix(pathname, PROTECTED_PREFIXES) && !session.userId) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.search = '';
    loginUrl.searchParams.set('returnUrl', `${pathname}${search}`);
    const redirect = NextResponse.redirect(loginUrl);
    redirect.headers.set('Cache-Control', 'private, no-store, max-age=0');
    return session.applyTo(redirect);
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const csp = buildAppCsp(nonce);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', csp);
  if (matchesPrefix(pathname, PRIVATE_PREFIXES)) {
    response.headers.set('Cache-Control', 'private, no-store, max-age=0');
  }
  return session.applyTo(response);
}

export const config = {
  matcher: [
    {
      source: '/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|images/|.*\\.(?:png|jpg|jpeg|svg|webp|ico|txt)$).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
