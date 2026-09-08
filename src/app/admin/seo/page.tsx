import type { Metadata } from 'next';
import Link from 'next/link';
import { Shuffle } from 'lucide-react';
import { requirePermission, userCan } from '@/lib/auth/guards';
import { getSeoSettings } from '@/lib/services/settings';
import { AdminPageHeader } from '@/components/admin/page-header';
import { SeoSettingsForm, type SeoSettingsValues } from '@/components/admin/seo/seo-settings-form';
import { buttonClasses } from '@/components/ui/button';

export const metadata: Metadata = { title: 'SEO' };
export const dynamic = 'force-dynamic';

export default async function SeoAdmin() {
  const user = await requirePermission('seo.manage');
  const seo = await getSeoSettings();

  const initial: SeoSettingsValues = {
    defaultTitle: seo.defaultTitle,
    titleTemplate: seo.titleTemplate,
    defaultDescription: seo.defaultDescription,
    defaultOgImageUrl: seo.defaultOgImageUrl ?? '',
    twitterHandle: seo.twitterHandle ?? '',
    organizationName: seo.organizationName,
    organizationLogoUrl: seo.organizationLogoUrl ?? '',
    organizationType: seo.organizationType,
    googleSiteVerification: seo.googleSiteVerification ?? '',
    bingSiteVerification: seo.bingSiteVerification ?? '',
    robotsTxtExtra: seo.robotsTxtExtra ?? '',
    sitemapEnabled: seo.sitemapEnabled,
    noIndexSite: seo.noIndexSite,
  };

  return (
    <div className="mx-auto max-w-3xl">
      <AdminPageHeader
        title="SEO"
        description="Global defaults. Individual pages, products and posts override these."
        crumbs={[{ label: 'SEO' }]}
        actions={
          <>
            <Link href="/sitemap.xml" target="_blank" className={buttonClasses('ghost', 'sm')}>
              View sitemap
            </Link>
            <Link href="/admin/redirects" className={buttonClasses('outline', 'sm')}>
              <Shuffle className="h-4 w-4" aria-hidden="true" />
              Redirects
            </Link>
          </>
        }
      />
      <SeoSettingsForm initial={initial} canEdit={userCan(user, 'seo.manage')} />
    </div>
  );
}
