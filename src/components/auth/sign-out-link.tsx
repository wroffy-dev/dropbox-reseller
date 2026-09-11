'use client';

import { signOut } from 'next-auth/react';

/** Escape hatch on the pre-session screens, where there is no account menu. */
export function SignOutLink({ children }: { children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={() => signOut({ callbackUrl: '/login' })}
      className="font-medium text-brand underline-offset-2 hover:underline"
    >
      {children}
    </button>
  );
}
