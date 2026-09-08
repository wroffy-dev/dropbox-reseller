import type { Metadata } from 'next';
import { requirePermission, userCan } from '@/lib/auth/guards';
import { AdminPageHeader } from '@/components/admin/page-header';
import { PageForm, EMPTY_PAGE } from '@/components/admin/pages/page-form';
import { Alert } from '@/components/ui/states';

export const metadata: Metadata = { title: 'New page' };

export default async function NewPage() {
  const user = await requirePermission('pages.create');

  return (
    <div className="mx-auto max-w-3xl">
      <AdminPageHeader
        title="New page"
        description="Create the page, then add and arrange its sections."
        crumbs={[{ label: 'Pages', href: '/admin/pages' }, { label: 'New' }]}
      />
      <Alert tone="info" className="mb-4">
        Pages are created as drafts. Add your sections first, then publish when you are happy with it.
      </Alert>
      <PageForm initial={EMPTY_PAGE} canPublish={userCan(user, 'pages.publish')} mode="create" />
    </div>
  );
}
