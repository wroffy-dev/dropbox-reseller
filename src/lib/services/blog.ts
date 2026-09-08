import 'server-only';
import { cache } from 'react';
import { prisma } from '@/lib/db/prisma';
import type { Prisma } from '@prisma/client';

/**
 * Evaluated per call so `new Date()` reflects the current request rather than
 * the moment the module was first imported.
 */
export function publishedPostWhere() {
  return {
    deletedAt: null,
    status: 'PUBLISHED' as const,
    OR: [{ publishedAt: null }, { publishedAt: { lte: new Date() } }],
  };
}

export const POSTS_PER_PAGE = 9;

const listSelect = {
  id: true,
  title: true,
  slug: true,
  excerpt: true,
  publishedAt: true,
  readingTime: true,
  isFeatured: true,
  featuredImage: { select: { url: true, altText: true, width: true, height: true } },
  category: { select: { name: true, slug: true } },
  author: { select: { name: true, image: true } },
} satisfies Prisma.BlogPostSelect;

export type BlogListItem = Prisma.BlogPostGetPayload<{ select: typeof listSelect }>;

export async function listPosts(options: {
  page?: number;
  categorySlug?: string;
  tagSlug?: string;
  query?: string;
  perPage?: number;
}): Promise<{ posts: BlogListItem[]; total: number; pages: number; page: number }> {
  const perPage = options.perPage ?? POSTS_PER_PAGE;
  const page = Math.max(1, options.page ?? 1);

  const where: Prisma.BlogPostWhereInput = { ...publishedPostWhere() };
  if (options.categorySlug) where.category = { slug: options.categorySlug };
  if (options.tagSlug) where.tags = { some: { tag: { slug: options.tagSlug } } };
  if (options.query?.trim()) {
    const q = options.query.trim();
    where.AND = [
      {
        OR: [
          { title: { contains: q, mode: 'insensitive' } },
          { excerpt: { contains: q, mode: 'insensitive' } },
          { content: { contains: q, mode: 'insensitive' } },
        ],
      },
    ];
  }

  const [posts, total] = await Promise.all([
    prisma.blogPost.findMany({
      where,
      orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
      skip: (page - 1) * perPage,
      take: perPage,
      select: listSelect,
    }),
    prisma.blogPost.count({ where }),
  ]);

  return { posts, total, pages: Math.max(1, Math.ceil(total / perPage)), page };
}

export const getPublishedPost = cache(async (slug: string) => {
  return prisma.blogPost.findFirst({
    where: { ...publishedPostWhere(), slug },
    include: {
      featuredImage: true,
      ogImage: { select: { url: true } },
      category: true,
      author: { select: { name: true, image: true, jobTitle: true } },
      tags: { include: { tag: true } },
      relatedTo: {
        orderBy: { sortOrder: 'asc' },
        include: { target: { select: listSelect } },
      },
    },
  });
});

/** Explicit related posts, topped up with same-category posts. */
export async function getRelatedPosts(postId: string, categoryId: string | null, limit = 3) {
  const explicit = await prisma.blogPostRelation.findMany({
    where: { sourceId: postId, target: publishedPostWhere() },
    orderBy: { sortOrder: 'asc' },
    take: limit,
    include: { target: { select: listSelect } },
  });

  const results = explicit.map((r) => r.target);
  if (results.length >= limit) return results;

  const filler = await prisma.blogPost.findMany({
    where: {
      ...publishedPostWhere(),
      id: { notIn: [postId, ...results.map((r) => r.id)] },
      ...(categoryId ? { categoryId } : {}),
    },
    orderBy: [{ publishedAt: 'desc' }],
    take: limit - results.length,
    select: listSelect,
  });

  return [...results, ...filler];
}

export const getBlogCategories = cache(async () => {
  return prisma.blogCategory.findMany({
    where: { posts: { some: publishedPostWhere() } },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      _count: { select: { posts: { where: publishedPostWhere() } } },
    },
  });
});
