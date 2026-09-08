'use client';

import * as React from 'react';
import { SessionProvider } from 'next-auth/react';
import { AdminSidebar } from './sidebar';
import { AdminTopbar } from './topbar';

export function AdminShell({
  user,
  branding,
  children,
}: {
  user: { name: string; email: string; roleName: string; permissions: string[]; isSuperAdmin: boolean };
  branding: { siteName: string; logoUrl: string | null };
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = React.useState(false);

  return (
    <SessionProvider>
      <div className="min-h-screen bg-muted/[0.03]">
        <AdminSidebar
          permissions={user.permissions}
          isSuperAdmin={user.isSuperAdmin}
          siteName={branding.siteName}
          logoUrl={branding.logoUrl}
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />
        <div className="lg:pl-64">
          <AdminTopbar
            user={{ name: user.name, email: user.email, roleName: user.roleName }}
            onOpenSidebar={() => setSidebarOpen(true)}
            canSearch
          />
          <main id="admin-main" className="px-4 py-6 sm:px-6 sm:py-8">
            {children}
          </main>
        </div>
      </div>
    </SessionProvider>
  );
}
