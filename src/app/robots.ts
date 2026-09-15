import type { MetadataRoute } from 'next';
import { getSeoSettings } from '@/lib/services/settings';
import { siteUrl } from '@/lib/env';

// Rendered per request: the image is built without a database, so anything
// baked in at build time would ship empty.
export const dynamic = 'force-dynamic';

export default async function robots(): Promise<MetadataRoute.Robots> {
  const base = siteUrl();
  const seo = await getSeoSettings().catch(() => null);

  if (seo?.noIndexSite) {
    return { rules: [{ userAgent: '*', disallow: '/' }] };
  }

  // Admin → SEO holds extra paths to disallow, one per line. A leading
  // "Disallow:" is tolerated and stripped so the directive is never doubled up.
  const extra = (seo?.robotsTxtExtra ?? '')
    .split('\n')
    .map((line) => line.trim().replace(/^disallow:\s*/i, ''))
    .filter((line) => line.startsWith('/'));

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // The sign-in screen is deliberately absent: robots.txt is public, so
        // listing its path here would publish the one thing moving it off
        // /login was meant to keep quiet. The page carries `noindex, nofollow`
        // in its own metadata and in a response header (next.config.mjs).
        disallow: ['/admin', '/admin/', '/api/', '/preview', ...extra],
      },
    ],
    sitemap: seo?.sitemapEnabled === false ? undefined : `${base}/sitemap.xml`,
    host: base,
  };
}
