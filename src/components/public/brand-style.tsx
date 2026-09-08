import type { WebsiteSettings } from '@prisma/client';

/** Converts #RRGGBB to the "R G B" triple Tailwind's <alpha-value> tokens need. */
function rgbTriple(hex: string, fallback: string): string {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex?.trim() ?? '');
  if (!match) return fallback;
  const value = match[1]!;
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `${r} ${g} ${b}`;
}

const GOOGLE_FONTS = new Set([
  'Inter', 'Manrope', 'Poppins', 'Roboto', 'Open Sans', 'Lato', 'Montserrat',
  'Source Sans 3', 'Nunito', 'Work Sans', 'DM Sans', 'Plus Jakarta Sans',
  'Space Grotesk', 'Outfit', 'Figtree', 'Playfair Display', 'Merriweather', 'Lora',
]);

/**
 * Injects the admin-configured palette and typography as CSS custom properties.
 * Everything downstream (Tailwind tokens, CMS blocks) reads these, so changing
 * a colour in the admin repaints the whole site with no code change.
 */
export function BrandStyle({ settings }: { settings: WebsiteSettings }) {
  const css = `:root{
--brand-primary:${rgbTriple(settings.colorPrimary, '0 97 255')};
--brand-secondary:${rgbTriple(settings.colorSecondary, '11 27 52')};
--brand-accent1:${rgbTriple(settings.colorAccent1, '26 193 165')};
--brand-accent2:${rgbTriple(settings.colorAccent2, '255 138 61')};
--brand-background:${rgbTriple(settings.colorBackground, '255 255 255')};
--brand-text:${rgbTriple(settings.colorText, '11 27 52')};
--brand-muted:${rgbTriple(settings.colorMuted, '91 107 133')};
--brand-border:${rgbTriple(settings.colorBorder, '227 232 240')};
--font-heading:'${settings.headingFont.replace(/'/g, '')}',ui-sans-serif,system-ui,sans-serif;
--font-body:'${settings.bodyFont.replace(/'/g, '')}',ui-sans-serif,system-ui,sans-serif;
--font-heading-weight:${settings.headingWeight.replace(/[^0-9]/g, '') || '700'};
--font-body-weight:${settings.bodyWeight.replace(/[^0-9]/g, '') || '400'};
--font-base-size:${/^\d+(\.\d+)?(px|rem)$/.test(settings.baseFontSize) ? settings.baseFontSize : '16px'};
}`;

  const families = Array.from(new Set([settings.headingFont, settings.bodyFont])).filter((f) =>
    GOOGLE_FONTS.has(f),
  );
  const fontHref = families.length
    ? `https://fonts.googleapis.com/css2?${families
        .map((f) => `family=${encodeURIComponent(f)}:wght@300;400;500;600;700;800`)
        .join('&')}&display=swap`
    : null;

  return (
    <>
      {fontHref ? (
        <>
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
          <link rel="stylesheet" href={fontHref} />
        </>
      ) : null}
      <style dangerouslySetInnerHTML={{ __html: css }} />
    </>
  );
}
