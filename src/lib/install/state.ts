import 'server-only';
import { readConfig } from './config-store';
import { loadStoredConfig } from './runtime-env';

/**
 * Has this copy been set up yet?
 *
 * ## Why this is not just "is there a config file"
 *
 * Every installation that exists today was configured by whoever deployed it:
 * `DATABASE_URL` and the secrets come from Azure Container Apps secrets, a
 * Compose file or a developer's `.env`, and there is no config file anywhere.
 * Those are *installed*. Treating "no config file" as "needs installing" would
 * put a setup wizard in front of a live storefront — and, worse, a wizard that
 * offers to create an administrator.
 *
 * So an installation is considered done when **either**:
 *
 *  - the stored configuration records an `installedAt`, which is what the
 *    wizard writes when it finishes; or
 *  - a database is configured and already holds a user account, which is what
 *    every existing deployment looks like.
 *
 * The second test is what makes this change safe to ship to a running system.
 *
 * ## Caching
 *
 * "Installed" is a one-way door, so once observed it is remembered for the life
 * of the process and never costs another query. "Not installed" is re-checked,
 * but no more often than `RECHECK_MS` — the wizard is a handful of requests and
 * a query per request on an empty database is not worth the complexity of
 * anything cleverer.
 */

export type InstallState = 'installed' | 'needs-install';

const RECHECK_MS = 2_000;

const globalForState = globalThis as unknown as {
  installState?: { value: InstallState; checkedAt: number };
};

/** Forgets what was observed. The wizard calls this the moment it finishes. */
export function resetInstallStateCache(): void {
  delete globalForState.installState;
}

export async function getInstallState(): Promise<InstallState> {
  const cached = globalForState.installState;
  if (cached?.value === 'installed') return 'installed';
  if (cached && Date.now() - cached.checkedAt < RECHECK_MS) return cached.value;

  const value = await determine();
  globalForState.installState = { value, checkedAt: Date.now() };
  return value;
}

async function determine(): Promise<InstallState> {
  loadStoredConfig();

  // The wizard's own record. Cheap, and true for anything this installer set up.
  if (readConfig().installedAt) return 'installed';

  // Nothing to connect to: certainly not installed.
  if (!process.env.DATABASE_URL?.trim()) return 'needs-install';

  /*
   * A database is configured. Whether this is a working installation or an
   * empty one the wizard should finish is decided by whether anybody can sign
   * in to it.
   *
   * Any failure here — unreachable server, missing tables on a database that
   * has never been migrated — means the same thing for this question: there is
   * no account, so setup has not finished. The error itself is deliberately not
   * inspected and never logged, because a Prisma connection error's message can
   * carry the whole connection string.
   */
  try {
    const { prisma } = await import('@/lib/db/prisma');
    const account = await prisma.user.findFirst({ select: { id: true } });
    return account ? 'installed' : 'needs-install';
  } catch {
    return 'needs-install';
  }
}

/** True when the setup wizard should still be reachable. */
export async function installerIsOpen(): Promise<boolean> {
  return (await getInstallState()) === 'needs-install';
}
