import type { Metadata } from 'next';
import { Plus } from 'lucide-react';
import { prisma } from '@/lib/db/prisma';
import { requirePermission, userCan } from '@/lib/auth/guards';
import { AdminPageHeader } from '@/components/admin/page-header';
import { FilterBar } from '@/components/admin/filter-bar';
import type { FilterDefinition, FilterPreset } from '@/lib/admin/filters';
import { AdminPagination } from '@/components/admin/admin-pagination';
import { PagesTable, type PageRow } from '@/components/admin/pages/pages-table';
import { Card } from '@/components/ui/card';
import { ButtonLink } from '@/components/ui/button';
import type { Prisma } from '@prisma/client';

export const metadata: Metadata = { title: 'Pages' };
export const dynamic = 'force-dynamic';

const PER_PAGE = 20;

export default async function PagesAdmin({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; page?: string }>;
}) {
  const user = await requirePermission('pages.view');
  const params = await searchParams;

  const page = Math.max(1, Number(params.page) || 1);
  const where: Prisma.PageWhereInput = { deletedAt: null };
  if (params.q?.trim()) {
    where.OR = [
      { title: { contains: params.q.trim(), mode: 'insensitive' } },
      { slug: { contains: params.q.trim(), mode: 'insensitive' } },
    ];
  }
  if (params.status) where.status = params.status as Prisma.PageWhereInput['status'];

  const [rows, total] = await Promise.all([
    prisma.page.findMany({
      where,
      orderBy: [{ isHomepage: 'desc' }, { updatedAt: 'desc' }],
      skip: (page - 1) * PER_PAGE,
      take: PER_PAGE,
      select: {
        id: true,
        title: true,
        slug: true,
        status: true,
        isHomepage: true,
        updatedAt: true,
        _count: { select: { sections: true } },
      },
    }),
    prisma.page.count({ where }),
  ]);

  const can = {
    edit: userCan(user, 'pages.edit'),
    publish: userCan(user, 'pages.publish'),
    create: userCan(user, 'pages.create'),
    delete: userCan(user, 'pages.delete'),
  };

  const tableRows: PageRow[] = rows.map((row) => ({
    id: row.id,
    title: row.title,
    slug: row.slug,
    status: row.status,
    isHomepage: row.isHomepage,
    updatedAt: row.updatedAt.toISOString(),
    sectionCount: row._count.sections,
  }));

  const definitions: FilterDefinition[] = [
    {
      name: 'status',
      label: 'Status',
      allLabel: 'Any status',
      options: [
        { label: 'Published', value: 'PUBLISHED' },
        { label: 'Draft', value: 'DRAFT' },
        { label: 'Scheduled', value: 'SCHEDULED' },
        { label: 'Archived', value: 'ARCHIVED' },
      ],
    },
  ];

  const presets: FilterPreset[] = [
    { id: 'all', label: 'All pages', params: {} },
    { id: 'published', label: 'Published', params: { status: 'PUBLISHED' } },
    { id: 'drafts', label: 'Drafts', params: { status: 'DRAFT' } },
  ];

  return (
    <>
      <AdminPageHeader
        title="Pages"
        description="Every page on the website. Create, arrange sections and publish without touching code."
        crumbs={[{ label: 'Pages' }]}
        actions={
          can.create ? (
            <ButtonLink href="/admin/pages/new">
              <Plus className="h-4 w-4" aria-hidden="true" />
              New page
            </ButtonLink>
          ) : null
        }
      />

      <FilterBar
        searchPlaceholder="Search pages by title or URL"
        definitions={definitions}
        presets={presets}
      />

      <Card>
        <PagesTable rows={tableRows} can={can} filtered={Boolean(params.q || params.status)} />
        {tableRows.length > 0 ? (
          <AdminPagination
            page={page}
            pages={Math.max(1, Math.ceil(total / PER_PAGE))}
            total={total}
            basePath="/admin/pages"
            params={params}
          />
        ) : null}
      </Card>
    </>
  );
}
