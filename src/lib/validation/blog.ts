import { z } from 'zod';
import { slugify } from '@/lib/utils/slug';

const optional = (max: number) =>
  z
    .string()
    .max(max)
    .transform((v) => v.trim())
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

export const blogPostSchema = z
  .object({
    title: z.string().trim().min(1, 'Title is required').max(240),
    slug: z
      .string()
      .max(240)
      .transform((v) => slugify(v)),
    status: z.enum(['DRAFT', 'PUBLISHED', 'SCHEDULED', 'ARCHIVED']).default('DRAFT'),
    publishedAt: z
      .string()
      .optional()
      .nullable()
      .transform((v) => (v ? new Date(v) : null))
      .refine((d) => d === null || !Number.isNaN(d.getTime()), 'Enter a valid date'),
    excerpt: optional(600),
    content: z.string().max(200_000).default(''),
    isFeatured: z.coerce.boolean().default(false),
    featuredImageId: optional(40),
    categoryId: optional(40),
    authorId: optional(40),
    tags: z.array(z.string().max(60)).max(20).default([]),
    relatedIds: z.array(z.string().max(40)).max(6).default([]),

    seoTitle: optional(240),
    seoDescription: optional(400),
    canonicalUrl: optional(500),
    noIndex: z.coerce.boolean().default(false),
    ogTitle: optional(240),
    ogDescription: optional(400),
    ogImageId: optional(40),
  })
  .refine((data) => data.status !== 'SCHEDULED' || data.publishedAt !== null, {
    message: 'A scheduled post needs a publish date',
    path: ['publishedAt'],
  });

export const blogCategorySchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  /** Optional parent, e.g. Microsoft → Azure. Empty means top level. */
  parentId: z
    .string()
    .max(40)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null)),
  slug: z
    .string()
    .max(160)
    .transform((v) => slugify(v)),
  description: optional(1000),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
  seoTitle: optional(240),
  seoDescription: optional(400),
});

/** A blog tag. Slug uniqueness is enforced in the action. */
export const blogTagSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(80),
  slug: z
    .string()
    .max(120)
    .transform((v) => slugify(v)),
});

export type BlogTagInput = z.infer<typeof blogTagSchema>;

export const blogCategoryOrderSchema = z.object({
  ids: z.array(z.string().min(1)).max(500),
});
