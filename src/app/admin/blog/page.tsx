import type { Metadata } from 'next';
import Link from 'next/link';
import { Plus, Tag } from 'lucide-react';
import { prisma } from '@/lib/db/prisma';
import { requirePermission, userCan } from '@/lib/auth/guards';
import { AdminPageHeader } from '@/components/admin/page-header';
import { TableToolbar } from '@/components/admin/table-toolbar';
import { AdminPagination } from '@/components/admin/admin-pagination';
import { PostsTable, type PostRow } from '@/components/admin/blog/posts-table';
import { Card } from '@/components/ui/card';
import { ButtonLink, buttonClasses } from '@/components/ui/button';
import type { Prisma } from '@prisma/client';

export const metadata: Metadata = { title: 'Blog' };
export const dynamic = 'force-dynamic';

const PER_PAGE = 20;

export default async function BlogAdmin({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; category?: string; page?: string }>;
}) {
  const user = await requirePermission('blog.view');
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);

  const where: Prisma.BlogPostWhereInput = { deletedAt: null };
  if (params.q?.trim()) {
    where.OR = [
      { title: { contains: params.q.trim(), mode: 'insensitive' } },
      { slug: { contains: params.q.trim(), mode: 'insensitive' } },
      { excerpt: { contains: params.q.trim(), mode: 'insensitive' } },
    ];
  }
  if (params.status) where.status = params.status as Prisma.BlogPostWhereInput['status'];
  if (params.category) where.categoryId = params.category;

  const [rows, total, categories] = await Promise.all([
    prisma.blogPost.findMany({
      where,
      orderBy: [{ publishedAt: 'desc' }, { updatedAt: 'desc' }],
      skip: (page - 1) * PER_PAGE,
      take: PER_PAGE,
      select: {
        id: true,
        title: true,
        slug: true,
        status: true,
        isFeatured: true,
        readingTime: true,
        publishedAt: true,
        updatedAt: true,
        category: { select: { name: true } },
        author: { select: { name: true } },
      },
    }),
    prisma.blogPost.count({ where }),
    prisma.blogCategory.findMany({ orderBy: { sortOrder: 'asc' }, select: { id: true, name: true } }),
  ]);

  const can = {
    edit: userCan(user, 'blog.edit'),
    create: userCan(user, 'blog.create'),
    delete: userCan(user, 'blog.delete'),
    publish: userCan(user, 'blog.publish'),
  };

  const tableRows: PostRow[] = rows.map((row) => ({
    id: row.id,
    title: row.title,
    slug: row.slug,
    status: row.status,
    isFeatured: row.isFeatured,
    categoryName: row.category?.name ?? null,
    authorName: row.author?.name ?? null,
    readingTime: row.readingTime,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
  }));

  return (
    <>
      <AdminPageHeader
        title="Blog"
        description="Articles published at /blog. Categories and tags drive the public archive pages."
        crumbs={[{ label: 'Blog' }]}
        actions={
          <>
            {can.edit ? (
              <Link href="/admin/blog/categories" className={buttonClasses('outline', 'md')}>
                <Tag className="h-4 w-4" aria-hidden="true" />
                Categories
              </Link>
            ) : null}
            {can.create ? (
              <ButtonLink href="/admin/blog/new">
                <Plus className="h-4 w-4" aria-hidden="true" />
                New post
              </ButtonLink>
            ) : null}
          </>
        }
      />

      <TableToolbar
        searchPlaceholder="Search posts by title or excerpt"
        filters={[
          {
            name: 'status',
            label: 'Status',
            options: [
              { label: 'Published', value: 'PUBLISHED' },
              { label: 'Draft', value: 'DRAFT' },
              { label: 'Scheduled', value: 'SCHEDULED' },
              { label: 'Archived', value: 'ARCHIVED' },
            ],
          },
          {
            name: 'category',
            label: 'Category',
            options: categories.map((c) => ({ label: c.name, value: c.id })),
          },
        ]}
      />

      <Card>
        <PostsTable
          rows={tableRows}
          can={can}
          filtered={Boolean(params.q || params.status || params.category)}
        />
        {tableRows.length > 0 ? (
          <AdminPagination
            page={page}
            pages={Math.max(1, Math.ceil(total / PER_PAGE))}
            total={total}
            basePath="/admin/blog"
            params={params}
          />
        ) : null}
      </Card>
    </>
  );
}
