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

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/admin', '/admin/', '/api/', '/login', '/preview'],
      },
    ],
    sitemap: seo?.sitemapEnabled === false ? undefined : `${base}/sitemap.xml`,
    host: base,
  };
}
