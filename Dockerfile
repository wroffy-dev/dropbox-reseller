# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Dependencies — cached independently of the source tree
# ---------------------------------------------------------------------------
FROM node:22-alpine AS deps
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

COPY package.json package-lock.json* ./
COPY prisma ./prisma
# `npm ci` runs prisma generate through the postinstall of @prisma/client.
RUN npm ci --ignore-scripts && npx prisma generate

# ---------------------------------------------------------------------------
# Build
# ---------------------------------------------------------------------------
FROM node:22-alpine AS builder
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
# The build reads settings from the database when it can and falls back to
# on-demand rendering when it cannot, so a database is not required here.
# A syntactically valid placeholder keeps Prisma's client from erroring at import.
ENV DATABASE_URL="postgresql://build:build@127.0.0.1:5432/build?schema=public"
ENV AUTH_SECRET="build-time-placeholder-value-not-used-at-runtime"

RUN npm run build

# ---------------------------------------------------------------------------
# Runtime
# ---------------------------------------------------------------------------
FROM node:22-alpine AS runner
# postgresql16-client supplies pg_dump and pg_restore for the backup system.
# The major version must match the server: pg_dump refuses to read a database
# newer than itself. Falls back to the unversioned package if the pinned one is
# not in this Alpine release.
RUN apk add --no-cache libc6-compat openssl curl \
 && (apk add --no-cache postgresql16-client || apk add --no-cache postgresql-client)
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs

# The standalone bundle carries only the modules the server actually needs.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public

# Prisma CLI, schema and migrations, so the entrypoint can run `migrate deploy`.
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/.bin ./node_modules/.bin

COPY --chown=nextjs:nodejs docker/entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

# Locally-stored uploads live here; mount a volume so they survive a redeploy.
RUN mkdir -p /app/public/uploads && chown -R nextjs:nodejs /app/public/uploads

# Backup archives. The container filesystem is replaced on every deploy, so
# this MUST be a persistent volume in production or the backups are lost with
# the container that made them. Off-site copies belong in S3/R2.
RUN mkdir -p /app/backups && chown -R nextjs:nodejs /app/backups

VOLUME ["/app/public/uploads", "/app/backups"]

USER nextjs
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD curl -fsS http://127.0.0.1:3000/api/health || exit 1

ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["node", "server.js"]
