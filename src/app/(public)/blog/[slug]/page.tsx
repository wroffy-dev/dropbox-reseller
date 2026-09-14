import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { after } from 'next/server';
import { getPublishedPost, recordPostView } from '@/lib/services/blog';
import { getSeoSettings, getWebsiteSettings } from '@/lib/services/settings';
import { buildMetadata } from '@/lib/seo/metadata';
import { JsonLd } from '@/components/seo/json-ld';
import { blogPostingSchema, breadcrumbSchema } from '@/lib/seo/structured-data';
import { BlogArticle } from '@/components/blog/blog-article';

// The root layout reads the visitor's tracking-consent cookie, so nothing under
// it can be rendered statically. Declaring `revalidate` here made Next try
// anyway and every request failed with DYNAMIC_SERVER_USAGE.
export const dynamic = 'force-dynamic';

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
    noFollow: post.noFollow,
    ogTitle: post.ogTitle,
    ogDescription: post.ogDescription,
    ogImageUrl: post.ogImage?.url ?? post.featuredImage?.url ?? null,
    twitterImageUrl: post.twitterImage?.url ?? null,
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

  const [site, seo] = await Promise.all([getWebsiteSettings(), getSeoSettings()]);

  // The view counter feeds the "Popular posts" sources. It runs after the
  // response so a write can never delay or fail the page.
  after(() => recordPostView(post.id));

  return (
    <>
      <BlogArticle post={post} />

      <JsonLd
        data={[
          blogPostingSchema({
            title: post.title,
            description: post.seoDescription || post.excerpt,
            slug: post.slug,
            imageUrl: post.featuredImage?.url ?? post.ogImage?.url ?? null,
            publishedAt: post.publishedAt,
            updatedAt: post.updatedAt,
            wordCount: post.content.replace(/<[^>]*>/g, ' ').split(/\s+/).filter(Boolean).length,
            keywords: post.tags.map(({ tag }) => tag.name),
            section: post.category?.name ?? null,
            author: post.author
              ? {
                  name: post.author.name,
                  jobTitle: post.author.jobTitle,
                  url: post.author.linkedinUrl || post.author.websiteUrl,
                }
              : null,
            organizationName: seo.organizationName || site.siteName,
            logoUrl: seo.organizationLogoUrl ?? site.logoUrl,
          }),
          breadcrumbSchema([
            { name: 'Home', path: '/' },
            { name: 'Blog', path: '/blog' },
            ...(post.category
              ? [{ name: post.category.name, path: `/blog/category/${post.category.slug}` }]
              : []),
            { name: post.title, path: `/blog/${post.slug}` },
          ]),
        ]}
      />
    </>
  );
}
