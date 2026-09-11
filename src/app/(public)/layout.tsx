import { headers } from "next/headers";
import { prisma } from "@/lib/db/prisma";
import { getPublishedPage } from "@/lib/services/pages";
import { getSeoSettings, getWebsiteSettings } from "@/lib/services/settings";
import {
  getNavigations,
  getPrimaryNavigation,
} from "@/lib/services/navigation";
import { MaintenanceNotice } from "@/components/public/maintenance-notice";
import { SiteHeader } from "@/components/public/site-header";
import { SiteFooter } from "@/components/public/site-footer";
import { PopupHost } from "@/components/public/popup-host";
import { JsonLd } from "@/components/seo/json-ld";
import { organizationSchema, websiteSchema } from "@/lib/seo/structured-data";
import { getCurrentUser } from "@/lib/auth/guards";

export default async function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const headerList = await headers();
  const pathname = headerList.get("x-pathname") ?? "/";

  // A CMS page can opt out of the site header or footer. Other public routes
  // (blog, products) always show both. getPublishedPage is request-cached, so
  // this adds no extra query for the page route itself.
  const chrome = await resolveChrome(pathname);

  const [site, seo, nav, footerMenus, legalMenus, popups] = await Promise.all([
    getWebsiteSettings(),
    getSeoSettings(),
    getPrimaryNavigation(),
    getNavigations("FOOTER"),
    getNavigations("LEGAL"),
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

  // Maintenance mode hides the public site from visitors — a restore turns it
  // on for the duration so nobody browses a half-restored database. Signed-in
  // staff are exempt, so the person running the restore can still check it.
  if (site.maintenanceMode) {
    const staff = await getCurrentUser();
    if (!staff) {
      return <MaintenanceNotice siteName={site.siteName} logoUrl={site.logoUrl} />;
    }
  }

  return (
    <>
      <a href="#main" className="skip-link">
        Skip to content
      </a>
      {chrome.showHeader ? (
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
      <main id="main" className="min-h-[60vh]">
        {children}
      </main>
      {chrome.showFooter ? (
        <SiteFooter
          settings={site}
          columns={footerMenus}
          legal={legalMenus[0]?.items ?? []}
        />
      ) : null}
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
          urlPatterns: Array.isArray(p.urlPatterns)
            ? (p.urlPatterns as string[])
            : [],
          pageSlugs: p.pageTargets.map((t) => t.page.slug),
        }))}
      />
      <JsonLd data={[organizationSchema(seo, site), websiteSchema(site)]} />
    </>
  );
}

/** CMS pages may hide the header or footer; every other route keeps both. */
async function resolveChrome(
  pathname: string,
): Promise<{ showHeader: boolean; showFooter: boolean }> {
  const slug = pathname.replace(/^\/+|\/+$/g, "");
  if (slug.startsWith("blog") || slug.startsWith("products")) {
    return { showHeader: true, showFooter: true };
  }
  try {
    const page = await getPublishedPage(slug);
    if (!page) return { showHeader: true, showFooter: true };
    return { showHeader: page.showHeader, showFooter: page.showFooter };
  } catch {
    return { showHeader: true, showFooter: true };
  }
}
