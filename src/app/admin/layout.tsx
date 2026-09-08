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
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const [site, role] = await Promise.all([
    getWebsiteSettings(),
    user.role ? prisma.userRole.findUnique({ where: { slug: user.role }, select: { name: true } }) : null,
  ]);

  return (
    <AdminShell
      user={{
        name: user.name,
        email: user.email,
        roleName: role?.name ?? 'Staff',
        permissions: user.permissions,
        isSuperAdmin: user.role === 'super-admin',
      }}
      branding={{ siteName: site.siteName, logoUrl: site.logoUrl }}
    >
      {children}
    </AdminShell>
  );
}
