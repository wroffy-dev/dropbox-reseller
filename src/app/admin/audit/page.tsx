import type { Metadata } from 'next';
import { prisma } from '@/lib/db/prisma';
import { requirePermission } from '@/lib/auth/guards';
import { AdminPageHeader } from '@/components/admin/page-header';
import { TableToolbar } from '@/components/admin/table-toolbar';
import { AdminPagination } from '@/components/admin/admin-pagination';
import { AuditTable, type AuditRow } from '@/components/admin/audit-table';
import { Card } from '@/components/ui/card';
import type { Prisma } from '@prisma/client';

export const metadata: Metadata = { title: 'Audit log' };
export const dynamic = 'force-dynamic';

const PER_PAGE = 40;

export default async function AuditAdmin({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; entity?: string; actor?: string; page?: string }>;
}) {
  await requirePermission('audit.view');
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);

  const where: Prisma.AuditLogWhereInput = {};
  if (params.q?.trim()) {
    where.OR = [
      { summary: { contains: params.q.trim(), mode: 'insensitive' } },
      { actorEmail: { contains: params.q.trim(), mode: 'insensitive' } },
      { action: { contains: params.q.trim(), mode: 'insensitive' } },
    ];
  }
  if (params.entity) where.entity = params.entity;
  if (params.actor) where.actorId = params.actor;

  const [rows, total, entities, actors] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PER_PAGE,
      take: PER_PAGE,
      select: {
        id: true,
        action: true,
        entity: true,
        entityId: true,
        summary: true,
        actorEmail: true,
        before: true,
        after: true,
        createdAt: true,
        actor: { select: { name: true } },
      },
    }),
    prisma.auditLog.count({ where }),
    prisma.auditLog.groupBy({ by: ['entity'], _count: { _all: true }, orderBy: { entity: 'asc' } }),
    prisma.user.findMany({
      where: { deletedAt: null },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
  ]);

  const auditRows: AuditRow[] = rows.map((row) => ({
    id: row.id,
    action: row.action,
    entity: row.entity,
    entityId: row.entityId,
    summary: row.summary,
    actorName: row.actor?.name ?? null,
    actorEmail: row.actorEmail,
    before: row.before ? JSON.stringify(row.before, null, 2) : null,
    after: row.after ? JSON.stringify(row.after, null, 2) : null,
    createdAt: row.createdAt.toISOString(),
  }));

  return (
    <>
      <AdminPageHeader
        title="Audit log"
        description="Every change made in the admin, with who made it and what changed."
        crumbs={[{ label: 'Audit log' }]}
      />

      <TableToolbar
        searchPlaceholder="Search by summary, action or email"
        filters={[
          {
            name: 'entity',
            label: 'Type',
            options: entities.map((e) => ({ label: `${e.entity} (${e._count._all})`, value: e.entity })),
          },
          { name: 'actor', label: 'Person', options: actors.map((a) => ({ label: a.name, value: a.id })) },
        ]}
      />

      <Card>
        <AuditTable rows={auditRows} filtered={Boolean(params.q || params.entity || params.actor)} />
        {auditRows.length > 0 ? (
          <AdminPagination
            page={page}
            pages={Math.max(1, Math.ceil(total / PER_PAGE))}
            total={total}
            basePath="/admin/audit"
            params={params}
          />
        ) : null}
      </Card>
    </>
  );
}
