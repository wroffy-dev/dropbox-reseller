import type { Metadata } from 'next';
import Link from 'next/link';
import { DatabaseBackup, Mail, Palette } from 'lucide-react';
import { requirePermission, userCan } from '@/lib/auth/guards';
import { prisma } from '@/lib/db/prisma';
import { getAllSocialLinks, getWebsiteSettings } from '@/lib/services/settings';
import { AdminPageHeader } from '@/components/admin/page-header';
import { WebsiteSettingsForm } from '@/components/admin/settings/settings-form';
import { SocialLinksForm } from '@/components/admin/settings/social-links-form';
import { buttonClasses } from '@/components/ui/button';

export const metadata: Metadata = { title: 'Website settings' };
export const dynamic = 'force-dynamic';

export default async function SettingsAdmin() {
  const user = await requirePermission('settings.manage');
  const [settings, socials, forms] = await Promise.all([
    getWebsiteSettings(),
    getAllSocialLinks(),
    prisma.form.findMany({
      where: { isActive: true, deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
  ]);

  // Send everything except the timestamps; the form owns the whole record.
  const { id, updatedAt, ...rest } = settings;
  void id;
  void updatedAt;

  const initial = Object.fromEntries(
    Object.entries(rest).map(([key, value]) => [key, value === null ? '' : value]),
  ) as Record<string, string | boolean>;

  return (
    <div className="mx-auto max-w-3xl">
      <AdminPageHeader
        title="Website settings"
        description="Name, contact details, logos and the site header and footer."
        crumbs={[{ label: 'Settings' }]}
        actions={
          <>
            <Link href="/admin/settings/design" className={buttonClasses('outline', 'md')}>
              <Palette className="h-4 w-4" aria-hidden="true" />
              Website design
            </Link>
            <Link href="/admin/settings/email" className={buttonClasses('outline', 'md')}>
              <Mail className="h-4 w-4" aria-hidden="true" />
              Email settings
            </Link>
            {userCan(user, 'backup.view') ? (
              <Link href="/admin/settings/backups" className={buttonClasses('outline', 'md')}>
                <DatabaseBackup className="h-4 w-4" aria-hidden="true" />
                Backup &amp; restore
              </Link>
            ) : null}
          </>
        }
      />
      <WebsiteSettingsForm
        initial={initial}
        canEdit={userCan(user, 'settings.manage')}
        only={['general', 'branding', 'header', 'footer']}
        forms={forms}
      />
      <SocialLinksForm
        initial={socials.map((link) => ({
          id: link.id,
          network: link.network,
          label: link.label,
          url: link.url,
          isVisible: link.isVisible,
        }))}
        canEdit={userCan(user, 'settings.manage')}
      />
    </div>
  );
}
