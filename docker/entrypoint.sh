#!/bin/sh
# Container startup: apply migrations, optionally seed, then hand over to Next.
#
# Only `migrate deploy` is ever used. It applies migrations that already exist in
# the image and nothing else — it never generates, never resets and never drops.
# `migrate dev`, `db push` and `migrate reset` must not appear in this file.
set -eu

log() {
  # Structured enough to grep in Azure Log Analytics, plain enough to read.
  printf '{"level":"%s","event":"%s","message":"%s","time":"%s"}\n' \
    "$1" "$2" "$3" "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}

die() {
  log error "$1" "$2"
  exit 1
}

# ---------------------------------------------------------------------------
# Is this copy configured yet?
# ---------------------------------------------------------------------------
# A missing DATABASE_URL used to stop the container. That was right when the
# only way to configure this application was to set variables on the platform:
# a container with no database could do nothing but serve errors.
#
# It is wrong now. A fresh copy is *expected* to start with nothing set — the
# setup wizard is how the connection string arrives, and the wizard is a page
# this server has to be running to render. Exiting here would mean the one
# screen that can fix the problem never loads.
#
# The wizard writes its configuration to APP_CONFIG_DIR, so a container that has
# already been set up finds its database there rather than in the environment.
CONFIG_FILE="${APP_CONFIG_DIR:-/data/config}/app-config.json"

AWAITING_INSTALL=false

if [ -z "${DATABASE_URL:-}" ]; then
  if [ -f "$CONFIG_FILE" ]; then
    # Already installed through the wizard.
    #
    # The connection string is read out of the file and exported, so the
    # migration step below works exactly as it does for a platform-configured
    # deployment — which is what makes a *redeploy* safe: a new image with new
    # migrations applies them on start, rather than leaving a wizard-installed
    # copy pinned to the schema it was installed with.
    #
    # Read by node on stdout, never passed as an argument: an argument would be
    # visible in `ps` to anything else in the container. Exporting it puts it in
    # this process's environment, which is exactly where a platform-set variable
    # would already be, so this adds no exposure that did not already exist.
    DATABASE_URL="$(node -e '
      const fs = require("node:fs");
      try {
        const raw = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
        process.stdout.write(typeof raw.DATABASE_URL === "string" ? raw.DATABASE_URL : "");
      } catch {
        process.stdout.write("");
      }
    ' "$CONFIG_FILE" 2>/dev/null || true)"

    if [ -n "$DATABASE_URL" ]; then
      export DATABASE_URL
      log info startup.config_loaded "database configuration read from the stored config"
    else
      # The file exists but carries no connection string — an installation that
      # was interrupted before its database step finished. The wizard is still
      # the thing that fixes it.
      log warn startup.config_incomplete "stored config has no database — serving the setup wizard"
      AWAITING_INSTALL=true
    fi
  else
    log info startup.awaiting_installation \
      "no database configured — starting so the setup wizard can be reached"
    AWAITING_INSTALL=true
  fi
fi

# The Prisma CLI ships in the image, so call the local binary directly. Using
# `npx prisma` would let a resolution miss turn into a registry fetch, which
# fails on a locked-down Azure Container Apps egress and would be reported as a
# migration error rather than a networking one.
PRISMA_BIN="/app/node_modules/prisma/build/index.js"
if [ ! -f "$PRISMA_BIN" ]; then
  die startup.misconfigured "Prisma CLI is missing from the image"
fi
prisma() {
  node "$PRISMA_BIN" "$@"
}

# ---------------------------------------------------------------------------
# Migrations
# ---------------------------------------------------------------------------
# Retries exist for one specific case: the database is reachable but not yet
# accepting connections — an Azure PostgreSQL Flexible Server waking from a
# stopped state, or a failover mid-deploy. Backoff is exponential and capped, so
# the total wait is about four minutes rather than the 25 seconds a flat 5×5s
# retry allowed, which was not enough for a cold Azure server.
#
# A migration that fails for any *other* reason (a conflicting schema, a bad SQL
# statement) will fail on every attempt and then fail the container. That is
# deliberate: a replica that starts against a schema it does not match serves
# errors, and silently continuing would hide the cause.
# Skipped entirely while the application is waiting to be installed: there is no
# database to migrate, and the wizard runs the migrations itself once it has a
# connection string it has tested.
if [ "$AWAITING_INSTALL" = "true" ]; then
  log info migrate.skipped "no database configured yet — the setup wizard will migrate"
elif [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  log info migrate.start "applying database migrations"

  attempt=1
  max_attempts="${MIGRATION_MAX_ATTEMPTS:-7}"
  delay=2

  until prisma migrate deploy; do
    if [ "$attempt" -ge "$max_attempts" ]; then
      die migrate.failed "migrations failed after ${attempt} attempts — container will not start"
    fi
    log warn migrate.retry "attempt ${attempt} failed, retrying in ${delay}s"
    sleep "$delay"
    attempt=$((attempt + 1))
    delay=$((delay * 2))
    # An `&& assignment` here would return non-zero when the test is false and,
    # under `set -e`, kill the script on the very first retry.
    if [ "$delay" -gt 60 ]; then
      delay=60
    fi
  done

  log info migrate.done "migrations applied"
else
  log info migrate.skipped "RUN_MIGRATIONS is not true"
fi

# ---------------------------------------------------------------------------
# Seeding
# ---------------------------------------------------------------------------
# Off by default and intended to be switched off again once the first admin
# exists. The seed is idempotent — it upserts roles and permissions and leaves an
# existing admin's password alone — so an accidental second run is harmless, but
# leaving it on means the admin password stays in the environment for no reason.
#
# It runs the compiled bundle, not `tsx prisma/seed.ts`: tsx is a devDependency
# and is not present in this image, so the old command failed here and the
# failure was swallowed. A failure now stops the container, because a deployment
# that was explicitly told to create an admin and did not is broken.
if [ "$AWAITING_INSTALL" = "true" ] && [ "${RUN_SEED:-false}" = "true" ]; then
  log warn seed.skipped "RUN_SEED is set but no database is configured — use the setup wizard"
elif [ "${RUN_SEED:-false}" = "true" ]; then
  SEED_BUNDLE="/app/prisma/seed.mjs"
  if [ ! -f "$SEED_BUNDLE" ]; then
    die seed.missing "RUN_SEED=true but $SEED_BUNDLE is not in the image"
  fi

  log info seed.start "seeding database"
  if node "$SEED_BUNDLE"; then
    log info seed.done "seed complete — set RUN_SEED=false and clear SEED_ADMIN_PASSWORD"
  else
    die seed.failed "seed failed — see the error above; fix the configuration and redeploy"
  fi
else
  log info seed.skipped "RUN_SEED is not true"
fi

# ---------------------------------------------------------------------------
# Media storage
# ---------------------------------------------------------------------------
# Checked before the server starts, because the failure it catches is silent:
# a container brought up without its volume works perfectly, nobody notices,
# and every upload lands on a layer the next deployment throws away.
#
# Not fatal. An unwritable directory stops uploads; it does not stop the site
# serving the pages it already has, and exiting here would take a working
# storefront offline over a misconfigured mount.
STORAGE_DRIVER_RESOLVED="$(printf '%s' "${STORAGE_DRIVER:-${STORAGE_PROVIDER:-local}}" | tr '[:upper:]' '[:lower:]')"

if [ "$STORAGE_DRIVER_RESOLVED" = "local" ]; then
  MEDIA_DIR="${UPLOAD_DIR:-${LOCAL_UPLOAD_DIR:-/data/uploads}}"

  if ! mkdir -p "$MEDIA_DIR" 2>/dev/null; then
    log error storage.unusable "cannot create $MEDIA_DIR — uploads will fail until a writable volume is mounted there"
  elif [ ! -w "$MEDIA_DIR" ]; then
    log error storage.readonly "$MEDIA_DIR is not writable by this container — uploads will fail; check the volume's ownership"
  else
    log info storage.ready "media storage: local, $MEDIA_DIR, writable"
  fi
else
  log info storage.ready "media storage: $STORAGE_DRIVER_RESOLVED (object storage)"
fi

log info server.start "starting Next.js on port ${PORT:-3000}"

# `exec` replaces this shell, so the Node process becomes PID 1 and receives
# SIGTERM directly from the platform. Without it the signal would stop the shell
# and the server would be killed instead of shutting down cleanly — see
# src/instrumentation.ts for what happens on that signal.
exec "$@"
