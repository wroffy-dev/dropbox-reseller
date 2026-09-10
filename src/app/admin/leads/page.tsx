import type { Metadata } from 'next';
import { Plus } from 'lucide-react';
import { prisma } from '@/lib/db/prisma';
import { requirePermission, userCan } from '@/lib/auth/guards';
import { buildLeadWhere, buildLeadOrderBy, type LeadFilters } from '@/lib/crm/query';
import { AdminPageHeader } from '@/components/admin/page-header';
import { FilterBar } from '@/components/admin/filter-bar';
import { AdminPagination } from '@/components/admin/admin-pagination';
import { LeadsTable, type LeadRow } from '@/components/admin/leads/leads-table';
import { StatCard } from '@/components/admin/stat-card';
import { Card } from '@/components/ui/card';
import { ButtonLink } from '@/components/ui/button';
import { LEAD_STATUS_OPTIONS } from '@/lib/crm/constants';
import { decimalToString } from '@/lib/utils/money';
import {
  daysAgo,
  today,
  startOfWeek,
  type FilterDefinition,
  type FilterPreset,
} from '@/lib/admin/filters';

export const metadata: Metadata = { title: 'Leads' };
export const dynamic = 'force-dynamic';

const PER_PAGE = 25;

type SearchParams = LeadFilters & { page?: string };

/** Distinct non-null values of an attribution column, for its filter dropdown. */
async function attributionOptions(
  column: 'utmSource' | 'utmMedium' | 'utmCampaign' | 'utmContent' | 'source',
) {
  const rows = await prisma.lead.groupBy({
    by: [column],
    where: { deletedAt: null, [column]: { not: null } },
    _count: { _all: true },
    orderBy: { _count: { [column]: 'desc' } },
    take: 25,
  });
  return rows
    .map((row) => ({
      value: String(row[column] ?? ''),
      label: String(row[column] ?? ''),
      hint: String(row._count._all),
    }))
    .filter((option) => option.value);
}

export default async function LeadsAdmin({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const user = await requirePermission('leads.view');
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);

  const where = buildLeadWhere(params);
  const orderBy = buildLeadOrderBy(params);

  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);

  const [
    rows,
    total,
    staff,
    products,
    forms,
    pages,
    utmSources,
    utmMediums,
    utmCampaigns,
    utmContents,
    leadSources,
    statusCounts,
    unassignedCount,
    followUpCount,
  ] = await Promise.all([
    prisma.lead.findMany({
      where,
      orderBy,
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
        utmCampaign: true,
        value: true,
        followUpAt: true,
        createdAt: true,
        updatedAt: true,
        product: { select: { name: true } },
        form: { select: { name: true } },
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
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true },
    }),
    prisma.form.findMany({
      where: { deletedAt: null },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
    prisma.page.findMany({
      where: { deletedAt: null },
      orderBy: { title: 'asc' },
      take: 100,
      select: { id: true, title: true },
    }),
    attributionOptions('utmSource'),
    attributionOptions('utmMedium'),
    attributionOptions('utmCampaign'),
    attributionOptions('utmContent'),
    attributionOptions('source'),
    prisma.lead.groupBy({
      by: ['status'],
      where: { deletedAt: null },
      _count: { _all: true },
    }),
    prisma.lead.count({
      where: {
        deletedAt: null,
        assignedToId: null,
        status: { notIn: ['WON', 'LOST', 'SPAM'] },
      },
    }),
    prisma.lead.count({
      where: {
        deletedAt: null,
        followUpAt: { lte: endOfToday },
        status: { notIn: ['WON', 'LOST', 'SPAM'] },
      },
    }),
  ]);

  const counts = Object.fromEntries(statusCounts.map((row) => [row.status, row._count._all]));
  const totalLeads = statusCounts.reduce((sum, row) => sum + row._count._all, 0);

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
    utmCampaign: row.utmCampaign,
    productName: row.product?.name ?? null,
    formName: row.form?.name ?? null,
    assignedToName: row.assignedTo?.name ?? null,
    value: decimalToString(row.value),
    followUpAt: row.followUpAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }));

  // Primary filters sit in the bar; the rest live behind "More filters" so the
  // screen stays readable while every attribution field stays reachable.
  const definitions: FilterDefinition[] = [
    {
      name: 'status',
      label: 'Status',
      options: LEAD_STATUS_OPTIONS,
      allLabel: 'All statuses',
    },
    {
      name: 'assignedTo',
      label: 'Owner',
      allLabel: 'All owners',
      options: [
        { label: 'Unassigned', value: 'unassigned' },
        { label: 'Anyone assigned', value: 'assigned' },
        ...staff.map((member) => ({ label: member.name, value: member.id })),
      ],
    },
    {
      name: 'source',
      label: 'Source',
      allLabel: 'All sources',
      options: utmSources,
    },
    { name: 'from', label: 'Date range', kind: 'date' },

    {
      name: 'productId',
      label: 'Product',
      allLabel: 'Any product',
      options: products.map((p) => ({ label: p.name, value: p.id })),
      advanced: true,
    },
    {
      name: 'formId',
      label: 'Form',
      allLabel: 'Any form',
      options: forms.map((f) => ({ label: f.name, value: f.id })),
      advanced: true,
    },
    {
      name: 'pageId',
      label: 'Landing page',
      allLabel: 'Any page',
      options: pages.map((p) => ({ label: p.title, value: p.id })),
      advanced: true,
    },
    {
      name: 'leadSource',
      label: 'Lead source',
      allLabel: 'Any lead source',
      options: leadSources,
      advanced: true,
    },
    {
      name: 'utmMedium',
      label: 'UTM medium',
      allLabel: 'Any medium',
      options: utmMediums,
      advanced: true,
    },
    {
      name: 'utmCampaign',
      label: 'UTM campaign',
      allLabel: 'Any campaign',
      options: utmCampaigns,
      advanced: true,
    },
    {
      name: 'utmContent',
      label: 'UTM content',
      allLabel: 'Any content',
      options: utmContents,
      advanced: true,
    },
    {
      name: 'followUp',
      label: 'Follow-up',
      allLabel: 'Any follow-up',
      advanced: true,
      options: [
        { label: 'Due today or earlier', value: 'due' },
        { label: 'Overdue', value: 'overdue' },
        { label: 'Scheduled', value: 'set' },
        { label: 'None scheduled', value: 'none' },
      ],
    },
    {
      name: 'dateField',
      label: 'Date applies to',
      allLabel: 'Created date',
      advanced: true,
      options: [
        { label: 'Created date', value: 'created' },
        { label: 'Last activity', value: 'activity' },
      ],
    },
  ];

  const presets: FilterPreset[] = [
    { id: 'all', label: 'All leads', params: {} },
    { id: 'new-today', label: 'New today', params: { from: today() } },
    { id: 'this-week', label: 'This week', params: { from: startOfWeek() } },
    {
      id: 'unassigned',
      label: 'Unassigned',
      params: { assignedTo: 'unassigned' },
    },
    { id: 'follow-up', label: 'Follow-up due', params: { followUp: 'due' } },
    { id: 'qualified', label: 'Qualified', params: { status: 'QUALIFIED' } },
    {
      id: 'won-30',
      label: 'Won (30 days)',
      params: { status: 'WON', from: daysAgo(30) },
    },
  ];

  return (
    <>
      <AdminPageHeader
        title="Leads"
        description="Every enquiry captured from the website, with the product, page and campaign it came from."
        actions={
          userCan(user, 'leads.create') ? (
            <ButtonLink href="/admin/leads/new">
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add lead
            </ButtonLink>
          ) : null
        }
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        <StatCard label="Total" value={totalLeads} href="/admin/leads" />
        <StatCard label="New" value={counts.NEW ?? 0} tone="brand" href="/admin/leads?status=NEW" />
        <StatCard
          label="Contacted"
          value={counts.CONTACTED ?? 0}
          href="/admin/leads?status=CONTACTED"
        />
        <StatCard
          label="Qualified"
          value={counts.QUALIFIED ?? 0}
          href="/admin/leads?status=QUALIFIED"
        />
        <StatCard
          label="Won"
          value={counts.WON ?? 0}
          tone="success"
          href="/admin/leads?status=WON"
        />
        <StatCard
          label="Lost"
          value={counts.LOST ?? 0}
          tone="danger"
          href="/admin/leads?status=LOST"
        />
        <StatCard
          label="Unassigned"
          value={unassignedCount}
          tone={unassignedCount > 0 ? 'warning' : 'default'}
          hint={followUpCount > 0 ? `${followUpCount} follow-ups due` : undefined}
          href="/admin/leads?assignedTo=unassigned"
        />
      </div>

      <FilterBar
        searchPlaceholder="Search name, email, phone or company"
        definitions={definitions}
        presets={presets}
      />

      <Card>
        <LeadsTable
          rows={tableRows}
          can={can}
          staff={staff}
          filters={params}
          total={total}
          filtered={Object.entries(params).some(
            ([key, value]) => Boolean(value) && key !== 'page' && key !== 'sort' && key !== 'dir',
          )}
        />
        {tableRows.length > 0 ? (
          <AdminPagination
            page={page}
            pages={Math.max(1, Math.ceil(total / PER_PAGE))}
            total={total}
            basePath="/admin/leads"
            params={params as Record<string, string | undefined>}
          />
        ) : null}
      </Card>
    </>
  );
}
