import type { Metadata } from 'next';
import { prisma } from '@/lib/db/prisma';
import { requireUser } from '@/lib/auth/guards';
import { getWebsiteSettings } from '@/lib/services/settings';
import { getAdminCountryScope } from '@/lib/country/admin';
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
  const [site, role, account, scope] = await Promise.all([
    getWebsiteSettings(),
    user.role ? prisma.userRole.findUnique({ where: { slug: user.role }, select: { name: true } }) : null,
    prisma.user.findUnique({ where: { id: user.id }, select: { image: true } }),
    // Resolved here so the selector renders from a server value and there is
    // nothing for hydration to correct.
    getAdminCountryScope(),
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
      branding={{
        siteName: site.siteName,
        logoUrl: site.logoUrl,
        // The admin rail is dark, so it prefers the dark-surface logo when one
        // has been uploaded — the same choice the public footer makes.
        logoDarkUrl: site.logoDarkUrl,
      }}
      country={{ id: scope.country.id, code: scope.country.code, name: scope.country.name }}
      countries={scope.countries.map((country) => ({
        id: country.id,
        code: country.code,
        name: country.name,
        isDefault: country.isDefault,
      }))}
    >
      {children}
    </AdminShell>
  );
}
