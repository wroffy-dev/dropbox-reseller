'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { X } from 'lucide-react';
import { ADMIN_NAV } from '@/lib/admin/nav';
import { NavIcon } from './nav-icon';
import { cn } from '@/lib/utils/cn';

export type SidebarProps = {
  permissions: string[];
  isSuperAdmin: boolean;
  siteName: string;
  logoUrl: string | null;
  open: boolean;
  onClose: () => void;
};

export function AdminSidebar({
  permissions,
  isSuperAdmin,
  siteName,
  logoUrl,
  open,
  onClose,
}: SidebarProps) {
  const pathname = usePathname();

  const can = React.useCallback(
    (permission: string) => isSuperAdmin || permissions.includes(permission),
    [isSuperAdmin, permissions],
  );

  const groups = React.useMemo(
    () =>
      ADMIN_NAV.map((group) => ({ ...group, items: group.items.filter((i) => can(i.permission)) })).filter(
        (group) => group.items.length > 0,
      ),
    [can],
  );

  const isActive = (href: string) =>
    href === '/admin' ? pathname === '/admin' : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <>
      {open ? (
        <div
          className="fixed inset-0 z-40 bg-[rgb(var(--brand-secondary))]/50 lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      ) : null}

      <aside
        id="admin-sidebar"
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-hairline bg-surface transition-transform lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
        aria-label="Admin navigation"
      >
        <div className="flex h-16 shrink-0 items-center gap-2 border-b border-hairline px-4">
          <Link href="/admin" className="flex min-w-0 items-center gap-2">
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoUrl} alt={siteName} className="h-7 w-auto max-w-[9rem] object-contain" />
            ) : (
              <>
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand text-sm font-bold text-white">
                  {siteName.charAt(0).toUpperCase()}
                </span>
                <span className="truncate font-heading text-sm font-bold text-content">{siteName}</span>
              </>
            )}
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto rounded-lg p-1.5 text-muted hover:bg-muted/10 lg:hidden"
            aria-label="Close navigation"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {groups.map((group) => (
            <div key={group.label} className="mb-5">
              <h2 className="px-3 pb-2 text-[0.6875rem] font-semibold uppercase tracking-wider text-muted/70">
                {group.label}
              </h2>
              <ul className="space-y-0.5">
                {group.items.map((item) => {
                  const active = isActive(item.href);
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={onClose}
                        aria-current={active ? 'page' : undefined}
                        className={cn(
                          'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors',
                          active
                            ? 'bg-brand/10 font-medium text-brand'
                            : 'text-content hover:bg-muted/[0.07]',
                        )}
                      >
                        <NavIcon name={item.icon} className="h-4 w-4 shrink-0" />
                        <span className="truncate">{item.label}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="border-t border-hairline p-3">
          <Link
            href="/"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-muted transition-colors hover:bg-muted/[0.07] hover:text-content"
          >
            <NavIcon name="activity" className="h-4 w-4" />
            View website
          </Link>
        </div>
      </aside>
    </>
  );
}
