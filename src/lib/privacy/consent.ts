import { z } from 'zod';
import type { LawfulBasis } from '@prisma/client';

/**
 * The consent notice, as the form renders it and the evidence stores it.
 *
 * Three permissions, kept apart on purpose:
 *
 *  - **enquiry** — may we process what you sent in order to answer it. Required
 *    when the form's lawful basis is CONSENT, and the only one that can block a
 *    submission.
 *  - **marketing** — may we also send you unrelated marketing. Always optional;
 *    the server never rejects a submission for leaving it unticked.
 *  - **terms** — you accept the Terms & Conditions. Asked only by forms that
 *    need it, and recorded separately because accepting terms is not the same
 *    act as permitting data processing.
 *
 * Bundling them would produce exactly the "blanket consent covering unrelated
 * purposes" the requirement rules out, and would make the CRM unable to answer
 * "did this person agree to marketing?" without guessing.
 */

export const CONSENT_NOTICE_KEY_DEFAULT = 'default';

/** The shape of a notice, shared by the CMS editor and the renderer. */
export const consentNoticeSchema = z.object({
  purposeText: z.string().trim().min(1).max(2000),
  enquiryLabel: z.string().trim().min(1).max(1000),
  marketingLabel: z.string().trim().min(1).max(1000),
  termsLabel: z.string().trim().min(1).max(1000),
  withdrawalText: z.string().trim().min(1).max(1000),
  privacyUrl: z.string().trim().min(1).max(500),
  privacyVersion: z.string().trim().max(40).optional().nullable(),
  termsUrl: z.string().trim().min(1).max(500),
  termsVersion: z.string().trim().max(40).optional().nullable(),
});

export type ConsentNoticeContent = z.infer<typeof consentNoticeSchema>;

/**
 * The wording a site starts with.
 *
 * Deliberately specific about purpose rather than "we may contact you about
 * anything": a notice that does not say what the information is for cannot
 * support a consent-based lawful basis, whatever the tick box says. The
 * business is expected to review this text — see docs/CONSENT-AND-PRIVACY.md.
 */
export const DEFAULT_CONSENT_NOTICE: ConsentNoticeContent = {
  purposeText:
    'We use the details you enter here to respond to your enquiry, prepare a quotation, and keep a record of our correspondence with you. We also record your IP address and the page you submitted from, to help us detect abuse of this form.',
  enquiryLabel:
    'I agree that my details may be used to respond to this enquiry and to contact me about it.',
  marketingLabel:
    'Optional: I would also like to receive product news, offers and event invitations by email.',
  termsLabel: 'I have read and accept the Terms & Conditions.',
  withdrawalText:
    'You can withdraw your consent at any time, or ask what we hold about you, by emailing the address on our Privacy Policy. Withdrawing consent does not affect anything we did before you withdrew it.',
  privacyUrl: '/privacy',
  privacyVersion: null,
  termsUrl: '/terms',
  termsVersion: null,
};

/**
 * A ticked box, read strictly.
 *
 * `z.coerce.boolean()` reads the string "false" as true, because it is a
 * non-empty string — it would record consent nobody gave. Only the tokens a
 * checkbox actually posts count as ticked; anything else, including anything
 * unrecognised, is unticked.
 */
const ticked = z
  .unknown()
  .optional()
  .transform(
    (value) =>
      value === true || value === 'true' || value === 'on' || value === '1' || value === 'yes',
  );

/** What the browser sends back. Every box defaults to false, never to true. */
export const consentSubmissionSchema = z.object({
  /**
   * The notice family and version the visitor was actually shown.
   *
   * Version 0 is a real value, not a missing one: it is what `getCurrentNotice`
   * returns for a site with no notice stored, meaning “the wording compiled into
   * the code”. Rejecting it would reject every submission on such a site — and
   * because this object sits inside the submission envelope, the rejection is
   * the *whole envelope* failing to parse, which the visitor sees as an
   * unexplained “could not be read” with a form they cannot fix.
   *
   * For that reason nothing here can fail the parse. A version we cannot read
   * degrades to “unknown”, which costs only the staleness check below; the
   * evidence records the server's own notice and version either way, so a
   * mangled field can never make the record claim more than it should.
   */
  noticeKey: z.string().trim().max(60).optional().catch(undefined),
  noticeVersion: z.coerce.number().int().min(0).optional().catch(undefined),
  enquiry: ticked,
  marketing: ticked,
  terms: ticked,
});

export type ConsentSubmission = z.infer<typeof consentSubmissionSchema>;

/** What a form asks for, resolved from its own settings and its notice. */
export type ConsentRequirement = {
  /** False for a form that genuinely collects nothing personal. */
  applies: boolean;
  lawfulBasis: LawfulBasis;
  /** The enquiry box must be ticked for the submission to be accepted. */
  requireEnquiry: boolean;
  offerMarketing: boolean;
  requireTerms: boolean;
  noticeKey: string;
  noticeVersion: number;
  notice: ConsentNoticeContent;
};

export const CONSENT_MESSAGES = {
  enquiry: 'Please confirm we may use your details to respond to this enquiry.',
  terms: 'Please accept the Terms & Conditions to continue.',
  stale:
    'Our privacy notice changed while you were filling this in. Please read it again and resubmit.',
} as const;

/**
 * Judges a submitted consent payload against what the form asks for.
 *
 * Runs on the server from the stored form and notice, never from anything the
 * page sent, so a crafted request cannot present itself as a form that did not
 * require consent. Marketing is never a reason to reject.
 */
export function validateConsent(
  requirement: ConsentRequirement,
  submitted: ConsentSubmission | undefined,
): { ok: true } | { ok: false; field: 'enquiry' | 'terms' | 'notice'; message: string } {
  if (!requirement.applies) return { ok: true };

  const consent = submitted ?? { enquiry: false, marketing: false, terms: false };

  if (requirement.requireEnquiry && consent.enquiry !== true) {
    return { ok: false, field: 'enquiry', message: CONSENT_MESSAGES.enquiry };
  }
  if (requirement.requireTerms && consent.terms !== true) {
    return { ok: false, field: 'terms', message: CONSENT_MESSAGES.terms };
  }

  /*
   * The version the visitor ticked against must be the version we are still
   * serving. Otherwise the evidence would claim they agreed to wording they
   * never saw — the page could have been open since before an edit. Asking
   * them to read it again is the only honest outcome.
   */
  if (
    requirement.requireEnquiry &&
    submitted?.noticeVersion !== undefined &&
    submitted.noticeVersion !== requirement.noticeVersion
  ) {
    return { ok: false, field: 'notice', message: CONSENT_MESSAGES.stale };
  }

  return { ok: true };
}

/**
 * The evidence row's payload, built from the requirement and the answer.
 *
 * The notice is snapshotted rather than referenced alone, because the record
 * has to keep saying what was on screen even after the notice is superseded or
 * the row is removed.
 */
export function buildConsentEvidence(
  requirement: ConsentRequirement,
  submitted: ConsentSubmission | undefined,
) {
  const consent = submitted ?? { enquiry: false, marketing: false, terms: false };
  return {
    noticeKey: requirement.noticeKey,
    noticeVersion: requirement.noticeVersion,
    noticeSnapshot: requirement.notice as unknown as Record<string, unknown>,
    purposeText: requirement.notice.purposeText,
    lawfulBasis: requirement.lawfulBasis,
    enquiryConsent: requirement.requireEnquiry ? consent.enquiry === true : false,
    marketingConsent: requirement.offerMarketing ? consent.marketing === true : false,
    termsAccepted: requirement.requireTerms ? consent.terms === true : false,
    termsRequired: requirement.requireTerms,
    privacyUrl: requirement.notice.privacyUrl,
    privacyVersion: requirement.notice.privacyVersion ?? null,
    termsUrl: requirement.notice.termsUrl,
    termsVersion: requirement.notice.termsVersion ?? null,
  };
}

/** How the CRM should describe one lead's consent, without flattening it. */
export type ConsentDisplayState =
  | 'RECORDED'
  | 'NOT_RECORDED'
  | 'WITHDRAWN'
  | 'NOT_APPLICABLE';

export const CONSENT_DISPLAY_LABELS: Record<ConsentDisplayState, string> = {
  RECORDED: 'Recorded',
  NOT_RECORDED: 'Not recorded',
  WITHDRAWN: 'Withdrawn',
  NOT_APPLICABLE: 'Not applicable',
};

/**
 * Reduces one consent record to a column value.
 *
 * A lead with no record reads "Not recorded" and never "Recorded": leads
 * captured before consent evidence existed have no evidence, and showing them
 * as consented would be inventing it. Nothing backfills this.
 */
export function consentDisplayState(
  record:
    | {
        lawfulBasis: LawfulBasis;
        enquiryConsent: boolean;
        withdrawnAt: Date | null;
      }
    | null
    | undefined,
): ConsentDisplayState {
  if (!record) return 'NOT_RECORDED';
  if (record.withdrawnAt) return 'WITHDRAWN';
  // A submission processed on a basis other than consent has no tick box to
  // be missing, so an empty one is not a gap.
  if (record.lawfulBasis !== 'CONSENT') return 'NOT_APPLICABLE';
  return record.enquiryConsent ? 'RECORDED' : 'NOT_RECORDED';
}
