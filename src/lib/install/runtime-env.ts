import 'server-only';
import { readConfig, CONFIG_KEYS, type ConfigKey } from './config-store';

/**
 * Makes the stored configuration look like environment variables.
 *
 * Every existing reader — `src/lib/env.ts`, the Prisma client, Auth.js — asks
 * `process.env` for what it needs. Rather than teach each of them about a second
 * source, the stored file is folded into `process.env` once, before any of them
 * look. Nothing downstream changes, and an installation configured entirely
 * through the platform behaves exactly as it did.
 *
 * ## A real variable always wins
 *
 * A key already present in the environment is left alone. This is the rule that
 * makes the file safe to introduce: Azure Container Apps secrets, a Compose
 * `environment:` block and a developer's `.env` all continue to be the authority
 * wherever they are used, and the file only answers for what nobody set.
 *
 * It also gives an operator a way out. If the stored `DATABASE_URL` is wrong and
 * the wizard is locked, setting the variable on the platform overrides it
 * without anyone having to edit a file inside a container.
 *
 * ## Once per process
 *
 * Guarded on `globalThis` rather than module scope, because route handlers,
 * Server Actions and instrumentation are traced into separate bundles and the
 * same module can be instantiated more than once in one process.
 */

const globalForConfig = globalThis as unknown as { appConfigLoaded?: ConfigKey[] };

/**
 * Hydrates `process.env` from the stored configuration and reports which keys
 * it supplied — **names only**, so the result can be logged.
 */
export function loadStoredConfig(): ConfigKey[] {
  if (globalForConfig.appConfigLoaded) return globalForConfig.appConfigLoaded;

  const stored = readConfig();
  const applied: ConfigKey[] = [];

  for (const key of CONFIG_KEYS) {
    const value = stored[key]?.trim();
    if (!value) continue;
    if (process.env[key]?.trim()) continue; // the platform set it; leave it alone
    process.env[key] = value;
    applied.push(key);
  }

  globalForConfig.appConfigLoaded = applied;
  return applied;
}

/**
 * Forgets that the configuration was loaded.
 *
 * Only for the installer, which writes the file and then needs the very next
 * read to see it, and for tests. It does not remove anything already applied to
 * `process.env` — a live Prisma client is already holding that value, and
 * pulling it out from under the running process would be worse than stale.
 */
export function resetStoredConfigCache(): void {
  delete globalForConfig.appConfigLoaded;
}
