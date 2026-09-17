import 'server-only';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';

/**
 * Talking to a database the wizard has just been handed.
 *
 * Everything here works on a connection string that is **not** the one this
 * process was started with — that is the whole point, and it is why none of it
 * can use the application's own Prisma client.
 *
 * ## Nothing that comes back from here is trusted prose
 *
 * A PostgreSQL driver error and a `prisma migrate` failure both quote the
 * connection string, credentials included, and both are about to be rendered
 * in a browser. Every message that leaves this module goes through `redact`
 * first, and the raw text is never logged either — the container log is not a
 * safe place for a password.
 */

export type Attempt = { ok: true } | { ok: false; reason: string };

/**
 * Removes anything that looks like a credential from a message.
 *
 * Two passes, because they catch different things: the exact string this call
 * was given, which handles it appearing in an unexpected format, and a general
 * pattern for any `scheme://user:password@host` that a driver decided to
 * reformat before quoting.
 */
export function redact(message: string, secret?: string): string {
  let safe = message;
  if (secret && secret.length > 8) {
    safe = safe.split(secret).join('[connection string]');
  }
  safe = safe.replace(/\b[a-z+]+:\/\/[^\s@/]+:[^\s@/]+@/gi, '[credentials]@');
  return safe.trim();
}

/** A connection string has to be one before anything tries to open it. */
export function validateConnectionString(raw: string): Attempt {
  const value = raw.trim();
  if (!value) return { ok: false, reason: 'Enter a PostgreSQL connection string.' };
  if (!/^postgres(ql)?:\/\//i.test(value)) {
    return { ok: false, reason: 'The connection string must start with postgresql://' };
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return { ok: false, reason: 'That is not a valid connection string.' };
  }
  if (!parsed.hostname) return { ok: false, reason: 'The connection string has no host.' };
  if (!parsed.pathname.replace(/^\//, '')) {
    return { ok: false, reason: 'The connection string does not name a database.' };
  }
  return { ok: true };
}

/**
 * Opens a connection, runs one trivial query, and closes it.
 *
 * A separate client with an explicit datasource, disconnected in a `finally`:
 * a wizard that leaves a pool open on every failed attempt would exhaust a
 * small PostgreSQL tier while somebody was still typing.
 */
export async function testConnection(url: string): Promise<Attempt> {
  const shape = validateConnectionString(url);
  if (!shape.ok) return shape;

  const client = new PrismaClient({ datasources: { db: { url } }, log: [] });
  try {
    await client.$queryRaw`SELECT 1`;
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      reason: redact(
        error instanceof Error ? error.message : 'The database could not be reached.',
        url,
      ).slice(0, 600),
    };
  } finally {
    await client.$disconnect().catch(() => {});
  }
}

/** Where the Prisma CLI is, in the container and in a checkout. */
function prismaCli(): string | null {
  const candidates = [
    path.join(process.cwd(), 'node_modules', 'prisma', 'build', 'index.js'),
    '/app/node_modules/prisma/build/index.js',
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

/**
 * Applies the migrations shipped in this image to the given database.
 *
 * `migrate deploy` and only `migrate deploy` — it applies what exists and never
 * generates, resets or drops. The wizard runs it against a database an operator
 * has just named, which may well not be empty, and a command that could reset
 * one has no business being reachable from a browser.
 *
 * The connection string is passed through the child's environment rather than
 * on its command line, because a command line is visible to anything else in
 * the container through `ps`.
 */
export async function applyMigrations(url: string): Promise<Attempt> {
  const cli = prismaCli();
  if (!cli) {
    return {
      ok: false,
      reason: 'The Prisma CLI is missing from this image, so migrations cannot be applied.',
    };
  }

  return new Promise<Attempt>((resolve) => {
    const child = spawn(process.execPath, [cli, 'migrate', 'deploy'], {
      env: {
        ...process.env,
        DATABASE_URL: url,
        // The CLI's update notifier would reach for the network, which on a
        // locked-down egress hangs the wizard rather than failing it.
        CHECKPOINT_DISABLE: '1',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let output = '';
    const collect = (chunk: Buffer) => {
      // Bounded: a migration that fails in a loop should not be able to grow
      // this without limit inside a request.
      if (output.length < 64_000) output += chunk.toString();
    };
    child.stdout.on('data', collect);
    child.stderr.on('data', collect);

    const timer = setTimeout(
      () => {
        child.kill('SIGKILL');
        resolve({
          ok: false,
          reason: 'Applying migrations took too long and was stopped. Check that the database is reachable and try again.',
        });
      },
      5 * 60 * 1000,
    );

    child.on('error', () => {
      clearTimeout(timer);
      resolve({ ok: false, reason: 'The migration process could not be started.' });
    });

    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) return resolve({ ok: true });
      resolve({
        ok: false,
        reason:
          redact(output, url).split('\n').filter(Boolean).slice(-12).join('\n').slice(0, 1500) ||
          'The migrations failed.',
      });
    });
  });
}

/**
 * Runs the foundation rows against the named database.
 *
 * Its own client for the same reason as the connection test: this database is
 * not necessarily the one this process is configured for.
 */
export async function prepareSchema(url: string): Promise<Attempt & { counts?: unknown }> {
  const client = new PrismaClient({ datasources: { db: { url } }, log: [] });
  try {
    const { seedFoundation } = await import('./bootstrap');
    const counts = await seedFoundation(client);
    return { ok: true, counts };
  } catch (error) {
    return {
      ok: false,
      reason: redact(
        error instanceof Error ? error.message : 'The database could not be prepared.',
        url,
      ).slice(0, 600),
    };
  } finally {
    await client.$disconnect().catch(() => {});
  }
}
