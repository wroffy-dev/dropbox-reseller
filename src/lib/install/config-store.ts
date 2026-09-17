import 'server-only';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
  chmodSync,
  unlinkSync,
} from 'node:fs';
import path from 'node:path';

/**
 * Configuration the application writes about itself.
 *
 * ## Why a file at all
 *
 * Everything this application needs used to arrive as environment variables set
 * by whoever deployed it. That works, and on Azure Container Apps it remains the
 * right answer — but it means the first run of a fresh copy is an operator
 * exercise, not a visit to the site: somebody has to know the variable names,
 * generate the secrets by hand, and set `SEED_ADMIN_PASSWORD` in the platform's
 * environment just long enough to create one account.
 *
 * The setup wizard needs somewhere to put what it collects, and that somewhere
 * has to survive a restart. So: one JSON file, on the persistent volume.
 *
 * ## The platform always wins
 *
 * A value set in the real environment is never overridden by this file.
 * A deployment that already configures `DATABASE_URL` through Container Apps
 * secrets keeps behaving exactly as it does today, and the file simply has
 * nothing to contribute. The file is the *fallback*, which is what makes adding
 * it safe for an installation that already works.
 *
 * ## What is in it
 *
 * Connection strings and secrets — the things that would otherwise be typed
 * into a platform's secret store. So:
 *
 *  - the directory is created 0700 and the file written 0600, because on a
 *    shared volume "readable by the container" should not mean "readable by
 *    anything else mounted there";
 *  - it is written atomically, through a temporary file and a rename, so a
 *    container killed mid-write leaves the previous configuration intact rather
 *    than a truncated file that boots into nothing;
 *  - **no value from it is ever logged.** Not at debug level, not in an error
 *    message, not in a stack trace. The helpers below return keys, never values,
 *    for exactly this reason.
 *
 * ## What is not in it
 *
 * Nothing the database can hold. Site settings, company details and country
 * configuration are rows, not configuration — they are editable in the admin
 * panel and belong in PostgreSQL. This file holds only what is needed *before*
 * there is a database to read.
 */

/** The keys this file is allowed to carry. An explicit list, not "anything". */
export const CONFIG_KEYS = [
  'DATABASE_URL',
  'AUTH_SECRET',
  'NEXTAUTH_URL',
  'NEXT_PUBLIC_SITE_URL',
  'ENCRYPTION_KEY',
  'MFA_ENCRYPTION_KEY',
] as const;

export type ConfigKey = (typeof CONFIG_KEYS)[number];

export type InstallConfig = Partial<Record<ConfigKey, string>> & {
  /** ISO timestamp. Its presence is what "this copy has been installed" means. */
  installedAt?: string;
  /** The schema version of this file, so a later release can migrate it. */
  version?: number;
};

export const CONFIG_VERSION = 1;

/**
 * Where the file lives.
 *
 * `/data` rather than `/app`: everything under `/app` is replaced wholesale by
 * the next image, so configuration written there would be destroyed by the
 * deployment that was supposed to preserve it. `/data` is the volume that
 * already holds the media library for the same reason.
 */
export function configDirectory(): string {
  return process.env.APP_CONFIG_DIR?.trim() || '/data/config';
}

export function configPath(): string {
  return path.join(configDirectory(), 'app-config.json');
}

/**
 * Reads the file, or returns nothing.
 *
 * Synchronous on purpose: this is read while modules are still initialising,
 * before the first request, and an async read there would mean every consumer
 * had to be async too — including the Prisma client's datasource.
 *
 * A missing file is the normal state of a fresh copy, not an error. A corrupt
 * one is reported as empty rather than thrown, because throwing here would stop
 * the server booting and the wizard is the only thing that could repair it.
 */
export function readConfig(): InstallConfig {
  const file = configPath();
  try {
    if (!existsSync(file)) return {};
    const parsed: unknown = JSON.parse(readFileSync(file, 'utf8'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed as InstallConfig;
  } catch {
    // Deliberately no value, no path, no parser message in the log line: this
    // runs on a file full of secrets and a JSON error can quote its content.
    console.error('[config] the stored configuration could not be read — treating it as absent');
    return {};
  }
}

/**
 * Writes the file, atomically, with the previous contents merged underneath.
 *
 * A key set to `null` is removed — which is how the installer drops a value it
 * only needed during setup, rather than leaving it behind for the life of the
 * installation.
 */
export function writeConfig(
  /** A key set to `null` is removed; see below. */
  patch: Record<string, string | number | null | undefined>,
): void {
  const directory = configDirectory();
  mkdirSync(directory, { recursive: true, mode: 0o700 });

  const merged: Record<string, unknown> = { ...readConfig(), version: CONFIG_VERSION };
  for (const [key, value] of Object.entries(patch)) {
    if (value === null || value === undefined || value === '') delete merged[key];
    else merged[key] = value;
  }

  const file = configPath();
  const temporary = `${file}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(merged, null, 2)}\n`, { mode: 0o600 });
  renameSync(temporary, file);
  // rename preserves the temporary file's mode, but an existing file replaced
  // by it may predate this and carry a wider one.
  chmodSync(file, 0o600);
}

/** Is the configuration directory somewhere this process can actually write? */
export function configIsWritable(): { ok: true } | { ok: false; reason: string } {
  const directory = configDirectory();
  try {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
  } catch {
    return {
      ok: false,
      reason: `The configuration directory could not be created. Mount a writable volume at ${directory}, or set APP_CONFIG_DIR to a directory this container can write to.`,
    };
  }
  const probe = path.join(directory, `.write-probe-${process.pid}`);
  try {
    writeFileSync(probe, 'x', { mode: 0o600 });
  } catch {
    return {
      ok: false,
      reason: `The configuration directory is not writable by this container. Check the ownership of ${directory}.`,
    };
  }
  try {
    unlinkSync(probe);
  } catch {
    // An undeletable probe is not a reason to fail the check.
  }
  return { ok: true };
}

/**
 * Which configured keys this file supplies — **names only, never values**.
 *
 * Used by the wizard's summary and the startup log, both of which an operator
 * reads and neither of which should ever contain a secret.
 */
export function configuredKeys(config: InstallConfig = readConfig()): ConfigKey[] {
  return CONFIG_KEYS.filter((key) => Boolean(config[key]?.trim()));
}
