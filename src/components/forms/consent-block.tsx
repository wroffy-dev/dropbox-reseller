'use client';

import * as React from 'react';
import type { ConsentRequirement } from '@/lib/privacy/consent';

/**
 * The consent block under a public form.
 *
 * Every box starts unticked and stays a real checkbox — no pre-selected state,
 * no "by submitting you agree" wording standing in for a choice. The three
 * permissions are separate controls because they are separate decisions: a
 * visitor may want their enquiry answered without wanting marketing, and
 * accepting Terms is not the same act as permitting data processing.
 *
 * The policy links open in a new tab. A visitor who wants to read the privacy
 * notice before ticking must not lose what they have typed to do it.
 */
export function ConsentBlock({
  requirement,
  value,
  onChange,
  errors,
  idPrefix,
}: {
  requirement: ConsentRequirement;
  value: { enquiry: boolean; marketing: boolean; terms: boolean };
  onChange: (next: { enquiry: boolean; marketing: boolean; terms: boolean }) => void;
  errors: Record<string, string[]>;
  idPrefix: string;
}) {
  if (!requirement.applies) return null;

  const notice = requirement.notice;
  const enquiryError = errors._consentEnquiry?.[0];
  const termsError = errors._consentTerms?.[0];
  const noticeError = errors._consentNotice?.[0];

  const set = (patch: Partial<typeof value>) => onChange({ ...value, ...patch });

  return (
    <div className="fd-consent mt-4 space-y-3 text-sm">
      <p className="fd-help leading-relaxed">{notice.purposeText}</p>

      {noticeError ? (
        <p role="alert" className="fd-error">
          {noticeError}
        </p>
      ) : null}

      {requirement.requireEnquiry ? (
        <ConsentCheckbox
          id={`${idPrefix}-consent-enquiry`}
          checked={value.enquiry}
          onChange={(next) => set({ enquiry: next })}
          label={notice.enquiryLabel}
          required
          error={enquiryError}
        />
      ) : null}

      {requirement.requireTerms ? (
        <ConsentCheckbox
          id={`${idPrefix}-consent-terms`}
          checked={value.terms}
          onChange={(next) => set({ terms: next })}
          label={notice.termsLabel}
          required
          error={termsError}
        />
      ) : null}

      {requirement.offerMarketing ? (
        <ConsentCheckbox
          id={`${idPrefix}-consent-marketing`}
          checked={value.marketing}
          onChange={(next) => set({ marketing: next })}
          label={notice.marketingLabel}
        />
      ) : null}

      <p className="fd-help leading-relaxed">
        {notice.withdrawalText}{' '}
        <PolicyLink href={notice.privacyUrl} version={notice.privacyVersion}>
          Privacy Policy
        </PolicyLink>
        {' · '}
        <PolicyLink href={notice.termsUrl} version={notice.termsVersion}>
          Terms &amp; Conditions
        </PolicyLink>
      </p>
    </div>
  );
}

function ConsentCheckbox({
  id,
  checked,
  onChange,
  label,
  required,
  error,
}: {
  id: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  required?: boolean;
  error?: string;
}) {
  const errorId = error ? `${id}-error` : undefined;
  return (
    <div>
      {/*
        * A real <input type="checkbox"> inside its <label>: the whole line is
        * clickable, Space toggles it, and a screen reader reads the wording as
        * the control's name without an aria-label repeating it.
        */}
      <label htmlFor={id} className="flex cursor-pointer items-start gap-2.5 leading-relaxed">
        <input
          id={id}
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          aria-required={required || undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={errorId}
          className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer"
        />
        <span>
          {label}
          {required ? (
            <span className="fd-required" aria-hidden="true">
              {' '}
              *
            </span>
          ) : null}
        </span>
      </label>
      {error ? (
        <p id={errorId} role="alert" className="fd-error mt-1 pl-[1.625rem]">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * A policy link that opens in a new tab.
 *
 * `target="_blank"` is the whole point: following it in place would discard a
 * half-filled form, and a visitor who has to choose between reading the notice
 * and keeping their answers is not being given a real choice.
 */
function PolicyLink({
  href,
  version,
  children,
}: {
  href: string;
  version?: string | null;
  children: React.ReactNode;
}) {
  const safe = /^(https?:\/\/|\/)/i.test(href) ? href : `/${href.replace(/^\/+/, '')}`;
  return (
    <a href={safe} target="_blank" rel="noopener noreferrer" className="fd-consent-link underline">
      {children}
      {version ? ` (v${version})` : null}
    </a>
  );
}
