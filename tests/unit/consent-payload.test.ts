import { describe, it, expect } from 'vitest';
import { submissionEnvelopeSchema } from '@/lib/validation/form-submission';
import {
  consentSubmissionSchema,
  validateConsent,
  buildConsentEvidence,
  DEFAULT_CONSENT_NOTICE,
  CONSENT_MESSAGES,
  type ConsentRequirement,
} from '@/lib/privacy/consent';

/**
 * The consent object inside a submission.
 *
 * It travels inside the envelope, so anything that makes it fail to parse makes
 * the *envelope* fail — and the visitor is told the submission "could not be
 * read", about a form they filled in correctly, with nothing they can change.
 * That is exactly what happened: `getCurrentNotice` returns version 0 for a
 * site with no notice published in the CMS, the page sent that 0 straight back,
 * and the schema required 1 or more. Every public form on such a site was
 * unsubmittable.
 *
 * So these tests pin two things at once: the consent object can never sink the
 * envelope, and it can never report more consent than was actually given.
 */

function envelope(consent: unknown) {
  return submissionEnvelopeSchema.safeParse({
    formSlug: 'contact',
    values: { name: 'Himanshu Verma', email: 'himanshu@example.com' },
    consent,
  });
}

const requirement: ConsentRequirement = {
  applies: true,
  lawfulBasis: 'CONSENT',
  requireEnquiry: true,
  offerMarketing: true,
  requireTerms: false,
  noticeKey: 'default',
  noticeVersion: 0,
  notice: DEFAULT_CONSENT_NOTICE,
};

describe('consent inside the submission envelope', () => {
  it('accepts version 0, the notice built into the site', () => {
    const parsed = envelope({
      noticeKey: 'default',
      noticeVersion: 0,
      enquiry: true,
      marketing: false,
      terms: false,
    });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.consent).toMatchObject({
      noticeVersion: 0,
      enquiry: true,
      marketing: false,
    });
  });

  it('accepts a version published in the CMS', () => {
    const parsed = envelope({ noticeKey: 'default', noticeVersion: 3, enquiry: true });
    expect(parsed.success && parsed.data.consent?.noticeVersion).toBe(3);
  });

  it('never fails the envelope over an unreadable version', () => {
    for (const noticeVersion of ['banana', -1, 2.5, null, {}]) {
      const parsed = envelope({ noticeVersion, enquiry: true });
      expect(parsed.success, `version ${JSON.stringify(noticeVersion)}`).toBe(true);
    }
  });

  it('never fails the envelope over an unreadable notice key', () => {
    const parsed = envelope({ noticeKey: 42, enquiry: true });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.consent?.noticeKey).toBeUndefined();
  });

  it('leaves the envelope valid when no consent object is sent at all', () => {
    const parsed = submissionEnvelopeSchema.safeParse({
      formSlug: 'contact',
      values: { name: 'Himanshu Verma' },
    });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.consent).toBeUndefined();
  });
});

describe('a box is ticked only when it was ticked', () => {
  it('does not read the string "false" as agreement', () => {
    const parsed = consentSubmissionSchema.parse({
      enquiry: 'false',
      marketing: 'false',
      terms: 'false',
    });
    expect(parsed).toMatchObject({ enquiry: false, marketing: false, terms: false });
  });

  it('accepts the tokens a checkbox actually posts', () => {
    expect(consentSubmissionSchema.parse({ enquiry: 'on' }).enquiry).toBe(true);
    expect(consentSubmissionSchema.parse({ enquiry: 'true' }).enquiry).toBe(true);
    expect(consentSubmissionSchema.parse({ enquiry: true }).enquiry).toBe(true);
  });

  it('treats anything unrecognised as unticked', () => {
    for (const value of [undefined, null, 0, '', 'maybe', {}, []]) {
      expect(consentSubmissionSchema.parse({ enquiry: value }).enquiry).toBe(false);
    }
  });
});

describe('validation still enforces what the form asks for', () => {
  it('rejects a submission with the required enquiry box unticked', () => {
    const verdict = validateConsent(requirement, consentSubmissionSchema.parse({ enquiry: false }));
    expect(verdict).toMatchObject({ ok: false, field: 'enquiry' });
  });

  it('never rejects a submission for leaving marketing unticked', () => {
    const verdict = validateConsent(
      requirement,
      consentSubmissionSchema.parse({ noticeVersion: 0, enquiry: true, marketing: false }),
    );
    expect(verdict.ok).toBe(true);
  });

  it('asks the visitor to read again when the notice moved on under them', () => {
    const verdict = validateConsent(
      { ...requirement, noticeVersion: 2 },
      consentSubmissionSchema.parse({ noticeVersion: 1, enquiry: true }),
    );
    expect(verdict).toMatchObject({ ok: false, message: CONSENT_MESSAGES.stale });
  });

  it('records the notice the server is serving, not the version the page claimed', () => {
    const evidence = buildConsentEvidence(
      { ...requirement, noticeVersion: 4 },
      consentSubmissionSchema.parse({ noticeVersion: 1, enquiry: true, marketing: true }),
    );
    expect(evidence.noticeVersion).toBe(4);
    expect(evidence.enquiryConsent).toBe(true);
    expect(evidence.marketingConsent).toBe(true);
    expect(evidence.purposeText).toBe(DEFAULT_CONSENT_NOTICE.purposeText);
  });
});
