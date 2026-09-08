import Image from 'next/image';
import { prisma } from '@/lib/db/prisma';
import type { CtaContent, FormBlockContent, LeadMagnetContent } from '@/lib/cms/blocks';
import { getPublicForm, getDefaultForm } from '@/lib/services/forms';
import { getMedia } from '@/lib/services/media';
import { PublicFormRenderer } from '@/components/forms/public-form';
import { cn } from '@/lib/utils/cn';
import { Check } from 'lucide-react';
import { SectionHeading, CtaLink } from './shared';

export async function CtaBlock({ content, inverted }: { content: CtaContent; inverted: boolean }) {
  const form = content.variant === 'split' && content.formSlug ? await getPublicForm(content.formSlug) : null;

  const buttons = (
    <div
      className={cn(
        'flex flex-wrap gap-3',
        content.variant !== 'split' && 'justify-center',
      )}
    >
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
  );

  if (content.variant === 'split' && form) {
    return (
      <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
        <div>
          <SectionHeading
            heading={content.heading}
            description={content.description}
            align="left"
            inverted={inverted}
          />
          <div className="mt-7">{buttons}</div>
        </div>
        <div className="rounded-2xl border border-hairline bg-surface p-6 shadow-lg sm:p-8">
          <PublicFormRenderer form={form} ctaLocation="cta-block" compact />
        </div>
      </div>
    );
  }

  const body = (
    <>
      <SectionHeading heading={content.heading} description={content.description} inverted={inverted} />
      <div className="mt-8">{buttons}</div>
    </>
  );

  if (content.variant === 'panel') {
    return (
      <div
        className={cn(
          'rounded-2xl px-6 py-12 text-center sm:px-12',
          inverted ? 'bg-white/10 backdrop-blur' : 'bg-brand text-white',
        )}
      >
        <SectionHeading
          heading={content.heading}
          description={content.description}
          inverted
        />
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <CtaLink label={content.primaryCtaLabel} url={content.primaryCtaUrl} variant="outline" />
          <CtaLink label={content.secondaryCtaLabel} url={content.secondaryCtaUrl} variant="ghost" />
        </div>
      </div>
    );
  }

  return <div className="text-center">{body}</div>;
}

export async function FormBlock({ content, inverted }: { content: FormBlockContent; inverted: boolean }) {
  const form = content.formSlug ? await getPublicForm(content.formSlug) : await getDefaultForm();

  if (!form) {
    return (
      <SectionHeading
        heading={content.heading}
        description="No form has been configured for this section yet."
        inverted={inverted}
      />
    );
  }

  const formPanel = (
    <div className="rounded-2xl border border-hairline bg-surface p-6 shadow-sm sm:p-8">
      <PublicFormRenderer form={form} ctaLocation="form-block" />
    </div>
  );

  if (content.layout === 'split') {
    const bullets = content.sideBullets.filter(Boolean);
    return (
      <div className="grid gap-10 lg:grid-cols-[1fr_1.1fr] lg:gap-16">
        <div>
          <SectionHeading
            heading={content.heading}
            description={content.description}
            align="left"
            inverted={inverted}
          />
          {content.sideHeading ? (
            <h3
              className={cn(
                'mt-8 font-heading text-sm font-semibold uppercase tracking-wide',
                inverted ? 'text-white/70' : 'text-muted',
              )}
            >
              {content.sideHeading}
            </h3>
          ) : null}
          {bullets.length > 0 ? (
            <ul className="mt-4 space-y-3">
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
                  <span className={cn('text-sm', inverted ? 'text-white/80' : 'text-muted')}>{bullet}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        {formPanel}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <SectionHeading
        heading={content.heading}
        description={content.description}
        inverted={inverted}
        className="mb-8"
      />
      {formPanel}
    </div>
  );
}

export async function LeadMagnetBlock({
  content,
  inverted,
}: {
  content: LeadMagnetContent;
  inverted: boolean;
}) {
  const magnet = content.leadMagnetSlug
    ? await prisma.leadMagnet.findFirst({
        where: { slug: content.leadMagnetSlug, isActive: true, deletedAt: null },
        include: { image: { select: { url: true, altText: true, width: true, height: true } }, form: true },
      })
    : null;

  const heading = content.heading || magnet?.title || '';
  const description = content.description || magnet?.description || '';
  const overrideImage = await getMedia(content.imageId);
  const image = overrideImage ?? (magnet?.image ? { ...magnet.image, id: '', altText: magnet.image.altText ?? '' } : null);

  const formSlug = content.formSlug || (magnet?.form?.isActive ? magnet.form.slug : null);
  const form = formSlug ? await getPublicForm(formSlug) : null;

  if (!magnet && !form) {
    return (
      <SectionHeading
        heading={heading || 'Lead magnet'}
        description="Select an active lead magnet or form for this section."
        inverted={inverted}
      />
    );
  }

  return (
    <div
      className={cn(
        'grid items-center gap-8 rounded-2xl p-6 sm:p-10 lg:grid-cols-2 lg:gap-14',
        inverted ? 'bg-white/10 backdrop-blur' : 'border border-hairline bg-surface shadow-sm',
      )}
    >
      <div>
        {image ? (
          <Image
            src={image.url}
            alt={image.altText || heading}
            width={image.width ?? 480}
            height={image.height ?? 320}
            className="mb-6 h-auto w-full max-w-xs rounded-xl border border-hairline object-cover"
          />
        ) : null}
        <SectionHeading heading={heading} description={description} align="left" inverted={inverted} />
      </div>

      <div>
        {form ? (
          <PublicFormRenderer
            form={{ ...form, submitLabel: content.ctaLabel || magnet?.ctaLabel || form.submitLabel }}
            leadMagnetId={magnet?.id ?? null}
            compact
            ctaLocation="lead-magnet"
          />
        ) : (
          <p className={cn('text-sm', inverted ? 'text-white/70' : 'text-muted')}>
            Attach a form to this lead magnet to start collecting downloads.
          </p>
        )}
      </div>
    </div>
  );
}
