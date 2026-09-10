/**
 * Form builder model — shared by the server routes and the client builder.
 *
 * This lives outside the `'use client'` component on purpose. `/admin/forms/new`
 * is a Server Component that needs the starter field factory and the empty-form
 * defaults; importing them from a client module turns them into client
 * references, so calling `newField()` or spreading `EMPTY_FORM` on the server
 * throws and the "New form" route fails before it can render.
 */

export type BuilderField = {
  /** Stable React key. For a saved field this is its database id. */
  key: string;
  id: string | null;
  type: string;
  label: string;
  name: string;
  placeholder: string;
  helpText: string;
  defaultValue: string;
  isRequired: boolean;
  width: 'full' | 'half';
  options: Array<{ label: string; value: string }>;
  minLength: string;
  maxLength: string;
  pattern: string;
};

export type FormBuilderValues = {
  id?: string;
  name: string;
  slug: string;
  description: string;
  isActive: boolean;
  submitLabel: string;
  successMessage: string;
  redirectUrl: string;
  leadSource: string;
  defaultProductId: string;
  createsLead: boolean;
  notifyEmails: string;
  consentText: string;
  requireCaptcha: boolean;
  fields: BuilderField[];
};

export const FIELD_TYPE_LABELS: Record<string, string> = {
  NAME: 'Name',
  EMAIL: 'Email',
  PHONE: 'Phone',
  COMPANY: 'Company',
  TEXT: 'Single line text',
  TEXTAREA: 'Paragraph text',
  NUMBER: 'Number',
  URL: 'Website / URL',
  DATE: 'Date',
  SELECT: 'Dropdown',
  RADIO: 'Radio buttons',
  CHECKBOX: 'Checkbox',
  CONSENT: 'Consent checkbox',
  HIDDEN: 'Hidden value',
};

/** Field types whose values map straight onto Lead columns. */
export const MAPPED_FIELD_TYPES = new Set(['NAME', 'EMAIL', 'PHONE', 'COMPANY', 'TEXTAREA']);

export const CHOICE_FIELD_TYPES = new Set(['SELECT', 'RADIO']);

export const EMPTY_FORM: FormBuilderValues = {
  name: '',
  slug: '',
  description: '',
  isActive: true,
  submitLabel: 'Submit',
  successMessage: 'Thank you. Our team will contact you shortly.',
  redirectUrl: '',
  leadSource: 'Website Form',
  defaultProductId: '',
  createsLead: true,
  notifyEmails: '',
  consentText: '',
  requireCaptcha: false,
  fields: [],
};

let keyCounter = 0;

/**
 * Unique key for a builder row.
 *
 * Server-rendered starter fields and client-added fields both flow through
 * here, so the counter is combined with a random suffix rather than a
 * timestamp — two fields added in the same millisecond must not collide, and
 * server and client sequences must not overlap after hydration.
 */
export function nextFieldKey(): string {
  keyCounter += 1;
  return `f${keyCounter}-${Math.random().toString(36).slice(2, 9)}`;
}

export function newField(type = 'TEXT'): BuilderField {
  return {
    key: nextFieldKey(),
    id: null,
    type,
    label: FIELD_TYPE_LABELS[type] ?? 'Field',
    name: '',
    placeholder: '',
    helpText: '',
    defaultValue: '',
    isRequired: type === 'EMAIL' || type === 'CONSENT',
    width: type === 'TEXTAREA' || type === 'CONSENT' ? 'full' : 'half',
    options: CHOICE_FIELD_TYPES.has(type) ? [{ label: 'Option one', value: 'option-one' }] : [],
    minLength: '',
    maxLength: '',
    pattern: '',
  };
}

/** The four fields that map onto a lead — the default starting point. */
export function starterFields(): BuilderField[] {
  const labels: Record<string, string> = {
    NAME: 'Full name',
    EMAIL: 'Work email',
    PHONE: 'Phone',
    COMPANY: 'Company',
  };

  return ['NAME', 'EMAIL', 'PHONE', 'COMPANY'].map((type) => {
    const field = newField(type);
    field.name = type.toLowerCase();
    field.label = labels[type]!;
    field.isRequired = type === 'NAME' || type === 'EMAIL';
    return field;
  });
}

/** Machine names key the submission payload, so they must be unique per form. */
export function uniqueFieldName(base: string, fields: BuilderField[]): string {
  const root = base || 'field';
  let candidate = root;
  let n = 1;
  while (fields.some((f) => f.name === candidate)) {
    n += 1;
    candidate = `${root}_${n}`;
  }
  return candidate;
}
