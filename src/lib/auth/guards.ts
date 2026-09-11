import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db/prisma';
import { loadSession, touchSession } from '@/lib/auth/session.service';
import type { PermissionKey } from '@/lib/auth/permissions';

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: string | null;
  permissions: string[];
  /** The AuthSession row backing this request. */
  sessionId: string;
};

/**
 * Where a request stands.
 *
 * Two-factor authentication is mandatory for every role, so "signed in" is not
 * a binary. A correct password produces `mfa-setup` or `mfa-pending`, and only
 * a verified second factor produces `authenticated`. Every guard below is
 * built on this one function, which means a route cannot accidentally accept a
 * half-authenticated session by forgetting to check.
 */
export type AuthState =
  | { status: 'anonymous' }
  | { status: 'mfa-setup'; user: SessionUser }
  | { status: 'mfa-pending'; user: SessionUser }
  | { status: 'authenticated'; user: SessionUser };

/**
 * Resolved once per request.
 *
 * The database read is not optional: the token cannot be trusted for role,
 * permissions or MFA state, because it is minted at sign-in and would keep
 * working after a role change, a password change or an administrator revoking
 * the session. React's `cache` keeps it to a single query per request.
 */
export const getAuthState = cache(async (): Promise<AuthState> => {
  const token = await auth();
  const userId = token?.user?.id;
  const sessionId = token?.user?.sessionId;

  // A token minted before server-side sessions existed has no `sid`. Treating
  // it as anonymous signs those users out once, rather than granting access
  // that cannot be revoked.
  if (!userId || !sessionId) return { status: 'anonymous' };

  const session = await loadSession(sessionId);
  if (!session || session.userId !== userId) return { status: 'anonymous' };

  const account = await prisma.user.findFirst({
    where: { id: userId, deletedAt: null },
    select: {
      id: true,
      name: true,
      email: true,
      status: true,
      twoFactorRequired: true,
      twoFactorEnabled: true,
      roles: {
        select: { slug: true, permissions: { select: { permission: { select: { key: true } } } } },
      },
    },
  });

  if (!account || account.status !== 'ACTIVE') return { status: 'anonymous' };

  const user: SessionUser = {
    id: account.id,
    name: account.name,
    email: account.email,
    role: account.roles.slug,
    permissions: account.roles.permissions.map((rp) => rp.permission.key),
    sessionId: session.id,
  };

  // Enrolment comes before verification: someone who has never set up an
  // authenticator has nothing to verify against.
  const mfaRequired = account.twoFactorRequired;
  if (mfaRequired && !account.twoFactorEnabled) return { status: 'mfa-setup', user };
  if (mfaRequired && !session.mfaVerifiedAt) return { status: 'mfa-pending', user };

  void touchSession(session.id);
  return { status: 'authenticated', user };
});

/** Where a half-authenticated request should be sent. */
export function authRedirectPath(state: AuthState): string | null {
  if (state.status === 'anonymous') return '/login';
  if (state.status === 'mfa-setup') return '/auth/setup-2fa';
  if (state.status === 'mfa-pending') return '/auth/verify-2fa';
  return null;
}

/**
 * The signed-in user, or null.
 *
 * Returns null for a session that has not cleared MFA, so every existing
 * caller became MFA-enforcing the moment this landed — there is no opt-in to
 * forget.
 */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const state = await getAuthState();
  return state.status === 'authenticated' ? state.user : null;
}

/**
 * Page-level guard. Sends an unauthenticated visitor to the login screen and a
 * half-authenticated one to the step it still owes.
 */
export async function requireUser(): Promise<SessionUser> {
  const state = await getAuthState();
  if (state.status === 'authenticated') return state.user;
  redirect(authRedirectPath(state) ?? '/login');
}

/**
 * For the MFA screens themselves: they need the identity behind a pending
 * session, which `requireUser` would bounce.
 */
export async function requirePartialUser(): Promise<{
  user: SessionUser;
  status: AuthState['status'];
}> {
  const state = await getAuthState();
  if (state.status === 'anonymous') redirect('/login');
  return { user: state.user, status: state.status };
}

export function userCan(user: SessionUser | null, permission: PermissionKey): boolean {
  if (!user) return false;
  if (user.role === 'super-admin') return true;
  return user.permissions.includes(permission);
}

export function userCanAny(user: SessionUser | null, permissions: PermissionKey[]): boolean {
  return permissions.some((p) => userCan(user, p));
}

/** Page-level guard: redirects unauthorised users to the admin dashboard. */
export async function requirePermission(permission: PermissionKey): Promise<SessionUser> {
  const user = await requireUser();
  if (!userCan(user, permission)) redirect('/admin?denied=' + encodeURIComponent(permission));
  return user;
}

export class AuthorizationError extends Error {
  constructor(permission: string) {
    super(`Missing permission: ${permission}`);
    this.name = 'AuthorizationError';
  }
}

/**
 * Action-level guard. Throws instead of redirecting so Server Actions can
 * surface a clean error to the caller.
 */
export async function authorize(permission: PermissionKey): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new AuthorizationError('authentication');
  if (!userCan(user, permission)) throw new AuthorizationError(permission);
  return user;
}

/**
 * Guard for actions on one's own account — profile edits, password changes,
 * authenticator management.
 *
 * No permission is involved: every user owns their own account. The identity
 * comes from the session and nowhere else, so a user id in a form body can
 * never redirect one of these actions at somebody else's record.
 */
export async function authorizeSelf(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new AuthorizationError('authentication');
  return user;
}

/**
 * Guard for the enrolment and verification actions.
 *
 * These are the only actions a pending session may call, and each one checks
 * for itself which of the two states it will accept.
 */
export async function authorizePartial(): Promise<{
  user: SessionUser;
  status: AuthState['status'];
}> {
  const state = await getAuthState();
  if (state.status === 'anonymous') throw new AuthorizationError('authentication');
  return { user: state.user, status: state.status };
}
