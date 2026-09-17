import 'server-only';
import { redirect, notFound } from 'next/navigation';
import { getInstallState } from './state';

/** Where the setup wizard lives. One constant, so nothing goes out of step. */
export const INSTALL_PATH = '/install';

/**
 * Sends a visitor to the wizard while the application is not set up yet.
 *
 * Called from the public and admin layouts rather than from middleware: the
 * answer depends on reading a file and querying the database, and middleware
 * runs on the Edge runtime where neither is available. Putting it in the
 * layouts also means it is checked on the same render that would otherwise
 * have tried to read content out of a database that is not there.
 */
export async function redirectWhenNotInstalled(): Promise<void> {
  if ((await getInstallState()) === 'needs-install') redirect(INSTALL_PATH);
}

/**
 * Closes the wizard once the application is set up.
 *
 * This is the "remove the installer" step, and it is deliberately a check
 * rather than a deletion. Routes are compiled into the server bundle, so they
 * cannot be deleted at runtime; and even where files could be removed, the next
 * deployment replaces the whole image and would put the installer back — an
 * installer that reopens on every deploy is worse than one that was never
 * removed, because nobody would be watching for it.
 *
 * A state check is strictly stronger: it survives redeployment, applies to
 * every replica at once, and cannot be undone by a file that failed to delete.
 *
 * The answer is the site's own 404, not a redirect and not a 403. A redirect
 * would confirm the path exists, and a 403 would confirm it exists *and* is
 * protected. A visitor probing for `/install` on a live site learns exactly what
 * they learn from any other URL that is not there.
 */
export async function requireInstallerOpen(): Promise<void> {
  if ((await getInstallState()) === 'installed') notFound();
}
