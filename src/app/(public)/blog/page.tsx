import Link from 'next/link';
import type { Metadata } from 'next';
import { Search } from 'lucide-react';
import { listPosts, getBlogCategories } from '@/lib/services/blog';
import { buildMetadata } from '@/lib/seo/metadata';
import { PostCard } from '@/components/blog/post-card';
import { Pagination } from '@/components/blog/pagination';
import { EmptyState } from '@/components/ui/states';
import { Input } from '@/components/ui/field';
import { cn } from '@/lib/utils/cn';

type SearchParams = Promise<{ page?: string; q?: string; tag?: string }>;

export const revalidate = 120;

export async function generateMetadata(): Promise<Metadata> {
  return buildMetadata({
    title: 'Blog',
    description: 'Guides, migration playbooks and administration tips for teams running Dropbox.',
    path: '/blog',
  });
}

export default async function BlogIndex({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const [{ posts, pages, page }, categories] = await Promise.all([
    listPosts({ page: Number(params.page) || 1, query: params.q, tagSlug: params.tag }),
    getBlogCategories(),
  ]);

  return (
    <>
      <div className="border-b border-hairline bg-muted/[0.04]">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-16">
          <h1 className="font-heading text-3xl tracking-tight text-content sm:text-4xl">Blog</h1>
          <p className="mt-3 max-w-2xl text-base leading-relaxed text-muted sm:text-lg">
            Migration playbooks, plan comparisons and administration tips from the team that deploys Dropbox
            for a living.
          </p>

          <form action="/blog" method="get" role="search" className="mt-8 flex max-w-md gap-2">
            <div className="relative flex-1">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
                aria-hidden="true"
              />
              <Input
                type="search"
                name="q"
                defaultValue={params.q ?? ''}
                placeholder="Search articles"
                aria-label="Search articles"
                className="pl-9"
              />
            </div>
            <button
              type="submit"
              className="h-10 shrink-0 rounded-lg bg-brand px-4 text-sm font-medium text-white transition-colors hover:bg-brand/90"
            >
              Search
            </button>
          </form>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
        {categories.length > 0 ? (
          <nav aria-label="Categories" className="mb-10">
            <ul className="flex flex-wrap gap-2">
              <li>
                <Link
                  href="/blog"
                  className={cn(
                    'inline-flex rounded-full border px-3.5 py-1.5 text-sm transition-colors',
                    'border-brand bg-brand text-white',
                  )}
                >
                  All
                </Link>
              </li>
              {categories.map((category) => (
                <li key={category.id}>
                  <Link
                    href={`/blog/category/${category.slug}`}
                    className="inline-flex rounded-full border border-hairline px-3.5 py-1.5 text-sm text-content transition-colors hover:border-brand hover:text-brand"
                  >
                    {category.name}
                    <span className="ml-1.5 text-muted">{category._count.posts}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}

        {posts.length === 0 ? (
          <EmptyState
            title={params.q ? `No articles match “${params.q}”` : 'No articles published yet'}
            description={
              params.q
                ? 'Try a different search term, or browse all articles.'
                : 'New guides are published regularly — check back soon.'
            }
            action={
              params.q ? (
                <Link href="/blog" className="text-sm font-medium text-brand hover:underline">
                  Clear search
                </Link>
              ) : undefined
            }
          />
        ) : (
          <>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {posts.map((post, index) => (
                <PostCard key={post.id} post={post} priority={index < 3} />
              ))}
            </div>
            <Pagination
              page={page}
              pages={pages}
              basePath="/blog"
              searchParams={{ q: params.q, tag: params.tag }}
            />
          </>
        )}
      </div>
    </>
  );
}
