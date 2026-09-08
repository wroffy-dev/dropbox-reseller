import 'server-only';
import { cache } from 'react';
import { prisma } from '@/lib/db/prisma';
import { decimalToString } from '@/lib/utils/money';
import type { Prisma } from '@prisma/client';

export type PublicProduct = {
  id: string;
  name: string;
  slug: string;
  sku: string | null;
  shortDescription: string | null;
  description: string | null;
  storage: string | null;
  minUsers: number | null;
  maxUsers: number | null;
  currency: string;
  monthlyPrice: string | null;
  annualPrice: string | null;
  compareAtPrice: string | null;
  discountPercent: number | null;
  priceSuffix: string | null;
  priceNote: string | null;
  isFeatured: boolean;
  features: string[];
  benefits: string[];
  specs: Array<{ label: string; value: string }>;
  ctaLabel: string;
  ctaUrl: string | null;
  ctaFormSlug: string | null;
  imageUrl: string | null;
  imageAlt: string | null;
  galleryIds: string[];
  categoryName: string | null;
};

const productSelect = {
  id: true,
  name: true,
  slug: true,
  sku: true,
  shortDescription: true,
  description: true,
  storage: true,
  minUsers: true,
  maxUsers: true,
  currency: true,
  monthlyPrice: true,
  annualPrice: true,
  compareAtPrice: true,
  discountPercent: true,
  priceSuffix: true,
  priceNote: true,
  isFeatured: true,
  features: true,
  benefits: true,
  specs: true,
  ctaLabel: true,
  ctaUrl: true,
  ctaForm: { select: { slug: true, isActive: true } },
  image: { select: { url: true, altText: true } },
  galleryIds: true,
  category: { select: { name: true } },
} satisfies Prisma.ProductSelect;

type ProductRow = Prisma.ProductGetPayload<{ select: typeof productSelect }>;

function toStringArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((v) => String(v)).filter(Boolean);
}

function toSpecs(raw: unknown): Array<{ label: string; value: string }> {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((s): s is { label?: unknown; value?: unknown } => typeof s === 'object' && s !== null)
    .map((s) => ({ label: String(s.label ?? ''), value: String(s.value ?? '') }))
    .filter((s) => s.label);
}

export function toPublicProduct(row: ProductRow): PublicProduct {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    sku: row.sku,
    shortDescription: row.shortDescription,
    description: row.description,
    storage: row.storage,
    minUsers: row.minUsers,
    maxUsers: row.maxUsers,
    currency: row.currency,
    monthlyPrice: decimalToString(row.monthlyPrice),
    annualPrice: decimalToString(row.annualPrice),
    compareAtPrice: decimalToString(row.compareAtPrice),
    discountPercent: row.discountPercent,
    priceSuffix: row.priceSuffix,
    priceNote: row.priceNote,
    isFeatured: row.isFeatured,
    features: toStringArray(row.features),
    benefits: toStringArray(row.benefits),
    specs: toSpecs(row.specs),
    ctaLabel: row.ctaLabel || 'Get Started',
    ctaUrl: row.ctaUrl,
    ctaFormSlug: row.ctaForm?.isActive ? row.ctaForm.slug : null,
    imageUrl: row.image?.url ?? null,
    imageAlt: row.image?.altText ?? row.name,
    galleryIds: toStringArray(row.galleryIds),
    categoryName: row.category?.name ?? null,
  };
}

/**
 * Evaluated per call so `new Date()` reflects the current request rather than
 * the moment the module was first imported.
 */
export function publishedProductWhere(): Prisma.ProductWhereInput {
  return {
    status: 'PUBLISHED',
    deletedAt: null,
    OR: [{ publishedAt: null }, { publishedAt: { lte: new Date() } }],
  };
}

export type ProductSelection = {
  source: 'featured' | 'all' | 'category' | 'selected' | 'latest';
  productIds?: string[];
  categoryId?: string | null;
  limit?: number;
};

/** Resolves the product-source configuration shared by the product blocks. */
export const selectProducts = cache(
  async (selection: ProductSelection): Promise<PublicProduct[]> => {
    const take = Math.min(Math.max(selection.limit ?? 3, 1), 24);

    if (selection.source === 'selected') {
      const ids = selection.productIds ?? [];
      if (ids.length === 0) return [];
      const rows = await prisma.product.findMany({
        where: { ...publishedProductWhere(), id: { in: ids } },
        select: productSelect,
      });
      // Preserve the admin's hand-picked order.
      const byId = new Map(rows.map((r) => [r.id, r]));
      return ids
        .map((id) => byId.get(id))
        .filter((r): r is ProductRow => Boolean(r))
        .slice(0, take)
        .map(toPublicProduct);
    }

    const where: Prisma.ProductWhereInput = { ...publishedProductWhere() };
    if (selection.source === 'featured') where.isFeatured = true;
    if (selection.source === 'category' && selection.categoryId) where.categoryId = selection.categoryId;

    const orderBy: Prisma.ProductOrderByWithRelationInput[] =
      selection.source === 'latest'
        ? [{ publishedAt: 'desc' }, { createdAt: 'desc' }]
        : [{ sortOrder: 'asc' }, { name: 'asc' }];

    const rows = await prisma.product.findMany({ where, orderBy, take, select: productSelect });
    return rows.map(toPublicProduct);
  },
);

export const getPublicProduct = cache(async (slug: string): Promise<PublicProduct | null> => {
  const row = await prisma.product.findFirst({
    where: { ...publishedProductWhere(), slug },
    select: productSelect,
  });
  return row ? toPublicProduct(row) : null;
});
