import { notFound } from 'next/navigation';
import Link from 'next/link';
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
 * Authenticated preview of any page, published or not.
 * Renders with the real header/footer so what you see matches the live site.
 */
export default async function PreviewPage({ params }: { params: Promise<{ id: string }> }) {
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
    <div className="min-h-screen bg-surface">
      <div className="sticky top-0 z-[60] flex flex-wrap items-center gap-3 bg-amber-500 px-4 py-2 text-sm text-amber-950">
        <strong className="font-semibold">Preview</strong>
        <span>
          “{page.title}” — {page.status.toLowerCase()}
          {page.status !== 'PUBLISHED' ? ' (not visible to the public)' : ''}
        </span>
        <Link href={`/admin/pages/${page.id}`} className="ml-auto font-medium underline underline-offset-2">
          Back to editor
        </Link>
      </div>

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
    </div>
  );
}
