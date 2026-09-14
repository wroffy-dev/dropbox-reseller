import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { requirePermission } from '@/lib/auth/guards';
import { getPostForPreview } from '@/lib/services/blog';
import { getWebsiteSettings } from '@/lib/services/settings';
import { getNavigations, getPrimaryNavigation } from '@/lib/services/navigation';
import { BlogArticle } from '@/components/blog/blog-article';
import { SiteHeader } from '@/components/public/site-header';
import { SiteFooter } from '@/components/public/site-footer';

export const metadata: Metadata = {
  title: 'Blog preview',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

/**
 * The article body shown inside the blog preview iframe.
 *
 * It renders through the same `BlogArticle` component and the same site chrome
 * as the public route, so a preview is a true representation of the published
 * page rather than an approximation of it.
 *
 * Draft content is visible here and nowhere else: the public route still
 * applies the publish gate, middleware requires a session for /preview, and
 * robots.txt disallows it.
 */
export default async function BlogPreviewRender({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePermission('blog.view');
  const { id } = await params;

  const post = await getPostForPreview(id);
  if (!post) notFound();

  const [site, nav, footerMenus, legalMenus] = await Promise.all([
    getWebsiteSettings(),
    getPrimaryNavigation(),
    getNavigations('FOOTER'),
    getNavigations('LEGAL'),
  ]);

  return (
    <>
      <SiteHeader
        nav={nav}
        brand={{
          siteName: site.siteName,
          logoUrl: site.logoUrl,
          ctaLabel: site.headerCtaLabel,
          ctaUrl: site.headerCtaUrl,
          secondaryCtaLabel: site.headerSecondaryCtaLabel,
          secondaryCtaUrl: site.headerSecondaryCtaUrl,
          announcement:
            site.announcementEnabled && site.announcementText
              ? { text: site.announcementText, url: site.announcementUrl }
              : null,
        }}
      />

      <main>
        <BlogArticle post={post} />
      </main>

      <SiteFooter settings={site} columns={footerMenus} legal={legalMenus[0]?.items ?? []} />
    </>
  );
}
