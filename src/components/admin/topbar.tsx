'use client';

import * as React from 'react';
import Link from 'next/link';
import { signOut } from 'next-auth/react';
import { PanelLeft, LogOut, ChevronDown, Plus, ExternalLink, User } from 'lucide-react';
import { initials } from '@/lib/utils/format';
import type { PermissionKey } from '@/lib/auth/permissions';
import { cn } from '@/lib/utils/cn';
import { AdminSearch } from './admin-search';
import { AdminBreadcrumbs } from './breadcrumbs';
import { Menu, MenuItem, MenuSeparator } from '@/components/ui/menu';

/** Create shortcuts, each gated by the permission its destination requires. */
const QUICK_CREATE: Array<{
  label: string;
  href: string;
  permission: PermissionKey;
}> = [
  { label: 'New page', href: '/admin/pages/new', permission: 'pages.create' },
  {
    label: 'New product',
    href: '/admin/products/new',
    permission: 'products.create',
  },
  { label: 'New form', href: '/admin/forms/new', permission: 'forms.create' },
  { label: 'New lead', href: '/admin/leads/new', permission: 'leads.create' },
  {
    label: 'New blog post',
    href: '/admin/blog/new',
    permission: 'blog.create',
  },
  { label: 'Upload media', href: '/admin/media', permission: 'media.upload' },
];

export function AdminTopbar({
  user,
  permissions,
  isSuperAdmin,
  onOpenSidebar,
}: {
  user: { name: string; email: string; roleName: string };
  permissions: string[];
  isSuperAdmin: boolean;
  onOpenSidebar: () => void;
}) {
  const can = (permission: PermissionKey) => isSuperAdmin || permissions.includes(permission);
  const createOptions = QUICK_CREATE.filter((option) => can(option.permission));

  return (
    <header className="sticky top-0 z-30 border-b border-hairline bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/80">
      <div className="flex h-16 items-center gap-2 px-4 sm:gap-3 sm:px-6">
        <button
          type="button"
          onClick={onOpenSidebar}
          aria-label="Open navigation"
          aria-controls="admin-sidebar"
          className="-ml-1 rounded-lg p-2 text-muted transition-colors hover:bg-muted/10 hover:text-content lg:hidden"
        >
          <PanelLeft className="h-5 w-5" />
        </button>

        {/* Breadcrumbs take the space on desktop; search owns it on mobile. */}
        <div className="hidden min-w-0 flex-1 lg:block">
          <AdminBreadcrumbs />
        </div>

        <div className="min-w-0 flex-1 lg:max-w-xs lg:flex-none">
          <AdminSearch permissions={permissions} isSuperAdmin={isSuperAdmin} />
        </div>

        {createOptions.length > 0 ? (
          <Menu
            align="right"
            trigger={
              <span
                className={cn(
                  'inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand px-3 text-sm font-medium text-white',
                  'shadow-sm transition-colors hover:bg-brand/90',
                )}
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                <span className="hidden sm:inline">Create</span>
                <ChevronDown
                  className="hidden h-3.5 w-3.5 opacity-80 sm:block"
                  aria-hidden="true"
                />
              </span>
            }
            label="Create new"
          >
            {createOptions.map((option) => (
              <MenuItem key={option.href} href={option.href}>
                {option.label}
              </MenuItem>
            ))}
          </Menu>
        ) : null}

        <Menu
          align="right"
          label="Account menu"
          trigger={
            <span className="flex items-center gap-2 rounded-lg px-1.5 py-1.5 transition-colors hover:bg-muted/10">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand/10 text-xs font-semibold text-brand">
                {initials(user.name)}
              </span>
              <span className="hidden text-left xl:block">
                <span className="block max-w-[9rem] truncate text-sm font-medium leading-tight text-content">
                  {user.name}
                </span>
                <span className="block text-xs leading-tight text-muted">{user.roleName}</span>
              </span>
              <ChevronDown className="hidden h-4 w-4 text-muted xl:block" aria-hidden="true" />
            </span>
          }
        >
          <div className="border-b border-hairline px-3 py-2.5">
            <p className="truncate text-sm font-medium text-content">{user.name}</p>
            <p className="truncate text-xs text-muted">{user.email}</p>
            <p className="mt-1 text-xs text-muted">{user.roleName}</p>
          </div>
          <MenuItem href="/" external icon={<ExternalLink className="h-4 w-4" />}>
            View website
          </MenuItem>
          {isSuperAdmin || permissions.includes('staff.manage') ? (
            <MenuItem href="/admin/staff" icon={<User className="h-4 w-4" />}>
              Staff & roles
            </MenuItem>
          ) : null}
          <MenuSeparator />
          <MenuItem
            tone="danger"
            icon={<LogOut className="h-4 w-4" />}
            onClick={() => signOut({ callbackUrl: '/login' })}
          >
            Sign out
          </MenuItem>
        </Menu>
      </div>

      {/* Breadcrumbs move below the bar on small screens so they stay readable. */}
      <div className="border-t border-hairline px-4 py-2 lg:hidden">
        <AdminBreadcrumbs />
      </div>
    </header>
  );
}
