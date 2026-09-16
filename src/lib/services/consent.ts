import 'server-only';
import { cache } from 'react';
import { prisma } from '@/lib/db/prisma';
import {
  CONSENT_NOTICE_KEY_DEFAULT,
  DEFAULT_CONSENT_NOTICE,
  consentNoticeSchema,
  type ConsentNoticeContent,
  type ConsentRequirement,
} from '@/lib/privacy/consent';
import type { LawfulBasis } from '@prisma/client';

/**
 * Consent notices, resolved for rendering and for judging a submission.
 *
 * One rule decides which notice a form shows, and both the renderer and the
 * submission handler call it — so the wording a visitor ticked against is
 * necessarily the wording the server validates and stores. A second lookup
 * path here would be a way for those two to disagree, which is the one thing
 * the evidence must never do.
 */

type NoticeRow = {
  id: string;
  key: string;
  version: number;
  purposeText: string;
  enquiryLabel: string;
  marketingLabel: string;
  termsLabel: string;
  withdrawalText: string;
  privacyUrl: string;
  privacyVersion: string | null;
  termsUrl: string;
  termsVersion: string | null;
};

const NOTICE_SELECT = {
  id: true,
  key: true,
  version: true,
  purposeText: true,
  enquiryLabel: true,
  marketingLabel: true,
  termsLabel: true,
  withdrawalText: true,
  privacyUrl: true,
  privacyVersion: true,
  termsUrl: true,
  termsVersion: true,
} as const;

function toContent(row: NoticeRow): ConsentNoticeContent {
  return {
    purposeText: row.purposeText,
    enquiryLabel: row.enquiryLabel,
    marketingLabel: row.marketingLabel,
    termsLabel: row.termsLabel,
    withdrawalText: row.withdrawalText,
    privacyUrl: row.privacyUrl,
    privacyVersion: row.privacyVersion,
    termsUrl: row.termsUrl,
    termsVersion: row.termsVersion,
  };
}

/**
 * The live notice for a key, preferring a market-specific version.
 *
 * Falls back through: this market's notice for the key → the shared notice for
 * the key → the shared default → the wording compiled into the code. The last
 * step is what lets a site with no notice configured still render a truthful
 * block instead of a form with no notice at all.
 */
export const getCurrentNotice = cache(
  async (
    key: string,
    countryId: string | null,
  ): Promise<{ id: string | null; key: string; version: number; content: ConsentNoticeContent }> => {
    const candidates = await prisma.consentNotice.findMany({
      where: {
        isCurrent: true,
        key: { in: Array.from(new Set([key, CONSENT_NOTICE_KEY_DEFAULT])) },
        OR: [{ countryId: null }, ...(countryId ? [{ countryId }] : [])],
      },
      select: { ...NOTICE_SELECT, countryId: true },
      orderBy: { version: 'desc' },
    });

    const pick =
      candidates.find((row) => row.key === key && row.countryId === countryId) ??
      candidates.find((row) => row.key === key && row.countryId === null) ??
      candidates.find(
        (row) => row.key === CONSENT_NOTICE_KEY_DEFAULT && row.countryId === countryId,
      ) ??
      candidates.find(
        (row) => row.key === CONSENT_NOTICE_KEY_DEFAULT && row.countryId === null,
      );

    if (!pick) {
      return {
        id: null,
        key: CONSENT_NOTICE_KEY_DEFAULT,
        // Version 0 marks "not from the database". A stored notice always
        // starts at 1, so evidence can never confuse the two.
        version: 0,
        content: DEFAULT_CONSENT_NOTICE,
      };
    }

    return { id: pick.id, key: pick.key, version: pick.version, content: toContent(pick) };
  },
);

/** What one form asks of a visitor, resolved from the form and its notice. */
export async function resolveConsentRequirement(
  form: {
    consentNoticeKey: string | null;
    lawfulBasis: LawfulBasis;
    offerMarketingConsent: boolean;
    requireTermsAcceptance: boolean;
    collectsPersonalData: boolean;
  },
  countryId: string | null,
): Promise<ConsentRequirement> {
  const notice = await getCurrentNotice(
    form.consentNoticeKey || CONSENT_NOTICE_KEY_DEFAULT,
    countryId,
  );

  return {
    applies: form.collectsPersonalData,
    lawfulBasis: form.lawfulBasis,
    // Only a consent basis makes the tick box the thing that authorises
    // processing. On any other basis the box would be theatre — and worse,
    // ticking it would imply a right to withdraw that the basis does not give.
    requireEnquiry: form.collectsPersonalData && form.lawfulBasis === 'CONSENT',
    offerMarketing: form.collectsPersonalData && form.offerMarketingConsent,
    requireTerms: form.collectsPersonalData && form.requireTermsAcceptance,
    noticeKey: notice.key,
    noticeVersion: notice.version,
    notice: notice.content,
  };
}

/** Every notice family, newest version first, for the admin list. */
export async function listNoticeVersions(key: string) {
  return prisma.consentNotice.findMany({
    where: { key },
    orderBy: { version: 'desc' },
    select: { ...NOTICE_SELECT, isCurrent: true, countryId: true, createdAt: true },
  });
}

export async function listNoticeKeys(): Promise<Array<{ key: string; versions: number }>> {
  const rows = await prisma.consentNotice.groupBy({ by: ['key'], _count: { key: true } });
  return rows.map((row) => ({ key: row.key, versions: row._count.key }));
}

/**
 * Publishes a new version of a notice.
 *
 * Always an insert. The previous version stays exactly as it was, because
 * submissions point at it and the point of a version is that it does not
 * change under the evidence that cites it.
 */
export async function publishNotice(input: {
  key: string;
  countryId: string | null;
  content: ConsentNoticeContent;
  actorId: string | null;
}): Promise<{ id: string; version: number }> {
  const content = consentNoticeSchema.parse(input.content);

  return prisma.$transaction(async (tx) => {
    const latest = await tx.consentNotice.findFirst({
      where: { key: input.key },
      orderBy: { version: 'desc' },
      select: { version: true },
    });
    const version = (latest?.version ?? 0) + 1;

    // Exactly one current version per key. Done inside the transaction so a
    // concurrent publish cannot leave two rows claiming to be live.
    await tx.consentNotice.updateMany({
      where: { key: input.key, isCurrent: true },
      data: { isCurrent: false },
    });

    const created = await tx.consentNotice.create({
      data: {
        key: input.key,
        version,
        isCurrent: true,
        countryId: input.countryId,
        createdById: input.actorId,
        ...content,
        privacyVersion: content.privacyVersion || null,
        termsVersion: content.termsVersion || null,
      },
      select: { id: true, version: true },
    });

    return created;
  });
}

/**
 * Records a withdrawal against an existing consent record.
 *
 * Nothing that was agreed is edited. The original booleans stay exactly as the
 * visitor left them, a `withdrawnAt` marks the record, and an event is
 * appended — so the history reads "agreed on the 3rd, withdrew on the 9th"
 * rather than "never agreed", which is what rewriting the row would produce.
 *
 * Marketing suppression is a separate flag on the lead, because that is what
 * campaign sending reads. A withdrawal that did not set it would leave the
 * record honest and the mailing list wrong.
 */
export async function withdrawConsent(input: {
  recordId: string;
  scope: 'MARKETING' | 'ALL';
  actorId: string | null;
  note: string | null;
  ipAddress: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const record = await prisma.consentRecord.findUnique({
    where: { id: input.recordId },
    select: { id: true, leadId: true, withdrawnAt: true, withdrawnScope: true },
  });
  if (!record) return { ok: false, error: 'That consent record no longer exists.' };
  if (record.withdrawnAt && record.withdrawnScope === 'ALL') {
    return { ok: false, error: 'Consent has already been withdrawn in full.' };
  }

  await prisma.$transaction(async (tx) => {
    await tx.consentRecord.update({
      where: { id: record.id },
      data: { withdrawnAt: new Date(), withdrawnScope: input.scope },
    });

    await tx.consentEvent.create({
      data: {
        recordId: record.id,
        type: 'WITHDRAWN',
        scope: input.scope,
        value: false,
        actorId: input.actorId,
        actorType: input.actorId ? 'STAFF' : 'VISITOR',
        note: input.note,
        ipAddress: input.ipAddress,
      },
    });

    if (record.leadId) {
      await tx.lead.update({
        where: { id: record.leadId },
        data: { marketingSuppressedAt: new Date() },
      });
    }
  });

  return { ok: true };
}

/** The fields the CRM needs to describe a lead's consent without guessing. */
export const CONSENT_RECORD_SELECT = {
  id: true,
  lawfulBasis: true,
  enquiryConsent: true,
  marketingConsent: true,
  termsAccepted: true,
  termsRequired: true,
  purposeText: true,
  noticeKey: true,
  noticeVersion: true,
  noticeSnapshot: true,
  privacyUrl: true,
  privacyVersion: true,
  termsUrl: true,
  termsVersion: true,
  consentedAt: true,
  withdrawnAt: true,
  withdrawnScope: true,
} as const;
