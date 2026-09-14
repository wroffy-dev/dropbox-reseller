import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getTagBySlug } from '@/lib/services/blog';
import { buildMetadata } from '@/lib/seo/metadata';
import { JsonLd } from '@/components/seo/json-ld';
import { breadcrumbSchema } from '@/lib/seo/structured-data';
import { BlogArchive } from '@/components/blog/blog-archive';

export const dynamic = 'force-dynamic';

type Params = Promise<{ slug: string }>;
type SearchParams = Promise<{ page?: string; q?: string }>;

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}): Promise<Metadata> {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const tag = await getTagBySlug(slug);
  if (!tag) return { title: 'Tag not found', robots: { index: false, follow: false } };

  const page = Math.max(1, Number(query.page) || 1);

  return buildMetadata({
    title: tag.seoTitle || `${tag.name} articles`,
    description: tag.seoDescription || tag.description,
    path: `/blog/tag/${slug}`,
    canonicalUrl: tag.canonicalUrl,
    noIndex: tag.noIndex || page > 1,
  });
}

export default async function TagArchive({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const tag = await getTagBySlug(slug);
  if (!tag) notFound();

  return (
    <>
      <BlogArchive basePath={`/blog/tag/${slug}`} tagSlug={slug} searchParams={query} />
      <JsonLd
        data={breadcrumbSchema([
          { name: 'Home', path: '/' },
          { name: 'Blog', path: '/blog' },
          { name: tag.name, path: `/blog/tag/${slug}` },
        ])}
      />
    </>
  );
}
