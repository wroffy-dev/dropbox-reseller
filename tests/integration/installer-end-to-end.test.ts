import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { mockAuth } from '../helpers';

mockAuth();

/**
 * The whole claim, against a genuinely empty database.
 *
 * Everything else about the installer can be unit tested; this cannot. The
 * question it answers is whether a copy with no schema, no rows and no
 * configuration can be turned into a working installation by the same calls the
 * wizard makes — migrations, foundation rows, secrets, an administrator and the
 * lock — and the only way to know is to do it.
 */

const configDir = mkdtempSync(path.join(tmpdir(), 'install-e2e-'));
process.env.APP_CONFIG_DIR = configDir;

const adminUrl = process.env.DATABASE_URL!;
const freshName = `install_e2e_${Date.now()}`;
const freshUrl = adminUrl.replace(/\/[^/?]+(\?|$)/, `/${freshName}$1`);

const { configPath, readConfig } = await import('@/lib/install/config-store');
const { resetStoredConfigCache } = await import('@/lib/install/runtime-env');
const { resetInstallStateCache, getInstallState } = await import('@/lib/install/state');
const { configureDatabase, finishInstallation } = await import('@/lib/actions/install');
const { resetPrismaClient } = await import('@/lib/db/prisma');

let admin: PrismaClient;

beforeAll(async () => {
  admin = new PrismaClient({ datasources: { db: { url: adminUrl } }, log: [] });
  await admin.$executeRawUnsafe(`CREATE DATABASE "${freshName}"`);

  /*
   * The state this test is about: an empty database, no stored configuration,
   * and nothing installed.
   *
   * `DATABASE_URL` is pointed at the empty database rather than unset, because
   * unsetting it does not survive: constructing a `PrismaClient` re-reads the
   * project's `.env` and puts the development value back, so a test that
   * depended on the variable being absent would pass in CI — where there is no
   * `.env` — and fail on a developer's machine. The case where nothing at all
   * is configured is covered in installer.test.ts, which constructs no clients
   * between its assertions.
   *
   * What this file is for is the rest of it: migrations, foundation rows,
   * secrets, the administrator and the lock, against a database that really is
   * empty.
   */
  rmSync(configPath(), { force: true });
  process.env.DATABASE_URL = freshUrl;
  resetStoredConfigCache();
  resetInstallStateCache();
}, 60_000);

afterAll(async () => {
  process.env.DATABASE_URL = adminUrl;
  try {
    await admin.$executeRawUnsafe(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${freshName}'`,
    );
    await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${freshName}"`);
  } catch {
    // A leftover scratch database is not worth failing the suite over.
  }
  await admin.$disconnect().catch(() => {});
  rmSync(configDir, { recursive: true, force: true });
}, 60_000);

describe('installing a copy that has nothing', () => {
  it('starts out needing installation: a database with nobody in it', async () => {
    expect(existsSync(configPath())).toBe(false);
    expect(await getInstallState()).toBe('needs-install');
  });

  it('migrates and prepares the database, then stores the connection', async () => {
    const result = await configureDatabase({ databaseUrl: freshUrl });
    expect(result.ok, result.ok === false ? result.error : '').toBe(true);

    // The schema is really there, and so are the rows an empty database needs.
    const fresh = new PrismaClient({ datasources: { db: { url: freshUrl } }, log: [] });
    try {
      expect(await fresh.permission.count()).toBeGreaterThan(0);
      expect(await fresh.userRole.count()).toBeGreaterThan(0);
      expect(await fresh.country.count()).toBeGreaterThan(0);
      // Nobody can sign in yet, which is what keeps the next step legitimate.
      expect(await fresh.user.count()).toBe(0);
    } finally {
      await fresh.$disconnect().catch(() => {});
    }

    expect(readConfig().DATABASE_URL).toBe(freshUrl);
  }, 120_000);

  it('is still not installed until an administrator exists', async () => {
    resetInstallStateCache();
    // A migrated, prepared database is not an installed one: the thing that
    // makes it installed is somebody being able to sign in.
    expect(await getInstallState()).toBe('needs-install');
  });

  it('refuses a weak administrator password without writing anything', async () => {
    const before = readConfig();
    const result = await finishInstallation({
      siteUrl: 'https://shop.example.com',
      adminName: 'Owner',
      adminEmail: 'owner@example.com',
      adminPassword: 'password',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/14 characters/);
    // The failed step left the installation exactly as it was.
    expect(readConfig().installedAt).toBeUndefined();
    expect(readConfig().DATABASE_URL).toBe(before.DATABASE_URL);
    resetInstallStateCache();
    expect(await getInstallState()).toBe('needs-install');
  });

  it('refuses a configuration the next restart would reject, and stays open', async () => {
    /*
     * The trap this closes: the gate the container applies at boot rejects a
     * non-https site address in production and *exits*. A wizard that accepted
     * one would complete, close behind itself, and leave an application that
     * cannot start and has no installer left to fix it.
     */
    const wasProduction = process.env.NODE_ENV;
    Object.defineProperty(process.env, 'NODE_ENV', {
      value: 'production',
      configurable: true,
      writable: true,
      enumerable: true,
    });
    try {
      const result = await finishInstallation({
        siteUrl: 'http://shop.example.com',
        adminName: 'Owner',
        adminEmail: 'owner@example.com',
        adminPassword: 'Correct-Horse-9-Battery!',
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error).toMatch(/https/i);
    } finally {
      Object.defineProperty(process.env, 'NODE_ENV', {
        value: wasProduction,
        configurable: true,
        writable: true,
        enumerable: true,
      });
    }

    // Nothing was written and nobody was created.
    expect(readConfig().installedAt).toBeUndefined();
    resetInstallStateCache();
    expect(await getInstallState()).toBe('needs-install');
  });

  it('creates the administrator, generates the secrets and locks the installer', async () => {
    /*
     * A fresh copy has no secrets set. The test harness supplies them for every
     * other suite, and leaving them in place would exercise the *other* branch —
     * "the platform already set this, so keep it" — and prove nothing about
     * generation. Nothing restores these the way `.env` restores DATABASE_URL.
     */
    for (const key of ['AUTH_SECRET', 'ENCRYPTION_KEY', 'MFA_ENCRYPTION_KEY']) {
      delete process.env[key];
    }

    const result = await finishInstallation({
      siteUrl: 'https://shop.example.com/some/path',
      adminName: 'Site Owner',
      adminEmail: 'Owner@Example.com',
      adminPassword: 'Correct-Horse-9-Battery!',
    });

    expect(result.ok, result.ok === false ? result.error : '').toBe(true);
    if (!result.ok) return;

    expect(result.data!.adminEmail).toBe('owner@example.com');
    expect(result.data!.checks.every((check) => check.ok)).toBe(true);

    const stored = readConfig();
    expect(stored.installedAt).toBeTruthy();
    // Secrets were generated, and the site URL was reduced to its origin.
    for (const key of ['AUTH_SECRET', 'ENCRYPTION_KEY', 'MFA_ENCRYPTION_KEY'] as const) {
      expect(stored[key]?.length ?? 0).toBeGreaterThanOrEqual(40);
    }
    expect(stored.NEXTAUTH_URL).toBe('https://shop.example.com');

    // The account is real, hashed, and a super admin.
    const fresh = new PrismaClient({ datasources: { db: { url: freshUrl } }, log: [] });
    try {
      const account = await fresh.user.findFirstOrThrow({ include: { roles: true } });
      expect(account.email).toBe('owner@example.com');
      expect(account.roles?.slug).toBe('super-admin');
      expect(account.passwordHash).toBeTruthy();
      // The password itself was hashed and discarded, never stored as given.
      expect(account.passwordHash).not.toContain('Correct-Horse-9-Battery!');
    } finally {
      await fresh.$disconnect().catch(() => {});
    }
  }, 60_000);

  it('never writes the administrator password into the configuration', () => {
    const raw = JSON.stringify(readConfig());
    expect(raw).not.toContain('Correct-Horse-9-Battery!');
  });

  it('is installed, and stays installed', async () => {
    resetInstallStateCache();
    expect(await getInstallState()).toBe('installed');
  });

  /*
   * Losing the configuration is not losing the installation.
   *
   * The way to get here is a wizard install whose config file sat on a
   * container's own filesystem and was destroyed by the next restart: the
   * database survived, the connection string and the secrets did not. The app
   * then sees no database, offers the wizard again, and the wizard used to be a
   * dead end — it refuses to create a second administrator and had no other way
   * through.
   */
  it('reconnects to a database that already has an account, without creating another', async () => {
    rmSync(configPath(), { force: true });
    /*
     * What a restarted container actually looks like: the file is gone and
     * nothing in the environment names a database. Clearing the variable is the
     * part that makes this a faithful simulation — with it still set, the
     * application can see the accounts in that database and judges itself
     * installed, which is the state a restart does *not* come back in.
     */
    delete process.env.DATABASE_URL;
    // The secrets went with the file. Everyone is signed out by this, which is
    // the unavoidable cost of losing the key that signed their sessions.
    for (const key of ['AUTH_SECRET', 'ENCRYPTION_KEY', 'MFA_ENCRYPTION_KEY']) {
      delete process.env[key];
    }
    resetStoredConfigCache();
    resetInstallStateCache();

    const reconnect = await configureDatabase({ databaseUrl: freshUrl });
    expect(reconnect.ok, reconnect.ok === false ? reconnect.error : '').toBe(true);
    // It says so, rather than letting the operator think this is a fresh start.
    expect(reconnect.ok && reconnect.data!.hasAccounts).toBe(true);

    /*
     * Constructing a Prisma client re-reads the project's `.env`, which puts
     * the development database back into the environment — and because a
     * platform variable always wins over the stored file, the stored one would
     * then be ignored. A container has no `.env`, so this pins the environment
     * to what a restart there would actually leave: the file's own value.
     */
    process.env.DATABASE_URL = freshUrl;
    resetPrismaClient();

    // No administrator details: a reconnection does not ask for any.
    const finished = await finishInstallation({ siteUrl: 'https://shop.example.com' });
    expect(finished.ok, finished.ok === false ? finished.error : '').toBe(true);
    if (!finished.ok) return;

    // The original owner, not a new one, and still exactly one account.
    expect(finished.data!.adminEmail).toBe('owner@example.com');
    const fresh = new PrismaClient({ datasources: { db: { url: freshUrl } }, log: [] });
    try {
      expect(await fresh.user.count()).toBe(1);
    } finally {
      await fresh.$disconnect().catch(() => {});
    }

    // And the configuration it lost is back.
    const stored = readConfig();
    expect(stored.DATABASE_URL).toBe(freshUrl);
    expect(stored.installedAt).toBeTruthy();

    /*
     * Every secret the application needs is available — from the file, or from
     * the environment where the platform supplies one. Which of the two is
     * deliberately not asserted: generating a value the platform already sets
     * would overwrite it, so "missing from the file" is the correct outcome
     * whenever the environment has it. The run's own checks cover the same
     * ground, and refuse to lock without them.
     */
    for (const key of ['AUTH_SECRET', 'ENCRYPTION_KEY', 'MFA_ENCRYPTION_KEY'] as const) {
      const available = (process.env[key]?.trim() || stored[key]?.trim()) ?? '';
      expect(available.length).toBeGreaterThanOrEqual(16);
    }
    expect(finished.data!.checks.every((check) => check.ok)).toBe(true);
    resetInstallStateCache();
  }, 120_000);

  it('refuses every installer action now that it is closed', async () => {
    const again = await finishInstallation({
      siteUrl: 'https://shop.example.com',
      adminName: 'Second',
      adminEmail: 'second@example.com',
      adminPassword: 'Correct-Horse-9-Battery!',
    });
    expect(again.ok).toBe(false);

    // And no second account was created by the attempt.
    const fresh = new PrismaClient({ datasources: { db: { url: freshUrl } }, log: [] });
    try {
      expect(await fresh.user.count()).toBe(1);
    } finally {
      await fresh.$disconnect().catch(() => {});
    }
  });
});
