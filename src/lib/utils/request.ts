import 'server-only';
import { headers } from 'next/headers';

/** Best-effort client IP behind proxies (Coolify/Traefik set x-forwarded-for). */
export async function clientIp(): Promise<string | null> {
  const h = await headers();
  const forwarded = h.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]?.trim() ?? null;
  return h.get('x-real-ip') ?? h.get('cf-connecting-ip') ?? null;
}

export async function userAgent(): Promise<string | null> {
  const h = await headers();
  return h.get('user-agent');
}

export async function requestContext(): Promise<{ ip: string | null; userAgent: string | null }> {
  const [ip, ua] = await Promise.all([clientIp(), userAgent()]);
  return { ip, userAgent: ua };
}
