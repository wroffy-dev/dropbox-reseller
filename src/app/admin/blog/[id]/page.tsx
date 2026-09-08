import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { ExternalLink } from 'lucide-react';
import { prisma } from '@/lib/db/prisma';
import { requirePermission, userCan } from '@/lib/auth/guards';
import { AdminPageHeader } from '@/components/admin/page-header';
import { PostForm, type PostFormValues } from '@/components/admin/blog/post-form';
import { ContentStatusBadge } from '@/components/admin/lead-status-badge';
import { buttonClasses } from '@/components/ui/button';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const post = await prisma.blogPost.findUnique({ where: { id }, select: { title: true } });
  return { title: post ? `Edit ${post.title}` : 'Post' };
}

function toLocalInput(date: Date | null): string {
  if (!date) return '';
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export default async function EditPost({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission('blog.view');
  const { id } = await params;

  const [post, categories, authors, posts] = await Promise.all([
    prisma.blogPost.findFirst({
      where: { id, deletedAt: null },
      include: {
        tags: { include: { tag: true } },
        relatedTo: { orderBy: { sortOrder: 'asc' }, select: { targetId: true } },
      },
    }),
    prisma.blogCategory.findMany({ orderBy: { sortOrder: 'asc' }, select: { id: true, name: true } }),
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
  if (!post) notFound();

  const initial: PostFormValues = {
    id: post.id,
    title: post.title,
    slug: post.slug,
    status: post.status,
    publishedAt: toLocalInput(post.publishedAt),
    excerpt: post.excerpt ?? '',
    content: post.content,
    isFeatured: post.isFeatured,
    featuredImageId: post.featuredImageId,
    categoryId: post.categoryId ?? '',
    authorId: post.authorId ?? '',
    tags: post.tags.map((t) => t.tag.name),
    relatedIds: post.relatedTo.map((r) => r.targetId),
    seoTitle: post.seoTitle ?? '',
    seoDescription: post.seoDescription ?? '',
    canonicalUrl: post.canonicalUrl ?? '',
    noIndex: post.noIndex,
    ogTitle: post.ogTitle ?? '',
    ogDescription: post.ogDescription ?? '',
    ogImageId: post.ogImageId,
  };

  return (
    <>
      <AdminPageHeader
        title={post.title}
        description={`/blog/${post.slug} · ${post.readingTime} min read`}
        crumbs={[{ label: 'Blog', href: '/admin/blog' }, { label: post.title }]}
        actions={
          <>
            <ContentStatusBadge status={post.status} />
            {post.status === 'PUBLISHED' ? (
              <Link
                href={`/blog/${post.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className={buttonClasses('outline', 'sm')}
              >
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
                View live
              </Link>
            ) : null}
          </>
        }
      />
      <PostForm
        initial={initial}
        categories={categories}
        authors={authors}
        posts={posts}
        canPublish={userCan(user, 'blog.publish')}
        canEdit={userCan(user, 'blog.edit')}
        mode="edit"
      />
    </>
  );
}
