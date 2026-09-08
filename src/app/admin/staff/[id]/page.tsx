import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { prisma } from '@/lib/db/prisma';
import { requirePermission } from '@/lib/auth/guards';
import { AdminPageHeader } from '@/components/admin/page-header';
import { StaffForm, type StaffFormValues } from '@/components/admin/staff/staff-form';
import { formatDate } from '@/lib/utils/format';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const member = await prisma.user.findUnique({ where: { id }, select: { name: true } });
  return { title: member ? member.name : 'Staff' };
}

export default async function EditStaff({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission('staff.manage');
  const { id } = await params;

  const [member, actorRole] = await Promise.all([
    prisma.user.findFirst({ where: { id, deletedAt: null }, include: { roles: true } }),
    user.role
      ? prisma.userRole.findUnique({ where: { slug: user.role }, select: { rank: true } })
      : null,
  ]);
  if (!member) notFound();

  const roles = await prisma.userRole.findMany({
    where: user.role === 'super-admin' || !actorRole ? {} : { rank: { gt: actorRole.rank } },
    orderBy: { rank: 'asc' },
    select: { id: true, name: true },
  });

  // The current role stays selectable even when it sits above the actor's level,
  // so the form does not silently drop it.
  if (!roles.some((role) => role.id === member.roleId)) {
    roles.unshift({ id: member.roleId, name: member.roles.name });
  }

  const initial: StaffFormValues = {
    id: member.id,
    name: member.name,
    email: member.email,
    jobTitle: member.jobTitle ?? '',
    phone: member.phone ?? '',
    roleId: member.roleId,
    status: member.status,
  };

  return (
    <div className="mx-auto max-w-3xl">
      <AdminPageHeader
        title={member.name}
        description={`${member.email} · added ${formatDate(member.createdAt)}`}
        crumbs={[{ label: 'Staff', href: '/admin/staff' }, { label: member.name }]}
      />
      <StaffForm initial={initial} roles={roles} mode="edit" isSelf={member.id === user.id} />
    </div>
  );
}
