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
