import type { Metadata } from 'next';
import { prisma } from '@/lib/db/prisma';
import { requireUser } from '@/lib/auth/guards';
import { getWebsiteSettings } from '@/lib/services/settings';
import { AdminShell } from '@/components/admin/admin-shell';

export const metadata: Metadata = {
  title: { default: 'Admin', template: '%s · Admin' },
  robots: { index: false, follow: false },
};

/**
 * Every /admin route is authenticated here as well as in middleware.
 * Middleware alone is not an authorisation boundary — each page and Server
 * Action re-checks the specific permission it needs.
 *
 * `requireUser()` also enforces two-factor authentication: a session that has
 * passed the password check but not the second factor is redirected to
 * enrolment or verification and never renders this layout at all.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const [site, role, account] = await Promise.all([
    getWebsiteSettings(),
    user.role ? prisma.userRole.findUnique({ where: { slug: user.role }, select: { name: true } }) : null,
    prisma.user.findUnique({ where: { id: user.id }, select: { image: true } }),
  ]);

  return (
    <AdminShell
      user={{
        name: user.name,
        email: user.email,
        roleName: role?.name ?? 'Staff',
        permissions: user.permissions,
        isSuperAdmin: user.role === 'super-admin',
        image: account?.image ?? null,
      }}
      branding={{ siteName: site.siteName, logoUrl: site.logoUrl }}
    >
      {children}
    </AdminShell>
  );
}
