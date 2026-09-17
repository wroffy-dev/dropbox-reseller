import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { mkdtempSync, rmSync, statSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { mockAuth, ensureSystemRoles, TEST_ACTOR } from '../helpers';

/*
 * The installer runs before anybody has signed in, so the auth mock is only
 * here because the action module's import graph reaches the guards. Nothing in
 * this suite depends on being authenticated — that is the point of it.
 */
mockAuth();

/** A scratch directory per run, so nothing here can touch a real config file. */
const configDir = mkdtempSync(path.join(tmpdir(), 'install-config-'));
process.env.APP_CONFIG_DIR = configDir;

const { prisma } = await import('@/lib/db/prisma');
const { readConfig, writeConfig, configPath, configuredKeys } = await import(
  '@/lib/install/config-store'
);
const { loadStoredConfig, resetStoredConfigCache } = await import('@/lib/install/runtime-env');
const { getInstallState, resetInstallStateCache } = await import('@/lib/install/state');
const { lockInstallation, installationIsLocked } = await import('@/lib/install/lock');
const { redact, validateConnectionString, testConnection } = await import(
  '@/lib/install/database'
);
const { generateSecrets, generateMissingSecrets } = await import('@/lib/install/secrets');
const { passwordWeaknesses } = await import('@/lib/install/bootstrap');
const { inspectEnvironment, configureDatabase, finishInstallation } = await import(
  '@/lib/actions/install'
);

const realDatabaseUrl = process.env.DATABASE_URL!;

function clearConfig() {
  rmSync(configPath(), { force: true });
  resetStoredConfigCache();
  resetInstallStateCache();
}

beforeAll(() => clearConfig());
afterAll(() => {
  rmSync(configDir, { recursive: true, force: true });
  process.env.DATABASE_URL = realDatabaseUrl;
});

beforeEach(() => resetInstallStateCache());

describe('the stored configuration', () => {
  beforeEach(() => clearConfig());

  it('is absent on a fresh copy, and that is not an error', () => {
    expect(existsSync(configPath())).toBe(false);
    expect(readConfig()).toEqual({});
  });

  it('is written so only the owner can read it', () => {
    writeConfig({ AUTH_SECRET: 'a-secret-value' });
    // 0600. A configuration file full of credentials on a shared volume must
    // not be readable by anything else mounted there.
    expect(statSync(configPath()).mode & 0o777).toBe(0o600);
  });

  it('merges rather than replaces, and removes a key set to null', () => {
    writeConfig({ AUTH_SECRET: 'one', ENCRYPTION_KEY: 'two' });
    writeConfig({ ENCRYPTION_KEY: null });
    const stored = readConfig();
    expect(stored.AUTH_SECRET).toBe('one');
    expect(stored.ENCRYPTION_KEY).toBeUndefined();
  });

  it('reports key names and never their values', () => {
    writeConfig({ AUTH_SECRET: 'super-secret-value', DATABASE_URL: 'postgresql://u:p@h:5432/d' });
    const names = configuredKeys();
    expect(names).toContain('AUTH_SECRET');
    expect(JSON.stringify(names)).not.toContain('super-secret-value');
    expect(JSON.stringify(names)).not.toContain('u:p@h');
  });
});

describe('platform configuration always wins', () => {
  beforeEach(() => clearConfig());

  it('never overrides a variable the platform already set', () => {
    writeConfig({ AUTH_SECRET: 'from-the-file' });
    process.env.AUTH_SECRET = 'from-the-platform';
    resetStoredConfigCache();

    loadStoredConfig();
    expect(process.env.AUTH_SECRET).toBe('from-the-platform');
  });

  it('supplies a variable the platform left unset', () => {
    delete process.env.ENCRYPTION_KEY;
    writeConfig({ ENCRYPTION_KEY: 'from-the-file' });
    resetStoredConfigCache();

    const applied = loadStoredConfig();
    expect(applied).toContain('ENCRYPTION_KEY');
    expect(process.env.ENCRYPTION_KEY).toBe('from-the-file');
  });
});

describe('deciding whether this copy is installed', () => {
  beforeEach(() => clearConfig());

  it('treats an existing deployment as installed, even with no config file', async () => {
    /*
     * The case that makes this change safe to ship. Every installation that
     * exists today was configured on the platform and has no config file — and
     * has users. Showing it a setup wizard would put one in front of a live
     * storefront.
     *
     * The account is provisioned here rather than assumed: the suites share one
     * database and some of them clean up after themselves, so a test that read
     * "installed" from whatever happened to be left behind would pass or fail
     * depending on which file ran before it.
     */
    process.env.DATABASE_URL = realDatabaseUrl;
    await ensureSystemRoles();
    const role = await prisma.userRole.findFirstOrThrow({ where: { slug: 'super-admin' } });
    await prisma.user.upsert({
      where: { id: TEST_ACTOR.id },
      update: {},
      create: {
        id: TEST_ACTOR.id,
        email: TEST_ACTOR.email,
        name: TEST_ACTOR.name,
        roleId: role.id,
      },
    });

    expect(existsSync(configPath())).toBe(false);
    resetInstallStateCache();
    expect(await getInstallState()).toBe('installed');
  });

  it('needs installing when there is no database at all', async () => {
    delete process.env.DATABASE_URL;
    resetInstallStateCache();
    expect(await getInstallState()).toBe('needs-install');
    process.env.DATABASE_URL = realDatabaseUrl;
  });

  it('is installed once the wizard has recorded it, whatever else is true', async () => {
    delete process.env.DATABASE_URL;
    writeConfig({ installedAt: new Date().toISOString() });
    resetStoredConfigCache();
    resetInstallStateCache();

    expect(await getInstallState()).toBe('installed');
    process.env.DATABASE_URL = realDatabaseUrl;
  });
});

describe('errors never carry credentials', () => {
  it('removes the exact connection string it was given', () => {
    const url = 'postgresql://admin:hunter2@db.internal:5432/app';
    const message = redact(`Cannot reach ${url} — timed out`, url);
    expect(message).not.toContain('hunter2');
    expect(message).not.toContain('admin:hunter2');
  });

  it('removes credentials it was not given, in any URL shape', () => {
    const message = redact('failed: postgres://someone:letmein@host:5432/db is unreachable');
    expect(message).not.toContain('letmein');
    expect(message).toContain('[credentials]@');
  });
});

describe('the connection string is checked before anything opens it', () => {
  it('refuses something that is not a PostgreSQL URL', () => {
    expect(validateConnectionString('mysql://a:b@h/d').ok).toBe(false);
    expect(validateConnectionString('not a url').ok).toBe(false);
    expect(validateConnectionString('').ok).toBe(false);
  });

  it('refuses a URL that names no database', () => {
    expect(validateConnectionString('postgresql://user:pw@host:5432/').ok).toBe(false);
  });

  it('accepts a well-formed one', () => {
    expect(validateConnectionString(realDatabaseUrl).ok).toBe(true);
  });

  it('reports an unreachable database without quoting its password', async () => {
    const result = await testConnection('postgresql://u:s3cr3tpw@127.0.0.1:1/nope');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).not.toContain('s3cr3tpw');
  });
});

describe('generated secrets', () => {
  it('are long, random and all different', () => {
    const first = generateSecrets();
    const second = generateSecrets();
    for (const value of Object.values(first)) expect(value.length).toBeGreaterThanOrEqual(40);
    expect(first.AUTH_SECRET).not.toBe(first.ENCRYPTION_KEY);
    expect(first.AUTH_SECRET).not.toBe(second.AUTH_SECRET);
  });

  it('leaves alone anything the platform already supplies', () => {
    const generated = generateMissingSecrets((name) => name === 'AUTH_SECRET');
    expect(generated.AUTH_SECRET).toBeUndefined();
    expect(generated.ENCRYPTION_KEY).toBeDefined();
  });
});

describe('the first administrator password', () => {
  it('names what is missing rather than echoing the password', () => {
    const missing = passwordWeaknesses('short');
    expect(missing).toContain('at least 14 characters');
    expect(missing.join(' ')).not.toContain('short');
  });

  it('accepts a strong one', () => {
    expect(passwordWeaknesses('Correct-Horse-9-Battery!')).toEqual([]);
  });
});

describe('locking, and what it clears', () => {
  beforeEach(() => clearConfig());

  it('records the installation and keeps only what the app needs to boot', async () => {
    writeConfig({
      DATABASE_URL: realDatabaseUrl,
      AUTH_SECRET: 'kept',
      INSTALL_TOKEN: 'temporary-setup-only',
    });
    resetStoredConfigCache();

    const result = await lockInstallation();

    expect(result.installedAt).toBeTruthy();
    expect(installationIsLocked()).toBe(true);

    const stored = readConfig();
    expect(stored.DATABASE_URL).toBe(realDatabaseUrl);
    expect(stored.AUTH_SECRET).toBe('kept');
    // The setup-only credential is gone.
    expect((stored as Record<string, unknown>).INSTALL_TOKEN).toBeUndefined();

    // And nothing that was cleared is still sitting in the file.
    expect(readFileSync(configPath(), 'utf8')).not.toContain('temporary-setup-only');
  });

  it('closes the installer to every action afterwards', async () => {
    writeConfig({ DATABASE_URL: realDatabaseUrl, installedAt: new Date().toISOString() });
    resetStoredConfigCache();
    resetInstallStateCache();

    for (const attempt of [
      await inspectEnvironment(),
      await configureDatabase({ databaseUrl: realDatabaseUrl }),
      await finishInstallation({
        siteUrl: 'https://example.com',
        adminName: 'Intruder',
        adminEmail: 'intruder@example.com',
        adminPassword: 'Correct-Horse-9-Battery!',
      }),
    ]) {
      expect(attempt.ok).toBe(false);
      if (!attempt.ok) expect(attempt.error).toMatch(/already complete/i);
    }
  });
});
