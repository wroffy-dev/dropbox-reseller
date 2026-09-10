import { z } from 'zod';
import type { PublicFormField } from '@/lib/services/forms';

/** Attribution captured client-side and posted with every submission. */
export const attributionSchema = z.object({
  utmSource: z.string().max(200).optional().nullable(),
  utmMedium: z.string().max(200).optional().nullable(),
  utmCampaign: z.string().max(200).optional().nullable(),
  utmTerm: z.string().max(200).optional().nullable(),
  utmContent: z.string().max(200).optional().nullable(),
  firstUtmSource: z.string().max(200).optional().nullable(),
  firstUtmMedium: z.string().max(200).optional().nullable(),
  firstUtmCampaign: z.string().max(200).optional().nullable(),
  firstUtmTerm: z.string().max(200).optional().nullable(),
  firstUtmContent: z.string().max(200).optional().nullable(),
  firstLandingUrl: z.string().max(500).optional().nullable(),
  firstTouchAt: z.string().max(40).optional().nullable(),
  referrer: z.string().max(500).optional().nullable(),
  landingUrl: z.string().max(500).optional().nullable(),
  pagePath: z.string().max(500).optional().nullable(),
  ctaLabel: z.string().max(120).optional().nullable(),
  ctaLocation: z.string().max(120).optional().nullable(),
});

export type Attribution = z.infer<typeof attributionSchema>;

export const submissionEnvelopeSchema = z.object({
  formSlug: z.string().min(1).max(120),
  productId: z.string().max(40).optional().nullable(),
  leadMagnetId: z.string().max(40).optional().nullable(),
  /** Honeypot — bots fill it, humans never see it. */
  website: z.string().max(200).optional().nullable(),
  /** Milliseconds between render and submit; sub-second submits are bots. */
  elapsedMs: z.coerce.number().optional().nullable(),
  values: z.record(z.string(), z.union([z.string(), z.array(z.string())])),
  attribution: attributionSchema.optional(),
  /**
   * Math CAPTCHA: the signed challenge the visitor was shown, and their
   * answer. Only present when the form has it switched on. The expected answer
   * is never sent to the browser and never comes back from it — the server
   * recomputes it from the signed token.
   */
  captchaToken: z.string().max(400).optional().nullable(),
  captchaAnswer: z.string().max(10).optional().nullable(),
});

export type SubmissionEnvelope = z.infer<typeof submissionEnvelopeSchema>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
const PHONE_RE = /^[+\d][\d\s().-]{5,24}$/;

/**
 * Builds a Zod schema from the admin-configured field definitions, so the
 * server enforces exactly the rules the admin set — never the client's copy.
 */
export function buildFieldSchema(fields: PublicFormField[]): z.ZodType<Record<string, unknown>> {
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const field of fields) {
    let rule: z.ZodTypeAny;

    switch (field.type) {
      // A consent box is a single yes/no the visitor must actively tick when it
      // is required — it never carries multiple values like a checkbox group.
      case 'CONSENT': {
        rule = z
          .union([z.string(), z.array(z.string())])
          .transform((v) => (Array.isArray(v) ? (v.length > 0 ? 'true' : '') : v));
        if (field.isRequired) {
          rule = rule.refine((v) => v === 'true' || v === 'on' || v === 'checked', {
            message: `${field.label} must be accepted`,
          });
        }
        shape[field.name] = rule.optional();
        continue;
      }

      case 'CHECKBOX':
        rule = z
          .union([z.string(), z.array(z.string())])
          .transform((v) => (Array.isArray(v) ? v.join(', ') : v));
        if (field.isRequired) {
          rule = rule.refine((v) => Boolean(v && v !== 'false'), {
            message: `${field.label} is required`,
          });
        }
        shape[field.name] = rule.optional();
        continue;

      case 'EMAIL': {
        let s = z.string().trim().max(320);
        s = s.refine((v) => !v || EMAIL_RE.test(v), { message: 'Enter a valid email address' });
        rule = s;
        break;
      }

      case 'PHONE': {
        let s = z.string().trim().max(30);
        s = s.refine((v) => !v || PHONE_RE.test(v), { message: 'Enter a valid phone number' });
        rule = s;
        break;
      }

      case 'NUMBER': {
        rule = z
          .string()
          .trim()
          .max(20)
          .refine((v) => !v || /^-?\d+(\.\d+)?$/.test(v), { message: 'Enter a number' });
        break;
      }

      case 'SELECT':
      case 'RADIO': {
        const allowed = field.options.map((o) => o.value);
        rule = z
          .string()
          .trim()
          .refine((v) => !v || allowed.length === 0 || allowed.includes(v), {
            message: 'Choose one of the available options',
          });
        break;
      }

      case 'URL': {
        rule = z
          .string()
          .trim()
          .max(500)
          .refine((v) => !v || /^(https?:\/\/)?[\w.-]+\.[a-z]{2,}([/?#].*)?$/i.test(v), {
            message: 'Enter a valid web address',
          });
        break;
      }

      case 'DATE': {
        rule = z
          .string()
          .trim()
          .max(10)
          .refine((v) => !v || /^\d{4}-\d{2}-\d{2}$/.test(v), { message: 'Choose a date' });
        break;
      }

      case 'TEXTAREA':
        rule = z
          .string()
          .trim()
          .max(field.maxLength ?? 5000);
        break;

      default:
        rule = z
          .string()
          .trim()
          .max(field.maxLength ?? 500);
    }

    let stringRule = rule as z.ZodType<string>;

    if (field.minLength) {
      stringRule = stringRule.refine((v) => !v || v.length >= field.minLength!, {
        message: `${field.label} must be at least ${field.minLength} characters`,
      });
    }
    if (field.pattern) {
      const pattern = field.pattern;
      stringRule = stringRule.refine(
        (v) => {
          if (!v) return true;
          try {
            return new RegExp(pattern).test(v);
          } catch {
            return true; // an invalid stored pattern must not block submissions
          }
        },
        { message: `${field.label} is not in the expected format` },
      );
    }
    if (field.isRequired) {
      stringRule = stringRule.refine((v) => Boolean(v && v.trim()), {
        message: `${field.label} is required`,
      });
      shape[field.name] = stringRule;
    } else {
      shape[field.name] = stringRule.optional().default('');
    }
  }

  return z.object(shape).passthrough() as unknown as z.ZodType<Record<string, unknown>>;
}

/** Maps well-known field names onto Lead columns. */
export function extractLeadCore(values: Record<string, unknown>, fields: PublicFormField[]) {
  const get = (predicate: (f: PublicFormField) => boolean): string => {
    const field = fields.find(predicate);
    if (!field) return '';
    const value = values[field.name];
    return typeof value === 'string' ? value.trim() : '';
  };

  const name =
    get((f) => f.type === 'NAME') ||
    get((f) => /^(full_?name|name)$/i.test(f.name)) ||
    [get((f) => /first_?name/i.test(f.name)), get((f) => /last_?name/i.test(f.name))]
      .filter(Boolean)
      .join(' ');

  const email = get((f) => f.type === 'EMAIL') || get((f) => /email/i.test(f.name));
  const phone = get((f) => f.type === 'PHONE') || get((f) => /phone|mobile/i.test(f.name));
  const company =
    get((f) => f.type === 'COMPANY') ||
    get((f) => /company|organisation|organization/i.test(f.name));
  const jobTitle = get((f) => /job_?title|designation|role/i.test(f.name));
  const message =
    get((f) => f.type === 'TEXTAREA') || get((f) => /message|comments|requirement/i.test(f.name));

  return { name, email, phone, company, jobTitle, message };
}
