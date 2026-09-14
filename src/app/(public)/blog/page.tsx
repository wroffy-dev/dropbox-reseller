import type { Metadata } from 'next';
import { getBlogSettings } from '@/lib/services/blog-cms';
import { buildMetadata } from '@/lib/seo/metadata';
import { JsonLd } from '@/components/seo/json-ld';
import { breadcrumbSchema } from '@/lib/seo/structured-data';
import { BlogArchive } from '@/components/blog/blog-archive';

type SearchParams = Promise<{ page?: string; q?: string; tag?: string }>;

// The root layout reads the visitor's tracking-consent cookie, so nothing under
// it can be rendered statically. Declaring `revalidate` here made Next try
// anyway and every request failed with DYNAMIC_SERVER_USAGE.
export const dynamic = 'force-dynamic';

export async function generateMetadata({
  searchParams,
}: {
  searchParams: SearchParams;
}): Promise<Metadata> {
  const [settings, params] = await Promise.all([getBlogSettings(), searchParams]);
  const page = Math.max(1, Number(params.page) || 1);

  return buildMetadata({
    title: settings.seoTitle || 'Blog',
    description:
      settings.seoDescription ||
      'Guides, migration playbooks and administration tips for teams running Dropbox.',
    path: '/blog',
    canonicalUrl: settings.canonicalUrl,
    // A search result or page 2+ is not a page to index — the articles
    // themselves are already indexed on their own URLs.
    noIndex: settings.noIndex || page > 1 || Boolean(params.q?.trim()),
    noFollow: settings.noFollow,
    ogTitle: settings.ogTitle,
    ogDescription: settings.ogDescription,
    ogImageUrl: settings.ogImageUrl,
  });
}

export default async function BlogIndex({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;

  return (
    <>
      <BlogArchive basePath="/blog" searchParams={params} />
      <JsonLd
        data={breadcrumbSchema([
          { name: 'Home', path: '/' },
          { name: 'Blog', path: '/blog' },
        ])}
      />
    </>
  );
}
