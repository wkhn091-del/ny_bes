import 'server-only';
import { headers } from 'next/headers';

export async function getClientIp(): Promise<string> {
  const h = await headers();
  const forwarded = h.get('x-forwarded-for');
  const candidate = forwarded?.split(',')[0]?.trim() || h.get('x-real-ip') || '0.0.0.0';
  return candidate.slice(0, 64);
}

export function getClientIpFromRequest(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  const candidate = forwarded?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || '0.0.0.0';
  return candidate.slice(0, 64);
}
