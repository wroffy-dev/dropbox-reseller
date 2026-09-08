import Image from 'next/image';
import type {
  RichTextContent,
  ImageContentContent,
  StatsContent,
  StepsContent,
  LogoWallContent,
  FeatureGridContent,
} from '@/lib/cms/blocks';
import { getMedia, getMediaByIds } from '@/lib/services/media';
import { resolveCmsIcon } from '@/components/ui/icons';
import { cn } from '@/lib/utils/cn';
import { safeUrl } from '@/lib/utils/sanitize';
import { SectionHeading, CtaLink, RichText, gridColsClass } from './shared';

export function RichTextBlock({ content, inverted }: { content: RichTextContent; inverted: boolean }) {
  return (
    <div
      className={cn(
        content.width === 'narrow' ? 'mx-auto max-w-3xl' : '',
        content.align === 'center' && 'text-center',
      )}
    >
      {content.heading ? (
        <h2
          className={cn(
            'font-heading text-2xl tracking-tight sm:text-3xl lg:text-4xl',
            inverted ? 'text-white' : 'text-content',
          )}
        >
          {content.heading}
        </h2>
      ) : null}
      <RichText html={content.content} className={cn(content.heading && 'mt-5', inverted && 'text-white/80')} />
    </div>
  );
}

export async function ImageContentBlock({
  content,
  inverted,
}: {
  content: ImageContentContent;
  inverted: boolean;
}) {
  const image = await getMedia(content.imageId);

  return (
    <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
      <div className={cn(content.imagePosition === 'left' && 'lg:order-2')}>
        <SectionHeading
          eyebrow={content.eyebrow}
          heading={content.heading}
          align="left"
          inverted={inverted}
        />
        <RichText html={content.description} className={cn('mt-5', inverted && 'text-white/80')} />
        <div className="mt-7">
          <CtaLink
            label={content.ctaLabel}
            url={content.ctaUrl}
            variant={inverted ? 'outline' : 'primary'}
            size="md"
          />
        </div>
      </div>

      <div className={cn(content.imagePosition === 'left' && 'lg:order-1')}>
        {image ? (
          <div className="overflow-hidden rounded-2xl border border-hairline shadow-lg">
            <Image
              src={image.url}
              alt={image.altText}
              width={image.width ?? 1000}
              height={image.height ?? 750}
              sizes="(max-width: 1024px) 100vw, 50vw"
              className="h-auto w-full object-cover"
            />
          </div>
        ) : (
          <div
            className="aspect-[4/3] w-full rounded-2xl border border-dashed border-hairline bg-muted/5"
            aria-hidden="true"
          />
        )}
      </div>
    </div>
  );
}

export async function FeatureGridBlock({
  content,
  inverted,
}: {
  content: FeatureGridContent;
  inverted: boolean;
}) {
  const items = content.items.filter((item) => item.title || item.description);
  const media = await getMediaByIds(items.map((i) => i.imageId).filter((id): id is string => Boolean(id)));

  return (
    <>
      <SectionHeading
        heading={content.heading}
        description={content.description}
        inverted={inverted}
        className="mb-12"
      />

      <ul className={cn('grid gap-5', gridColsClass(content.columns))}>
        {items.map((item, index) => {
          const Icon = resolveCmsIcon(item.icon);
          const image = item.imageId ? media.get(item.imageId) : null;
          return (
            <li
              key={index}
              className={cn(
                'rounded-xl p-6 transition-shadow',
                content.style === 'card' &&
                  (inverted
                    ? 'bg-white/10 backdrop-blur'
                    : 'border border-hairline bg-surface shadow-sm hover:shadow-md'),
              )}
            >
              {image ? (
                <Image
                  src={image.url}
                  alt={image.altText}
                  width={48}
                  height={48}
                  className="mb-4 h-12 w-12 rounded-lg object-cover"
                />
              ) : Icon ? (
                <span
                  className={cn(
                    'mb-4 flex h-11 w-11 items-center justify-center rounded-lg',
                    inverted ? 'bg-white/15 text-white' : 'bg-brand/10 text-brand',
                  )}
                >
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
              ) : null}

              {item.title ? (
                <h3 className={cn('font-heading text-base font-semibold', inverted ? 'text-white' : 'text-content')}>
                  {item.title}
                </h3>
              ) : null}
              {item.description ? (
                <p className={cn('mt-2 text-sm leading-relaxed', inverted ? 'text-white/75' : 'text-muted')}>
                  {item.description}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>
    </>
  );
}

export function StatsBlock({ content, inverted }: { content: StatsContent; inverted: boolean }) {
  const items = content.items.filter((i) => i.value || i.label);
  return (
    <>
      <SectionHeading
        heading={content.heading}
        description={content.description}
        inverted={inverted}
        className="mb-10"
      />
      <dl
        className={cn(
          'grid gap-6 text-center',
          items.length >= 4 ? 'grid-cols-2 lg:grid-cols-4' : 'grid-cols-1 sm:grid-cols-3',
        )}
      >
        {items.map((item, index) => (
          <div key={index} className={cn('rounded-xl p-5', inverted ? 'bg-white/10' : 'bg-muted/[0.05]')}>
            <dt className="sr-only">{item.label}</dt>
            <dd>
              <span
                className={cn(
                  'block font-heading text-3xl font-bold sm:text-4xl',
                  inverted ? 'text-white' : 'text-brand',
                )}
              >
                {item.value}
              </span>
              <span className={cn('mt-1.5 block text-sm', inverted ? 'text-white/75' : 'text-muted')}>
                {item.label}
              </span>
            </dd>
          </div>
        ))}
      </dl>
    </>
  );
}

export function StepsBlock({ content, inverted }: { content: StepsContent; inverted: boolean }) {
  const items = content.items.filter((i) => i.title || i.description);
  return (
    <>
      <SectionHeading
        heading={content.heading}
        description={content.description}
        inverted={inverted}
        className="mb-12"
      />
      <ol className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item, index) => (
          <li key={index} className="relative">
            <span
              className={cn(
                'flex h-9 w-9 items-center justify-center rounded-full font-heading text-sm font-bold',
                inverted ? 'bg-white text-[rgb(var(--brand-secondary))]' : 'bg-brand text-white',
              )}
              aria-hidden="true"
            >
              {index + 1}
            </span>
            <h3 className={cn('mt-4 font-heading text-base font-semibold', inverted ? 'text-white' : 'text-content')}>
              {item.title}
            </h3>
            <p className={cn('mt-2 text-sm leading-relaxed', inverted ? 'text-white/75' : 'text-muted')}>
              {item.description}
            </p>
          </li>
        ))}
      </ol>
    </>
  );
}

export async function LogoWallBlock({ content, inverted }: { content: LogoWallContent; inverted: boolean }) {
  const logos = content.logos.filter((l) => l.label || l.imageId);
  const media = await getMediaByIds(logos.map((l) => l.imageId).filter((id): id is string => Boolean(id)));

  return (
    <div className="text-center">
      {content.heading ? (
        <p
          className={cn(
            'text-xs font-semibold uppercase tracking-[0.14em]',
            inverted ? 'text-white/60' : 'text-muted',
          )}
        >
          {content.heading}
        </p>
      ) : null}

      <ul className="mt-7 flex flex-wrap items-center justify-center gap-x-10 gap-y-6">
        {logos.map((logo, index) => {
          const image = logo.imageId ? media.get(logo.imageId) : null;
          const href = safeUrl(logo.url);
          const inner = image ? (
            <Image
              src={image.url}
              alt={image.altText || logo.label}
              width={image.width ?? 140}
              height={image.height ?? 40}
              className={cn('h-8 w-auto object-contain', !inverted && 'opacity-60 grayscale')}
            />
          ) : (
            <span
              className={cn(
                'font-heading text-lg font-semibold tracking-tight',
                inverted ? 'text-white/70' : 'text-muted/70',
              )}
            >
              {logo.label}
            </span>
          );
          return (
            <li key={index}>
              {href ? (
                <a href={href} target="_blank" rel="noopener noreferrer" aria-label={logo.label}>
                  {inner}
                </a>
              ) : (
                inner
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
