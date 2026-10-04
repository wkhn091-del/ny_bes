const ALLOWED_RETURN_PREFIXES = ['/spaces', '/checkout', '/account', '/admin', '/branches'] as const;

/**
 * Validates a post-login return URL against an allowlist of internal paths.
 * Anything else (absolute URLs, protocol-relative URLs, backslashes, control
 * characters) collapses to the home page to prevent open redirects.
 */
export function safeReturnUrl(raw: string | null | undefined, fallback = '/'): string {
  if (!raw || typeof raw !== 'string' || raw.length > 512) return fallback;
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return fallback;
  }
  if (!decoded.startsWith('/') || decoded.startsWith('//') || decoded.includes('\\')) return fallback;
  if (/[\u0000-\u001f\u007f]/.test(decoded)) return fallback;

  let parsed: URL;
  try {
    parsed = new URL(decoded, 'http://internal.invalid');
  } catch {
    return fallback;
  }
  if (parsed.origin !== 'http://internal.invalid') return fallback;

  const path = parsed.pathname;
  if (path === '/') return '/' + parsed.search;
  const allowed = ALLOWED_RETURN_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
  return allowed ? `${path}${parsed.search}` : fallback;
}
