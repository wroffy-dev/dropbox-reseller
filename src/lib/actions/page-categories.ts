'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import { authorize } from '@/lib/auth/guards';
import { recordAudit } from '@/lib/services/audit';
import { pageCategorySchema, pageCategoryOrderSchema } from '@/lib/validation/page';
import { canSetParent } from '@/lib/utils/tree';
import { uniqueSlug, slugify } from '@/lib/utils/slug';
import { sanitizeText } from '@/lib/utils/sanitize';
import { success, failure, toActionError, type ActionResult } from '@/lib/utils/result';

const PARENT_LABELS = {
  self: 'A category cannot be its own parent.',
  cycle: 'That would place a category inside one of its own subcategories.',
  missing: 'That parent category no longer exists.',
};

/** Every category, for cycle checking. Small table, so one read is cheap. */
async function loadTree() {
  return prisma.pageCategory.findMany({ select: { id: true, parentId: true } });
}

export async function savePageCategory(
  categoryId: string | null,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await authorize('pages.edit');

    const input = pageCategorySchema.parse({
      name: formData.get('name'),
      slug: formData.get('slug') || String(formData.get('name') ?? ''),
      description: formData.get('description'),
      parentId: formData.get('parentId'),
      sortOrder: formData.get('sortOrder') || 0,
    });

    // A category may not sit inside itself or inside its own descendants —
    // that makes every recursive read (tree, breadcrumbs) loop forever.
    const parentCheck = canSetParent(await loadTree(), categoryId, input.parentId, PARENT_LABELS);
    if (!parentCheck.ok) return failure(parentCheck.error);

    // Slugs are unique. A new one is de-duplicated automatically; an edited one
    // is checked so the admin is told rather than silently renamed.
    let slug = input.slug || slugify(input.name);
    if (categoryId === null) {
      slug = await uniqueSlug(slug, async (candidate) => {
        const existing = await prisma.pageCategory.findUnique({
          where: { slug: candidate },
          select: { id: true },
        });
        return Boolean(existing);
      });
    } else {
      const clash = await prisma.pageCategory.findFirst({
        where: { slug, NOT: { id: categoryId } },
        select: { id: true },
      });
      if (clash) return failure('Another category already uses that URL slug.');
    }

    const data = {
      name: sanitizeText(input.name),
      slug,
      description: input.description ? sanitizeText(input.description) : null,
      parentId: input.parentId,
      sortOrder: input.sortOrder,
    };

    const category = categoryId
      ? await prisma.pageCategory.update({ where: { id: categoryId }, data })
      : await prisma.pageCategory.create({ data });

    await recordAudit({
      actor: user,
      action: categoryId ? 'updated' : 'created',
      entity: 'PageCategory',
      entityId: category.id,
      summary: `${categoryId ? 'Updated' : 'Created'} page category “${category.name}”`,
    });

    revalidatePath('/admin/pages/categories');
    revalidatePath('/admin/pages');
    return success({ id: category.id }, 'Category saved.');
  } catch (error) {
    return toActionError(error);
  }
}

const deleteSchema = z.object({
  categoryId: z.string().min(1),
  /** Where the category's pages go. Omitted or empty means uncategorised. */
  movePagesTo: z
    .string()
    .max(40)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null)),
});

/**
 * Deletes a category. Its pages are never deleted with it — they are moved to
 * the chosen category, or left uncategorised. Child categories are promoted to
 * the level the deleted category occupied rather than orphaned.
 */
export async function deletePageCategory(input: unknown): Promise<ActionResult> {
  try {
    const user = await authorize('pages.delete');
    const { categoryId, movePagesTo } = deleteSchema.parse(input);

    const category = await prisma.pageCategory.findUnique({
      where: { id: categoryId },
      include: { _count: { select: { pages: true, children: true } } },
    });
    if (!category) return failure('That category no longer exists.');

    if (movePagesTo) {
      if (movePagesTo === categoryId)
        return failure('Choose a different category to move pages to.');
      const target = await prisma.pageCategory.findUnique({
        where: { id: movePagesTo },
        select: { id: true },
      });
      if (!target) return failure('That destination category no longer exists.');
    }

    await prisma.$transaction(async (tx) => {
      await tx.page.updateMany({
        where: { categoryId },
        data: { categoryId: movePagesTo },
      });
      // Children rise to the deleted category's own parent.
      await tx.pageCategory.updateMany({
        where: { parentId: categoryId },
        data: { parentId: category.parentId },
      });
      await tx.pageCategory.delete({ where: { id: categoryId } });
    });

    await recordAudit({
      actor: user,
      action: 'deleted',
      entity: 'PageCategory',
      entityId: categoryId,
      summary:
        `Deleted page category “${category.name}” — ${category._count.pages} page(s) ` +
        `${movePagesTo ? 'moved to another category' : 'left uncategorised'}, ` +
        `${category._count.children} subcategory(ies) promoted`,
    });

    revalidatePath('/admin/pages/categories');
    revalidatePath('/admin/pages');
    return success(
      undefined,
      `Category deleted. ${category._count.pages} page(s) ${movePagesTo ? 'moved' : 'are now uncategorised'}.`,
    );
  } catch (error) {
    return toActionError(error);
  }
}

/** Persists a new display order. Ids are applied in the order given. */
export async function reorderPageCategories(input: unknown): Promise<ActionResult> {
  try {
    const user = await authorize('pages.edit');
    const { ids } = pageCategoryOrderSchema.parse(input);

    await prisma.$transaction(
      ids.map((id, index) =>
        prisma.pageCategory.update({ where: { id }, data: { sortOrder: index * 10 } }),
      ),
    );

    await recordAudit({
      actor: user,
      action: 'reordered',
      entity: 'PageCategory',
      summary: `Reordered ${ids.length} page category(ies)`,
    });

    revalidatePath('/admin/pages/categories');
    return success(undefined, 'Order saved.');
  } catch (error) {
    return toActionError(error);
  }
}
