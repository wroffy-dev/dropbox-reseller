'use client';

import * as React from 'react';
import { submitForm } from '@/lib/actions/submit-form';
import { requestCaptchaChallenge } from '@/lib/actions/captcha';
import type { CaptchaChallenge } from '@/lib/forms/captcha';
import { collectAttribution, trackConversion } from '@/lib/analytics/attribution';
import { CheckCircle, Spinner } from '@/components/ui/icons';

/**
 * The footer's "stay updated" form.
 *
 * It is a presentation of an ordinary Form record, not a second lead system:
 * the submission goes through the same `submitForm` server action every other
 * form on the site uses, so rate limiting, the honeypot, CAPTCHA, attribution,
 * lead creation and the notification email all behave identically. Which form
 * it posts to is chosen in Admin → Settings → Footer, and the subscriber lands
 * in the existing Leads dashboard under that form's lead source.
 *
 * What is bespoke here is only the markup: one full-width input with the button
 * directly beneath it, which is what the footer layout calls for and what the
 * generic renderer — built for multi-field forms — does not produce.
 */
export function FooterNewsletter({
  formSlug,
  emailField,
  requireCaptcha,
  placeholder,
  buttonLabel,
  successMessage,
}: {
  formSlug: string;
  /** The name of the form's email field, resolved server-side. */
  emailField: string;
  requireCaptcha: boolean;
  placeholder: string;
  buttonLabel: string;
  successMessage: string;
}) {
  const [email, setEmail] = React.useState('');
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState<string | null>(null);
  const mountedAt = React.useRef(Date.now());
  const inputId = React.useId();

  // Sub-second submissions are rejected server-side as bot traffic. A visitor
  // who lands mid-page and types immediately can beat that, so the button
  // simply waits rather than showing them an error they cannot act on.
  const [captcha, setCaptcha] = React.useState<CaptchaChallenge | null>(null);
  const [captchaAnswer, setCaptchaAnswer] = React.useState('');

  const loadCaptcha = React.useCallback(() => {
    if (!requireCaptcha) return;
    requestCaptchaChallenge(formSlug)
      .then(setCaptcha)
      .catch(() => setCaptcha(null));
  }, [requireCaptcha, formSlug]);

  React.useEffect(() => {
    loadCaptcha();
  }, [loadCaptcha]);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    const trimmed = email.trim();
    // A cheap client check for an obvious typo. The real judgement is the
    // server's: the field schema is rebuilt there from the stored definition.
    if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(trimmed)) {
      setError('Enter a valid email address.');
      return;
    }

    setPending(true);
    setError(null);

    const data = new FormData(event.currentTarget);
    const elapsed = Date.now() - mountedAt.current;
    // Wait out the server's minimum fill time rather than failing the visitor.
    if (elapsed < 1300) await new Promise((resolve) => setTimeout(resolve, 1300 - elapsed));

    const result = await submitForm({
      formSlug,
      website: String(data.get('website') ?? ''),
      elapsedMs: Date.now() - mountedAt.current,
      values: { [emailField]: trimmed },
      attribution: collectAttribution({ ctaLabel: buttonLabel, ctaLocation: 'Footer' }),
      captchaToken: captcha?.token ?? null,
      captchaAnswer: requireCaptcha ? captchaAnswer : null,
    });

    setPending(false);

    if (!result.ok) {
      setError(result.error);
      if (requireCaptcha) {
        setCaptchaAnswer('');
        loadCaptcha();
      }
      return;
    }

    trackConversion('generate_lead', { form: formSlug });
    setDone(result.data?.message || successMessage);
  }

  if (done) {
    return (
      <p className="flex items-start gap-2 text-sm" role="status">
        <CheckCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <span>{done}</span>
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-2.5">
      <label htmlFor={inputId} className="sr-only">
        Email address
      </label>
      <input
        id={inputId}
        type="email"
        name="email"
        autoComplete="email"
        required
        value={email}
        onChange={(event) => {
          setEmail(event.target.value);
          if (error) setError(null);
        }}
        placeholder={placeholder}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${inputId}-error` : undefined}
        className="w-full rounded-lg border px-3.5 py-2.5 text-sm text-[color:var(--footer-heading)] placeholder:text-[color:var(--footer-text)] focus:outline-none focus:ring-2 focus:ring-[color:var(--footer-btn-bg)]"
        style={{
          background: 'var(--footer-input-bg)',
          borderColor: 'var(--footer-input-border)',
        }}
      />

      {/* Honeypot: off-screen and hidden from assistive tech, so only a bot fills it. */}
      <input
        type="text"
        name="website"
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        className="absolute left-[-9999px] h-0 w-0 opacity-0"
      />

      {requireCaptcha && captcha ? (
        <div className="flex items-center gap-2">
          <span className="text-sm">{captcha.question}</span>
          <input
            type="text"
            inputMode="numeric"
            value={captchaAnswer}
            onChange={(event) => setCaptchaAnswer(event.target.value)}
            aria-label={captcha.question}
            className="w-16 rounded-lg border px-2 py-1.5 text-sm text-[color:var(--footer-heading)]"
            style={{
              background: 'var(--footer-input-bg)',
              borderColor: 'var(--footer-input-border)',
            }}
          />
        </div>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-60"
        style={{ background: 'var(--footer-btn-bg)', color: 'var(--footer-btn-text)' }}
      >
        {pending ? (
          <>
            <Spinner className="h-4 w-4 animate-spin" aria-hidden="true" />
            Sending…
          </>
        ) : (
          buttonLabel
        )}
      </button>

      {error ? (
        <p id={`${inputId}-error`} role="alert" className="text-sm text-[#FCA5A5]">
          {error}
        </p>
      ) : null}
    </form>
  );
}
