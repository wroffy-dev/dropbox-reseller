import type { Metadata } from 'next';
import { Plus } from 'lucide-react';
import { prisma } from '@/lib/db/prisma';
import { requirePermission, userCan } from '@/lib/auth/guards';
import { AdminPageHeader } from '@/components/admin/page-header';
import { FormsTable, type FormRow } from '@/components/admin/forms/forms-table';
import { Card } from '@/components/ui/card';
import { ButtonLink } from '@/components/ui/button';

export const metadata: Metadata = { title: 'Forms' };
export const dynamic = 'force-dynamic';

export default async function FormsAdmin() {
  const user = await requirePermission('forms.view');

  const rows = await prisma.form.findMany({
    where: { deletedAt: null },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      name: true,
      slug: true,
      isActive: true,
      createsLead: true,
      updatedAt: true,
      _count: { select: { fields: true, submissions: true, leads: true } },
    },
  });

  const tableRows: FormRow[] = rows.map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    isActive: row.isActive,
    createsLead: row.createsLead,
    fieldCount: row._count.fields,
    submissionCount: row._count.submissions,
    leadCount: row._count.leads,
    updatedAt: row.updatedAt.toISOString(),
  }));

  return (
    <>
      <AdminPageHeader
        title="Forms"
        description="Every form on the site. Submissions become leads with the product, page and campaign attached."
        crumbs={[{ label: 'Forms' }]}
        actions={
          userCan(user, 'forms.create') ? (
            <ButtonLink href="/admin/forms/new">
              <Plus className="h-4 w-4" aria-hidden="true" />
              New form
            </ButtonLink>
          ) : null
        }
      />
      <Card>
        <FormsTable
          rows={tableRows}
          can={{
            edit: userCan(user, 'forms.edit'),
            create: userCan(user, 'forms.create'),
            delete: userCan(user, 'forms.delete'),
          }}
        />
      </Card>
    </>
  );
}
