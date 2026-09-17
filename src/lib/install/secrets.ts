import 'server-only';
import crypto from 'node:crypto';

/**
 * The secrets a deployment needs, generated rather than invented.
 *
 * Until now these were an operator's job: `openssl rand -base64 32`, three
 * times, pasted into a platform's secret store. That is a step people skip, and
 * the failure mode of skipping it is a deployment running on a short or reused
 * value — which nothing would report, because a weak `AUTH_SECRET` works
 * perfectly right up until somebody forges a session with it.
 *
 * `randomBytes` rather than anything derived from a password, a timestamp or a
 * hostname: these are keys, and the only property that matters is that nobody
 * can guess them.
 *
 * Generated values are written straight to the configuration file and returned
 * to nobody. They are never rendered in the wizard, never included in a server
 * action's result and never logged — an operator does not need to see a key
 * they will never type.
 */

/** 32 bytes, URL-safe, for anything that travels in a cookie or a header. */
function key(): string {
  return crypto.randomBytes(32).toString('base64url');
}

export function generateSecrets(): {
  AUTH_SECRET: string;
  ENCRYPTION_KEY: string;
  MFA_ENCRYPTION_KEY: string;
} {
  return {
    AUTH_SECRET: key(),
    // Encrypts stored integration credentials (SMTP, object storage).
    ENCRYPTION_KEY: key(),
    // Encrypts TOTP secrets. Separate from the above on purpose: rotating the
    // one that protects integration credentials should not invalidate every
    // member of staff's two-step enrolment.
    MFA_ENCRYPTION_KEY: key(),
  };
}

/**
 * Only the secrets that are actually missing.
 *
 * A deployment that already sets `AUTH_SECRET` on the platform keeps its value:
 * generating a new one would sign out every existing session, and on a copy
 * being re-run through the wizard after a partial failure that would be a
 * surprising thing for a setup screen to do.
 */
export function generateMissingSecrets(
  present: (name: string) => boolean = (name) => Boolean(process.env[name]?.trim()),
): Partial<ReturnType<typeof generateSecrets>> {
  const all = generateSecrets();
  const needed: Partial<typeof all> = {};
  for (const [name, value] of Object.entries(all) as Array<[keyof typeof all, string]>) {
    if (!present(name)) needed[name] = value;
  }
  return needed;
}
