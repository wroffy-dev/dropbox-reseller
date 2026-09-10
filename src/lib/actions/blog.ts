'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import { authorize } from '@/lib/auth/guards';
import { recordAudit } from '@/lib/services/audit';
import { canSetParent } from '@/lib/utils/tree';
import { blogPostSchema, blogCategorySchema } from '@/lib/validation/blog';
import { uniqueSlug, slugify } from '@/lib/utils/slug';
import { sanitizeHtml, sanitizeText } from '@/lib/utils/sanitize';
import { readingTimeMinutes, plainExcerpt } from '@/lib/utils/format';
import { success, failure, toActionError, type ActionResult } from '@/lib/utils/result';

function revalidatePost(slug: string) {
  revalidatePath('/blog');
  revalidatePath(`/blog/${slug}`);
  revalidatePath('/sitemap.xml');
}

function readPostForm(formData: FormData) {
  const parseJson = <T>(key: string, fallback: T): T => {
    const raw = formData.get(key);
    if (typeof raw !== 'string' || !raw.trim()) return fallback;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  };

  return blogPostSchema.parse({
    title: formData.get('title'),
    slug: formData.get('slug') || String(formData.get('title') ?? ''),
    status: formData.get('status') || 'DRAFT',
    publishedAt: formData.get('publishedAt') || null,
    excerpt: formData.get('excerpt'),
    content: formData.get('content') ?? '',
    isFeatured: formData.get('isFeatured') === 'true',
    featuredImageId: formData.get('featuredImageId'),
    categoryId: formData.get('categoryId'),
    authorId: formData.get('authorId'),
    tags: parseJson<string[]>('tags', []),
    relatedIds: parseJson<string[]>('relatedIds', []),
    seoTitle: formData.get('seoTitle'),
    seoDescription: formData.get('seoDescription'),
    canonicalUrl: formData.get('canonicalUrl'),
    noIndex: formData.get('noIndex') === 'true',
    ogTitle: formData.get('ogTitle'),
    ogDescription: formData.get('ogDescription'),
    ogImageId: formData.get('ogImageId'),
  });
}

/** Resolves tag names to ids, creating any that do not exist yet. */
async function resolveTagIds(names: string[]): Promise<string[]> {
  const cleaned = Array.from(
    new Set(names.map((name) => sanitizeText(name).trim()).filter(Boolean)),
  ).slice(0, 20);
  const ids: string[] = [];

  for (const name of cleaned) {
    const slug = slugify(name);
    if (!slug) continue;
    const tag = await prisma.blogTag.upsert({
      where: { slug },
      update: {},
      create: { name, slug },
    });
    ids.push(tag.id);
  }
  return ids;
}

export async function createBlogPost(formData: FormData): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await authorize('blog.create');
    const input = readPostForm(formData);
    if (input.status === 'PUBLISHED') await authorize('blog.publish');

    const slug = await uniqueSlug(input.slug || slugify(input.title), async (candidate) => {
      const existing = await prisma.blogPost.findUnique({
        where: { slug: candidate },
        select: { id: true },
      });
      return Boolean(existing);
    });

    const content = sanitizeHtml(input.content);
    const tagIds = await resolveTagIds(input.tags);

    const post = await prisma.blogPost.create({
      data: {
        title: sanitizeText(input.title),
        slug,
        status: input.status,
        publishedAt:
          input.status === 'PUBLISHED' ? (input.publishedAt ?? new Date()) : input.publishedAt,
        excerpt: input.excerpt ? sanitizeText(input.excerpt) : plainExcerpt(content, 200) || null,
        content,
        readingTime: readingTimeMinutes(content),
        isFeatured: input.isFeatured,
        featuredImageId: input.featuredImageId,
        categoryId: input.categoryId,
        authorId: input.authorId ?? user.id,
        seoTitle: input.seoTitle,
        seoDescription: input.seoDescription,
        canonicalUrl: input.canonicalUrl,
        noIndex: input.noIndex,
        ogTitle: input.ogTitle,
        ogDescription: input.ogDescription,
        ogImageId: input.ogImageId,
        tags: { create: tagIds.map((tagId) => ({ tagId })) },
        relatedTo: {
          create: input.relatedIds.map((targetId, index) => ({ targetId, sortOrder: index * 10 })),
        },
      },
    });

    await recordAudit({
      actor: user,
      action: 'created',
      entity: 'BlogPost',
      entityId: post.id,
      summary: `Created post “${post.title}”`,
    });

    revalidatePath('/admin/blog');
    revalidatePost(slug);
    return success({ id: post.id }, 'Post created.');
  } catch (error) {
    return toActionError(error);
  }
}

export async function updateBlogPost(postId: string, formData: FormData): Promise<ActionResult> {
  try {
    const user = await authorize('blog.edit');
    const before = await prisma.blogPost.findUnique({ where: { id: postId } });
    if (!before || before.deletedAt) return failure('That post no longer exists.');

    const input = readPostForm(formData);
    if (input.status === 'PUBLISHED' && before.status !== 'PUBLISHED')
      await authorize('blog.publish');

    const slug = input.slug || before.slug;
    if (slug !== before.slug) {
      const clash = await prisma.blogPost.findFirst({
        where: { slug, id: { not: postId } },
        select: { id: true },
      });
      if (clash)
        return failure('Another post already uses that URL.', { slug: ['This URL is taken'] });
    }

    const content = sanitizeHtml(input.content);
    const tagIds = await resolveTagIds(input.tags);
    // Related posts must not include the post itself.
    const relatedIds = input.relatedIds.filter((id) => id !== postId);

    const updated = await prisma.$transaction(async (tx) => {
      await tx.blogPostTag.deleteMany({ where: { postId } });
      await tx.blogPostRelation.deleteMany({ where: { sourceId: postId } });

      return tx.blogPost.update({
        where: { id: postId },
        data: {
          title: sanitizeText(input.title),
          slug,
          status: input.status,
          publishedAt:
            input.status === 'PUBLISHED'
              ? (input.publishedAt ?? before.publishedAt ?? new Date())
              : input.publishedAt,
          excerpt: input.excerpt ? sanitizeText(input.excerpt) : plainExcerpt(content, 200) || null,
          content,
          readingTime: readingTimeMinutes(content),
          isFeatured: input.isFeatured,
          featuredImageId: input.featuredImageId,
          categoryId: input.categoryId,
          authorId: input.authorId,
          seoTitle: input.seoTitle,
          seoDescription: input.seoDescription,
          canonicalUrl: input.canonicalUrl,
          noIndex: input.noIndex,
          ogTitle: input.ogTitle,
          ogDescription: input.ogDescription,
          ogImageId: input.ogImageId,
          tags: { create: tagIds.map((tagId) => ({ tagId })) },
          relatedTo: {
            create: relatedIds.map((targetId, index) => ({ targetId, sortOrder: index * 10 })),
          },
        },
      });
    });

    await recordAudit({
      actor: user,
      action: 'updated',
      entity: 'BlogPost',
      entityId: postId,
      summary: `Updated post “${updated.title}”`,
      before: { status: before.status, slug: before.slug },
      after: { status: updated.status, slug: updated.slug },
    });

    revalidatePath('/admin/blog');
    revalidatePath(`/admin/blog/${postId}`);
    revalidatePost(before.slug);
    if (slug !== before.slug) revalidatePost(slug);
    return success(undefined, 'Post saved.');
  } catch (error) {
    return toActionError(error);
  }
}

export async function setBlogPostStatus(
  postId: string,
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED',
): Promise<ActionResult> {
  try {
    const user =
      status === 'PUBLISHED' ? await authorize('blog.publish') : await authorize('blog.edit');
    const post = await prisma.blogPost.findUnique({ where: { id: postId } });
    if (!post) return failure('That post no longer exists.');

    await prisma.blogPost.update({
      where: { id: postId },
      data: {
        status,
        publishedAt: status === 'PUBLISHED' ? (post.publishedAt ?? new Date()) : post.publishedAt,
      },
    });

    await recordAudit({
      actor: user,
      action: status.toLowerCase(),
      entity: 'BlogPost',
      entityId: postId,
      summary: `Set “${post.title}” to ${status.toLowerCase()}`,
    });

    revalidatePath('/admin/blog');
    revalidatePost(post.slug);
    return success(undefined, `Post ${status.toLowerCase()}.`);
  } catch (error) {
    return toActionError(error);
  }
}

export async function duplicateBlogPost(postId: string): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await authorize('blog.create');
    const source = await prisma.blogPost.findUnique({
      where: { id: postId },
      include: { tags: true },
    });
    if (!source) return failure('That post no longer exists.');

    const slug = await uniqueSlug(`${source.slug}-copy`, async (candidate) => {
      const existing = await prisma.blogPost.findUnique({
        where: { slug: candidate },
        select: { id: true },
      });
      return Boolean(existing);
    });

    const copy = await prisma.blogPost.create({
      data: {
        title: `${source.title} (copy)`,
        slug,
        status: 'DRAFT',
        excerpt: source.excerpt,
        content: source.content,
        readingTime: source.readingTime,
        isFeatured: false,
        featuredImageId: source.featuredImageId,
        categoryId: source.categoryId,
        authorId: user.id,
        seoTitle: source.seoTitle,
        seoDescription: source.seoDescription,
        ogTitle: source.ogTitle,
        ogDescription: source.ogDescription,
        ogImageId: source.ogImageId,
        tags: { create: source.tags.map((t) => ({ tagId: t.tagId })) },
      },
    });

    await recordAudit({
      actor: user,
      action: 'duplicated',
      entity: 'BlogPost',
      entityId: copy.id,
      summary: `Duplicated post “${source.title}”`,
    });

    revalidatePath('/admin/blog');
    return success({ id: copy.id }, 'Post duplicated.');
  } catch (error) {
    return toActionError(error);
  }
}

export async function deleteBlogPost(postId: string): Promise<ActionResult> {
  try {
    const user = await authorize('blog.delete');
    const post = await prisma.blogPost.findUnique({ where: { id: postId } });
    if (!post) return failure('That post no longer exists.');

    await prisma.blogPost.update({
      where: { id: postId },
      data: {
        deletedAt: new Date(),
        status: 'ARCHIVED',
        slug: `${post.slug}-deleted-${Date.now()}`,
        isFeatured: false,
      },
    });

    await recordAudit({
      actor: user,
      action: 'deleted',
      entity: 'BlogPost',
      entityId: postId,
      summary: `Deleted post “${post.title}”`,
    });

    revalidatePath('/admin/blog');
    revalidatePost(post.slug);
    return success(undefined, 'Post deleted.');
  } catch (error) {
    return toActionError(error);
  }
}

export async function saveBlogCategory(
  categoryId: string | null,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await authorize('blog.edit');
    const input = blogCategorySchema.parse({
      name: formData.get('name'),
      slug: formData.get('slug') || String(formData.get('name') ?? ''),
      description: formData.get('description'),
      parentId: formData.get('parentId'),
      sortOrder: formData.get('sortOrder') || 0,
      seoTitle: formData.get('seoTitle'),
      seoDescription: formData.get('seoDescription'),
    });

    // A category may not sit inside itself or inside one of its own children;
    // a cycle would make the tree and breadcrumb reads loop forever.
    const parentCheck = canSetParent(
      await prisma.blogCategory.findMany({ select: { id: true, parentId: true } }),
      categoryId,
      input.parentId,
      {
        self: 'A category cannot be its own parent.',
        cycle: 'That would place a category inside one of its own subcategories.',
        missing: 'That parent category no longer exists.',
      },
    );
    if (!parentCheck.ok) return failure(parentCheck.error);

    const slug =
      categoryId === null
        ? await uniqueSlug(input.slug || slugify(input.name), async (candidate) => {
            const existing = await prisma.blogCategory.findUnique({
              where: { slug: candidate },
              select: { id: true },
            });
            return Boolean(existing);
          })
        : input.slug;

    const data = {
      name: sanitizeText(input.name),
      slug,
      description: input.description ? sanitizeText(input.description) : null,
      parentId: input.parentId,
      sortOrder: input.sortOrder,
      seoTitle: input.seoTitle,
      seoDescription: input.seoDescription,
    };

    const category = categoryId
      ? await prisma.blogCategory.update({ where: { id: categoryId }, data })
      : await prisma.blogCategory.create({ data });

    await recordAudit({
      actor: user,
      action: categoryId ? 'updated' : 'created',
      entity: 'BlogCategory',
      entityId: category.id,
      summary: `${categoryId ? 'Updated' : 'Created'} category “${category.name}”`,
    });

    revalidatePath('/admin/blog/categories');
    revalidatePath('/blog');
    return success({ id: category.id }, 'Category saved.');
  } catch (error) {
    return toActionError(error);
  }
}

export async function deleteBlogCategory(categoryId: string): Promise<ActionResult> {
  try {
    const user = await authorize('blog.delete');
    const category = await prisma.blogCategory.findUnique({
      where: { id: categoryId },
      include: { _count: { select: { posts: true, children: true } } },
    });
    if (!category) return failure('That category no longer exists.');

    await prisma.$transaction(async (tx) => {
      // Subcategories rise to the deleted category's own parent rather than
      // being orphaned at the root — the hierarchy stays meaningful.
      await tx.blogCategory.updateMany({
        where: { parentId: categoryId },
        data: { parentId: category.parentId },
      });
      await tx.blogCategory.delete({ where: { id: categoryId } });
    });

    await recordAudit({
      actor: user,
      action: 'deleted',
      entity: 'BlogCategory',
      entityId: categoryId,
      summary:
        `Deleted category “${category.name}” — ${category._count.posts} post(s) uncategorised, ` +
        `${category._count.children} subcategory(ies) promoted`,
    });

    revalidatePath('/admin/blog/categories');
    revalidatePath('/blog');
    return success(
      undefined,
      category._count.posts > 0
        ? `Category deleted. ${category._count.posts} post(s) are now uncategorised.`
        : 'Category deleted.',
    );
  } catch (error) {
    return toActionError(error);
  }
}

const bulkSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(100),
  action: z.enum(['publish', 'draft', 'archive', 'delete']),
});

export async function bulkBlogAction(input: unknown): Promise<ActionResult> {
  try {
    const { ids, action } = bulkSchema.parse(input);
    const user =
      action === 'delete'
        ? await authorize('blog.delete')
        : action === 'publish'
          ? await authorize('blog.publish')
          : await authorize('blog.edit');

    const posts = await prisma.blogPost.findMany({ where: { id: { in: ids }, deletedAt: null } });

    if (action === 'delete') {
      await prisma.$transaction(
        posts.map((post) =>
          prisma.blogPost.update({
            where: { id: post.id },
            data: {
              deletedAt: new Date(),
              status: 'ARCHIVED',
              slug: `${post.slug}-deleted-${Date.now()}`,
              isFeatured: false,
            },
          }),
        ),
      );
    } else {
      const status = action === 'publish' ? 'PUBLISHED' : action === 'draft' ? 'DRAFT' : 'ARCHIVED';
      await prisma.blogPost.updateMany({
        where: { id: { in: posts.map((p) => p.id) } },
        data: { status, ...(status === 'PUBLISHED' ? { publishedAt: new Date() } : {}) },
      });
    }

    await recordAudit({
      actor: user,
      action: `bulk.${action}`,
      entity: 'BlogPost',
      summary: `${action} applied to ${posts.length} post(s)`,
    });

    revalidatePath('/admin/blog');
    revalidatePath('/blog');
    return success(undefined, `${posts.length} post(s) updated.`);
  } catch (error) {
    return toActionError(error);
  }
}
