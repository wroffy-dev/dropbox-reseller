import 'server-only';
import { redirect } from 'next/navigation';
import { auth } from '@/lib/auth';
import type { PermissionKey } from '@/lib/auth/permissions';

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: string | null;
  permissions: string[];
};

export async function getCurrentUser(): Promise<SessionUser | null> {
  const session = await auth();
  if (!session?.user?.id) return null;
  return {
    id: session.user.id,
    name: session.user.name ?? '',
    email: session.user.email ?? '',
    role: session.user.role ?? null,
    permissions: session.user.permissions ?? [],
  };
}

/** Redirects to /login when unauthenticated. Use in admin layouts/pages. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  return user;
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
