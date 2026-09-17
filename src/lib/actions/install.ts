'use server';

import { z } from 'zod';
import { prisma, resetPrismaClient } from '@/lib/db/prisma';
import { success, failure, toActionError, type ActionResult } from '@/lib/utils/result';
import {
  readConfig,
  writeConfig,
  configIsWritable,
  configIsPersistent,
  configuredKeys,
  configDirectory,
} from '@/lib/install/config-store';
import { loadStoredConfig, resetStoredConfigCache } from '@/lib/install/runtime-env';
import { getInstallState, resetInstallStateCache } from '@/lib/install/state';
import { testConnection, applyMigrations, prepareSchema, validateConnectionString } from '@/lib/install/database';
import { generateMissingSecrets } from '@/lib/install/secrets';
import { createFirstAdministrator, passwordWeaknesses } from '@/lib/install/bootstrap';
import { collectEnvProblems } from '@/lib/env-validation';
import { CONFIG_KEYS } from '@/lib/install/config-store';

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
  const stored = readConfig();

  /*
   * Finished is finished, and it is the only thing that closes the installer.
   */
  if (stored.installedAt) {
    throw new Error('This installation is already complete.');
  }

  /*
   * A run that has already passed the database step carries on.
   *
   * Without this the wizard closed on itself halfway through a reconnection:
   * storing the connection string lets the application see the accounts in that
   * database, `getInstallState()` then answers "installed", and the very next
   * step is refused — on the run that was putting the configuration back.
   *
   * `startedAt` is only ever written by the database step, which had to find
   * the installer open to run at all, so this cannot be a way in.
   */
  if (!stored.startedAt && (await getInstallState()) === 'installed') {
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

    /*
     * Writable is not enough. A container's own filesystem is writable and is
     * replaced by the next deployment, so a wizard run against one completes,
     * reports success, and loses everything on the next restart.
     */
    const storage = configIsPersistent();
    const persistent = !writable.ok || !storage.known || storage.persistent;

    const checks: EnvironmentReport['checks'] = [
      {
        label: 'Configuration storage',
        ok: writable.ok,
        detail: writable.ok
          ? 'The settings collected here can be saved.'
          : writable.reason,
      },
      {
        label: 'Settings survive a restart',
        ok: persistent,
        detail: persistent
          ? storage.known
            ? 'Stored on a mounted volume, so a restart or redeployment keeps it.'
            : 'An ordinary directory on this machine, which persists.'
          : `${configDirectory()} is inside the container rather than on a mounted volume. Setup would appear to work and its configuration would be destroyed by the next restart — the site would then come back with no database and no sign-in key. Mount a volume at ${configDirectory()} and reload this page.`,
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

export type DatabaseOutcome = {
  migrated: boolean;
  /**
   * The database already holds accounts.
   *
   * Which means this is not a first install but a **reconnection**: the most
   * common way to get here is a wizard install whose configuration was written
   * to a container's own filesystem and destroyed by the next restart. The
   * database survived; the connection string and the secrets did not.
   *
   * Without this the wizard was a dead end in exactly that situation — it
   * refuses to create a second administrator, and there was no other way
   * through.
   */
  hasAccounts: boolean;
};

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
    // `startedAt` marks the run as under way; see `assertInstallerOpen`.
    writeConfig({ DATABASE_URL: url, startedAt: new Date().toISOString() });
    resetStoredConfigCache();
    loadStoredConfig();
    // The application's own client may have been built against no database at
    // all; it is dropped so the next use connects to the one just configured.
    resetPrismaClient();
    resetInstallStateCache();

    const accounts = await prisma.user.count().catch(() => 0);

    return success(
      { migrated: true, hasAccounts: accounts > 0 },
      accounts > 0
        ? 'Connected. This database already has an account, so setup will reconnect to it rather than create one.'
        : 'The database is ready.',
    );
  } catch (error) {
    return toActionError(error);
  }
}

// ---------------------------------------------------------------------------
// Step 3 — the administrator, and the lock
// ---------------------------------------------------------------------------

const finishSchema = z.object({
  siteUrl: z.string().min(1).max(500),
  /*
   * Optional, because a reconnection to a database that already has accounts
   * does not create one. They are still required by the form when an account is
   * actually being made — enforced against the database rather than the shape
   * of the request, which a caller controls.
   */
  adminName: z.string().max(120).default(''),
  adminEmail: z.string().max(200).default(''),
  adminPassword: z.string().max(200).default(''),
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


    let siteUrl: URL;
    try {
      siteUrl = new URL(parsed.siteUrl.trim());
    } catch {
      return failure('Enter the full public address of the site, for example https://example.com');
    }
    if (siteUrl.protocol !== 'http:' && siteUrl.protocol !== 'https:') {
      return failure('The site address must start with http:// or https://');
    }

    /*
     * A bind address is not a site address.
     *
     * `0.0.0.0` means "listen on every interface"; a container reached that way
     * reports it as its Host, so it is what this screen would otherwise be
     * handed. It goes into `NEXTAUTH_URL`, every sign-in redirect is sent
     * there, and a browser answers `ERR_ADDRESS_INVALID` — with the installer
     * already closed behind it.
     */
    const hostname = siteUrl.hostname.replace(/^\[|\]$/g, '');
    if (['0.0.0.0', '::', '0:0:0:0:0:0:0:0'].includes(hostname)) {
      return failure(
        'That is the address the server listens on, not one a browser can open. Enter the address people will actually visit — for example https://example.com, or http://localhost:3000 for a local install.',
      );
    }

    const origin = siteUrl.origin;

    loadStoredConfig();
    if (!process.env.DATABASE_URL?.trim()) {
      return failure('Configure the database before creating an administrator.');
    }

    // Only checked when an account is about to be created; a reconnection does
    // not ask for one.
    const creatingAccount = (await prisma.user.count().catch(() => 0)) === 0;
    if (creatingAccount) {
      if (!parsed.adminName.trim() || !parsed.adminEmail.trim()) {
        return failure('Enter a name and an email address for the administrator.');
      }
      if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(parsed.adminEmail.trim())) {
        return failure('That is not a valid email address.');
      }
      const weaknesses = passwordWeaknesses(parsed.adminPassword);
      if (weaknesses.length > 0) {
        return failure(`The administrator password needs ${weaknesses.join(', ')}.`);
      }
    }

    const secrets = generateMissingSecrets();

    /*
     * Would the configuration this is about to write survive the next restart?
     *
     * The container applies `collectEnvProblems` at boot and *exits* when it
     * finds one. So a configuration the wizard is happy with but the gate is
     * not produces the worst possible outcome: setup completes, the installer
     * closes behind it, and the application then refuses to start — with no
     * wizard left to correct it.
     *
     * That is not hypothetical. An `http://` site address is accepted by every
     * check in this action and rejected by the gate, which bricked a
     * freshly-installed copy on its first restart.
     *
     * So the same rules run here, against the configuration as it *would be*,
     * before a single value is written. Only the keys this wizard owns are
     * considered — storage and mail are configured later, in the admin panel,
     * and are not this screen's to refuse.
     */
    const prospective = {
      ...process.env,
      NODE_ENV: process.env.NODE_ENV,
      NEXTAUTH_URL: origin,
      NEXT_PUBLIC_SITE_URL: origin,
      ...secrets,
    };
    const owned = new Set<string>(CONFIG_KEYS);
    const blocking = collectEnvProblems(prospective).filter((problem) =>
      owned.has(problem.variable),
    );
    if (blocking.length > 0) {
      return failure(
        `This configuration would stop the application starting:\n${blocking
          .map((problem) => `• ${problem.variable} ${problem.problem}`)
          .join('\n')}`,
      );
    }

    /*
     * Secrets first, and written before the account exists.
     *
     * An account created against a missing AUTH_SECRET could not be signed in
     * to, and the wizard would already have closed behind it.
     */
    writeConfig({
      ...secrets,
      NEXTAUTH_URL: origin,
      NEXT_PUBLIC_SITE_URL: origin,
    });
    resetStoredConfigCache();
    loadStoredConfig();

    /*
     * Reconnecting to a database that already has accounts, rather than
     * installing into an empty one.
     *
     * Creating a second administrator here would be wrong twice over: the
     * existing owner did not ask for one, and an unauthenticated screen that
     * mints an admin against a populated database is a way in. So the account
     * step is skipped and only the configuration is rewritten — which is the
     * thing that was actually lost.
     */
    const existing = await prisma.user.findFirst({
      where: { deletedAt: null },
      orderBy: { createdAt: 'asc' },
      select: { email: true },
    });

    const admin = existing
      ? { email: existing.email }
      : await createFirstAdministrator(prisma, {
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
