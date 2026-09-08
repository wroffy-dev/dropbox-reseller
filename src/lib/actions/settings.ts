'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import { authorize } from '@/lib/auth/guards';
import { recordAudit } from '@/lib/services/audit';
import { sanitizeText, safeUrl } from '@/lib/utils/sanitize';
import { encryptSecret } from '@/lib/utils/crypto';
import { verifySmtp, sendMail } from '@/lib/email/mailer';
import { success, failure, toActionError, type ActionResult } from '@/lib/utils/result';

const optional = (max: number) =>
  z
    .string()
    .max(max)
    .transform((v) => v.trim())
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

const hexColor = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, 'Use a 6-digit hex colour like #0061FF');

const fontWeight = z.string().trim().regex(/^[1-9]00$/, 'Choose a weight between 100 and 900');

const websiteSettingsSchema = z.object({
  siteName: z.string().trim().min(1, 'Site name is required').max(120),
  siteTitle: z.string().trim().max(200),
  siteDescription: z.string().trim().max(500),
  siteUrl: z.string().trim().url('Enter the full URL including https://').max(300),
  contactEmail: optional(200),
  contactPhone: optional(40),
  whatsappNumber: optional(40),
  address: optional(400),

  linkedinUrl: optional(300),
  twitterUrl: optional(300),
  facebookUrl: optional(300),
  instagramUrl: optional(300),
  youtubeUrl: optional(300),

  logoUrl: optional(500),
  logoDarkUrl: optional(500),
  faviconUrl: optional(500),
  ogImageUrl: optional(500),

  headingFont: z.string().trim().min(1).max(80),
  bodyFont: z.string().trim().min(1).max(80),
  headingWeight: fontWeight,
  bodyWeight: fontWeight,
  baseFontSize: z
    .string()
    .trim()
    .regex(/^\d{1,2}(\.\d+)?(px|rem)$/, 'Use a size like 16px or 1rem'),

  colorPrimary: hexColor,
  colorSecondary: hexColor,
  colorAccent1: hexColor,
  colorAccent2: hexColor,
  colorBackground: hexColor,
  colorText: hexColor,
  colorMuted: hexColor,
  colorBorder: hexColor,

  announcementText: optional(300),
  announcementUrl: optional(300),
  announcementEnabled: z.coerce.boolean().default(false),
  headerCtaLabel: optional(60),
  headerCtaUrl: optional(300),
  headerSecondaryCtaLabel: optional(60),
  headerSecondaryCtaUrl: optional(300),

  footerDescription: optional(600),
  copyrightText: optional(300),
  defaultCurrency: z.string().trim().length(3),
  maintenanceMode: z.coerce.boolean().default(false),
});

export async function saveWebsiteSettings(formData: FormData): Promise<ActionResult> {
  try {
    const user = await authorize('settings.manage');
    const raw = Object.fromEntries(formData.entries()) as Record<string, string>;

    const input = websiteSettingsSchema.parse({
      ...raw,
      announcementEnabled: raw.announcementEnabled === 'true',
      maintenanceMode: raw.maintenanceMode === 'true',
    });

    // URL-ish fields are normalised through the same guard the renderer uses,
    // so a javascript: value can never reach an href.
    const data = {
      ...input,
      siteName: sanitizeText(input.siteName),
      siteTitle: sanitizeText(input.siteTitle),
      siteDescription: sanitizeText(input.siteDescription),
      address: input.address ? sanitizeText(input.address) : null,
      footerDescription: input.footerDescription ? sanitizeText(input.footerDescription) : null,
      copyrightText: input.copyrightText ? sanitizeText(input.copyrightText) : null,
      announcementText: input.announcementText ? sanitizeText(input.announcementText) : null,
      announcementUrl: safeUrl(input.announcementUrl),
      headerCtaUrl: safeUrl(input.headerCtaUrl),
      headerSecondaryCtaUrl: safeUrl(input.headerSecondaryCtaUrl),
      linkedinUrl: safeUrl(input.linkedinUrl),
      twitterUrl: safeUrl(input.twitterUrl),
      facebookUrl: safeUrl(input.facebookUrl),
      instagramUrl: safeUrl(input.instagramUrl),
      youtubeUrl: safeUrl(input.youtubeUrl),
      logoUrl: safeUrl(input.logoUrl),
      logoDarkUrl: safeUrl(input.logoDarkUrl),
      faviconUrl: safeUrl(input.faviconUrl),
      ogImageUrl: safeUrl(input.ogImageUrl),
      defaultCurrency: input.defaultCurrency.toUpperCase(),
    };

    await prisma.websiteSettings.upsert({
      where: { id: 'singleton' },
      update: data,
      create: { id: 'singleton', ...data },
    });

    await recordAudit({
      actor: user,
      action: 'updated',
      entity: 'WebsiteSettings',
      summary: 'Updated website settings',
    });

    // Colours, fonts, header and footer are all read in the root layout.
    revalidatePath('/', 'layout');
    revalidatePath('/admin', 'layout');
    return success(undefined, 'Website settings saved.');
  } catch (error) {
    return toActionError(error);
  }
}

const emailSettingsSchema = z.object({
  host: optional(200),
  port: z.coerce.number().int().min(1).max(65535).default(587),
  username: optional(200),
  password: z.string().max(300).optional().nullable(),
  encryption: z.enum(['none', 'tls', 'ssl']).default('tls'),
  fromName: z.string().trim().min(1, 'A sender name is required').max(120),
  fromEmail: optional(200),
  replyTo: optional(200),
  notifyOnNewLead: z.coerce.boolean().default(true),
  notifyOnAssignment: z.coerce.boolean().default(true),
  notifyOnSubmission: z.coerce.boolean().default(false),
  salesNotificationEmails: optional(600),
  isEnabled: z.coerce.boolean().default(false),
});

export async function saveEmailSettings(formData: FormData): Promise<ActionResult> {
  try {
    const user = await authorize('settings.manage');
    const raw = Object.fromEntries(formData.entries()) as Record<string, string>;

    const input = emailSettingsSchema.parse({
      ...raw,
      notifyOnNewLead: raw.notifyOnNewLead === 'true',
      notifyOnAssignment: raw.notifyOnAssignment === 'true',
      notifyOnSubmission: raw.notifyOnSubmission === 'true',
      isEnabled: raw.isEnabled === 'true',
    });

    if (input.isEnabled && !input.host) {
      return failure('Enter an SMTP host before enabling email.', { host: ['Required to send email'] });
    }
    if (input.isEnabled && !input.fromEmail) {
      return failure('Enter a from address before enabling email.', {
        fromEmail: ['Required to send email'],
      });
    }

    const { password, ...rest } = input;

    // An empty password field means "leave the stored one alone" — the current
    // value is never sent to the browser, so it cannot be echoed back.
    const data = {
      ...rest,
      ...(password ? { password: encryptSecret(password) } : {}),
    };

    await prisma.emailSettings.upsert({
      where: { id: 'singleton' },
      update: data,
      create: { id: 'singleton', ...data },
    });

    await recordAudit({
      actor: user,
      action: 'updated',
      entity: 'EmailSettings',
      summary: `Updated SMTP settings (${input.isEnabled ? 'enabled' : 'disabled'})`,
    });

    revalidatePath('/admin/settings/email');
    return success(undefined, 'Email settings saved.');
  } catch (error) {
    return toActionError(error);
  }
}

export async function testSmtpConnection(): Promise<ActionResult> {
  try {
    await authorize('settings.manage');
    const result = await verifySmtp();
    if (!result.sent) return failure(result.reason ?? 'Could not connect to the SMTP server.');
    return success(undefined, 'Connected to the SMTP server successfully.');
  } catch (error) {
    return toActionError(error);
  }
}

const testEmailSchema = z.object({ to: z.string().trim().email('Enter a valid email address') });

export async function sendTestEmail(input: unknown): Promise<ActionResult> {
  try {
    const user = await authorize('settings.manage');
    const { to } = testEmailSchema.parse(input);

    const result = await sendMail({
      to,
      subject: 'Test email from your website',
      html: `<p>This is a test message sent from your website's admin panel by ${sanitizeText(user.name)}.</p>
<p>If you received it, SMTP is configured correctly and lead notifications will be delivered.</p>`,
    });

    if (!result.sent) return failure(result.reason ?? 'The test email could not be sent.');
    return success(undefined, `Test email sent to ${to}.`);
  } catch (error) {
    return toActionError(error);
  }
}

const templateSchema = z.object({
  key: z.string().min(1).max(60),
  subject: z.string().trim().min(1, 'A subject is required').max(300),
  body: z.string().trim().min(1, 'A body is required').max(20_000),
  isActive: z.coerce.boolean().default(true),
});

export async function saveEmailTemplate(input: unknown): Promise<ActionResult> {
  try {
    const user = await authorize('settings.manage');
    const parsed = templateSchema.parse(input);

    const existing = await prisma.emailTemplate.findUnique({ where: { key: parsed.key } });
    if (!existing) return failure('That template does not exist.');

    await prisma.emailTemplate.update({
      where: { key: parsed.key },
      data: { subject: parsed.subject, body: parsed.body, isActive: parsed.isActive },
    });

    await recordAudit({
      actor: user,
      action: 'updated',
      entity: 'EmailTemplate',
      entityId: existing.id,
      summary: `Updated the “${existing.name}” email template`,
    });

    revalidatePath('/admin/settings/email');
    return success(undefined, 'Template saved.');
  } catch (error) {
    return toActionError(error);
  }
}
