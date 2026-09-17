import 'server-only';
import { PrismaClient } from '@prisma/client';
import { loadStoredConfig } from '@/lib/install/runtime-env';

/**
 * The single Prisma client for the process.
 *
 * Cached on `globalThis` in every environment, not just development. In dev it
 * stops hot reload leaking a new pool on every edit; in production it protects
 * against the same module being instantiated twice through different bundles
 * (route handlers, server actions and instrumentation are separately traced),
 * which on a small Azure PostgreSQL tier is a real risk: a Basic B1ms server
 * allows ~35 connections in total, and Prisma's default pool is
 * `num_cpus * 2 + 1` *per client*. Three replicas each holding two pools would
 * exhaust the server on its own.
 *
 * The pool size itself is set through the connection string rather than in
 * code — `?connection_limit=5` — so it can be tuned per environment without a
 * rebuild. See docs/AZURE-DEPLOYMENT.md.
 */
const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  prismaShutdownBound?: boolean;
};

function createClient(): PrismaClient {
  // The stored configuration is folded into `process.env` first, so a copy
  // configured by the setup wizard rather than by the platform finds its
  // connection string here. A platform-set variable is left alone.
  loadStoredConfig();

  return new PrismaClient({
    // `error` only in production: Prisma's `query` and `info` channels echo
    // parameters, and `warn` includes the connection string on pool timeouts.
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });
}

/**
 * Built on first use, not on import.
 *
 * Before the wizard runs there is no database to connect to, and `new
 * PrismaClient()` throws without a `DATABASE_URL`. Constructing it at import
 * time therefore made *importing this module* fatal on a fresh copy — and since
 * nearly everything imports it, that meant the server could not boot far enough
 * to render the page that collects the connection string.
 *
 * The proxy keeps the client a plain `prisma.x.y()` value for every existing
 * caller while moving construction to the first property access, which happens
 * inside a request that has already decided a database should exist.
 */
function client(): PrismaClient {
  globalForPrisma.prisma ??= createClient();
  return globalForPrisma.prisma;
}

export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const real = client();
    const value = Reflect.get(real, property) as unknown;
    /*
     * Methods are bound to the real client rather than handed back loose.
     *
     * Without this their `this` would be the proxy, and Prisma's client holds
     * genuine `#private` fields — reading one through an object whose class did
     * not declare it is a TypeError, so `prisma.$transaction(...)` would throw
     * instead of running.
     */
    return typeof value === 'function' ? value.bind(real) : value;
  },
  set(_target, property, value) {
    return Reflect.set(client(), property, value);
  },
  has(_target, property) {
    return Reflect.has(client(), property);
  },
  getPrototypeOf() {
    return Reflect.getPrototypeOf(client());
  },
});

/**
 * Drops the cached client so the next use builds one against the configuration
 * as it now stands. The installer calls this the moment it has written a
 * verified connection string; nothing else should.
 */
export function resetPrismaClient(): void {
  const existing = globalForPrisma.prisma;
  globalForPrisma.prisma = undefined;
  // Not awaited: a caller mid-request keeps its own reference, and the pool is
  // closed by the kernel when the process exits in any case.
  void existing?.$disconnect().catch(() => {});
}

/**
 * Graceful shutdown — handled by Next.js, deliberately not re-implemented here.
 *
 * Azure Container Apps sends SIGTERM when it replaces a revision or scales in.
 * Next.js's standalone server already registers SIGTERM and SIGINT handlers that
 * stop accepting connections, wait for in-flight requests to finish, close the
 * HTTP server and then exit — which is the part that matters for a clean
 * rollover.
 *
 * An application-level handler was written here and removed after testing: it
 * never ran. Next registers its handler first and its cleanup calls
 * `process.exit(0)`, so a second handler added by a route module has no
 * observable effect. Making one work would mean setting `NEXT_MANUAL_SIG_HANDLE`
 * and taking over closing the HTTP server as well — a custom process manager,
 * for no real gain: Prisma's sockets are closed by the kernel when the process
 * exits and PostgreSQL reaps those backends immediately, so connections are not
 * leaked either way.
 *
 * What genuinely protects the database through a rollover is bounding the pool,
 * via `connection_limit` in DATABASE_URL as described above.
 */
