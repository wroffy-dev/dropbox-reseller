import { prisma } from '@/lib/db/prisma';
import { getSeoSettings, getWebsiteSettings } from '@/lib/services/settings';
import { getNavigations, getPrimaryNavigation } from '@/lib/services/navigation';
import { SiteHeader } from '@/components/public/site-header';
import { SiteFooter } from '@/components/public/site-footer';
import { PopupHost } from '@/components/public/popup-host';
import { JsonLd } from '@/components/seo/json-ld';
import { organizationSchema, websiteSchema } from '@/lib/seo/structured-data';

export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const [site, seo, nav, footerMenus, legalMenus, popups] = await Promise.all([
    getWebsiteSettings(),
    getSeoSettings(),
    getPrimaryNavigation(),
    getNavigations('FOOTER'),
    getNavigations('LEGAL'),
    prisma.popup.findMany({
      where: {
        isActive: true,
        deletedAt: null,
        OR: [{ startsAt: null }, { startsAt: { lte: new Date() } }],
        AND: [{ OR: [{ endsAt: null }, { endsAt: { gte: new Date() } }] }],
      },
      include: {
        image: { select: { url: true, altText: true } },
        form: { select: { slug: true } },
        leadMagnet: { select: { slug: true, title: true } },
        pageTargets: { select: { page: { select: { slug: true } } } },
      },
    }),
  ]);

  return (
    <>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
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
      <main id="main" className="min-h-[60vh]">
        {children}
      </main>
      <SiteFooter settings={site} columns={footerMenus} legal={legalMenus[0]?.items ?? []} />
      <PopupHost
        popups={popups.map((p) => ({
          id: p.id,
          type: p.type,
          heading: p.heading,
          body: p.body,
          imageUrl: p.image?.url ?? null,
          imageAlt: p.image?.altText ?? null,
          formSlug: p.form?.slug ?? null,
          leadMagnetSlug: p.leadMagnet?.slug ?? null,
          ctaLabel: p.ctaLabel,
          ctaUrl: p.ctaUrl,
          trigger: p.trigger,
          delaySeconds: p.delaySeconds,
          scrollPercent: p.scrollPercent,
          device: p.device,
          frequencyDays: p.frequencyDays,
          urlPatterns: Array.isArray(p.urlPatterns) ? (p.urlPatterns as string[]) : [],
          pageSlugs: p.pageTargets.map((t) => t.page.slug),
        }))}
      />
      <JsonLd data={[organizationSchema(seo, site), websiteSchema(site)]} />
    </>
  );
}
