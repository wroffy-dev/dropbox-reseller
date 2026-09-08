import type { Metadata } from 'next';
import { Plus } from 'lucide-react';
import { prisma } from '@/lib/db/prisma';
import { requirePermission, userCan } from '@/lib/auth/guards';
import { buildLeadWhere } from '@/lib/crm/query';
import { AdminPageHeader } from '@/components/admin/page-header';
import { TableToolbar } from '@/components/admin/table-toolbar';
import { AdminPagination } from '@/components/admin/admin-pagination';
import { LeadsTable, type LeadRow } from '@/components/admin/leads/leads-table';
import { StatCard } from '@/components/admin/stat-card';
import { Card } from '@/components/ui/card';
import { ButtonLink } from '@/components/ui/button';
import { LEAD_STATUS_OPTIONS } from '@/lib/crm/constants';
import { decimalToString } from '@/lib/utils/money';

export const metadata: Metadata = { title: 'Leads' };
export const dynamic = 'force-dynamic';

const PER_PAGE = 25;

type SearchParams = {
  q?: string;
  status?: string;
  assignedTo?: string;
  productId?: string;
  source?: string;
  from?: string;
  to?: string;
  page?: string;
};

export default async function LeadsAdmin({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requirePermission('leads.view');
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);

  const where = buildLeadWhere(params);

  const [rows, total, staff, products, sources, statusCounts] = await Promise.all([
    prisma.lead.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PER_PAGE,
      take: PER_PAGE,
      select: {
        id: true,
        reference: true,
        name: true,
        email: true,
        phone: true,
        company: true,
        status: true,
        source: true,
        utmSource: true,
        value: true,
        createdAt: true,
        product: { select: { name: true } },
        assignedTo: { select: { name: true } },
      },
    }),
    prisma.lead.count({ where }),
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
    prisma.lead.groupBy({
      by: ['utmSource'],
      where: { deletedAt: null, utmSource: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { utmSource: 'desc' } },
      take: 12,
    }),
    prisma.lead.groupBy({ by: ['status'], where: { deletedAt: null }, _count: { _all: true } }),
  ]);

  const counts = Object.fromEntries(statusCounts.map((s) => [s.status, s._count._all]));

  const can = {
    edit: userCan(user, 'leads.edit'),
    assign: userCan(user, 'leads.assign'),
    delete: userCan(user, 'leads.delete'),
    export: userCan(user, 'leads.export'),
  };

  const tableRows: LeadRow[] = rows.map((row) => ({
    id: row.id,
    reference: row.reference,
    name: row.name,
    email: row.email,
    phone: row.phone,
    company: row.company,
    status: row.status,
    source: row.source,
    utmSource: row.utmSource,
    productName: row.product?.name ?? null,
    assignedToName: row.assignedTo?.name ?? null,
    value: decimalToString(row.value),
    createdAt: row.createdAt.toISOString(),
  }));

  return (
    <>
      <AdminPageHeader
        title="Leads"
        description="Every enquiry captured from the website, with the product, page and campaign it came from."
        crumbs={[{ label: 'Leads' }]}
        actions={
          userCan(user, 'leads.create') ? (
            <ButtonLink href="/admin/leads/new">
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add lead
            </ButtonLink>
          ) : null
        }
      />

      <div className="mb-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="New" value={counts.NEW ?? 0} href="/admin/leads?status=NEW" tone="brand" />
        <StatCard
          label="Qualified"
          value={counts.QUALIFIED ?? 0}
          href="/admin/leads?status=QUALIFIED"
        />
        <StatCard label="Won" value={counts.WON ?? 0} href="/admin/leads?status=WON" tone="success" />
        <StatCard label="Lost" value={counts.LOST ?? 0} href="/admin/leads?status=LOST" tone="danger" />
      </div>

      <TableToolbar
        searchPlaceholder="Search by name, email, company or phone"
        filters={[
          { name: 'status', label: 'Status', options: LEAD_STATUS_OPTIONS },
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
          {
            name: 'source',
            label: 'Source',
            options: sources.map((s) => ({
              label: `${s.utmSource} (${s._count._all})`,
              value: s.utmSource ?? '',
            })),
          },
        ]}
      />

      <Card>
        <LeadsTable
          rows={tableRows}
          can={can}
          staff={staff}
          filters={params}
          filtered={Boolean(
            params.q || params.status || params.assignedTo || params.productId || params.source,
          )}
        />
        {tableRows.length > 0 ? (
          <AdminPagination
            page={page}
            pages={Math.max(1, Math.ceil(total / PER_PAGE))}
            total={total}
            basePath="/admin/leads"
            params={params}
          />
        ) : null}
      </Card>
    </>
  );
}
