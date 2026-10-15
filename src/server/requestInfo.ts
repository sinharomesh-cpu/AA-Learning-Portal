import 'server-only';
import { headers } from 'next/headers';

/**
 * Client address for throttling (first entry of X-Forwarded-For, as set by the hosting proxy),
 * and the site's base URL for links in emails. APP_BASE_URL wins when set.
 */
export async function clientIp(): Promise<string | undefined> {
  const h = await headers();
  const forwarded = h.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || h.get('x-real-ip') || undefined;
}

export async function siteBaseUrl(): Promise<string> {
  const configured = process.env.APP_BASE_URL?.replace(/\/+$/, '');
  if (configured) return configured;
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000';
  const proto =
    h.get('x-forwarded-proto') ?? (host.startsWith('localhost') || host.startsWith('127.') ? 'http' : 'https');
  return `${proto}://${host}`;
}
