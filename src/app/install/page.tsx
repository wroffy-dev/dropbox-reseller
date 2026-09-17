import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { requireInstallerOpen } from '@/lib/install/guards';
import { SetupWizard } from '@/components/install/setup-wizard';

/**
 * The setup wizard.
 *
 * Deliberately outside the `(public)` group: that layout reads settings,
 * navigation and the page itself out of a database, and the entire purpose of
 * this route is to be reachable when there is no database to read.
 *
 * `requireInstallerOpen()` answers with the site's own 404 once setup has
 * finished — not a redirect and not a 403, either of which would confirm to
 * somebody probing a live site that this path means something.
 */
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Set up',
  robots: { index: false, follow: false },
};

export default async function InstallPage() {
  await requireInstallerOpen();

  /*
   * The address the visitor actually used, offered as the default site URL.
   * Taken from the request rather than from configuration, because
   * configuration is what this page exists to create.
   */
  const headerList = await headers();
  const host = headerList.get('x-forwarded-host') ?? headerList.get('host') ?? '';
  const protocol = headerList.get('x-forwarded-proto') ?? 'https';
  const origin = host ? `${protocol}://${host}` : '';

  return (
    <main className="min-h-screen bg-muted/[0.04]">
      <SetupWizard siteOrigin={origin} />
    </main>
  );
}
