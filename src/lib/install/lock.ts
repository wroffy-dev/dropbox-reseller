import 'server-only';
import { writeConfig, readConfig, configPath } from './config-store';
import { resetInstallStateCache } from './state';
import { resetStoredConfigCache } from './runtime-env';

/**
 * Closing the installer, and clearing up after it.
 *
 * ## The lock is a state, not a deletion
 *
 * The obvious reading of "remove the installer after setup" is to delete its
 * files. That cannot work here and would be worse if it could.
 *
 * The wizard's routes are compiled into the server bundle, so there are no
 * loose files to remove at runtime. And `/app` is replaced wholesale by the
 * next image — so even a successful deletion would be undone by the following
 * deployment, quietly reopening the installer on a live site with nobody
 * watching for it. A recorded state survives redeployment, applies to every
 * replica at once, and cannot be half-done.
 *
 * `src/lib/install/guards.ts` turns that state into the site's own 404 for
 * anyone who asks for `/install` afterwards.
 *
 * ## What is cleared
 *
 * Anything setup needed and the running application does not. The stored
 * configuration keeps exactly what the application needs to boot — the
 * connection string and the secrets — and nothing else. There is deliberately
 * no copy of the administrator's password anywhere: it was hashed by bcrypt and
 * the plaintext was never written down, never logged and never returned.
 */

/** Keys the wizard may have written that nothing needs once it has finished. */
const SETUP_ONLY_KEYS = [
  // Reserved: anything collected only to complete setup is listed here so it is
  // removed by name rather than by a rule somebody has to remember to apply.
  'INSTALL_TOKEN',
  'SETUP_ADMIN_EMAIL',
  'SETUP_ADMIN_PASSWORD',
] as const;

export type LockResult = {
  installedAt: string;
  /** Names of the keys the stored configuration kept. Never their values. */
  keptKeys: string[];
  configFile: string;
};

/**
 * Marks the installation complete and removes what only setup needed.
 *
 * Called last, and only once every check has passed — a lock taken before
 * verification would close the one screen able to fix whatever failed.
 */
export async function lockInstallation(): Promise<LockResult> {
  const installedAt = new Date().toISOString();

  const removals: Record<string, null> = {};
  for (const key of SETUP_ONLY_KEYS) removals[key] = null;

  writeConfig({ ...removals, installedAt });

  // The next read of either must see the new state rather than what was cached
  // while the wizard was still open.
  resetStoredConfigCache();
  resetInstallStateCache();

  const kept = Object.keys(readConfig()).filter(
    (key) => key !== 'installedAt' && key !== 'version',
  );

  /*
   * One line, naming keys and never values, so an operator can confirm from the
   * container log that setup finished and what it left behind.
   */
  console.log(
    JSON.stringify({
      level: 'info',
      event: 'install.completed',
      message: 'setup finished — the installer is now closed',
      keptKeys: kept,
      time: installedAt,
    }),
  );

  return { installedAt, keptKeys: kept, configFile: configPath() };
}

/** Has the installer been closed? Reads the file rather than any cache. */
export function installationIsLocked(): boolean {
  return Boolean(readConfig().installedAt);
}
