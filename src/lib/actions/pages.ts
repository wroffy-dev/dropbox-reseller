'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import { authorize } from '@/lib/auth/guards';
import { recordAudit } from '@/lib/services/audit';
import { pageInputSchema, sectionOrderSchema } from '@/lib/validation/page';
import { blockDefaults, getBlock } from '@/lib/cms/blocks';
import { sectionSettingsSchema } from '@/lib/cms/section-settings';
import { uniqueSlug, pageSlug } from '@/lib/utils/slug';
import { success, failure, toActionError, type ActionResult } from '@/lib/utils/result';
import { sanitizeText } from '@/lib/utils/sanitize';

/** Revalidates the public surfaces a page change can affect. */
async function revalidatePage(slug: string) {
  revalidatePath(`/${slug}`.replace(/\/+$/, '') || '/', 'page');
  revalidatePath('/sitemap.xml');
}

export async function createPage(formData: FormData): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await authorize('pages.create');

    const parsed = pageInputSchema.parse({
      title: formData.get('title'),
      slug: formData.get('slug') || String(formData.get('title') ?? ''),
      status: formData.get('status') || 'DRAFT',
      publishedAt: formData.get('publishedAt') || null,
      isHomepage: formData.get('isHomepage') === 'true',
      showHeader: formData.get('showHeader') !== 'false',
      showFooter: formData.get('showFooter') !== 'false',
      seoTitle: formData.get('seoTitle'),
      seoDescription: formData.get('seoDescription'),
      canonicalUrl: formData.get('canonicalUrl'),
      noIndex: formData.get('noIndex') === 'true',
      noFollow: formData.get('noFollow') === 'true',
      ogTitle: formData.get('ogTitle'),
      ogDescription: formData.get('ogDescription'),
      ogImageId: formData.get('ogImageId'),
      twitterTitle: formData.get('twitterTitle'),
      twitterDescription: formData.get('twitterDescription'),
      twitterImageId: formData.get('twitterImageId'),
    });

    if (parsed.status === 'PUBLISHED') await authorize('pages.publish');

    const slug = await uniqueSlug(parsed.slug || pageSlug(parsed.title), async (candidate) => {
      const existing = await prisma.page.findUnique({ where: { slug: candidate }, select: { id: true } });
      return Boolean(existing);
    });

    const page = await prisma.$transaction(async (tx) => {
      if (parsed.isHomepage) {
        await tx.page.updateMany({ where: { isHomepage: true }, data: { isHomepage: false } });
      }
      return tx.page.create({
        data: {
          ...parsed,
          slug,
          title: sanitizeText(parsed.title),
          publishedAt:
            parsed.status === 'PUBLISHED' ? (parsed.publishedAt ?? new Date()) : parsed.publishedAt,
          createdById: user.id,
          updatedById: user.id,
        },
      });
    });

    await recordAudit({
      actor: user,
      action: 'created',
      entity: 'Page',
      entityId: page.id,
      summary: `Created page “${page.title}”`,
      after: { title: page.title, slug: page.slug, status: page.status },
    });

    revalidatePath('/admin/pages');
    await revalidatePage(slug);
    return success({ id: page.id }, 'Page created.');
  } catch (error) {
    return toActionError(error);
  }
}

export async function updatePage(pageId: string, formData: FormData): Promise<ActionResult> {
  try {
    const user = await authorize('pages.edit');

    const before = await prisma.page.findUnique({ where: { id: pageId } });
    if (!before || before.deletedAt) return failure('That page no longer exists.');

    const parsed = pageInputSchema.parse({
      title: formData.get('title'),
      slug: formData.get('slug'),
      status: formData.get('status') || before.status,
      publishedAt: formData.get('publishedAt') || null,
      isHomepage: formData.get('isHomepage') === 'true',
      showHeader: formData.get('showHeader') !== 'false',
      showFooter: formData.get('showFooter') !== 'false',
      seoTitle: formData.get('seoTitle'),
      seoDescription: formData.get('seoDescription'),
      canonicalUrl: formData.get('canonicalUrl'),
      noIndex: formData.get('noIndex') === 'true',
      noFollow: formData.get('noFollow') === 'true',
      ogTitle: formData.get('ogTitle'),
      ogDescription: formData.get('ogDescription'),
      ogImageId: formData.get('ogImageId'),
      twitterTitle: formData.get('twitterTitle'),
      twitterDescription: formData.get('twitterDescription'),
      twitterImageId: formData.get('twitterImageId'),
    });

    if (parsed.status === 'PUBLISHED' && before.status !== 'PUBLISHED') {
      await authorize('pages.publish');
    }

    // The homepage must keep an addressable slug of "".
    const slug = before.isHomepage && parsed.isHomepage ? before.slug : parsed.slug;

    if (slug !== before.slug) {
      const clash = await prisma.page.findFirst({
        where: { slug, id: { not: pageId } },
        select: { id: true },
      });
      if (clash) return failure('Another page already uses that URL.', { slug: ['This URL is taken'] });
    }

    const updated = await prisma.$transaction(async (tx) => {
      if (parsed.isHomepage && !before.isHomepage) {
        await tx.page.updateMany({ where: { isHomepage: true }, data: { isHomepage: false } });
      }
      return tx.page.update({
        where: { id: pageId },
        data: {
          ...parsed,
          slug,
          title: sanitizeText(parsed.title),
          publishedAt:
            parsed.status === 'PUBLISHED'
              ? (parsed.publishedAt ?? before.publishedAt ?? new Date())
              : parsed.publishedAt,
          updatedById: user.id,
        },
      });
    });

    await recordAudit({
      actor: user,
      action: 'updated',
      entity: 'Page',
      entityId: pageId,
      summary: `Updated page “${updated.title}”`,
      before: { title: before.title, slug: before.slug, status: before.status },
      after: { title: updated.title, slug: updated.slug, status: updated.status },
    });

    revalidatePath('/admin/pages');
    revalidatePath(`/admin/pages/${pageId}`);
    await revalidatePage(before.slug);
    if (slug !== before.slug) await revalidatePage(slug);
    return success(undefined, 'Page saved.');
  } catch (error) {
    return toActionError(error);
  }
}

export async function setPageStatus(
  pageId: string,
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED',
): Promise<ActionResult> {
  try {
    const user = status === 'PUBLISHED' ? await authorize('pages.publish') : await authorize('pages.edit');
    const page = await prisma.page.findUnique({ where: { id: pageId } });
    if (!page) return failure('That page no longer exists.');

    await prisma.page.update({
      where: { id: pageId },
      data: {
        status,
        publishedAt: status === 'PUBLISHED' ? (page.publishedAt ?? new Date()) : page.publishedAt,
        updatedById: user.id,
      },
    });

    await recordAudit({
      actor: user,
      action: status.toLowerCase(),
      entity: 'Page',
      entityId: pageId,
      summary: `Set “${page.title}” to ${status.toLowerCase()}`,
      before: { status: page.status },
      after: { status },
    });

    revalidatePath('/admin/pages');
    await revalidatePage(page.slug);
    return success(undefined, `Page ${status.toLowerCase()}.`);
  } catch (error) {
    return toActionError(error);
  }
}

export async function duplicatePage(pageId: string): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await authorize('pages.create');
    const source = await prisma.page.findUnique({
      where: { id: pageId },
      include: { sections: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!source) return failure('That page no longer exists.');

    const slug = await uniqueSlug(`${source.slug || 'home'}-copy`, async (candidate) => {
      const existing = await prisma.page.findUnique({ where: { slug: candidate }, select: { id: true } });
      return Boolean(existing);
    });

    const copy = await prisma.page.create({
      data: {
        title: `${source.title} (copy)`,
        slug,
        status: 'DRAFT',
        isHomepage: false,
        showHeader: source.showHeader,
        showFooter: source.showFooter,
        seoTitle: source.seoTitle,
        seoDescription: source.seoDescription,
        noIndex: source.noIndex,
        noFollow: source.noFollow,
        ogTitle: source.ogTitle,
        ogDescription: source.ogDescription,
        ogImageId: source.ogImageId,
        createdById: user.id,
        updatedById: user.id,
        sections: {
          create: source.sections.map((section) => ({
            blockType: section.blockType,
            name: section.name,
            sortOrder: section.sortOrder,
            isVisible: section.isVisible,
            content: section.content as object,
            settings: section.settings as object,
          })),
        },
      },
    });

    await recordAudit({
      actor: user,
      action: 'duplicated',
      entity: 'Page',
      entityId: copy.id,
      summary: `Duplicated “${source.title}”`,
    });

    revalidatePath('/admin/pages');
    return success({ id: copy.id }, 'Page duplicated.');
  } catch (error) {
    return toActionError(error);
  }
}

export async function deletePage(pageId: string): Promise<ActionResult> {
  try {
    const user = await authorize('pages.delete');
    const page = await prisma.page.findUnique({ where: { id: pageId } });
    if (!page) return failure('That page no longer exists.');
    if (page.isHomepage) return failure('Set another page as the homepage before deleting this one.');

    // Soft delete keeps inbound lead attribution intact.
    await prisma.page.update({
      where: { id: pageId },
      data: { deletedAt: new Date(), status: 'ARCHIVED', slug: `${page.slug}-deleted-${Date.now()}` },
    });

    await recordAudit({
      actor: user,
      action: 'deleted',
      entity: 'Page',
      entityId: pageId,
      summary: `Deleted page “${page.title}”`,
      before: { title: page.title, slug: page.slug },
    });

    revalidatePath('/admin/pages');
    await revalidatePage(page.slug);
    return success(undefined, 'Page deleted.');
  } catch (error) {
    return toActionError(error);
  }
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

export async function addSection(pageId: string, blockType: string): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await authorize('pages.edit');
    const definition = getBlock(blockType);
    if (!definition) return failure('Unknown block type.');

    const page = await prisma.page.findUnique({ where: { id: pageId }, select: { slug: true } });
    if (!page) return failure('That page no longer exists.');

    const last = await prisma.pageSection.findFirst({
      where: { pageId },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });

    const section = await prisma.pageSection.create({
      data: {
        pageId,
        blockType,
        name: definition.label,
        sortOrder: (last?.sortOrder ?? 0) + 10,
        content: blockDefaults(blockType) as object,
        settings: sectionSettingsSchema.parse({}) as object,
      },
    });

    await recordAudit({
      actor: user,
      action: 'section.added',
      entity: 'Page',
      entityId: pageId,
      summary: `Added a ${definition.label} section`,
    });

    revalidatePath(`/admin/pages/${pageId}`);
    await revalidatePage(page.slug);
    return success({ id: section.id }, `${definition.label} added.`);
  } catch (error) {
    return toActionError(error);
  }
}

export async function updateSection(
  sectionId: string,
  payload: { content?: unknown; settings?: unknown; name?: string | null; isVisible?: boolean },
): Promise<ActionResult> {
  try {
    const user = await authorize('pages.edit');

    const section = await prisma.pageSection.findUnique({
      where: { id: sectionId },
      include: { page: { select: { id: true, slug: true } } },
    });
    if (!section) return failure('That section no longer exists.');

    const definition = getBlock(section.blockType);
    const data: Record<string, unknown> = {};

    if (payload.content !== undefined && definition) {
      // Validate against the block's own schema so stored content always parses.
      data.content = definition.schema.parse(payload.content);
    }
    if (payload.settings !== undefined) {
      data.settings = sectionSettingsSchema.parse(payload.settings);
    }
    if (payload.name !== undefined) data.name = payload.name ? sanitizeText(payload.name) : null;
    if (payload.isVisible !== undefined) data.isVisible = payload.isVisible;

    await prisma.pageSection.update({ where: { id: sectionId }, data });
    await prisma.page.update({ where: { id: section.page.id }, data: { updatedById: user.id } });

    revalidatePath(`/admin/pages/${section.page.id}`);
    await revalidatePage(section.page.slug);
    return success(undefined, 'Section saved.');
  } catch (error) {
    return toActionError(error);
  }
}

export async function duplicateSection(sectionId: string): Promise<ActionResult<{ id: string }>> {
  try {
    await authorize('pages.edit');
    const source = await prisma.pageSection.findUnique({
      where: { id: sectionId },
      include: { page: { select: { id: true, slug: true } } },
    });
    if (!source) return failure('That section no longer exists.');

    const copy = await prisma.pageSection.create({
      data: {
        pageId: source.pageId,
        blockType: source.blockType,
        name: source.name ? `${source.name} (copy)` : null,
        sortOrder: source.sortOrder + 5,
        isVisible: source.isVisible,
        content: source.content as object,
        settings: source.settings as object,
      },
    });

    await normaliseOrder(source.pageId);
    revalidatePath(`/admin/pages/${source.pageId}`);
    await revalidatePage(source.page.slug);
    return success({ id: copy.id }, 'Section duplicated.');
  } catch (error) {
    return toActionError(error);
  }
}

export async function deleteSection(sectionId: string): Promise<ActionResult> {
  try {
    await authorize('pages.edit');
    const section = await prisma.pageSection.findUnique({
      where: { id: sectionId },
      include: { page: { select: { id: true, slug: true } } },
    });
    if (!section) return failure('That section no longer exists.');

    await prisma.pageSection.delete({ where: { id: sectionId } });
    revalidatePath(`/admin/pages/${section.page.id}`);
    await revalidatePage(section.page.slug);
    return success(undefined, 'Section removed.');
  } catch (error) {
    return toActionError(error);
  }
}

export async function reorderSections(input: unknown): Promise<ActionResult> {
  try {
    await authorize('pages.edit');
    const { pageId, order } = sectionOrderSchema.parse(input);

    const page = await prisma.page.findUnique({ where: { id: pageId }, select: { slug: true } });
    if (!page) return failure('That page no longer exists.');

    // Reject ids that do not belong to this page.
    const owned = await prisma.pageSection.findMany({ where: { pageId }, select: { id: true } });
    const ownedIds = new Set(owned.map((s) => s.id));
    if (order.some((id) => !ownedIds.has(id))) return failure('Invalid section order.');

    await prisma.$transaction(
      order.map((id, index) =>
        prisma.pageSection.update({ where: { id }, data: { sortOrder: (index + 1) * 10 } }),
      ),
    );

    revalidatePath(`/admin/pages/${pageId}`);
    await revalidatePage(page.slug);
    return success(undefined, 'Order saved.');
  } catch (error) {
    return toActionError(error);
  }
}

async function normaliseOrder(pageId: string) {
  const sections = await prisma.pageSection.findMany({
    where: { pageId },
    orderBy: { sortOrder: 'asc' },
    select: { id: true },
  });
  await prisma.$transaction(
    sections.map((section, index) =>
      prisma.pageSection.update({ where: { id: section.id }, data: { sortOrder: (index + 1) * 10 } }),
    ),
  );
}

export async function toggleSectionVisibility(sectionId: string): Promise<ActionResult> {
  try {
    await authorize('pages.edit');
    const section = await prisma.pageSection.findUnique({
      where: { id: sectionId },
      include: { page: { select: { id: true, slug: true } } },
    });
    if (!section) return failure('That section no longer exists.');

    await prisma.pageSection.update({
      where: { id: sectionId },
      data: { isVisible: !section.isVisible },
    });

    revalidatePath(`/admin/pages/${section.page.id}`);
    await revalidatePage(section.page.slug);
    return success(undefined, section.isVisible ? 'Section hidden.' : 'Section shown.');
  } catch (error) {
    return toActionError(error);
  }
}

const bulkSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(100),
  action: z.enum(['publish', 'draft', 'archive', 'delete']),
});

export async function bulkPageAction(input: unknown): Promise<ActionResult> {
  try {
    const { ids, action } = bulkSchema.parse(input);
    const user =
      action === 'delete'
        ? await authorize('pages.delete')
        : action === 'publish'
          ? await authorize('pages.publish')
          : await authorize('pages.edit');

    const pages = await prisma.page.findMany({ where: { id: { in: ids }, deletedAt: null } });
    const targets = action === 'delete' ? pages.filter((p) => !p.isHomepage) : pages;

    if (action === 'delete') {
      await prisma.$transaction(
        targets.map((page) =>
          prisma.page.update({
            where: { id: page.id },
            data: {
              deletedAt: new Date(),
              status: 'ARCHIVED',
              slug: `${page.slug}-deleted-${Date.now()}`,
            },
          }),
        ),
      );
    } else {
      const status = action === 'publish' ? 'PUBLISHED' : action === 'draft' ? 'DRAFT' : 'ARCHIVED';
      await prisma.page.updateMany({
        where: { id: { in: targets.map((p) => p.id) } },
        data: {
          status,
          ...(status === 'PUBLISHED' ? { publishedAt: new Date() } : {}),
          updatedById: user.id,
        },
      });
    }

    await recordAudit({
      actor: user,
      action: `bulk.${action}`,
      entity: 'Page',
      summary: `${action} applied to ${targets.length} page(s)`,
    });

    revalidatePath('/admin/pages');
    for (const page of targets) await revalidatePage(page.slug);

    const skipped = pages.length - targets.length;
    return success(
      undefined,
      `${targets.length} page(s) updated.${skipped ? ` ${skipped} skipped (homepage).` : ''}`,
    );
  } catch (error) {
    return toActionError(error);
  }
}
