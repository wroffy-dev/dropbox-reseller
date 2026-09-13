import Link from 'next/link';
import { Mail, Phone, MapPin } from 'lucide-react';
import { resolveSocialIcon } from '@/components/ui/icons';
import type { SocialLink, WebsiteSettings } from '@prisma/client';
import type { ResolvedNavigation, ResolvedNavItem } from '@/lib/services/navigation';
import { FooterNewsletter } from './footer-newsletter';

export type FooterNewsletterConfig = {
  formSlug: string;
  emailField: string;
  requireCaptcha: boolean;
};

/**
 * The site footer.
 *
 * Four columns: the brand, then one column per footer menu, then "stay
 * updated". Nothing here is hardcoded — the logo and description come from
 * website settings, the link columns are Navigation menus with a FOOTER
 * location, the social icons are SocialLink rows, and the email form posts to
 * an ordinary Form record through the same action every other form uses.
 *
 * Colour and spacing come from the --footer-* custom properties BrandStyle
 * emits, so an admin restyling the footer never needs a code change.
 */
export function SiteFooter({
  settings,
  columns,
  legal,
  socials,
  newsletter,
}: {
  settings: WebsiteSettings;
  columns: ResolvedNavigation[];
  legal: ResolvedNavItem[];
  socials: SocialLink[];
  newsletter: FooterNewsletterConfig | null;
}) {
  const showNewsletter = settings.footerNewsletterEnabled && newsletter !== null;
  const logoUrl = settings.footerLogoUrl || settings.logoDarkUrl || settings.logoUrl;
  const hasContact = Boolean(settings.contactEmail || settings.contactPhone || settings.address);

  // The brand column is wider than the link columns, and "stay updated" wider
  // again so the input is not cramped. Built from the column count rather than
  // hardcoded, so adding a third footer menu in the admin still lays out.
  const template = [
    'minmax(0,1.5fr)',
    ...columns.map(() => 'minmax(0,1fr)'),
    showNewsletter || hasContact ? 'minmax(0,1.4fr)' : null,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <footer
      className="site-footer border-t"
      style={{
        background: 'var(--footer-bg)',
        color: 'var(--footer-text)',
        borderColor: 'var(--footer-divider)',
      }}
    >
      {/* Only the generated column template, never admin-entered text. */}
      <style
        dangerouslySetInnerHTML={{
          __html: `@media(min-width:1024px){.site-footer-grid{grid-template-columns:${template};}}`,
        }}
      />

      <div
        className="mx-auto w-full max-w-[var(--layout-container)] px-4 sm:px-6"
        style={{ paddingTop: 'var(--footer-pt)', paddingBottom: 'var(--footer-pb)' }}
      >
        <div
          className="site-footer-grid grid grid-cols-1 sm:grid-cols-2"
          style={{ columnGap: 'var(--footer-col-gap)', rowGap: 'var(--footer-row-gap)' }}
        >
          {/* ---------------------------------------------------------- brand */}
          <div className="max-w-sm">
            {settings.footerShowLogo ? (
              <Link href="/" className="inline-flex items-center gap-2">
                {logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={logoUrl}
                    alt={settings.siteName}
                    className="h-auto w-full object-contain"
                    style={{ maxWidth: settings.footerLogoWidth || '9rem' }}
                  />
                ) : (
                  <span
                    className="font-heading text-lg font-bold"
                    style={{ color: 'var(--footer-heading)' }}
                  >
                    {settings.siteName}
                  </span>
                )}
              </Link>
            ) : null}

            {settings.footerShowDescription && settings.footerDescription ? (
              <p className="mt-5 text-sm leading-relaxed">{settings.footerDescription}</p>
            ) : null}

            {socials.length > 0 ? (
              <ul className="mt-6 flex flex-wrap items-center gap-3">
                {socials.map((social) => {
                  const Icon = resolveSocialIcon(social.network);
                  return (
                    <li key={social.id}>
                      <a
                        href={social.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        aria-label={social.label}
                        className="footer-social inline-flex h-9 w-9 items-center justify-center rounded-full border transition-colors"
                        style={{ borderColor: 'var(--footer-input-border)' }}
                      >
                        <Icon className="h-4 w-4" aria-hidden="true" />
                      </a>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </div>

          {/* -------------------------------------------------- link columns */}
          {columns.map((column) => (
            <nav key={column.id} aria-label={column.name}>
              <h2
                className="font-heading text-xs font-semibold uppercase tracking-[0.14em]"
                style={{ color: 'var(--footer-heading)' }}
              >
                {column.name}
              </h2>
              <ul className="mt-5 space-y-3 text-sm">
                {column.items.map((item) => (
                  <li key={item.id}>
                    <Link
                      href={item.href}
                      target={item.openInNewTab ? '_blank' : undefined}
                      rel={relFor(item)}
                      className="footer-link transition-colors"
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}

          {/* ---------------------------------------------------- stay updated */}
          {showNewsletter || hasContact ? (
            <div>
              {showNewsletter ? (
                <>
                  <h2
                    className="font-heading text-xs font-semibold uppercase tracking-[0.14em]"
                    style={{ color: 'var(--footer-heading)' }}
                  >
                    {settings.footerNewsletterHeading}
                  </h2>
                  {settings.footerNewsletterDescription ? (
                    <p className="mt-5 text-sm leading-relaxed">
                      {settings.footerNewsletterDescription}
                    </p>
                  ) : null}
                  <div className="mt-5">
                    <FooterNewsletter
                      formSlug={newsletter.formSlug}
                      emailField={newsletter.emailField}
                      requireCaptcha={newsletter.requireCaptcha}
                      placeholder={settings.footerNewsletterPlaceholder}
                      buttonLabel={settings.footerNewsletterButtonLabel}
                      successMessage={settings.footerNewsletterSuccess}
                    />
                  </div>
                </>
              ) : null}

              {hasContact ? (
                <ul className={`${showNewsletter ? 'mt-7' : ''} space-y-2.5 text-sm`}>
                  {settings.contactEmail ? (
                    <li className="flex items-start gap-2.5">
                      <Mail className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                      <a href={`mailto:${settings.contactEmail}`} className="footer-link">
                        {settings.contactEmail}
                      </a>
                    </li>
                  ) : null}
                  {settings.contactPhone ? (
                    <li className="flex items-start gap-2.5">
                      <Phone className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                      <a
                        href={`tel:${settings.contactPhone.replace(/\s/g, '')}`}
                        className="footer-link"
                      >
                        {settings.contactPhone}
                      </a>
                    </li>
                  ) : null}
                  {settings.address ? (
                    <li className="flex items-start gap-2.5">
                      <MapPin className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                      <span>{settings.address}</span>
                    </li>
                  ) : null}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>

        {/* ------------------------------------------------------- bottom bar */}
        <div
          className="mt-12 flex flex-col gap-4 border-t pt-6 sm:flex-row sm:items-center sm:justify-between"
          style={{ borderColor: 'var(--footer-divider)' }}
        >
          <p className="text-xs">
            {settings.copyrightText || `© ${new Date().getFullYear()} ${settings.siteName}`}
          </p>

          {legal.length > 0 ? (
            <nav aria-label="Legal">
              <ul className="flex flex-wrap gap-x-5 gap-y-2 text-xs">
                {legal.map((item) => (
                  <li key={item.id}>
                    <Link
                      href={item.href}
                      target={item.openInNewTab ? '_blank' : undefined}
                      rel={relFor(item)}
                      className="footer-link transition-colors"
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ) : null}
        </div>
      </div>
    </footer>
  );
}

/** `rel` for a footer link — nofollow and new-tab safety, or nothing at all. */
function relFor(item: ResolvedNavItem): string | undefined {
  const parts = [
    item.openInNewTab ? 'noopener noreferrer' : null,
    item.isNoFollow ? 'nofollow' : null,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : undefined;
}
