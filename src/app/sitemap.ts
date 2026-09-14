import type { MetadataRoute } from 'next';
import { prisma } from '@/lib/db/prisma';
import { getSeoSettings } from '@/lib/services/settings';
import { publishedPageWhere } from '@/lib/services/pages';
import { publishedPostWhere } from '@/lib/services/blog';
import { listActiveCountries } from '@/lib/country/registry';
import { countryPath } from '@/lib/country/routing';
import { siteUrl } from '@/lib/env';

// Rendered per request: the image is built without a database, so anything
// baked in at build time would ship empty.
export const dynamic = 'force-dynamic';

/**
 * One sitemap covering every active market.
 *
 * Each URL is emitted with its own market prefix, so the root market keeps the
 * exact URLs it has always had and every other market contributes its own. The
 * markets are read from the database, so a new market appears here as soon as
 * it has published content — no code change, no second sitemap route to
 * remember.
 *
 * Only content that is genuinely indexable is listed: published, not soft
 * deleted, and not marked noindex. A market that is deactivated drops out
 * entirely, because it no longer serves public traffic.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const seo = await getSeoSettings().catch(() => null);
  if (seo && !seo.sitemapEnabled) return [];

  try {
    const countries = await listActiveCountries();

    const [pages, products, posts, categories, tags, blogSettings] = await Promise.all([
      prisma.page.findMany({
        where: { ...publishedPageWhere(), noIndex: false },
        select: { slug: true, countryId: true, updatedAt: true, isHomepage: true },
      }),
      prisma.productCountry.findMany({
        where: {
          noIndex: false,
          status: 'PUBLISHED',
          OR: [{ publishedAt: null }, { publishedAt: { lte: new Date() } }],
          product: { deletedAt: null, noIndex: false },
        },
        select: { countryId: true, updatedAt: true, product: { select: { slug: true } } },
      }),
      prisma.blogPost.findMany({
        where: { ...publishedPostWhere(), noIndex: false },
        select: { slug: true, countryId: true, updatedAt: true },
      }),
      prisma.blogCategory.findMany({
        where: { isActive: true, noIndex: false, posts: { some: publishedPostWhere() } },
        select: { slug: true, updatedAt: true, posts: { select: { countryId: true }, distinct: ['countryId'] } },
      }),
      prisma.blogTag.findMany({
        where: { isActive: true, noIndex: false, posts: { some: { post: publishedPostWhere() } } },
        select: {
          slug: true,
          updatedAt: true,
          createdAt: true,
          posts: { select: { post: { select: { countryId: true } } } },
        },
      }),
      prisma.blogSettings.findUnique({
        where: { id: 'singleton' },
        select: { noIndex: true },
      }),
    ]);

    const byId = new Map(countries.map((country) => [country.id, country]));
    const url = (countryId: string, path: string): string | null => {
      const country = byId.get(countryId);
      if (!country) return null;
      return `${base}${countryPath(country, path)}`.replace(/\/$/, '') || base;
    };

    const entries: MetadataRoute.Sitemap = [];

    for (const page of pages) {
      const href = url(page.countryId, page.slug);
      if (!href) continue;
      entries.push({
        url: href,
        lastModified: page.updatedAt,
        changeFrequency: 'weekly',
        priority: page.isHomepage || page.slug === '' ? 1 : 0.8,
      });
    }

    // The archive drops out of the sitemap when it is set to noindex.
    if (!blogSettings?.noIndex) {
      for (const country of countries) {
        entries.push({
          url: `${base}${countryPath(country, 'blog')}`,
          lastModified: posts.find((post) => post.countryId === country.id)?.updatedAt ?? new Date(),
          changeFrequency: 'daily',
          priority: 0.7,
        });
      }
    }

    for (const row of products) {
      const href = url(row.countryId, `products/${row.product.slug}`);
      if (!href) continue;
      entries.push({
        url: href,
        lastModified: row.updatedAt,
        changeFrequency: 'weekly',
        priority: 0.9,
      });
    }

    for (const category of categories) {
      for (const { countryId } of category.posts) {
        const href = url(countryId, `blog/category/${category.slug}`);
        if (!href) continue;
        entries.push({
          url: href,
          lastModified: category.updatedAt,
          changeFrequency: 'weekly',
          priority: 0.5,
        });
      }
    }

    for (const tag of tags) {
      const countryIds = new Set(tag.posts.map((row) => row.post.countryId));
      for (const countryId of countryIds) {
        const href = url(countryId, `blog/tag/${tag.slug}`);
        if (!href) continue;
        entries.push({
          url: href,
          lastModified: tag.updatedAt ?? tag.createdAt,
          changeFrequency: 'weekly',
          priority: 0.4,
        });
      }
    }

    for (const post of posts) {
      const href = url(post.countryId, `blog/${post.slug}`);
      if (!href) continue;
      entries.push({
        url: href,
        lastModified: post.updatedAt,
        changeFrequency: 'monthly',
        priority: 0.6,
      });
    }

    return entries;
  } catch (error) {
    console.error('[sitemap] generation failed', error);
    return [{ url: base, lastModified: new Date(), priority: 1 }];
  }
}
