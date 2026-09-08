'use client';

import * as React from 'react';
import Link from 'next/link';
import { signOut } from 'next-auth/react';
import { PanelLeft, LogOut, ChevronDown } from 'lucide-react';
import { initials } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';
import { AdminSearch } from './admin-search';

export function AdminTopbar({
  user,
  onOpenSidebar,
  canSearch,
}: {
  user: { name: string; email: string; roleName: string };
  onOpenSidebar: () => void;
  canSearch: boolean;
}) {
  const [menuOpen, setMenuOpen] = React.useState(false);
  const menuRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!menuOpen) return;
    const onClick = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-hairline bg-surface/90 px-4 backdrop-blur sm:px-6">
      <button
        type="button"
        onClick={onOpenSidebar}
        aria-label="Open navigation"
        aria-controls="admin-sidebar"
        className="rounded-lg p-2 text-muted transition-colors hover:bg-muted/10 lg:hidden"
      >
        <PanelLeft className="h-5 w-5" />
      </button>

      {canSearch ? <AdminSearch /> : <div className="flex-1" />}

      <div className="relative ml-auto" ref={menuRef}>
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          className="flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-muted/10"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand/10 text-xs font-semibold text-brand">
            {initials(user.name)}
          </span>
          <span className="hidden text-left sm:block">
            <span className="block text-sm font-medium leading-tight text-content">{user.name}</span>
            <span className="block text-xs leading-tight text-muted">{user.roleName}</span>
          </span>
          <ChevronDown className={cn('h-4 w-4 text-muted transition-transform', menuOpen && 'rotate-180')} />
        </button>

        {menuOpen ? (
          <div
            role="menu"
            className="absolute right-0 top-full mt-1.5 w-56 animate-slide-up rounded-xl border border-hairline bg-surface p-1.5 shadow-xl"
          >
            <div className="border-b border-hairline px-3 py-2.5">
              <p className="truncate text-sm font-medium text-content">{user.name}</p>
              <p className="truncate text-xs text-muted">{user.email}</p>
            </div>
            <Link
              href="/"
              target="_blank"
              rel="noopener noreferrer"
              role="menuitem"
              className="mt-1 block rounded-lg px-3 py-2 text-sm text-content transition-colors hover:bg-muted/10"
            >
              View website
            </Link>
            <button
              type="button"
              role="menuitem"
              onClick={() => signOut({ callbackUrl: '/login' })}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-red-600 transition-colors hover:bg-red-50"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          </div>
        ) : null}
      </div>
    </header>
  );
}
