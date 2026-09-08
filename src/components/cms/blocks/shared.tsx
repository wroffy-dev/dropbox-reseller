import Link from 'next/link';
import { cn } from '@/lib/utils/cn';
import { safeUrl, sanitizeHtml } from '@/lib/utils/sanitize';
import { buttonClasses, type ButtonVariant } from '@/components/ui/button';

export function SectionHeading({
  eyebrow,
  heading,
  description,
  align = 'center',
  inverted,
  className,
  as: Tag = 'h2',
}: {
  eyebrow?: string | null;
  heading?: string | null;
  description?: string | null;
  align?: 'left' | 'center';
  inverted?: boolean;
  className?: string;
  as?: 'h1' | 'h2' | 'h3';
}) {
  if (!eyebrow && !heading && !description) return null;
  return (
    <div
      className={cn(
        'max-w-2xl',
        align === 'center' && 'mx-auto text-center',
        className,
      )}
    >
      {eyebrow ? (
        <p
          className={cn(
            'mb-3 text-xs font-semibold uppercase tracking-[0.14em]',
            inverted ? 'text-white/70' : 'text-brand',
          )}
        >
          {eyebrow}
        </p>
      ) : null}
      {heading ? (
        <Tag
          className={cn(
            'font-heading tracking-tight',
            Tag === 'h1' ? 'text-3xl sm:text-4xl lg:text-5xl' : 'text-2xl sm:text-3xl lg:text-4xl',
            inverted ? 'text-white' : 'text-content',
          )}
        >
          {heading}
        </Tag>
      ) : null}
      {description ? (
        <p
          className={cn(
            'mt-4 text-base leading-relaxed sm:text-lg',
            inverted ? 'text-white/80' : 'text-muted',
          )}
        >
          {description}
        </p>
      ) : null}
    </div>
  );
}

/** Renders a CTA only when both label and a safe URL are present. */
export function CtaLink({
  label,
  url,
  variant = 'primary',
  size = 'lg',
  className,
}: {
  label?: string | null;
  url?: string | null;
  variant?: ButtonVariant;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const href = safeUrl(url);
  if (!label?.trim() || !href) return null;
  const external = /^https?:\/\//i.test(href);
  return (
    <Link
      href={href}
      className={buttonClasses(variant, size, className)}
      {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
    >
      {label}
    </Link>
  );
}

/** Sanitised rich text from the CMS. */
export function RichText({ html, className }: { html: string | null | undefined; className?: string }) {
  const clean = sanitizeHtml(html);
  if (!clean) return null;
  return <div className={cn('prose-cms', className)} dangerouslySetInnerHTML={{ __html: clean }} />;
}

export function gridColsClass(columns: number): string {
  return (
    {
      1: 'grid-cols-1',
      2: 'grid-cols-1 sm:grid-cols-2',
      3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
      4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
    }[columns] ?? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
  );
}
