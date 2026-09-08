import type { MetadataRoute } from 'next';
import { prisma } from '@/lib/db/prisma';
import { getSeoSettings } from '@/lib/services/settings';
import { publishedPageWhere } from '@/lib/services/pages';
import { publishedPostWhere } from '@/lib/services/blog';
import { publishedProductWhere } from '@/lib/services/products';
import { siteUrl } from '@/lib/env';

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const seo = await getSeoSettings().catch(() => null);
  if (seo && !seo.sitemapEnabled) return [];

  try {
    const [pages, products, posts, categories] = await Promise.all([
      prisma.page.findMany({
        where: { ...publishedPageWhere, noIndex: false },
        select: { slug: true, updatedAt: true, isHomepage: true },
      }),
      prisma.product.findMany({
        where: { ...publishedProductWhere, noIndex: false },
        select: { slug: true, updatedAt: true },
      }),
      prisma.blogPost.findMany({
        where: { ...publishedPostWhere, noIndex: false },
        select: { slug: true, updatedAt: true },
      }),
      prisma.blogCategory.findMany({
        where: { posts: { some: publishedPostWhere } },
        select: { slug: true, updatedAt: true },
      }),
    ]);

    return [
      ...pages.map((page) => ({
        url: `${base}/${page.slug}`.replace(/\/+$/, '') || base,
        lastModified: page.updatedAt,
        changeFrequency: 'weekly' as const,
        priority: page.isHomepage || page.slug === '' ? 1 : 0.8,
      })),
      {
        url: `${base}/blog`,
        lastModified: posts[0]?.updatedAt ?? new Date(),
        changeFrequency: 'daily' as const,
        priority: 0.7,
      },
      ...products.map((product) => ({
        url: `${base}/products/${product.slug}`,
        lastModified: product.updatedAt,
        changeFrequency: 'weekly' as const,
        priority: 0.9,
      })),
      ...categories.map((category) => ({
        url: `${base}/blog/category/${category.slug}`,
        lastModified: category.updatedAt,
        changeFrequency: 'weekly' as const,
        priority: 0.5,
      })),
      ...posts.map((post) => ({
        url: `${base}/blog/${post.slug}`,
        lastModified: post.updatedAt,
        changeFrequency: 'monthly' as const,
        priority: 0.6,
      })),
    ];
  } catch (error) {
    console.error('[sitemap] generation failed', error);
    return [{ url: base, lastModified: new Date(), priority: 1 }];
  }
}
