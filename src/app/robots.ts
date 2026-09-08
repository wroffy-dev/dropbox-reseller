import type { MetadataRoute } from 'next';
import { getSeoSettings } from '@/lib/services/settings';
import { siteUrl } from '@/lib/env';

export const revalidate = 3600;

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
        disallow: ['/admin', '/admin/', '/api/', '/login', '/preview', ...extra],
      },
    ],
    sitemap: seo?.sitemapEnabled === false ? undefined : `${base}/sitemap.xml`,
    host: base,
  };
}
