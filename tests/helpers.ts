import { vi } from 'vitest';
import type { SessionUser } from '@/lib/auth/guards';
import { ALL_PERMISSIONS } from '@/lib/auth/permissions';

export const TEST_ACTOR: SessionUser = {
  id: 'test-actor',
  name: 'Test Admin',
  email: 'test-admin@example.test',
  role: 'super-admin',
  permissions: [...ALL_PERMISSIONS],
  sessionId: 'test-session',
};

/**
 * Replaces the auth guards with a fixed actor.
 *
 * The module is mocked wholesale rather than spread over the real one: the real
 * module pulls in next-auth, which cannot load outside the Next.js runtime.
 */
export function mockAuth(permissions: string[] = [...ALL_PERMISSIONS], role = 'super-admin') {
  const user: SessionUser = { ...TEST_ACTOR, role, permissions };

  vi.doMock('@/lib/auth/guards', () => {
    class AuthorizationError extends Error {
      constructor(permission: string) {
        super(`Missing permission: ${permission}`);
        this.name = 'AuthorizationError';
      }
    }

    const can = (candidate: SessionUser | null, permission: string) =>
      candidate?.role === 'super-admin' || Boolean(candidate?.permissions.includes(permission));

    return {
      AuthorizationError,
      getCurrentUser: async () => user,
      requireUser: async () => user,
      requirePermission: async () => user,
      userCan: can,
      userCanAny: (candidate: SessionUser | null, keys: string[]) =>
        keys.some((key) => can(candidate, key)),
      authorize: async (permission: string) => {
        if (!can(user, permission)) throw new AuthorizationError(permission);
        return user;
      },
      authorizeAny: async (permissions: string[]) => {
        if (!permissions.some((permission) => can(user, permission))) {
          throw new AuthorizationError(permissions.join(' | '));
        }
        return user;
      },
      requireAnyPermission: async () => user,
      authorizeSelf: async () => user,
      authorizePartial: async () => ({ user, status: 'authenticated' as const }),
      requirePartialUser: async () => ({ user, status: 'authenticated' as const }),
      getAuthState: async () => ({ status: 'authenticated' as const, user }),
    };
  });

  return user;
}

/**
 * Builds a FormData the way the admin forms do: arrays and objects are sent as
 * JSON strings, everything else as plain text.
 */
export function formData(values: Record<string, unknown>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) {
    if (value === null || value === undefined) data.set(key, '');
    else if (typeof value === 'object') data.set(key, JSON.stringify(value));
    else data.set(key, String(value));
  }
  return data;
}

export function uniqueSuffix(): string {
  return Math.random().toString(36).slice(2, 9);
}

/**
 * The market every test writes into.
 *
 * Tests exercise real Server Actions against a real database, and content is
 * now market-scoped, so each suite needs a market to work in. This creates the
 * default one on demand and is idempotent, so suites can call it freely.
 */
export async function ensureTestCountry(): Promise<string> {
  const { prisma } = await import('@/lib/db/prisma');
  const country = await prisma.country.upsert({
    where: { code: 'IN' },
    update: {},
    create: {
      id: 'country_in',
      name: 'India',
      code: 'IN',
      slug: '',
      locale: 'en-IN',
      currency: 'INR',
      currencySymbol: '₹',
      phoneCode: '+91',
      timezone: 'Asia/Kolkata',
      isDefault: true,
      isActive: true,
      sortOrder: 0,
    },
  });
  return country.id;
}

/** A second market, for the tests that assert markets stay isolated. */
export async function ensureSecondCountry(): Promise<string> {
  const { prisma } = await import('@/lib/db/prisma');
  const country = await prisma.country.upsert({
    where: { code: 'AE' },
    update: {},
    create: {
      id: 'country_ae',
      name: 'United Arab Emirates',
      code: 'AE',
      slug: 'ae',
      locale: 'en-AE',
      currency: 'AED',
      currencySymbol: 'AED',
      phoneCode: '+971',
      timezone: 'Asia/Dubai',
      isDefault: false,
      isActive: true,
      sortOrder: 1,
    },
  });
  return country.id;
}

/**
 * The market context tests hand to rendering helpers and services.
 *
 * A plain object, exactly as the registry would build it — tests never need a
 * database round trip just to describe "the root market".
 */
export function testCountryContext(overrides: Record<string, unknown> = {}) {
  return {
    id: 'country_in',
    name: 'India',
    code: 'IN',
    slug: '',
    locale: 'en-IN',
    currency: 'INR',
    currencySymbol: '₹',
    phoneCode: '+91',
    timezone: 'Asia/Kolkata',
    isDefault: true,
    isActive: true,
    sortOrder: 0,
    prefixes: ['ae'] as readonly string[],
    ...overrides,
  };
}
