/**
 * Hydrates `process.env` from the stored configuration, before Next.js boots.
 *
 * Preloaded by the container's command (`node -r ./load-config.cjs server.js`),
 * which is the only place this can run.
 *
 * Not from `instrumentation.ts`: that file is bundled for the Edge runtime
 * alongside middleware, so importing anything that touches `node:fs` from it —
 * even dynamically, even behind a runtime check — pulls `node:fs` into the Edge
 * bundle and fails the build. A preload happens before any of that exists.
 *
 * Plain CommonJS with no imports beyond Node's own, so nothing bundles it and
 * it cannot fail for a reason of its own.
 *
 * A variable already set on the platform always wins: this only supplies what
 * nobody else did, which is what lets an Azure Container Apps deployment that
 * configures everything through secrets behave exactly as it always has.
 *
 * Nothing here logs a value. The one line it prints names the keys it supplied.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const KEYS = [
  'DATABASE_URL',
  'AUTH_SECRET',
  'NEXTAUTH_URL',
  'NEXT_PUBLIC_SITE_URL',
  'ENCRYPTION_KEY',
  'MFA_ENCRYPTION_KEY',
];

const directory = (process.env.APP_CONFIG_DIR || '/data/config').trim();
const file = path.join(directory, 'app-config.json');

try {
  if (fs.existsSync(file)) {
    const stored = JSON.parse(fs.readFileSync(file, 'utf8'));
    const supplied = [];

    for (const key of KEYS) {
      const value = typeof stored[key] === 'string' ? stored[key].trim() : '';
      if (!value) continue;
      if ((process.env[key] || '').trim()) continue;
      process.env[key] = value;
      supplied.push(key);
    }

    if (supplied.length > 0) {
      process.stdout.write(
        `${JSON.stringify({
          level: 'info',
          event: 'startup.config_hydrated',
          message: 'configuration loaded from the stored file',
          keys: supplied,
          time: new Date().toISOString(),
        })}\n`,
      );
    }
  }
} catch {
  // A configuration that cannot be read is reported by the application, which
  // can render an explanation. Throwing here would stop the server booting far
  // enough to do that, and the setup wizard is the only thing able to repair it.
  process.stdout.write(
    `${JSON.stringify({
      level: 'error',
      event: 'startup.config_unreadable',
      message: 'the stored configuration could not be read — treating it as absent',
      time: new Date().toISOString(),
    })}\n`,
  );
}
