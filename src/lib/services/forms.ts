import 'server-only';
import { cache } from 'react';
import { prisma } from '@/lib/db/prisma';
import type { FormFieldType } from '@prisma/client';
import { parseFormDesign, type FormDesign } from '@/lib/forms/form-design';
import { parseFieldSettings, type FieldSettings } from '@/lib/forms/field-settings';

export type PublicFormField = {
  id: string;
  type: FormFieldType;
  label: string;
  name: string;
  placeholder: string | null;
  helpText: string | null;
  defaultValue: string | null;
  isRequired: boolean;
  width: string;
  options: Array<{ label: string; value: string }>;
  minLength: number | null;
  maxLength: number | null;
  pattern: string | null;
  showLabel: boolean;
  isHidden: boolean;
  isReadOnly: boolean;
  colSpan: number | null;
  cssClass: string | null;
  settings: FieldSettings;
};

export type PublicForm = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  submitLabel: string;
  successMessage: string;
  redirectUrl: string | null;
  consentText: string | null;
  /**
   * Whether this form shows a math CAPTCHA. Only the flag travels with the
   * cached form — the challenge itself is fetched fresh by the runtime so a
   * statically rendered page can never serve a stale or expired token.
   */
  requireCaptcha: boolean;
  /** Presentation, shared by every place this form is rendered. */
  design: FormDesign;
  fields: PublicFormField[];
};

function parseOptions(raw: unknown): Array<{ label: string; value: string }> {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((o): o is { label?: unknown; value?: unknown } => typeof o === 'object' && o !== null)
    .map((o) => ({
      label: String(o.label ?? o.value ?? ''),
      value: String(o.value ?? o.label ?? ''),
    }))
    .filter((o) => o.value !== '');
}

/** Loads an active form for public rendering. Returns null when unavailable. */
export const getPublicForm = cache(async (slug: string): Promise<PublicForm | null> => {
  if (!slug) return null;
  const form = await prisma.form.findFirst({
    where: { slug, isActive: true, deletedAt: null },
    include: { fields: { orderBy: { sortOrder: 'asc' } } },
  });
  if (!form) return null;

  // A disabled field is dropped here rather than hidden in the renderer, so it
  // is absent from the validation schema too — the server then rejects a value
  // for it instead of quietly accepting one nobody could have entered.
  const fields = form.fields.filter((field) => field.isEnabled);

  return {
    id: form.id,
    slug: form.slug,
    name: form.name,
    description: form.description,
    submitLabel: form.submitLabel,
    successMessage: form.successMessage,
    redirectUrl: form.redirectUrl,
    consentText: form.consentText,
    requireCaptcha: form.requireCaptcha,
    design: parseFormDesign(form.design),
    fields: fields.map((f) => ({
      id: f.id,
      type: f.type,
      label: f.label,
      name: f.name,
      placeholder: f.placeholder,
      helpText: f.helpText,
      defaultValue: f.defaultValue,
      isRequired: f.isRequired,
      width: f.width,
      options: parseOptions(f.options),
      minLength: f.minLength,
      maxLength: f.maxLength,
      pattern: f.pattern,
      showLabel: f.showLabel,
      isHidden: f.isHidden,
      isReadOnly: f.isReadOnly,
      colSpan: f.colSpan,
      cssClass: f.cssClass,
      settings: parseFieldSettings(f.settings),
    })),
  };
});

/** The form used when a block or product CTA does not name one. */
export const getDefaultForm = cache(async (): Promise<PublicForm | null> => {
  const form = await prisma.form.findFirst({
    where: { isActive: true, deletedAt: null },
    orderBy: { createdAt: 'asc' },
    select: { slug: true },
  });
  return form ? getPublicForm(form.slug) : null;
});
