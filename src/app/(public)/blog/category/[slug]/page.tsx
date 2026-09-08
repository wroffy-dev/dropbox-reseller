import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { prisma } from '@/lib/db/prisma';
import { listPosts } from '@/lib/services/blog';
import { buildMetadata } from '@/lib/seo/metadata';
import { PostCard } from '@/components/blog/post-card';
import { Pagination } from '@/components/blog/pagination';
import { EmptyState } from '@/components/ui/states';
import { JsonLd } from '@/components/seo/json-ld';
import { breadcrumbSchema } from '@/lib/seo/structured-data';

export const revalidate = 120;

export async function generateStaticParams() {
  try {
    const categories = await prisma.blogCategory.findMany({ select: { slug: true }, take: 100 });
    return categories.map((c) => ({ slug: c.slug }));
  } catch {
    return [];
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const category = await prisma.blogCategory.findUnique({ where: { slug } });
  if (!category) return { title: 'Category not found', robots: { index: false, follow: false } };
  return buildMetadata({
    title: category.seoTitle || `${category.name} articles`,
    description: category.seoDescription || category.description,
    path: `/blog/category/${slug}`,
  });
}

export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const category = await prisma.blogCategory.findUnique({ where: { slug } });
  if (!category) notFound();

  const { posts, pages, page } = await listPosts({
    page: Number(query.page) || 1,
    categorySlug: slug,
  });

  return (
    <>
      <div className="border-b border-hairline bg-muted/[0.04]">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
          <Link href="/blog" className="text-sm text-muted hover:text-brand">
            ← All articles
          </Link>
          <h1 className="mt-3 font-heading text-3xl tracking-tight text-content sm:text-4xl">
            {category.name}
          </h1>
          {category.description ? (
            <p className="mt-3 max-w-2xl text-base leading-relaxed text-muted">{category.description}</p>
          ) : null}
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
        {posts.length === 0 ? (
          <EmptyState
            title="No articles in this category yet"
            description="Browse all articles instead."
            action={
              <Link href="/blog" className="text-sm font-medium text-brand hover:underline">
                View all articles
              </Link>
            }
          />
        ) : (
          <>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {posts.map((post, index) => (
                <PostCard key={post.id} post={post} priority={index < 3} />
              ))}
            </div>
            <Pagination page={page} pages={pages} basePath={`/blog/category/${slug}`} />
          </>
        )}
      </div>

      <JsonLd
        data={breadcrumbSchema([
          { name: 'Home', path: '/' },
          { name: 'Blog', path: '/blog' },
          { name: category.name, path: `/blog/category/${slug}` },
        ])}
      />
    </>
  );
}
