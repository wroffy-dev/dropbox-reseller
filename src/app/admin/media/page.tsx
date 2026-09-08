import type { Metadata } from 'next';
import { prisma } from '@/lib/db/prisma';
import { requirePermission, userCan } from '@/lib/auth/guards';
import { AdminPageHeader } from '@/components/admin/page-header';
import { MediaLibrary } from '@/components/admin/media/media-library';
import type { MediaDto } from '@/lib/actions/media';

export const metadata: Metadata = { title: 'Media' };
export const dynamic = 'force-dynamic';

const PAGE_SIZE = 40;

export default async function MediaAdmin({
  searchParams,
}: {
  searchParams: Promise<{ selected?: string }>;
}) {
  const user = await requirePermission('media.view');
  const params = await searchParams;

  const rows = await prisma.media.findMany({
    where: { deletedAt: null },
    orderBy: { createdAt: 'desc' },
    take: PAGE_SIZE + 1,
    select: {
      id: true,
      url: true,
      filename: true,
      mimeType: true,
      kind: true,
      size: true,
      width: true,
      height: true,
      altText: true,
      title: true,
      createdAt: true,
    },
  });

  const hasMore = rows.length > PAGE_SIZE;
  const items: MediaDto[] = (hasMore ? rows.slice(0, PAGE_SIZE) : rows).map((row) => ({
    ...row,
    createdAt: row.createdAt.toISOString(),
  }));

  const usedBytes = await prisma.media.aggregate({
    where: { deletedAt: null },
    _sum: { size: true },
    _count: { _all: true },
  });

  return (
    <>
      <AdminPageHeader
        title="Media"
        description={`${usedBytes._count._all} file(s) · ${((usedBytes._sum.size ?? 0) / 1024 / 1024).toFixed(1)} MB stored`}
        crumbs={[{ label: 'Media' }]}
      />
      <MediaLibrary
        initialItems={items}
        initialCursor={hasMore ? (items[items.length - 1]?.id ?? null) : null}
        can={{
          upload: userCan(user, 'media.upload'),
          edit: userCan(user, 'media.edit'),
          delete: userCan(user, 'media.delete'),
        }}
        selectedId={params.selected}
      />
    </>
  );
}
