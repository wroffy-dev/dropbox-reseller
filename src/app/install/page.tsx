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
   *
   * Two things this must not get wrong, because whatever it suggests is what an
   * administrator will accept, and the value ends up in `NEXTAUTH_URL` — which
   * is where every sign-in redirect is sent.
   *
   * The scheme is only assumed to be https behind a proxy that says so.
   * Defaulting to https meant a plain-http deployment was handed an https
   * address it does not serve, and the first sign-in redirected somewhere the
   * browser could not reach.
   *
   * And a bind address is never offered. A container reached on `0.0.0.0:3000`
   * reports that as its Host, and `https://0.0.0.0:3000` is not an address a
   * browser can open — `ERR_ADDRESS_INVALID`. Suggesting nothing is better than
   * suggesting that.
   */
  const headerList = await headers();
  const host = (headerList.get('x-forwarded-host') ?? headerList.get('host') ?? '').trim();
  const forwardedProto = headerList.get('x-forwarded-proto')?.split(',')[0]?.trim();
  const protocol = forwardedProto || 'http';

  const hostname = host.replace(/:\d+$/, '').replace(/^\[|\]$/g, '');
  const unroutable = ['0.0.0.0', '::', '0:0:0:0:0:0:0:0', ''];
  const origin = unroutable.includes(hostname) ? '' : `${protocol}://${host}`;

  return (
    <main className="min-h-screen bg-muted/[0.04]">
      <SetupWizard siteOrigin={origin} />
    </main>
  );
}
