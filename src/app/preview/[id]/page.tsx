import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { requirePermission } from '@/lib/auth/guards';
import { getPageForPreview } from '@/lib/services/pages';
import { getWebsiteSettings } from '@/lib/services/settings';
import { getNavigations, getPrimaryNavigation } from '@/lib/services/navigation';
import { SectionList } from '@/components/cms/section-renderer';
import { SiteHeader } from '@/components/public/site-header';
import { SiteFooter } from '@/components/public/site-footer';

export const metadata: Metadata = {
  title: 'Preview',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

/**
 * The page body shown inside the preview iframe.
 *
 * It lives outside /admin so it inherits only the root layout — no admin
 * sidebar inside the frame — and renders through the same SectionList and site
 * chrome as the public route, making a preview a true representation rather
 * than an approximation.
 *
 * Draft content is visible here and nowhere else: the public route still
 * applies the publish gate, middleware requires a session for /preview, and
 * robots.txt disallows it.
 */
export default async function PreviewRender({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission('pages.view');
  const { id } = await params;

  const page = await getPageForPreview(id);
  if (!page) notFound();

  const [site, nav, footerMenus, legalMenus] = await Promise.all([
    getWebsiteSettings(),
    getPrimaryNavigation(),
    getNavigations('FOOTER'),
    getNavigations('LEGAL'),
  ]);

  return (
    <>
      {page.showHeader ? (
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
      ) : null}

      <main>
        <SectionList sections={page.sections} />
      </main>

      {page.showFooter ? (
        <SiteFooter settings={site} columns={footerMenus} legal={legalMenus[0]?.items ?? []} />
      ) : null}
    </>
  );
}
