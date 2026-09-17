/**
 * Server startup and shutdown.
 *
 * Next.js calls `register()` once per server process, before the first request
 * is served. Two jobs happen here:
 *
 *  1. Environment validation. A production container with a missing critical
 *     variable exits immediately with a list of what is wrong, instead of
 *     booting and failing confusingly at the first sign-in.
 *  2. One structured startup line, so an operator can confirm which image and
 *     configuration a replica came up with.
 *
 * Graceful shutdown is deliberately *not* here. This file is compiled for the
 * Edge runtime alongside middleware, so anything it imports is paid for on every
 * request — importing Prisma from here doubled the middleware bundle. Signal
 * handling lives in `src/lib/db/prisma.ts`, which owns the connection pool and
 * is `server-only`.
 *
 * Nothing imported here pulls in a dependency: `env-validation` is plain
 * TypeScript with no zod, for the same bundling reason.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  /*
   * The configuration the setup wizard wrote, folded into `process.env` before
   * anything reads it.
   *
   * The container's CMD preloads `docker/load-config.cjs`, which does this
   * earlier and is still the belt — but it is the only thing that did, so
   * `next start`, `next dev` and any other way of running the server came up
   * with no connection string and no `AUTH_SECRET` after a perfectly good
   * install. That reads as `MissingSecret` on the sign-in screen.
   *
   * `node:fs` is reached through `process.getBuiltinModule` rather than an
   * import. This file is bundled for the Edge runtime alongside middleware, and
   * an import — static or dynamic, behind the runtime check above or not — pulls
   * `node:fs` into that bundle and fails the build. A runtime lookup by name is
   * invisible to the bundler and never evaluated on Edge.
   */
  hydrateStoredConfig();

  const { assertProductionEnv, awaitingInstallation } = await import('@/lib/env-validation');

  if (awaitingInstallation()) {
    // Not an error, and deliberately not fatal: this is what a fresh copy looks
    // like before anyone has opened it. Key *names* only — never their values.
    console.log(
      JSON.stringify({
        level: 'info',
        event: 'startup.awaiting_installation',
        message: 'no database configured — serving the setup wizard',
        time: new Date().toISOString(),
      }),
    );
    return;
  }

  try {
    assertProductionEnv();
  } catch (error) {
    // Deliberately fatal. A container that cannot work should fail visibly so
    // the platform surfaces it, rather than serving broken pages.
    console.error(`[startup] ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }

  logStartup();
}

/**
 * One structured line at boot, carrying only what an operator needs to confirm
 * the right image reached the right environment. No connection string, no
 * secret, no key — the database is described by host and name only.
 */
function logStartup(): void {
  console.log(
    JSON.stringify({
      level: 'info',
      event: 'app.start',
      time: new Date().toISOString(),
      nodeEnv: process.env.NODE_ENV,
      port: process.env.PORT ?? '3000',
      storage: (process.env.STORAGE_PROVIDER || 'local').toLowerCase(),
      backupStorage: (process.env.BACKUP_STORAGE_DRIVER || 'local').toLowerCase(),
      database: describeDatabase(),
      migrationsOnBoot: process.env.RUN_MIGRATIONS !== 'false',
    }),
  );
}

/**
 * Host and database name only.
 *
 * Parsed rather than pattern-stripped, so there is no way for a credential to
 * survive into the log through an unusual URL shape. An unparseable value is
 * reported as such rather than echoed.
 */
function describeDatabase(): string {
  const raw = process.env.DATABASE_URL;
  if (!raw) return 'not configured';
  try {
    const url = new URL(raw);
    return `${url.hostname}${url.port ? `:${url.port}` : ''}${url.pathname}`;
  } catch {
    return 'unparseable';
  }
}

/**
 * Reads the stored configuration and applies what the environment is missing.
 *
 * A deliberate duplicate of `docker/load-config.cjs`, kept small and dependency
 * free. The two exist for different moments: the preload runs before Node has
 * loaded the application at all, this runs for every other way of starting the
 * server. Whichever goes first wins, and the second finds nothing to do.
 *
 * A variable already set by the platform is never overridden, and no value is
 * ever logged — the line below names keys.
 */
function hydrateStoredConfig(): void {
  const KEYS = [
    'DATABASE_URL',
    'AUTH_SECRET',
    'NEXTAUTH_URL',
    'NEXT_PUBLIC_SITE_URL',
    'ENCRYPTION_KEY',
    'MFA_ENCRYPTION_KEY',
  ] as const;

  try {
    const fs = process.getBuiltinModule('node:fs');
    const nodePath = process.getBuiltinModule('node:path');
    const file = nodePath.join(
      (process.env.APP_CONFIG_DIR || '/data/config').trim(),
      'app-config.json',
    );
    if (!fs.existsSync(file)) return;

    const stored = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>;
    const applied: string[] = [];
    for (const key of KEYS) {
      const value = typeof stored[key] === 'string' ? stored[key].trim() : '';
      if (!value || process.env[key]?.trim()) continue;
      process.env[key] = value;
      applied.push(key);
    }

    if (applied.length > 0) {
      console.log(
        JSON.stringify({
          level: 'info',
          event: 'startup.config_hydrated',
          message: 'configuration loaded from the stored file',
          keys: applied,
          time: new Date().toISOString(),
        }),
      );
    }
  } catch {
    // Reported by the application, which can render an explanation. Throwing
    // here would stop the server booting far enough to do that.
    console.error('[startup] the stored configuration could not be read — treating it as absent');
  }
}
