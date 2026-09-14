import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { getCategoryBySlug } from '@/lib/services/blog';
import { getBlogSettings } from '@/lib/services/blog-cms';
import { buildMetadata } from '@/lib/seo/metadata';
import { JsonLd } from '@/components/seo/json-ld';
import { breadcrumbSchema } from '@/lib/seo/structured-data';
import { BlogArchive } from '@/components/blog/blog-archive';

export const dynamic = 'force-dynamic';

type Params = Promise<{ slug: string }>;
type SearchParams = Promise<{ page?: string; q?: string; tag?: string }>;

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}): Promise<Metadata> {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const category = await getCategoryBySlug(slug);
  if (!category) return { title: 'Category not found', robots: { index: false, follow: false } };

  const page = Math.max(1, Number(query.page) || 1);

  return buildMetadata({
    title: category.seoTitle || category.archiveTitle || `${category.name} articles`,
    description: category.seoDescription || category.archiveDescription || category.description,
    path: `/blog/category/${slug}`,
    canonicalUrl: category.canonicalUrl,
    noIndex: category.noIndex || page > 1,
    noFollow: category.noFollow,
    ogTitle: category.ogTitle,
    ogDescription: category.ogDescription,
    ogImageUrl: category.ogImage?.url ?? category.bannerImage?.url ?? null,
  });
}

export default async function CategoryArchive({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const category = await getCategoryBySlug(slug);
  if (!category) notFound();

  // A hidden category keeps its URL working for anyone who has it bookmarked;
  // it simply stops being advertised in the filters.
  await getBlogSettings();

  return (
    <>
      <BlogArchive
        basePath={`/blog/category/${slug}`}
        categorySlug={slug}
        categoryId={category.id}
        searchParams={query}
      />
      <JsonLd
        data={breadcrumbSchema([
          { name: 'Home', path: '/' },
          { name: 'Blog', path: '/blog' },
          ...(category.parent
            ? [{ name: category.parent.name, path: `/blog/category/${category.parent.slug}` }]
            : []),
          { name: category.name, path: `/blog/category/${slug}` },
        ])}
      />
    </>
  );
}
