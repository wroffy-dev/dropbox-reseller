'use server';

import { prisma } from '@/lib/db/prisma';
import { getPublicForm } from '@/lib/services/forms';
import {
  submissionEnvelopeSchema,
  buildFieldSchema,
  extractLeadCore,
  activeFields,
} from '@/lib/validation/form-submission';
import { notifyNewLead, logLeadActivity } from '@/lib/services/leads';
import { getEmailSettings, getWebsiteSettings } from '@/lib/services/settings';
import { sendTemplate } from '@/lib/email/mailer';
import { rateLimit } from '@/lib/utils/rate-limit';
import { verifyCaptcha, CAPTCHA_MESSAGES } from '@/lib/forms/captcha';
import { requestContext } from '@/lib/utils/request';
import { hashIp } from '@/lib/utils/crypto';
import { sanitizeText } from '@/lib/utils/sanitize';
import { productContext, isSystemFieldKey } from '@/lib/forms/system-context';
import { success, failure, type ActionResult } from '@/lib/utils/result';
import type { Prisma } from '@prisma/client';

export type SubmitFormResult = ActionResult<{ message: string; redirectUrl: string | null }>;

/**
 * Public form submission — the single entry point for every lead on the site.
 *
 * Validation is rebuilt from the stored field definitions, so a tampered client
 * payload cannot bypass required fields or option lists.
 */
export async function submitForm(payload: unknown): Promise<SubmitFormResult> {
  const parsed = submissionEnvelopeSchema.safeParse(payload);
  if (!parsed.success) return failure('That submission could not be read. Please try again.');
  const envelope = parsed.data;

  // Spam gates: honeypot + minimum fill time.
  if (envelope.website) return success({ message: 'Thank you.', redirectUrl: null });
  if (
    typeof envelope.elapsedMs === 'number' &&
    envelope.elapsedMs > 0 &&
    envelope.elapsedMs < 1200
  ) {
    return failure('That was submitted too quickly. Please try again.');
  }

  const { ip, userAgent } = await requestContext();
  const ipKey = hashIp(ip) ?? 'anonymous';
  const limit = rateLimit(`form:${envelope.formSlug}:${ipKey}`, 5, 600);
  if (!limit.ok) {
    return failure(`Too many submissions. Please try again in ${limit.retryAfterSeconds} seconds.`);
  }

  const form = await getPublicForm(envelope.formSlug);
  if (!form) return failure('This form is no longer available.');

  // Math CAPTCHA, when the admin switched it on for this form. Verified here
  // and nowhere else: the browser only ever held a question and a signed
  // token, so this is the first and only place the answer is judged. Forms
  // without the flag skip it entirely and submit exactly as they always did.
  if (form.requireCaptcha) {
    const verdict = verifyCaptcha(envelope.captchaToken, envelope.captchaAnswer);
    if (!verdict.ok) {
      return failure(CAPTCHA_MESSAGES[verdict.reason], {
        _captcha: [CAPTCHA_MESSAGES[verdict.reason]],
      });
    }
  }

  // Only the fields the visitor could actually have answered are judged: a
  // question hidden by conditional logic must not be required of them, and a
  // read-only field's value is never taken from the payload. Both decisions are
  // made here from the stored definitions, so the client cannot influence them.
  const judged = activeFields(form.fields, envelope.values);
  const fieldSchema = buildFieldSchema(judged, form.design);
  const valuesResult = fieldSchema.safeParse(envelope.values);
  if (!valuesResult.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of valuesResult.error.issues) {
      const key = issue.path.join('.') || '_form';
      (fieldErrors[key] ??= []).push(issue.message);
    }
    return failure('Please correct the highlighted fields.', fieldErrors);
  }

  const values = valuesResult.data as Record<string, string>;

  // Read-only and conditionally hidden fields fall back to the default the
  // admin configured, never to whatever the browser sent. This is what stops a
  // crafted payload rewriting a trusted value — a product id or plan injected
  // as a system field, say — while still recording the value the form intended.
  const judgedNames = new Set(judged.map((field) => field.name));
  for (const field of form.fields) {
    if (judgedNames.has(field.name) || field.type === 'HIDDEN') continue;
    // A field the visitor could not answer keeps the admin's default, or
    // nothing when it was conditionally hidden — never the submitted value.
    const serverSourced = field.isReadOnly || field.isHidden || field.settings.system;
    values[field.name] = serverSourced ? (field.defaultValue ?? '') : '';
  }

  const formRecord = await prisma.form.findUnique({
    where: { id: form.id },
    select: {
      createsLead: true,
      leadSource: true,
      defaultProductId: true,
      notifyEmails: true,
      name: true,
    },
  });

  const attribution = envelope.attribution ?? {};
  const productId = envelope.productId || formRecord?.defaultProductId || null;

  // System fields are filled from the product row, resolved here from the
  // trusted product id. An admin can put a `product_name` or `plan` field on
  // any form without that becoming a way for a crafted payload to claim the
  // enquiry was about something else.
  const systemFields = form.fields.filter((field) => field.settings.system);
  if (systemFields.length > 0 && productId) {
    const product = await prisma.product.findFirst({
      where: { id: productId, deletedAt: null },
      select: {
        id: true,
        name: true,
        slug: true,
        sku: true,
        billingPeriod: true,
        priceSuffix: true,
        monthlyPrice: true,
        annualPrice: true,
      },
    });

    if (product) {
      const context = productContext(product);
      for (const field of systemFields) {
        if (!isSystemFieldKey(field.name)) continue;
        const resolved = context[field.name];
        // A key with nothing behind it keeps the admin's default rather than
        // blanking the field.
        if (resolved) values[field.name] = resolved;
      }
    }
  }

  // Computed after the system fill so a mapped field that is also injected
  // (a company name carried from context, say) reaches the lead.
  const core = extractLeadCore(values, form.fields);

  const landingPath = attribution.pagePath ?? attribution.landingUrl ?? null;
  const landingPage = landingPath
    ? await prisma.page.findFirst({
        where: { slug: landingPath.replace(/^\/+|\/+$/g, ''), deletedAt: null },
        select: { id: true },
      })
    : null;

  let leadId: string | null = null;

  if (formRecord?.createsLead !== false && core.email) {
    const firstTouchAt = attribution.firstTouchAt ? new Date(attribution.firstTouchAt) : null;

    const lead = await prisma.lead.create({
      data: {
        name: sanitizeText(core.name) || core.email.split('@')[0] || 'Unknown',
        email: core.email.toLowerCase(),
        phone: sanitizeText(core.phone) || null,
        company: sanitizeText(core.company) || null,
        jobTitle: sanitizeText(core.jobTitle) || null,
        message: sanitizeText(core.message) || null,
        source: formRecord?.leadSource || form.name,
        campaign: attribution.utmCampaign ?? null,
        ctaLabel: attribution.ctaLabel ?? null,
        ctaLocation: attribution.ctaLocation ?? null,
        utmSource: attribution.utmSource ?? null,
        utmMedium: attribution.utmMedium ?? null,
        utmCampaign: attribution.utmCampaign ?? null,
        utmTerm: attribution.utmTerm ?? null,
        utmContent: attribution.utmContent ?? null,
        firstUtmSource: attribution.firstUtmSource ?? attribution.utmSource ?? null,
        firstUtmMedium: attribution.firstUtmMedium ?? attribution.utmMedium ?? null,
        firstUtmCampaign: attribution.firstUtmCampaign ?? attribution.utmCampaign ?? null,
        firstUtmTerm: attribution.firstUtmTerm ?? attribution.utmTerm ?? null,
        firstUtmContent: attribution.firstUtmContent ?? attribution.utmContent ?? null,
        firstLandingUrl: attribution.firstLandingUrl ?? attribution.landingUrl ?? null,
        firstTouchAt:
          firstTouchAt && !Number.isNaN(firstTouchAt.getTime()) ? firstTouchAt : new Date(),
        referrer: attribution.referrer ?? null,
        landingUrl: attribution.landingUrl ?? attribution.pagePath ?? null,
        userAgent,
        ipHash: hashIp(ip),
        productId,
        landingPageId: landingPage?.id ?? null,
        formId: form.id,
        leadMagnetId: envelope.leadMagnetId || null,
      },
      include: { product: { select: { name: true } }, form: { select: { name: true } } },
    });
    leadId = lead.id;

    await logLeadActivity({
      leadId: lead.id,
      type: 'CREATED',
      summary: `Lead captured from “${form.name}”${lead.product?.name ? ` for ${lead.product.name}` : ''}`,
      meta: { formSlug: form.slug, utmSource: lead.utmSource },
    });

    // Notifications must never block the visitor's response.
    void notifyNewLead({ lead, extraRecipients: splitEmails(formRecord?.notifyEmails) });
    void sendLeadConfirmation(lead.email, lead.name, lead.product?.name ?? null);
  }

  await prisma.formSubmission.create({
    data: {
      formId: form.id,
      data: values as Prisma.InputJsonValue,
      ipHash: hashIp(ip),
      userAgent,
      referrer: attribution.referrer ?? null,
      pageUrl: attribution.landingUrl ?? attribution.pagePath ?? null,
      leadId,
    },
  });

  void notifySubmission(
    form.id,
    form.name,
    values,
    attribution.landingUrl ?? null,
    formRecord?.notifyEmails,
  );

  return success({ message: form.successMessage, redirectUrl: form.redirectUrl });
}

function splitEmails(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(/[,;\n]/)
    .map((e) => e.trim())
    .filter((e) => e.includes('@'));
}

async function sendLeadConfirmation(to: string, name: string, productName: string | null) {
  try {
    const site = await getWebsiteSettings();
    await sendTemplate({
      key: 'lead_confirmation',
      to,
      tokens: {
        site_name: site.siteName,
        lead_name: name,
        product_suffix: productName ? ` about ${productName}` : '',
      },
    });
  } catch (error) {
    console.error('[form] confirmation email failed', error);
  }
}

async function notifySubmission(
  formId: string,
  formName: string,
  values: Record<string, string>,
  landingUrl: string | null,
  notifyEmails: string | null | undefined,
) {
  try {
    const [email, site] = await Promise.all([getEmailSettings(), getWebsiteSettings()]);
    if (!email.notifyOnSubmission) return;
    const recipients = Array.from(
      new Set([...splitEmails(notifyEmails), ...splitEmails(email.salesNotificationEmails)]),
    );
    if (recipients.length === 0) return;

    const rows = Object.entries(values)
      .map(
        ([key, value]) =>
          `<tr><td style="padding:6px;border:1px solid #e3e8f0"><strong>${escapeHtml(key)}</strong></td><td style="padding:6px;border:1px solid #e3e8f0">${escapeHtml(String(value))}</td></tr>`,
      )
      .join('');

    await sendTemplate({
      key: 'form_submission',
      to: recipients,
      tokens: {
        site_name: site.siteName,
        form_name: formName,
        landing_url: landingUrl ?? '—',
        submission_table: `<table style="border-collapse:collapse">${rows}</table>`,
      },
    });
  } catch (error) {
    console.error('[form] submission notification failed', error);
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
