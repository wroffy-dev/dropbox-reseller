import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { mockAuth, uniqueSuffix } from '../helpers';

mockAuth();

const { prisma } = await import('@/lib/db/prisma');
const { submitForm } = await import('@/lib/actions/submit-form');
const { getFooterNewsletterForm } = await import('@/lib/services/forms');
const { __resetRateLimits } = await import('@/lib/utils/rate-limit');

const suffix = uniqueSuffix();
const newsletterSlug = `footer-newsletter-${suffix}`;
const multiSlug = `footer-multi-${suffix}`;

let newsletterId = '';
let multiId = '';

/**
 * The footer's email column.
 *
 * These exercise the claim the footer rests on: a subscription is an ordinary
 * form submission, so it becomes a lead in the same dashboard with the same
 * attribution, and the column refuses to render against a form a single email
 * input could not satisfy.
 */
beforeAll(async () => {
  const newsletter = await prisma.form.create({
    data: {
      name: 'Footer newsletter',
      slug: newsletterSlug,
      isActive: true,
      leadSource: 'Footer newsletter',
      successMessage: 'Thanks — you are on the list.',
      fields: {
        create: [
          {
            type: 'EMAIL',
            label: 'Email',
            name: 'email',
            isRequired: true,
            sortOrder: 0,
            width: 'full',
          },
        ],
      },
    },
  });
  newsletterId = newsletter.id;

  // A form that also demands a name: one input cannot answer it.
  const multi = await prisma.form.create({
    data: {
      name: 'Contact-ish',
      slug: multiSlug,
      isActive: true,
      fields: {
        create: [
          { type: 'EMAIL', label: 'Email', name: 'email', isRequired: true, sortOrder: 0, width: 'full' },
          { type: 'NAME', label: 'Name', name: 'name', isRequired: true, sortOrder: 1, width: 'full' },
        ],
      },
    },
  });
  multiId = multi.id;
});

beforeEach(() => {
  __resetRateLimits();
});

afterAll(async () => {
  await prisma.lead.deleteMany({ where: { formId: { in: [newsletterId, multiId] } } });
  await prisma.formSubmission.deleteMany({ where: { formId: { in: [newsletterId, multiId] } } });
  await prisma.form.deleteMany({ where: { id: { in: [newsletterId, multiId] } } });
});

describe('footer newsletter form resolution', () => {
  it('resolves the email field name the footer submits into', async () => {
    const resolved = await getFooterNewsletterForm(newsletterId);
    expect(resolved).toEqual({
      formSlug: newsletterSlug,
      emailField: 'email',
      requireCaptcha: false,
    });
  });

  it('refuses a form whose other required fields cannot be answered', async () => {
    expect(await getFooterNewsletterForm(multiId)).toBeNull();
  });

  it('refuses a missing or unset form rather than rendering a dead input', async () => {
    expect(await getFooterNewsletterForm(null)).toBeNull();
    expect(await getFooterNewsletterForm('does-not-exist')).toBeNull();
  });
});

describe('footer newsletter submission', () => {
  it('creates a lead carrying the footer source, page and UTM attribution', async () => {
    const email = `subscriber-${suffix}@example.test`;
    const result = await submitForm({
      formSlug: newsletterSlug,
      elapsedMs: 5_000,
      values: { email },
      attribution: {
        pagePath: '/pricing',
        landingUrl: 'https://example.test/pricing',
        referrer: 'https://www.google.com/',
        utmSource: 'newsletter',
        utmMedium: 'footer',
        utmCampaign: 'always-on',
        ctaLocation: 'Footer',
      },
    });

    expect(result.ok).toBe(true);

    const lead = await prisma.lead.findFirstOrThrow({ where: { email } });
    expect(lead.source).toBe('Footer newsletter');
    expect(lead.ctaLocation).toBe('Footer');
    expect(lead.utmSource).toBe('newsletter');
    expect(lead.utmMedium).toBe('footer');
    expect(lead.referrer).toBe('https://www.google.com/');
    expect(lead.landingUrl).toBe('https://example.test/pricing');
    expect(lead.formId).toBe(newsletterId);
  });

  it('rejects an address that is not an email', async () => {
    const result = await submitForm({
      formSlug: newsletterSlug,
      elapsedMs: 5_000,
      values: { email: 'not-an-address' },
    });

    expect(result.ok).toBe(false);
  });

  it('does not create a second lead for a repeated submission', async () => {
    const email = `repeat-${suffix}@example.test`;
    const payload = { formSlug: newsletterSlug, elapsedMs: 5_000, values: { email } };

    expect((await submitForm(payload)).ok).toBe(true);
    // The visitor is told it worked either way — saying "you already
    // subscribed" would leak who is on the list.
    expect((await submitForm(payload)).ok).toBe(true);

    expect(await prisma.lead.count({ where: { email } })).toBe(1);
    expect(await prisma.formSubmission.count({ where: { formId: newsletterId, leadId: { not: null } } })).toBeGreaterThan(0);
  });

  it('still accepts a genuinely different submission on the same form', async () => {
    const first = `distinct-a-${suffix}@example.test`;
    const second = `distinct-b-${suffix}@example.test`;

    expect((await submitForm({ formSlug: newsletterSlug, elapsedMs: 5_000, values: { email: first } })).ok).toBe(true);
    expect((await submitForm({ formSlug: newsletterSlug, elapsedMs: 5_000, values: { email: second } })).ok).toBe(true);

    expect(await prisma.lead.count({ where: { email: { in: [first, second] } } })).toBe(2);
  });

  it('swallows a honeypot submission without creating anything', async () => {
    const email = `bot-${suffix}@example.test`;
    const result = await submitForm({
      formSlug: newsletterSlug,
      elapsedMs: 5_000,
      website: 'https://spam.example',
      values: { email },
    });

    expect(result.ok).toBe(true);
    expect(await prisma.lead.count({ where: { email } })).toBe(0);
  });
});
