import type { NextAuthConfig } from 'next-auth';

/**
 * Edge-safe slice of the Auth.js configuration.
 * Contains no Prisma/bcrypt imports so it can run inside middleware.
 */
export const authConfig = {
  trustHost: true,
  session: { strategy: 'jwt', maxAge: 60 * 60 * 8 },
  pages: { signIn: '/login', error: '/login' },
  cookies: {
    sessionToken: {
      name:
        process.env.NODE_ENV === 'production'
          ? '__Secure-authjs.session-token'
          : 'authjs.session-token',
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production',
      },
    },
  },
  providers: [],
  callbacks: {
    authorized({ auth }) {
      return !!auth?.user;
    },
    async jwt({ token, user, trigger, session }) {
      if (user) {
        token.uid = user.id;
        token.role = (user as { role?: string }).role ?? null;
        token.permissions = (user as { permissions?: string[] }).permissions ?? [];
        token.name = user.name;
        token.email = user.email;
      }
      // Allow a session refresh to pull updated role/permissions.
      if (trigger === 'update' && session && typeof session === 'object') {
        const s = session as { permissions?: string[]; role?: string; name?: string };
        if (s.permissions) token.permissions = s.permissions;
        if (s.role) token.role = s.role;
        if (s.name) token.name = s.name;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = (token.uid as string) ?? token.sub ?? '';
        session.user.role = (token.role as string | null) ?? null;
        session.user.permissions = (token.permissions as string[]) ?? [];
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
