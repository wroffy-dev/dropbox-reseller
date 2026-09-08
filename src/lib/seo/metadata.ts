import 'server-only';
import type { Metadata } from 'next';
import { getSeoSettings, getWebsiteSettings } from '@/lib/services/settings';
import { siteUrl } from '@/lib/env';

export type SeoInput = {
  title?: string | null;
  description?: string | null;
  path?: string;
  canonicalUrl?: string | null;
  noIndex?: boolean;
  noFollow?: boolean;
  ogTitle?: string | null;
  ogDescription?: string | null;
  ogImageUrl?: string | null;
  twitterTitle?: string | null;
  twitterDescription?: string | null;
  twitterImageUrl?: string | null;
  type?: 'website' | 'article' | 'product';
  publishedTime?: Date | null;
  modifiedTime?: Date | null;
  authorName?: string | null;
};

export function absoluteUrl(path = '/'): string {
  if (/^https?:\/\//i.test(path)) return path;
  return `${siteUrl()}${path.startsWith('/') ? path : `/${path}`}`;
}

/**
 * Merges entity SEO values over the global defaults from Admin → SEO.
 * Entity values always win; empty entity values fall back to the defaults.
 */
export async function buildMetadata(input: SeoInput): Promise<Metadata> {
  const [seo, site] = await Promise.all([getSeoSettings(), getWebsiteSettings()]);

  const rawTitle = input.title?.trim() || seo.defaultTitle;
  const title =
    input.title && seo.titleTemplate.includes('%s')
      ? seo.titleTemplate.replace('%s', rawTitle)
      : rawTitle;

  const description = input.description?.trim() || seo.defaultDescription;
  const canonical = input.canonicalUrl?.trim() || absoluteUrl(input.path ?? '/');
  const ogImage = input.ogImageUrl || seo.defaultOgImageUrl || site.ogImageUrl || null;

  const noIndex = seo.noIndexSite || Boolean(input.noIndex);

  return {
    metadataBase: new URL(siteUrl()),
    title,
    description,
    alternates: { canonical },
    robots: {
      index: !noIndex,
      follow: !input.noFollow,
      googleBot: { index: !noIndex, follow: !input.noFollow },
    },
    openGraph: {
      type: input.type === 'product' ? 'website' : input.type ?? 'website',
      title: input.ogTitle?.trim() || title,
      description: input.ogDescription?.trim() || description,
      url: canonical,
      siteName: site.siteName,
      images: ogImage ? [{ url: absoluteUrl(ogImage) }] : undefined,
      ...(input.type === 'article'
        ? {
            publishedTime: input.publishedTime?.toISOString(),
            modifiedTime: input.modifiedTime?.toISOString(),
            authors: input.authorName ? [input.authorName] : undefined,
          }
        : {}),
    },
    twitter: {
      card: ogImage ? 'summary_large_image' : 'summary',
      title: input.twitterTitle?.trim() || input.ogTitle?.trim() || title,
      description: input.twitterDescription?.trim() || input.ogDescription?.trim() || description,
      site: seo.twitterHandle || undefined,
      images: input.twitterImageUrl
        ? [absoluteUrl(input.twitterImageUrl)]
        : ogImage
          ? [absoluteUrl(ogImage)]
          : undefined,
    },
    verification: {
      google: seo.googleSiteVerification || undefined,
      other: seo.bingSiteVerification ? { 'msvalidate.01': seo.bingSiteVerification } : undefined,
    },
  };
}
