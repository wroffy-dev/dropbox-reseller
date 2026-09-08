import Image from 'next/image';
import { Check } from 'lucide-react';
import type { HeroContent } from '@/lib/cms/blocks';
import { getMedia } from '@/lib/services/media';
import { cn } from '@/lib/utils/cn';
import { SectionHeading, CtaLink } from './shared';

export async function HeroBlock({
  content,
  inverted,
  isFirst,
}: {
  content: HeroContent;
  inverted: boolean;
  isFirst: boolean;
}) {
  const image = await getMedia(content.imageId);
  const centred = content.alignment === 'center' || !image;
  const bullets = content.bullets.filter(Boolean);

  return (
    <div
      className={cn(
        'grid items-center gap-10 lg:gap-14',
        image && !centred ? 'lg:grid-cols-2' : 'grid-cols-1',
      )}
    >
      <div className={cn(centred && 'mx-auto max-w-3xl text-center')}>
        <SectionHeading
          as={isFirst ? 'h1' : 'h2'}
          eyebrow={content.eyebrow}
          heading={content.heading}
          description={content.description}
          align={centred ? 'center' : 'left'}
          inverted={inverted}
          className={centred ? undefined : 'max-w-xl'}
        />

        {bullets.length > 0 ? (
          <ul
            className={cn(
              'mt-7 space-y-2.5',
              centred && 'inline-flex flex-col items-start text-left',
            )}
          >
            {bullets.map((bullet, index) => (
              <li key={index} className="flex items-start gap-2.5">
                <span
                  className={cn(
                    'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full',
                    inverted ? 'bg-white/20 text-white' : 'bg-brand/10 text-brand',
                  )}
                >
                  <Check className="h-3 w-3" aria-hidden="true" />
                </span>
                <span className={cn('text-sm', inverted ? 'text-white/85' : 'text-muted')}>{bullet}</span>
              </li>
            ))}
          </ul>
        ) : null}

        <div className={cn('mt-9 flex flex-wrap gap-3', centred && 'justify-center')}>
          <CtaLink
            label={content.primaryCtaLabel}
            url={content.primaryCtaUrl}
            variant={inverted ? 'outline' : 'primary'}
          />
          <CtaLink
            label={content.secondaryCtaLabel}
            url={content.secondaryCtaUrl}
            variant={inverted ? 'ghost' : 'outline'}
          />
        </div>
      </div>

      {image && !centred ? (
        <div className="relative overflow-hidden rounded-2xl border border-hairline bg-muted/5 shadow-xl">
          <Image
            src={image.url}
            alt={image.altText}
            width={image.width ?? 1200}
            height={image.height ?? 800}
            priority={isFirst}
            sizes="(max-width: 1024px) 100vw, 50vw"
            className="h-auto w-full object-cover"
          />
        </div>
      ) : null}
    </div>
  );
}
