'use server';

import { z } from 'zod';
import { prisma, resetPrismaClient } from '@/lib/db/prisma';
import { success, failure, toActionError, type ActionResult } from '@/lib/utils/result';
import { readConfig, writeConfig, configIsWritable, configuredKeys } from '@/lib/install/config-store';
import { loadStoredConfig, resetStoredConfigCache } from '@/lib/install/runtime-env';
import { getInstallState, resetInstallStateCache } from '@/lib/install/state';
import { testConnection, applyMigrations, prepareSchema, validateConnectionString } from '@/lib/install/database';
import { generateMissingSecrets } from '@/lib/install/secrets';
import { createFirstAdministrator, passwordWeaknesses } from '@/lib/install/bootstrap';

/**
 * The setup wizard's server side.
 *
 * ## One rule, at the top of every action
 *
 * These actions create a super administrator and write a connection string, with
 * no signed-in user to authorise them — so the *only* thing standing between
 * them and a stranger is that the application has not been set up yet. That is
 * checked against the database on every call, in `assertInstallerOpen`, not
 * inferred from which page made the request: a Server Action is a public HTTP
 * endpoint, and one that trusted the page it was rendered on would be a way to
 * mint an administrator on a live site.
 *
 * ## What is never returned
 *
 * No action here returns a secret, a connection string or a password, and none
 * of them logs one. Failures are redacted before they leave
 * `src/lib/install/database.ts`, because a PostgreSQL driver quotes the
 * connection string in its errors and those errors are rendered in a browser.
 *
 * ## Nothing is written before its step has passed
 *
 * The database step tests the connection *before* it writes it, and migrates
 * before it records anything. A failed step leaves the configuration exactly as
 * it was and the wizard open, which is what lets somebody correct a typo and
 * try again rather than redeploy.
 */

/** Refuses once the application is set up. The installer's whole security model. */
async function assertInstallerOpen(): Promise<void> {
  if ((await getInstallState()) === 'installed') {
    throw new Error('This installation is already complete.');
  }

  /*
   * An optional shared secret, for a deployment that does not want to rely on
   * being first to the URL.
   *
   * There is an unavoidable window between a fresh copy becoming reachable and
   * somebody completing setup, and whoever reaches it first can create the
   * administrator. Setting INSTALL_TOKEN closes that window; leaving it unset
   * keeps the "copy, visit, configure" flow intact. It is checked here so it
   * covers every action rather than the one screen that collects it.
   */
  const required = process.env.INSTALL_TOKEN?.trim();
  if (required) {
    const { cookies } = await import('next/headers');
    const offered = (await cookies()).get('install_token')?.value ?? '';
    const { timingSafeEqual } = await import('node:crypto');
    const a = Buffer.from(offered);
    const b = Buffer.from(required);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new Error('This installer needs the setup token from the container logs.');
    }
  }
}

// ---------------------------------------------------------------------------
// Step 1 — what this container can see about itself
// ---------------------------------------------------------------------------

export type EnvironmentReport = {
  ready: boolean;
  checks: Array<{ label: string; ok: boolean; detail: string }>;
  /** Key names supplied by the platform. Never their values. */
  platformKeys: string[];
  /** Key names already stored by a previous, unfinished run. */
  storedKeys: string[];
  tokenRequired: boolean;
};

export async function inspectEnvironment(): Promise<ActionResult<EnvironmentReport>> {
  try {
    await assertInstallerOpen();

    loadStoredConfig();
    const writable = configIsWritable();
    const platformDatabase = Boolean(process.env.DATABASE_URL?.trim());

    const checks: EnvironmentReport['checks'] = [
      {
        label: 'Configuration storage',
        ok: writable.ok,
        detail: writable.ok
          ? 'The settings collected here can be saved and will survive a restart.'
          : writable.reason,
      },
      {
        label: 'Node.js runtime',
        ok: Number(process.versions.node.split('.')[0]) >= 22,
        detail: `Running Node.js ${process.versions.node}.`,
      },
      {
        label: 'Database',
        ok: true,
        detail: platformDatabase
          ? 'A connection string is already set on this platform, so the next step is prefilled from it.'
          : 'No database configured yet — the next step collects one.',
      },
    ];

    return success({
      ready: checks.every((check) => check.ok),
      checks,
      platformKeys: platformDatabase ? ['DATABASE_URL'] : [],
      storedKeys: configuredKeys(),
      tokenRequired: Boolean(process.env.INSTALL_TOKEN?.trim()),
    });
  } catch (error) {
    return toActionError(error);
  }
}

// ---------------------------------------------------------------------------
// Step 2 — the database
// ---------------------------------------------------------------------------

const databaseSchema = z.object({
  databaseUrl: z.string().min(1).max(2000),
});

export type DatabaseOutcome = { migrated: boolean };

/**
 * Tests, migrates, prepares, and only then stores.
 *
 * The order matters. Storing first and migrating afterwards would leave a copy
 * whose configuration points at a database it has never prepared — and since the
 * stored connection string is what the next boot uses, a failure there would
 * produce a container that starts against a broken database instead of one that
 * still offers the wizard.
 */
export async function configureDatabase(input: unknown): Promise<ActionResult<DatabaseOutcome>> {
  try {
    await assertInstallerOpen();
    const { databaseUrl } = databaseSchema.parse(input);
    const url = databaseUrl.trim();

    const shape = validateConnectionString(url);
    if (!shape.ok) return failure(shape.reason);

    const reachable = await testConnection(url);
    if (!reachable.ok) {
      return failure(`The database could not be reached.\n\n${reachable.reason}`);
    }

    const migrated = await applyMigrations(url);
    if (!migrated.ok) {
      return failure(`The database schema could not be created.\n\n${migrated.reason}`);
    }

    const prepared = await prepareSchema(url);
    if (!prepared.ok) {
      return failure(`The database could not be prepared.\n\n${prepared.reason}`);
    }

    // Only now, with a database that is reachable, migrated and populated.
    writeConfig({ DATABASE_URL: url });
    resetStoredConfigCache();
    loadStoredConfig();
    // The application's own client may have been built against no database at
    // all; it is dropped so the next use connects to the one just configured.
    resetPrismaClient();
    resetInstallStateCache();

    return success({ migrated: true }, 'The database is ready.');
  } catch (error) {
    return toActionError(error);
  }
}

// ---------------------------------------------------------------------------
// Step 3 — the administrator, and the lock
// ---------------------------------------------------------------------------

const finishSchema = z.object({
  siteUrl: z.string().min(1).max(500),
  adminName: z.string().min(1).max(120),
  adminEmail: z.string().email().max(200),
  adminPassword: z.string().min(1).max(200),
});

export type InstallSummary = {
  /** Where to send the operator next. */
  signInPath: string;
  adminEmail: string;
  /** Key names written to the stored configuration. Never their values. */
  storedKeys: string[];
  checks: Array<{ label: string; ok: boolean; detail: string }>;
};

export async function finishInstallation(input: unknown): Promise<ActionResult<InstallSummary>> {
  try {
    await assertInstallerOpen();
    const parsed = finishSchema.parse(input);

    const weaknesses = passwordWeaknesses(parsed.adminPassword);
    if (weaknesses.length > 0) {
      return failure(`The administrator password needs ${weaknesses.join(', ')}.`);
    }

    let siteUrl: URL;
    try {
      siteUrl = new URL(parsed.siteUrl.trim());
    } catch {
      return failure('Enter the full public address of the site, for example https://example.com');
    }
    if (siteUrl.protocol !== 'http:' && siteUrl.protocol !== 'https:') {
      return failure('The site address must start with http:// or https://');
    }
    const origin = siteUrl.origin;

    loadStoredConfig();
    if (!process.env.DATABASE_URL?.trim()) {
      return failure('Configure the database before creating an administrator.');
    }

    /*
     * Secrets first, and written before the account exists.
     *
     * An account created against a missing AUTH_SECRET could not be signed in
     * to, and the wizard would already have closed behind it.
     */
    const secrets = generateMissingSecrets();
    writeConfig({
      ...secrets,
      NEXTAUTH_URL: origin,
      NEXT_PUBLIC_SITE_URL: origin,
    });
    resetStoredConfigCache();
    loadStoredConfig();

    const admin = await createFirstAdministrator(prisma, {
      name: parsed.adminName,
      email: parsed.adminEmail,
      password: parsed.adminPassword,
    });

    /*
     * Everything is verified before anything is locked.
     *
     * If a check fails here the installer stays open and the configuration
     * stays as it is, so the problem can be corrected and the step retried —
     * which is the whole reason the lock is the last thing that happens rather
     * than the first.
     */
    const checks = await finalChecks();
    const failed = checks.filter((check) => !check.ok);
    if (failed.length > 0) {
      return failure(
        `Setup is not complete:\n${failed.map((check) => `• ${check.label}: ${check.detail}`).join('\n')}`,
      );
    }

    const { lockInstallation } = await import('@/lib/install/lock');
    await lockInstallation();

    return success(
      {
        signInPath: '/auth-control-panel/admin',
        adminEmail: admin.email,
        storedKeys: configuredKeys(),
        checks,
      },
      'Installation complete.',
    );
  } catch (error) {
    return toActionError(error);
  }
}

/** The checks that must pass before the installer is allowed to close. */
async function finalChecks(): Promise<InstallSummary['checks']> {
  const checks: InstallSummary['checks'] = [];

  const stored = readConfig();
  for (const key of ['AUTH_SECRET', 'ENCRYPTION_KEY', 'MFA_ENCRYPTION_KEY'] as const) {
    const available = Boolean(process.env[key]?.trim() || stored[key]?.trim());
    checks.push({
      label: key,
      ok: available,
      detail: available ? 'Generated and stored.' : 'Missing — it could not be generated.',
    });
  }

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.push({ label: 'Database', ok: true, detail: 'Reachable.' });
  } catch {
    checks.push({ label: 'Database', ok: false, detail: 'No longer reachable.' });
  }

  try {
    const accounts = await prisma.user.count();
    checks.push({
      label: 'Administrator',
      ok: accounts > 0,
      detail: accounts > 0 ? 'Created.' : 'No account exists.',
    });
  } catch {
    checks.push({ label: 'Administrator', ok: false, detail: 'Could not be confirmed.' });
  }

  const writable = configIsWritable();
  checks.push({
    label: 'Configuration storage',
    ok: writable.ok,
    detail: writable.ok ? 'Saved.' : writable.reason,
  });

  return checks;
}
