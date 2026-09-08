import 'server-only';
import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import { verifyPassword } from '@/lib/auth/password';
import { authConfig } from '@/lib/auth/config';

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      name: 'Credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;

        const email = parsed.data.email.toLowerCase().trim();
        const user = await prisma.user.findFirst({
          where: { email, deletedAt: null },
          include: {
            roles: { include: { permissions: { include: { permission: true } } } },
          },
        });

        // Constant-ish work regardless of user existence to blunt user enumeration.
        if (!user || !user.passwordHash) {
          await verifyPassword(parsed.data.password, '$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidin');
          return null;
        }
        if (user.status !== 'ACTIVE') return null;

        const ok = await verifyPassword(parsed.data.password, user.passwordHash);
        if (!ok) return null;

        await prisma.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
        });

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image ?? undefined,
          role: user.roles.slug,
          permissions: user.roles.permissions.map((rp) => rp.permission.key),
        };
      },
    }),
  ],
});
