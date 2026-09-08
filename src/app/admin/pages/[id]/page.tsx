import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { ExternalLink, Eye } from 'lucide-react';
import { prisma } from '@/lib/db/prisma';
import { requirePermission, userCan } from '@/lib/auth/guards';
import { AdminPageHeader } from '@/components/admin/page-header';
import { PageForm, type PageFormValues } from '@/components/admin/pages/page-form';
import { SectionBuilder, type BuilderSection } from '@/components/cms/section-builder';
import { PageRowActions } from '@/components/admin/pages/page-list-actions';
import { Card, CardHeader } from '@/components/ui/card';
import { ContentStatusBadge } from '@/components/admin/lead-status-badge';
import { buttonClasses } from '@/components/ui/button';
import type { FieldValues } from '@/components/cms/field-renderer';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const page = await prisma.page.findUnique({ where: { id }, select: { title: true } });
  return { title: page ? `Edit ${page.title}` : 'Page' };
}

function toLocalInput(date: Date | null): string {
  if (!date) return '';
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export default async function EditPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission('pages.view');
  const { id } = await params;

  const page = await prisma.page.findFirst({
    where: { id, deletedAt: null },
    include: { sections: { orderBy: { sortOrder: 'asc' } } },
  });
  if (!page) notFound();

  const canEdit = userCan(user, 'pages.edit');

  const initial: PageFormValues = {
    id: page.id,
    title: page.title,
    slug: page.slug,
    status: page.status,
    publishedAt: toLocalInput(page.publishedAt),
    isHomepage: page.isHomepage,
    showHeader: page.showHeader,
    showFooter: page.showFooter,
    seoTitle: page.seoTitle ?? '',
    seoDescription: page.seoDescription ?? '',
    canonicalUrl: page.canonicalUrl ?? '',
    noIndex: page.noIndex,
    noFollow: page.noFollow,
    ogTitle: page.ogTitle ?? '',
    ogDescription: page.ogDescription ?? '',
    ogImageId: page.ogImageId,
    twitterTitle: page.twitterTitle ?? '',
    twitterDescription: page.twitterDescription ?? '',
    twitterImageId: page.twitterImageId,
  };

  const sections: BuilderSection[] = page.sections.map((section) => ({
    id: section.id,
    blockType: section.blockType,
    name: section.name,
    isVisible: section.isVisible,
    sortOrder: section.sortOrder,
    content: (section.content ?? {}) as FieldValues,
    settings: (section.settings ?? {}) as FieldValues,
  }));

  const publicPath = `/${page.slug}`.replace(/\/+$/, '') || '/';

  return (
    <>
      <AdminPageHeader
        title={page.title}
        description={`Editing /${page.slug}`}
        crumbs={[{ label: 'Pages', href: '/admin/pages' }, { label: page.title }]}
        actions={
          <>
            <ContentStatusBadge status={page.status} />
            <Link href={`/admin/preview/${page.id}`} target="_blank" className={buttonClasses('outline', 'sm')}>
              <Eye className="h-4 w-4" aria-hidden="true" />
              Preview
            </Link>
            {page.status === 'PUBLISHED' ? (
              <Link
                href={publicPath}
                target="_blank"
                rel="noopener noreferrer"
                className={buttonClasses('ghost', 'sm')}
              >
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
                View live
              </Link>
            ) : null}
            <PageRowActions
              pageId={page.id}
              slug={page.slug}
              status={page.status}
              isHomepage={page.isHomepage}
              can={{
                edit: canEdit,
                publish: userCan(user, 'pages.publish'),
                create: userCan(user, 'pages.create'),
                delete: userCan(user, 'pages.delete'),
              }}
            />
          </>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[1fr_24rem]">
        <div className="min-w-0 xl:order-1">
          <Card>
            <CardHeader
              title="Sections"
              description="Drag to reorder. Click a section to edit its content and design."
            />
            <div className="p-4 sm:p-5">
              <SectionBuilder pageId={page.id} initialSections={sections} canEdit={canEdit} />
            </div>
          </Card>
        </div>

        <div className="min-w-0 xl:order-2">
          <PageForm initial={initial} canPublish={userCan(user, 'pages.publish')} mode="edit" />
        </div>
      </div>
    </>
  );
}
