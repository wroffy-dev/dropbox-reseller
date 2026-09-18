import 'server-only';

/**
 * Restarting the server once setup has finished.
 *
 * ## Why an install is not enough on its own
 *
 * Writing the configuration does not make the running process use it. Auth.js
 * reads `AUTH_SECRET` when `NextAuth()` is constructed, which happens the first
 * time its module is imported — before setup ran, when there was no secret to
 * read. Putting one into `process.env` afterwards cannot reach the instance
 * that already exists, and Auth.js offers no way to supply it later.
 *
 * So a freshly installed copy reported success and then answered every sign-in
 * with `MissingSecret`: installed, and unusable. The same is true of anything
 * else that captured configuration at import.
 *
 * A restart is the whole fix. Every module initialises again, this time against
 * a configuration that exists.
 *
 * ## Why exiting is safe here
 *
 * Every supported way of running this image restarts it: `restart:
 * unless-stopped` in Compose, the revision manager on Azure Container Apps, the
 * equivalent on Coolify and on a VPS under systemd. Exiting is how a container
 * asks to be restarted.
 *
 * Where nothing is watching — a bare `docker run` with no restart policy — the
 * container stops, which is visible and one command to undo. That is a better
 * failure than a site that is up and cannot authenticate anybody, because the
 * second one looks like a bug in the application.
 *
 * The delay exists so the response that triggered this reaches the browser
 * first. The wizard then waits for the server to answer again and sends the
 * administrator to the sign-in screen, so the restart is something they watch
 * happen rather than something that happens to them.
 */

/**
 * Long enough for the response to reach the browser *and* for the sign-in page
 * it then asks for to be served, short enough that nobody waits.
 *
 * The wizard leaves for the sign-in screen the moment setup succeeds, so that
 * request lands in this window: serving it before going down is what stops the
 * administrator seeing a dropped connection.
 */
const GRACE_MS = 3_000;

export function scheduleRestartAfterInstall(): void {
  console.log(
    JSON.stringify({
      level: 'info',
      event: 'install.restarting',
      message:
        'setup finished — restarting so every module starts against the new configuration',
      time: new Date().toISOString(),
    }),
  );

  const timer = setTimeout(() => {
    // 0, not a failure code: this is a deliberate, successful hand-off, and a
    // non-zero exit would be reported as a crash by every platform that watches
    // the container.
    process.exit(0);
  }, GRACE_MS);

  // Nothing else should be kept alive by this timer.
  timer.unref?.();
}
