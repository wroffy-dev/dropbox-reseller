import type { Metadata } from 'next';
import { prisma } from '@/lib/db/prisma';
import { requirePermission, userCan } from '@/lib/auth/guards';
import { AdminPageHeader } from '@/components/admin/page-header';
import { BlogCategoryManager, type BlogCategoryRow } from '@/components/admin/blog/category-manager';
import { Card } from '@/components/ui/card';

export const metadata: Metadata = { title: 'Blog categories' };
export const dynamic = 'force-dynamic';

export default async function BlogCategories() {
  const user = await requirePermission('blog.view');

  const rows = await prisma.blogCategory.findMany({
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      sortOrder: true,
      seoTitle: true,
      seoDescription: true,
      _count: { select: { posts: { where: { deletedAt: null } } } },
    },
  });

  const categories: BlogCategoryRow[] = rows.map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    sortOrder: row.sortOrder,
    seoTitle: row.seoTitle,
    seoDescription: row.seoDescription,
    postCount: row._count.posts,
  }));

  return (
    <div className="mx-auto max-w-4xl">
      <AdminPageHeader
        title="Blog categories"
        description="Each category gets its own archive page and appears in the blog filter bar."
        crumbs={[{ label: 'Blog', href: '/admin/blog' }, { label: 'Categories' }]}
      />
      <Card className="p-4 sm:p-5">
        <BlogCategoryManager
          rows={categories}
          canEdit={userCan(user, 'blog.edit')}
          canDelete={userCan(user, 'blog.delete')}
        />
      </Card>
    </div>
  );
}
