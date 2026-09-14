import type { CountryContext } from './types';

/**
 * The country routing engine.
 *
 * Everything in this module is pure and free of Next.js and Prisma, so the
 * rules that decide "which market is this URL in?" and "what does this link
 * look like in that market?" can be unit-tested on their own and reused on the
 * server, in the browser and in the admin.
 *
 * Two invariants hold everywhere:
 *
 *   - the default market owns the site root, so its URLs never gain a prefix
 *     and the original single-country URLs keep working byte-for-byte;
 *   - a path whose first segment is a system route is never read as a market,
 *     so /admin, /api and the rest cannot be captured by a market prefix.
 */

/**
 * First path segments that can never be a market prefix.
 *
 * Anything the framework, the admin, authentication, uploads or a crawler owns
 * belongs here. A market whose slug collided with one of these would shadow a
 * system route, so `isReservedSegment` is also what the country form validates
 * a new slug against.
 */
export const RESERVED_SEGMENTS: ReadonlySet<string> = new Set([
  'admin',
  'api',
  '_next',
  '_vercel',
  'auth',
  'login',
  'logout',
  'preview',
  'uploads',
  'media',
  'static',
  'assets',
  'favicon.ico',
  'robots.txt',
  'sitemap.xml',
  'manifest.json',
  'health',
  'ready',
  'opensearch.xml',
  'sw.js',
]);

export function isReservedSegment(segment: string): boolean {
  const value = segment.trim().toLowerCase();
  if (!value) return false;
  // Any dotted first segment is a file, never a market.
  return RESERVED_SEGMENTS.has(value) || value.includes('.');
}

/** Splits a pathname into clean, decoded segments. */
export function pathSegments(pathname: string): string[] {
  const withoutQuery = pathname.split(/[?#]/)[0] ?? '';
  return withoutQuery
    .split('/')
    .map((segment) => segment.trim())
    .filter(Boolean);
}

/** Normalises a content path to the app's convention: leading slash, no trailing slash. */
export function normalisePath(path: string): string {
  const segments = pathSegments(path);
  return segments.length > 0 ? `/${segments.join('/')}` : '/';
}

/**
 * The public URL of `path` within `country`.
 *
 * ```
 * countryPath(india, 'dropbox-business') === '/dropbox-business'
 * countryPath(uae,   'dropbox-business') === '/ae/dropbox-business'
 * countryPath(qatar, 'dropbox-business') === '/qa/dropbox-business'
 * countryPath(uae,   '')                 === '/ae'
 * ```
 *
 * This is the only place a market prefix is ever written. Nothing else in the
 * codebase concatenates one.
 */
export function countryPath(country: Pick<CountryContext, 'slug'>, path = ''): string {
  const rest = pathSegments(path);
  const prefix = country.slug.trim().replace(/^\/+|\/+$/g, '');
  const all = prefix ? [prefix, ...rest] : rest;
  return all.length > 0 ? `/${all.join('/')}` : '/';
}

/**
 * Rewrites an internal link so it stays inside `country`.
 *
 * Left untouched: external URLs, anchors, query-only links, `mailto:`/`tel:`,
 * protocol-relative URLs, system routes, and any path that already carries a
 * market prefix. Everything else — the root-relative links an editor types
 * into a CTA — gains the current market's prefix.
 *
 * For the default market this is the identity function, which is why the root
 * market's rendered HTML is unchanged by the multi-market conversion.
 */
export function countryHref(country: CountryContext, href: string | null | undefined): string {
  if (!href) return href ?? '';
  const value = href.trim();
  if (!value) return href;
  if (country.isDefault || !country.slug) return href;

  // Not an internal path: external, anchor, query, mailto/tel, or //host.
  if (!value.startsWith('/') || value.startsWith('//')) return href;

  const [pathPart = '', ...restParts] = value.split(/(?=[?#])/);
  const suffix = restParts.join('');
  const segments = pathSegments(pathPart);
  const first = segments[0];

  if (first && isReservedSegment(first)) return href;
  // Already addressed to a market — the editor meant that market.
  if (first && (first === country.slug || country.prefixes.includes(first))) return href;

  const localised = countryPath(country, segments.join('/'));
  return `${localised}${suffix}`;
}

/**
 * Splits a public pathname into the market that owns it and the path within
 * that market.
 *
 * `countries` is the full configured list. Only active, non-default markets can
 * claim a prefix, so deactivating a market immediately stops its prefix
 * behaving like a storefront — `/qa/anything` then resolves in the default
 * market, where it will simply not be found.
 */
export function splitCountryPath(
  pathname: string,
  countries: readonly CountryContext[],
): { country: CountryContext | null; path: string; matchedPrefix: boolean } {
  const segments = pathSegments(pathname);
  const fallback = countries.find((c) => c.isDefault) ?? countries[0] ?? null;
  const first = segments[0];

  if (first && !isReservedSegment(first)) {
    const match = countries.find(
      (candidate) => candidate.slug !== '' && candidate.slug === first && candidate.isActive,
    );
    if (match) {
      return { country: match, path: normalisePath(segments.slice(1).join('/')), matchedPrefix: true };
    }
  }

  return { country: fallback, path: normalisePath(segments.join('/')), matchedPrefix: false };
}

/**
 * The content slug for a path: no leading slash, no trailing slash.
 * `""` is the homepage, matching `Page.slug`.
 */
export function contentSlug(path: string): string {
  return pathSegments(path).join('/');
}

/**
 * Deep-rewrites the internal links inside a stored CMS payload.
 *
 * Editors type plain paths (`/contact`, `/products/dropbox-business`) into
 * block content, and those paths must resolve inside the market the block is
 * rendered in. Rewriting here — once, at the render boundary — keeps every
 * block component free of market logic.
 *
 * For the default market the payload is returned by reference and nothing is
 * walked at all, so the root market's rendering path is completely unchanged.
 * System routes and already-prefixed links are left alone by `countryHref`.
 */
export function localiseContent<T>(content: T, country: CountryContext): T {
  if (country.isDefault || !country.slug) return content;
  return walk(content, country) as T;
}

/**
 * Rewrites the root-relative `href`/`src` attributes inside a fragment of
 * editor HTML so they resolve inside `country`.
 *
 * Rich text is the one place an internal link is not a field of its own, so it
 * gets the same treatment the structured fields get — and the same exemptions,
 * because every candidate still goes through `countryHref`.
 */
export function localiseHtml(html: string, country: CountryContext): string {
  if (country.isDefault || !country.slug) return html;
  if (!html.includes('/')) return html;
  return html.replace(
    /\b(href|src)=("|')(\/[^"']*)\2/gi,
    (match, attribute: string, quote: string, url: string) =>
      `${attribute}=${quote}${countryHref(country, url)}${quote}`,
  );
}

function walk(value: unknown, country: CountryContext): unknown {
  if (typeof value === 'string') {
    // A root-relative path is localised directly; anything else is prose, which
    // may still carry markup links.
    if (value.startsWith('/')) return countryHref(country, value);
    return value.includes('<') ? localiseHtml(value, country) : value;
  }
  if (Array.isArray(value)) return value.map((item) => walk(item, country));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      out[key] = walk(item, country);
    }
    return out;
  }
  return value;
}
