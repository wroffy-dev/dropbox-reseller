import type { Metadata } from 'next';
import { prisma } from '@/lib/db/prisma';
import { requirePermission, userCan } from '@/lib/auth/guards';
import { buildLeadWhere } from '@/lib/crm/query';
import { AdminPageHeader } from '@/components/admin/page-header';
import { TableToolbar } from '@/components/admin/table-toolbar';
import { PipelineBoard, type PipelineCard } from '@/components/admin/leads/pipeline-board';
import { Alert } from '@/components/ui/states';
import { decimalToString } from '@/lib/utils/money';
import type { Prisma } from '@prisma/client';

export const metadata: Metadata = { title: 'Pipeline' };
export const dynamic = 'force-dynamic';

const MAX_CARDS = 300;

export default async function PipelinePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; assignedTo?: string; productId?: string }>;
}) {
  const user = await requirePermission('leads.view');
  const params = await searchParams;

  // Spam never appears on the board.
  const where: Prisma.LeadWhereInput = {
    ...buildLeadWhere(params),
    status: { notIn: ['SPAM'] },
  };

  const [leads, staff, products, total] = await Promise.all([
    prisma.lead.findMany({
      where,
      orderBy: [{ pipelineOrder: 'asc' }, { createdAt: 'desc' }],
      take: MAX_CARDS,
      select: {
        id: true,
        reference: true,
        name: true,
        company: true,
        status: true,
        value: true,
        createdAt: true,
        product: { select: { name: true } },
        assignedTo: { select: { name: true } },
      },
    }),
    prisma.user.findMany({
      where: { deletedAt: null, status: 'ACTIVE' },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
    prisma.product.findMany({
      where: { deletedAt: null },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
    prisma.lead.count({ where }),
  ]);

  const cards: PipelineCard[] = leads.map((lead) => ({
    id: lead.id,
    reference: lead.reference,
    name: lead.name,
    company: lead.company,
    productName: lead.product?.name ?? null,
    assignedToName: lead.assignedTo?.name ?? null,
    value: decimalToString(lead.value),
    status: lead.status,
    createdAt: lead.createdAt.toISOString(),
  }));

  return (
    <>
      <AdminPageHeader
        title="Pipeline"
        description="Drag a lead between stages to update it. Changes are recorded on the lead's timeline."
        crumbs={[{ label: 'Pipeline' }]}
      />

      <TableToolbar
        searchPlaceholder="Search leads"
        filters={[
          {
            name: 'assignedTo',
            label: 'Owner',
            options: [
              { label: 'Unassigned', value: 'unassigned' },
              ...staff.map((s) => ({ label: s.name, value: s.id })),
            ],
          },
          {
            name: 'productId',
            label: 'Product',
            options: products.map((p) => ({ label: p.name, value: p.id })),
          },
        ]}
      />

      {total > MAX_CARDS ? (
        <Alert tone="info" className="mb-4">
          Showing the {MAX_CARDS} most recent of {total} leads. Narrow the filters to see the rest.
        </Alert>
      ) : null}

      <PipelineBoard cards={cards} canEdit={userCan(user, 'leads.edit')} />
    </>
  );
}
