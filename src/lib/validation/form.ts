import { z } from 'zod';
import { slugify } from '@/lib/utils/slug';

const optional = (max: number) =>
  z
    .string()
    .max(max)
    .transform((v) => v.trim())
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

export const formFieldTypes = [
  'NAME',
  'EMAIL',
  'PHONE',
  'COMPANY',
  'TEXT',
  'TEXTAREA',
  'NUMBER',
  'URL',
  'DATE',
  'SELECT',
  'RADIO',
  'CHECKBOX',
  'CONSENT',
  'HIDDEN',
] as const;

export const formFieldSchema = z.object({
  id: z.string().optional().nullable(),
  type: z.enum(formFieldTypes),
  label: z.string().trim().min(1, 'Every field needs a label').max(160),
  // Machine key used as the submission key and the lead mapping hint.
  name: z
    .string()
    .max(60)
    .transform((v) => v.trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '')),
  placeholder: optional(160),
  helpText: optional(200),
  defaultValue: optional(200),
  isRequired: z.boolean().default(false),
  width: z.enum(['full', 'half']).default('full'),
  options: z
    .array(z.object({ label: z.string().max(120), value: z.string().max(120) }))
    .max(50)
    .default([]),
  minLength: z.number().int().min(0).max(5000).nullable().optional(),
  maxLength: z.number().int().min(1).max(20000).nullable().optional(),
  pattern: optional(200),
});

export const formInputSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(160),
  slug: z
    .string()
    .max(160)
    .transform((v) => slugify(v)),
  description: optional(500),
  isActive: z.boolean().default(true),
  submitLabel: z.string().trim().min(1).max(60).default('Submit'),
  successMessage: z.string().trim().min(1).max(600).default('Thank you.'),
  redirectUrl: optional(500),
  leadSource: optional(120),
  defaultProductId: optional(40),
  createsLead: z.boolean().default(true),
  notifyEmails: optional(500),
  consentText: optional(600),
  fields: z.array(formFieldSchema).max(40).default([]),
});

export type FormInput = z.infer<typeof formInputSchema>;

/** Field names must be unique within a form — they key the submission payload. */
export function duplicateFieldNames(fields: Array<{ name: string }>): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const field of fields) {
    if (seen.has(field.name)) duplicates.add(field.name);
    seen.add(field.name);
  }
  return Array.from(duplicates);
}
