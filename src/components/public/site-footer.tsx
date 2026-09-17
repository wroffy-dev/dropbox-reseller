import type * as React from 'react';
import Link from 'next/link';
import { Mail, Phone, MapPin } from 'lucide-react';
import { resolveSocialIcon } from '@/components/ui/icons';
import type { SocialLink, WebsiteSettings } from '@prisma/client';
import { getPublicFormById } from '@/lib/services/forms';
import { PublicFormRenderer } from '@/components/forms/public-form';
import type { ResolvedNavigation, ResolvedNavItem } from '@/lib/services/navigation';
import type { CountrySettingsView } from '@/lib/country/types';

/**
 * The site footer.
 *
 * Brand identity — logo, palette, social profiles — stays global; the company
 * name, contact details and copyright line come from the market being browsed
 * and fall back to the global settings, so the root market's footer renders
 * exactly what it rendered before markets existed.
 *
 * Nothing here is written into the component: the columns and the legal row
 * are whichever menus an administrator gave a footer location, the social
 * icons are whichever profile URLs are filled in, and the newsletter is one of
 * the site's own forms. A market with no footer menus renders no columns
 * rather than a placeholder.
 */
export async function SiteFooter({
  settings,
  local,
  homeUrl = '/',
  columns,
  legal,
  socials,
}: {
  settings: WebsiteSettings;
  /** The current market's contact details and copy. */
  local: CountrySettingsView;
  /** The current market's home page. */
  homeUrl?: string;
  columns: ResolvedNavigation[];
  legal: ResolvedNavItem[];
  /** Published profiles, already ordered and filtered by `getSocialLinks()`. */
  socials: SocialLink[];
}) {
  /*
   * An existing form rather than a footer-only email box: its fields, consent
   * text, captcha, notifications and submissions then work exactly as they do
   * on any other page, and a signup from here lands in the same place as one
   * from a landing page.
   */
  const newsletter =
    settings.footerNewsletterEnabled && settings.footerNewsletterFormId
      ? await getPublicFormById(settings.footerNewsletterFormId)
      : null;

  /*
   * Profiles come from `SocialLink` rows, not from five fixed columns on
   * website settings.
   *
   * The columns are gone: five of them meant the set of networks was a schema
   * decision, so adding a sixth needed a migration and a deployment. A row per
   * profile lets an administrator add, reorder, relabel or hide one, and the
   * icon is looked up from the stored network key — an unknown key falls back
   * to a generic link rather than breaking the footer.
   *
   * Ordering and the hidden-row filter are applied by `getSocialLinks()`, so
   * the footer and the organisation schema cannot disagree about what is
   * published.
   */
  const profiles = socials
    .filter((link) => link.url.trim())
    .map((link) => ({ label: link.label, Icon: resolveSocialIcon(link.network), href: link.url }));

  return (
    <footer className="border-t border-hairline bg-[rgb(var(--brand-secondary))] text-white/70">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
        {newsletter ? (
          <div className="mb-12 grid gap-6 rounded-2xl bg-white/5 p-6 sm:p-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:items-center">
            <div>
              <h2 className="font-heading text-lg font-bold text-white">{newsletter.name}</h2>
              {newsletter.description ? (
                <p className="mt-2 text-sm leading-relaxed">{newsletter.description}</p>
              ) : null}
            </div>
            {/*
              * On a light panel: the form carries its own colours from Forms →
              * Design, and those are chosen against a page background. Painting
              * it straight onto a dark footer would leave an administrator
              * restyling one form for one location.
              */}
            <div className="rounded-xl bg-surface p-4 text-content sm:p-5">
              <PublicFormRenderer form={newsletter} ctaLocation="footer-newsletter" compact />
            </div>
          </div>
        ) : null}

        {/*
          * One column per menu, plus a wider first one for the brand block.
          *
          * The count is a custom property because the number of menus is
          * whatever the admin configured, and a class name cannot be built from
          * data. It only takes effect from `lg` up, so the footer still stacks
          * on a phone. The class it replaces was
          * `lg:grid-cols-[1.4fr_repeat(auto-fit,minmax(9rem,1fr))]`,
          * which is invalid CSS: `repeat(auto-fit, …)` cannot be combined with
          * a flexible `fr` track, so browsers dropped the whole declaration and
          * the footer rendered as a single stacked column on every desktop.
          *
          * `minmax(0, …)` on each track is what stops a long menu label pushing
          * the footer wider than the page.
          */}
        <div
          className="grid gap-10 lg:[grid-template-columns:minmax(0,1.4fr)_repeat(var(--footer-cols),minmax(0,1fr))]"
          style={{ '--footer-cols': columns.length || 1 } as React.CSSProperties}
        >
          <div className="max-w-sm">
            <Link href={homeUrl} className="inline-flex items-center gap-2">
              {settings.logoDarkUrl || settings.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={settings.logoDarkUrl ?? settings.logoUrl ?? undefined}
                  alt={settings.siteName}
                  className="h-8 w-auto max-w-[10rem] object-contain"
                />
              ) : (
                <span className="font-heading text-lg font-bold text-white">{settings.siteName}</span>
              )}
            </Link>
            {local.footerDescription ? (
              <p className="mt-4 text-sm leading-relaxed">{local.footerDescription}</p>
            ) : null}

            <ul className="mt-6 space-y-2 text-sm">
              {local.salesEmail ? (
                <li className="flex items-start gap-2.5">
                  <Mail className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <a href={`mailto:${local.salesEmail}`} className="footer-link transition-colors hover:text-white">
                    {local.salesEmail}
                  </a>
                </li>
              ) : null}
              {local.salesPhone ? (
                <li className="flex items-start gap-2.5">
                  <Phone className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <a href={`tel:${local.salesPhone.replace(/\s/g, '')}`} className="footer-link transition-colors hover:text-white">
                    {local.salesPhone}
                  </a>
                </li>
              ) : null}
              {local.address ? (
                <li className="flex items-start gap-2.5">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>{local.address}</span>
                </li>
              ) : null}
            </ul>
          </div>

          {columns.map((column) => (
            <nav key={column.id} aria-label={column.name}>
              <h2 className="font-heading text-sm font-semibold text-white">{column.name}</h2>
              <ul className="mt-4 space-y-2.5 text-sm">
                {column.items.map((item) => (
                  <li key={item.id}>
                    <Link
                      href={item.href}
                      target={item.openInNewTab ? '_blank' : undefined}
                      rel={item.openInNewTab ? 'noopener noreferrer' : undefined}
                      className="footer-link transition-colors hover:text-white"
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-12 flex flex-col gap-4 border-t border-white/10 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs">
            {local.copyrightText || `© ${new Date().getFullYear()} ${local.companyName}`}
          </p>

          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            {legal.length > 0 ? (
              <nav aria-label="Legal">
                <ul className="flex flex-wrap gap-x-5 gap-y-2 text-xs">
                  {legal.map((item) => (
                    <li key={item.id}>
                      <Link href={item.href} className="footer-link transition-colors hover:text-white">
                        {item.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            ) : null}

            {profiles.length > 0 ? (
              <ul className="flex items-center gap-3">
                {profiles.map(({ label, href, Icon }) => (
                  <li key={label}>
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={label}
                      className="footer-social inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/10 transition-colors hover:bg-white/20 hover:text-white"
                    >
                      <Icon className="h-4 w-4" aria-hidden="true" />
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>
      </div>
    </footer>
  );
}
