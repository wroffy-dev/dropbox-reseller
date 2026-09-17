import type { Metadata } from 'next';

/**
 * A layout of its own, holding nothing.
 *
 * The site's public layout renders a header, a footer, navigation and popups,
 * all of which are database rows — so inheriting it would make the one page
 * that works without a database depend on one. This exists to stop that
 * inheritance, and does nothing else.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default function InstallLayout({ children }: { children: React.ReactNode }) {
  return children;
}
