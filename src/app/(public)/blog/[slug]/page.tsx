import Link from 'next/link';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { ChevronRight } from 'lucide-react';
import { prisma } from '@/lib/db/prisma';
import { getPublishedPost, getRelatedPosts, publishedPostWhere } from '@/lib/services/blog';
import { getSeoSettings, getWebsiteSettings } from '@/lib/services/settings';
import { buildMetadata } from '@/lib/seo/metadata';
import { JsonLd } from '@/components/seo/json-ld';
import { articleSchema, breadcrumbSchema } from '@/lib/seo/structured-data';
import { RichText } from '@/components/cms/blocks/shared';
import { PostCard } from '@/components/blog/post-card';
import { formatDate, initials } from '@/lib/utils/format';

export const revalidate = 120;

export async function generateStaticParams() {
  try {
    const posts = await prisma.blogPost.findMany({
      where: publishedPostWhere(),
      select: { slug: true },
      take: 300,
    });
    return posts.map((p) => ({ slug: p.slug }));
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
  const post = await getPublishedPost(slug);
  if (!post) return { title: 'Article not found', robots: { index: false, follow: false } };

  return buildMetadata({
    title: post.seoTitle || post.title,
    description: post.seoDescription || post.excerpt,
    path: `/blog/${slug}`,
    canonicalUrl: post.canonicalUrl,
    noIndex: post.noIndex,
    ogTitle: post.ogTitle,
    ogDescription: post.ogDescription,
    ogImageUrl: post.ogImage?.url ?? post.featuredImage?.url ?? null,
    type: 'article',
    publishedTime: post.publishedAt,
    modifiedTime: post.updatedAt,
    authorName: post.author?.name ?? null,
  });
}

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = await getPublishedPost(slug);
  if (!post) notFound();

  const [related, site, seo] = await Promise.all([
    getRelatedPosts(post.id, post.categoryId),
    getWebsiteSettings(),
    getSeoSettings(),
  ]);

  return (
    <>
      <nav aria-label="Breadcrumb" className="border-b border-hairline bg-muted/[0.03]">
        <ol className="mx-auto flex max-w-3xl flex-wrap items-center gap-1.5 px-4 py-3 text-xs text-muted sm:px-6">
          <li>
            <Link href="/" className="hover:text-brand">
              Home
            </Link>
          </li>
          <ChevronRight className="h-3 w-3" aria-hidden="true" />
          <li>
            <Link href="/blog" className="hover:text-brand">
              Blog
            </Link>
          </li>
          {post.category ? (
            <>
              <ChevronRight className="h-3 w-3" aria-hidden="true" />
              <li>
                <Link href={`/blog/category/${post.category.slug}`} className="hover:text-brand">
                  {post.category.name}
                </Link>
              </li>
            </>
          ) : null}
        </ol>
      </nav>

      <article className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
        <header>
          {post.category ? (
            <Link
              href={`/blog/category/${post.category.slug}`}
              className="inline-flex rounded-full bg-brand/10 px-3 py-1 text-xs font-semibold text-brand"
            >
              {post.category.name}
            </Link>
          ) : null}

          <h1 className="mt-4 font-heading text-3xl tracking-tight text-content sm:text-4xl lg:text-[2.75rem] lg:leading-[1.15]">
            {post.title}
          </h1>

          {post.excerpt ? (
            <p className="mt-4 text-lg leading-relaxed text-muted">{post.excerpt}</p>
          ) : null}

          <div className="mt-7 flex flex-wrap items-center gap-3 border-y border-hairline py-4 text-sm text-muted">
            {post.author ? (
              <span className="flex items-center gap-2.5">
                {post.author.image ? (
                  <Image
                    src={post.author.image}
                    alt=""
                    width={32}
                    height={32}
                    className="h-8 w-8 rounded-full object-cover"
                  />
                ) : (
                  <span
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-brand/10 text-xs font-semibold text-brand"
                    aria-hidden="true"
                  >
                    {initials(post.author.name)}
                  </span>
                )}
                <span className="font-medium text-content">{post.author.name}</span>
              </span>
            ) : null}
            <time dateTime={post.publishedAt?.toISOString()}>{formatDate(post.publishedAt)}</time>
            <span aria-hidden="true">·</span>
            <span>{post.readingTime} min read</span>
          </div>
        </header>

        {post.featuredImage ? (
          <Image
            src={post.featuredImage.url}
            alt={post.featuredImage.altText ?? ''}
            width={post.featuredImage.width ?? 1200}
            height={post.featuredImage.height ?? 675}
            priority
            sizes="(max-width: 768px) 100vw, 768px"
            className="mt-8 h-auto w-full rounded-2xl border border-hairline object-cover"
          />
        ) : null}

        <RichText html={post.content} className="mt-10 text-base" />

        {post.tags.length > 0 ? (
          <div className="mt-12 flex flex-wrap items-center gap-2 border-t border-hairline pt-6">
            <span className="text-sm text-muted">Tags:</span>
            {post.tags.map(({ tag }) => (
              <Link
                key={tag.id}
                href={`/blog?tag=${tag.slug}`}
                className="rounded-full border border-hairline px-3 py-1 text-xs text-muted transition-colors hover:border-brand hover:text-brand"
              >
                {tag.name}
              </Link>
            ))}
          </div>
        ) : null}
      </article>

      {related.length > 0 ? (
        <section aria-labelledby="related-heading" className="border-t border-hairline bg-muted/[0.03]">
          <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6">
            <h2 id="related-heading" className="font-heading text-2xl font-bold text-content">
              Related articles
            </h2>
            <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {related.map((item) => (
                <PostCard key={item.id} post={item} />
              ))}
            </div>
          </div>
        </section>
      ) : null}

      <JsonLd
        data={[
          articleSchema({
            title: post.title,
            description: post.excerpt,
            slug: post.slug,
            imageUrl: post.featuredImage?.url ?? null,
            publishedAt: post.publishedAt,
            updatedAt: post.updatedAt,
            authorName: post.author?.name ?? null,
            organizationName: seo.organizationName || site.siteName,
            logoUrl: seo.organizationLogoUrl ?? site.logoUrl,
          }),
          breadcrumbSchema([
            { name: 'Home', path: '/' },
            { name: 'Blog', path: '/blog' },
            { name: post.title, path: `/blog/${post.slug}` },
          ]),
        ]}
      />
    </>
  );
}
