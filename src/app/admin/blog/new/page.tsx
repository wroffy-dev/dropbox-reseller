import type { Metadata } from 'next';
import { prisma } from '@/lib/db/prisma';
import { requirePermission, userCan } from '@/lib/auth/guards';
import { AdminPageHeader } from '@/components/admin/page-header';
import { PostForm } from '@/components/admin/blog/post-form';
import { EMPTY_POST } from '@/lib/cms/post-model';

export const metadata: Metadata = { title: 'New post' };
export const dynamic = 'force-dynamic';

export default async function NewPost() {
  const user = await requirePermission('blog.create');

  const [categories, authors, posts] = await Promise.all([
    prisma.blogCategory.findMany({
      orderBy: { sortOrder: 'asc' },
      select: { id: true, name: true },
    }),
    prisma.user.findMany({
      where: { deletedAt: null, status: 'ACTIVE' },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
    prisma.blogPost.findMany({
      where: { deletedAt: null },
      orderBy: { publishedAt: 'desc' },
      take: 100,
      select: { id: true, title: true },
    }),
  ]);

  return (
    <>
      <AdminPageHeader
        title="New post"
        description="Write the article, set its category and tags, then publish."
        crumbs={[{ label: 'Blog', href: '/admin/blog' }, { label: 'New' }]}
      />
      <PostForm
        initial={{ ...EMPTY_POST, authorId: user.id }}
        categories={categories}
        authors={authors}
        posts={posts}
        canPublish={userCan(user, 'blog.publish')}
        canEdit
        mode="create"
      />
    </>
  );
}
