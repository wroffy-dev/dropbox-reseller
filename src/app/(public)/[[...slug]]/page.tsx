import { notFound, permanentRedirect, redirect } from 'next/navigation';
import type { Metadata } from 'next';
import { prisma } from '@/lib/db/prisma';
import { getPublishedPage, findRedirect } from '@/lib/services/pages';
import { getWebsiteSettings } from '@/lib/services/settings';
import { SectionList } from '@/components/cms/section-renderer';
import { JsonLd } from '@/components/seo/json-ld';
import { buildMetadata } from '@/lib/seo/metadata';
import { breadcrumbSchema, faqSchema } from '@/lib/seo/structured-data';
import { parseBlockContent, type FaqContent } from '@/lib/cms/blocks';

type Params = { slug?: string[] };

// The root layout reads the visitor's tracking-consent cookie, so nothing under
// it can be rendered statically. Declaring `revalidate` here made Next try
// anyway and every request failed with DYNAMIC_SERVER_USAGE.
export const dynamic = 'force-dynamic';

function slugFrom(params: Params): string {
  return (params.slug ?? []).join('/');
}

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const slug = slugFrom(await params);
  const page = await getPublishedPage(slug);
  if (!page) return { title: 'Page not found', robots: { index: false, follow: false } };

  const [ogImage, twitterImage] = await Promise.all([
    page.ogImageId
      ? prisma.media.findUnique({ where: { id: page.ogImageId }, select: { url: true } })
      : null,
    page.twitterImageId
      ? prisma.media.findUnique({ where: { id: page.twitterImageId }, select: { url: true } })
      : null,
  ]);

  return buildMetadata({
    title: page.seoTitle || page.title,
    description: page.seoDescription,
    path: `/${slug}`,
    canonicalUrl: page.canonicalUrl,
    noIndex: page.noIndex,
    noFollow: page.noFollow,
    ogTitle: page.ogTitle,
    ogDescription: page.ogDescription,
    ogImageUrl: ogImage?.url ?? null,
    twitterTitle: page.twitterTitle,
    twitterDescription: page.twitterDescription,
    twitterImageUrl: twitterImage?.url ?? null,
  });
}

export default async function CmsPage({ params }: { params: Promise<Params> }) {
  const slug = slugFrom(await params);
  const page = await getPublishedPage(slug);

  if (!page) {
    const target = await findRedirect(`/${slug}`);
    if (target) {
      if (target.permanent) permanentRedirect(target.destination);
      redirect(target.destination);
    }
    notFound();
  }

  const site = await getWebsiteSettings();

  // FAQ structured data is derived from any FAQ sections on the page.
  const faqItems = page.sections
    .filter((s) => s.blockType === 'faq' && s.isVisible)
    .flatMap((s) => parseBlockContent<FaqContent>('faq', s.content).items);
  const faq = faqSchema(faqItems);

  const crumbs =
    slug === ''
      ? null
      : breadcrumbSchema([
          { name: site.siteName, path: '/' },
          { name: page.title, path: `/${slug}` },
        ]);

  return (
    <>
      <SectionList sections={page.sections} />
      {faq ? <JsonLd data={faq} /> : null}
      {crumbs ? <JsonLd data={crumbs} /> : null}
    </>
  );
}
