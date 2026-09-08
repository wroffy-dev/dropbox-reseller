import Link from 'next/link';
import { Mail, Phone, MapPin } from 'lucide-react';
import {
  LinkedInIcon,
  XIcon,
  FacebookIcon,
  InstagramIcon,
  YouTubeIcon,
  type IconComponent,
} from '@/components/ui/icons';
import type { WebsiteSettings } from '@prisma/client';
import type { ResolvedNavigation, ResolvedNavItem } from '@/lib/services/navigation';

const SOCIALS: Array<{ key: keyof WebsiteSettings; label: string; Icon: IconComponent }> = [
  { key: 'linkedinUrl', label: 'LinkedIn', Icon: LinkedInIcon },
  { key: 'twitterUrl', label: 'X', Icon: XIcon },
  { key: 'facebookUrl', label: 'Facebook', Icon: FacebookIcon },
  { key: 'instagramUrl', label: 'Instagram', Icon: InstagramIcon },
  { key: 'youtubeUrl', label: 'YouTube', Icon: YouTubeIcon },
];

export function SiteFooter({
  settings,
  columns,
  legal,
}: {
  settings: WebsiteSettings;
  columns: ResolvedNavigation[];
  legal: ResolvedNavItem[];
}) {
  const socials = SOCIALS.map(({ key, label, Icon }) => ({
    label,
    Icon,
    href: typeof settings[key] === 'string' ? (settings[key] as string) : null,
  })).filter((s): s is { label: string; Icon: IconComponent; href: string } => Boolean(s.href));

  return (
    <footer className="border-t border-hairline bg-[rgb(var(--brand-secondary))] text-white/70">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
        <div className="grid gap-10 lg:grid-cols-[1.4fr_repeat(auto-fit,minmax(9rem,1fr))]">
          <div className="max-w-sm">
            <Link href="/" className="inline-flex items-center gap-2">
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
            {settings.footerDescription ? (
              <p className="mt-4 text-sm leading-relaxed">{settings.footerDescription}</p>
            ) : null}

            <ul className="mt-6 space-y-2 text-sm">
              {settings.contactEmail ? (
                <li className="flex items-start gap-2.5">
                  <Mail className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <a href={`mailto:${settings.contactEmail}`} className="hover:text-white">
                    {settings.contactEmail}
                  </a>
                </li>
              ) : null}
              {settings.contactPhone ? (
                <li className="flex items-start gap-2.5">
                  <Phone className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <a href={`tel:${settings.contactPhone.replace(/\s/g, '')}`} className="hover:text-white">
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
                      className="transition-colors hover:text-white"
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
            {settings.copyrightText || `© ${new Date().getFullYear()} ${settings.siteName}`}
          </p>

          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            {legal.length > 0 ? (
              <nav aria-label="Legal">
                <ul className="flex flex-wrap gap-x-5 gap-y-2 text-xs">
                  {legal.map((item) => (
                    <li key={item.id}>
                      <Link href={item.href} className="transition-colors hover:text-white">
                        {item.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            ) : null}

            {socials.length > 0 ? (
              <ul className="flex items-center gap-3">
                {socials.map(({ label, href, Icon }) => (
                  <li key={label}>
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={label}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/10 transition-colors hover:bg-white/20 hover:text-white"
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
