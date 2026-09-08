#!/bin/sh
# Applies pending migrations, then hands over to the Next.js server.
#
# `migrate deploy` only applies migrations that already exist — it never
# generates or resets anything, which is what makes it safe to run on boot.
set -e

if [ -z "$DATABASE_URL" ]; then
  echo "DATABASE_URL is not set." >&2
  exit 1
fi

if [ "${RUN_MIGRATIONS:-true}" = "true" ]; then
  echo "Applying database migrations…"
  attempt=1
  until npx prisma migrate deploy; do
    if [ "$attempt" -ge 5 ]; then
      echo "Migrations failed after $attempt attempts." >&2
      exit 1
    fi
    echo "Database not ready (attempt $attempt). Retrying in 5s…"
    attempt=$((attempt + 1))
    sleep 5
  done
  echo "Migrations applied."
fi

if [ "${RUN_SEED:-false}" = "true" ]; then
  echo "Seeding database…"
  # The seed is idempotent: it upserts roles and permissions and skips demo
  # content that already exists.
  npx tsx prisma/seed.ts || echo "Seed step failed; continuing." >&2
fi

exec "$@"
