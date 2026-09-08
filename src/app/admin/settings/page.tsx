import type { Metadata } from 'next';
import Link from 'next/link';
import { Mail } from 'lucide-react';
import { requirePermission, userCan } from '@/lib/auth/guards';
import { getWebsiteSettings } from '@/lib/services/settings';
import { AdminPageHeader } from '@/components/admin/page-header';
import { WebsiteSettingsForm } from '@/components/admin/settings/settings-form';
import { buttonClasses } from '@/components/ui/button';

export const metadata: Metadata = { title: 'Website settings' };
export const dynamic = 'force-dynamic';

export default async function SettingsAdmin() {
  const user = await requirePermission('settings.manage');
  const settings = await getWebsiteSettings();

  // Send everything except the timestamps; the form owns the whole record.
  const { id, updatedAt, footerNewsletterEnabled, footerNewsletterFormId, ...rest } = settings;
  void id;
  void updatedAt;
  void footerNewsletterEnabled;
  void footerNewsletterFormId;

  const initial = Object.fromEntries(
    Object.entries(rest).map(([key, value]) => [key, value === null ? '' : value]),
  ) as Record<string, string | boolean>;

  return (
    <div className="mx-auto max-w-3xl">
      <AdminPageHeader
        title="Website settings"
        description="Name, contact details, logos, colours and typography. Changes apply site-wide immediately."
        crumbs={[{ label: 'Settings' }]}
        actions={
          <Link href="/admin/settings/email" className={buttonClasses('outline', 'sm')}>
            <Mail className="h-4 w-4" aria-hidden="true" />
            Email settings
          </Link>
        }
      />
      <WebsiteSettingsForm initial={initial} canEdit={userCan(user, 'settings.manage')} />
    </div>
  );
}
