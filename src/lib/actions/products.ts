'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { authorize } from '@/lib/auth/guards';
import { recordAudit } from '@/lib/services/audit';
import { productInputSchema, productCategorySchema } from '@/lib/validation/product';
import { uniqueSlug, slugify } from '@/lib/utils/slug';
import { toDecimal } from '@/lib/utils/money';
import { sanitizeHtml, sanitizeText } from '@/lib/utils/sanitize';
import { success, failure, toActionError, type ActionResult } from '@/lib/utils/result';

function revalidateProduct(slug: string) {
  revalidatePath(`/products/${slug}`);
  revalidatePath('/sitemap.xml');
  // Product blocks appear on CMS pages, so the whole public tree is affected.
  revalidatePath('/', 'layout');
}

/** Parses the multi-value fields that arrive as JSON strings from the form. */
function parseJsonField<T>(raw: FormDataEntryValue | null, fallback: T): T {
  if (typeof raw !== 'string' || !raw.trim()) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function readProductForm(formData: FormData) {
  return productInputSchema.parse({
    name: formData.get('name'),
    slug: formData.get('slug') || String(formData.get('name') ?? ''),
    sku: formData.get('sku'),
    status: formData.get('status') || 'DRAFT',
    publishedAt: formData.get('publishedAt') || null,
    isFeatured: formData.get('isFeatured') === 'true',
    sortOrder: formData.get('sortOrder') || 0,
    shortDescription: formData.get('shortDescription'),
    description: formData.get('description'),
    storage: formData.get('storage'),
    minUsers: formData.get('minUsers'),
    maxUsers: formData.get('maxUsers'),
    billingPeriod: formData.get('billingPeriod') || 'BOTH',
    currency: formData.get('currency') || 'INR',
    monthlyPrice: formData.get('monthlyPrice'),
    annualPrice: formData.get('annualPrice'),
    compareAtPrice: formData.get('compareAtPrice'),
    discountPercent: formData.get('discountPercent'),
    priceSuffix: formData.get('priceSuffix'),
    priceNote: formData.get('priceNote'),
    features: parseJsonField<string[]>(formData.get('features'), []),
    benefits: parseJsonField<string[]>(formData.get('benefits'), []),
    specs: parseJsonField<Array<{ label: string; value: string }>>(formData.get('specs'), []),
    ctaLabel: formData.get('ctaLabel'),
    ctaUrl: formData.get('ctaUrl'),
    ctaFormId: formData.get('ctaFormId'),
    imageId: formData.get('imageId'),
    galleryIds: parseJsonField<string[]>(formData.get('galleryIds'), []),
    categoryId: formData.get('categoryId'),
    seoTitle: formData.get('seoTitle'),
    seoDescription: formData.get('seoDescription'),
    canonicalUrl: formData.get('canonicalUrl'),
    noIndex: formData.get('noIndex') === 'true',
    ogImageId: formData.get('ogImageId'),
  });
}

function toPrismaData(input: ReturnType<typeof readProductForm>) {
  return {
    name: sanitizeText(input.name),
    sku: input.sku,
    status: input.status,
    isFeatured: input.isFeatured,
    sortOrder: input.sortOrder,
    shortDescription: input.shortDescription ? sanitizeText(input.shortDescription) : null,
    description: input.description ? sanitizeHtml(input.description) : null,
    storage: input.storage,
    minUsers: input.minUsers,
    maxUsers: input.maxUsers,
    billingPeriod: input.billingPeriod,
    currency: input.currency.toUpperCase(),
    monthlyPrice: toDecimal(input.monthlyPrice),
    annualPrice: toDecimal(input.annualPrice),
    compareAtPrice: toDecimal(input.compareAtPrice),
    discountPercent: input.discountPercent,
    priceSuffix: input.priceSuffix,
    priceNote: input.priceNote,
    features: input.features.map((f) => sanitizeText(f)).filter(Boolean) as Prisma.InputJsonValue,
    benefits: input.benefits.map((b) => sanitizeText(b)).filter(Boolean) as Prisma.InputJsonValue,
    specs: input.specs
      .map((s) => ({ label: sanitizeText(s.label), value: sanitizeText(s.value) }))
      .filter((s) => s.label) as Prisma.InputJsonValue,
    ctaLabel: input.ctaLabel,
    ctaUrl: input.ctaUrl,
    ctaFormId: input.ctaFormId,
    imageId: input.imageId,
    galleryIds: input.galleryIds as Prisma.InputJsonValue,
    categoryId: input.categoryId,
    seoTitle: input.seoTitle,
    seoDescription: input.seoDescription,
    canonicalUrl: input.canonicalUrl,
    noIndex: input.noIndex,
    ogImageId: input.ogImageId,
  };
}

export async function createProduct(formData: FormData): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await authorize('products.create');
    const input = readProductForm(formData);

    const slug = await uniqueSlug(input.slug || slugify(input.name), async (candidate) => {
      const existing = await prisma.product.findUnique({
        where: { slug: candidate },
        select: { id: true },
      });
      return Boolean(existing);
    });

    const product = await prisma.product.create({
      data: {
        ...toPrismaData(input),
        slug,
        publishedAt: input.status === 'PUBLISHED' ? (input.publishedAt ?? new Date()) : input.publishedAt,
        createdById: user.id,
        updatedById: user.id,
      },
    });

    await recordAudit({
      actor: user,
      action: 'created',
      entity: 'Product',
      entityId: product.id,
      summary: `Created product “${product.name}”`,
      after: { name: product.name, slug: product.slug, status: product.status },
    });

    revalidatePath('/admin/products');
    revalidateProduct(slug);
    return success({ id: product.id }, 'Product created.');
  } catch (error) {
    return toActionError(error);
  }
}

export async function updateProduct(productId: string, formData: FormData): Promise<ActionResult> {
  try {
    const user = await authorize('products.edit');
    const before = await prisma.product.findUnique({ where: { id: productId } });
    if (!before || before.deletedAt) return failure('That product no longer exists.');

    const input = readProductForm(formData);
    const slug = input.slug || before.slug;

    if (slug !== before.slug) {
      const clash = await prisma.product.findFirst({
        where: { slug, id: { not: productId } },
        select: { id: true },
      });
      if (clash) return failure('Another product already uses that URL.', { slug: ['This URL is taken'] });
    }

    const updated = await prisma.product.update({
      where: { id: productId },
      data: {
        ...toPrismaData(input),
        slug,
        publishedAt:
          input.status === 'PUBLISHED'
            ? (input.publishedAt ?? before.publishedAt ?? new Date())
            : input.publishedAt,
        updatedById: user.id,
      },
    });

    await recordAudit({
      actor: user,
      action: 'updated',
      entity: 'Product',
      entityId: productId,
      summary: `Updated product “${updated.name}”`,
      before: {
        name: before.name,
        status: before.status,
        monthlyPrice: before.monthlyPrice?.toString() ?? null,
        annualPrice: before.annualPrice?.toString() ?? null,
      },
      after: {
        name: updated.name,
        status: updated.status,
        monthlyPrice: updated.monthlyPrice?.toString() ?? null,
        annualPrice: updated.annualPrice?.toString() ?? null,
      },
    });

    revalidatePath('/admin/products');
    revalidatePath(`/admin/products/${productId}`);
    revalidateProduct(before.slug);
    if (slug !== before.slug) revalidateProduct(slug);
    return success(undefined, 'Product saved.');
  } catch (error) {
    return toActionError(error);
  }
}

export async function setProductStatus(
  productId: string,
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED',
): Promise<ActionResult> {
  try {
    const user = await authorize('products.edit');
    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) return failure('That product no longer exists.');

    await prisma.product.update({
      where: { id: productId },
      data: {
        status,
        publishedAt: status === 'PUBLISHED' ? (product.publishedAt ?? new Date()) : product.publishedAt,
        updatedById: user.id,
      },
    });

    await recordAudit({
      actor: user,
      action: status.toLowerCase(),
      entity: 'Product',
      entityId: productId,
      summary: `Set “${product.name}” to ${status.toLowerCase()}`,
    });

    revalidatePath('/admin/products');
    revalidateProduct(product.slug);
    return success(undefined, `Product ${status.toLowerCase()}.`);
  } catch (error) {
    return toActionError(error);
  }
}

export async function toggleProductFeatured(productId: string): Promise<ActionResult> {
  try {
    const user = await authorize('products.edit');
    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) return failure('That product no longer exists.');

    await prisma.product.update({
      where: { id: productId },
      data: { isFeatured: !product.isFeatured, updatedById: user.id },
    });

    revalidatePath('/admin/products');
    revalidateProduct(product.slug);
    return success(undefined, product.isFeatured ? 'Removed from featured.' : 'Marked as featured.');
  } catch (error) {
    return toActionError(error);
  }
}

export async function duplicateProduct(productId: string): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await authorize('products.create');
    const source = await prisma.product.findUnique({
      where: { id: productId },
      include: { variants: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!source) return failure('That product no longer exists.');

    const slug = await uniqueSlug(`${source.slug}-copy`, async (candidate) => {
      const existing = await prisma.product.findUnique({
        where: { slug: candidate },
        select: { id: true },
      });
      return Boolean(existing);
    });

    const { id, createdAt, updatedAt, sku, ...rest } = source;
    void id;
    void createdAt;
    void updatedAt;

    const copy = await prisma.product.create({
      data: {
        ...rest,
        variants: undefined,
        name: `${source.name} (copy)`,
        slug,
        sku: sku ? `${sku}-COPY` : null,
        status: 'DRAFT',
        isFeatured: false,
        publishedAt: null,
        createdById: user.id,
        updatedById: user.id,
        features: source.features as Prisma.InputJsonValue,
        benefits: source.benefits as Prisma.InputJsonValue,
        specs: source.specs as Prisma.InputJsonValue,
        galleryIds: source.galleryIds as Prisma.InputJsonValue,
      },
    });

    if (source.variants.length > 0) {
      await prisma.productVariant.createMany({
        data: source.variants.map((variant) => ({
          productId: copy.id,
          name: variant.name,
          sku: null,
          storage: variant.storage,
          users: variant.users,
          monthlyPrice: variant.monthlyPrice,
          annualPrice: variant.annualPrice,
          sortOrder: variant.sortOrder,
          isDefault: variant.isDefault,
        })),
      });
    }

    await recordAudit({
      actor: user,
      action: 'duplicated',
      entity: 'Product',
      entityId: copy.id,
      summary: `Duplicated “${source.name}”`,
    });

    revalidatePath('/admin/products');
    return success({ id: copy.id }, 'Product duplicated.');
  } catch (error) {
    return toActionError(error);
  }
}

export async function deleteProduct(productId: string): Promise<ActionResult> {
  try {
    const user = await authorize('products.delete');
    const product = await prisma.product.findUnique({ where: { id: productId } });
    if (!product) return failure('That product no longer exists.');

    // Soft delete: leads reference the product and must keep their attribution.
    await prisma.product.update({
      where: { id: productId },
      data: {
        deletedAt: new Date(),
        status: 'ARCHIVED',
        slug: `${product.slug}-deleted-${Date.now()}`,
        isFeatured: false,
      },
    });

    await recordAudit({
      actor: user,
      action: 'deleted',
      entity: 'Product',
      entityId: productId,
      summary: `Deleted product “${product.name}”`,
    });

    revalidatePath('/admin/products');
    revalidateProduct(product.slug);
    return success(undefined, 'Product deleted.');
  } catch (error) {
    return toActionError(error);
  }
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export async function saveProductCategory(
  categoryId: string | null,
  formData: FormData,
): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await authorize('products.edit');
    const input = productCategorySchema.parse({
      name: formData.get('name'),
      slug: formData.get('slug') || String(formData.get('name') ?? ''),
      description: formData.get('description'),
      sortOrder: formData.get('sortOrder') || 0,
      imageId: formData.get('imageId'),
    });

    const slug =
      categoryId === null
        ? await uniqueSlug(input.slug || slugify(input.name), async (candidate) => {
            const existing = await prisma.productCategory.findUnique({
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
      sortOrder: input.sortOrder,
      imageId: input.imageId,
    };

    const category = categoryId
      ? await prisma.productCategory.update({ where: { id: categoryId }, data })
      : await prisma.productCategory.create({ data });

    await recordAudit({
      actor: user,
      action: categoryId ? 'updated' : 'created',
      entity: 'ProductCategory',
      entityId: category.id,
      summary: `${categoryId ? 'Updated' : 'Created'} category “${category.name}”`,
    });

    revalidatePath('/admin/products/categories');
    revalidatePath('/', 'layout');
    return success({ id: category.id }, 'Category saved.');
  } catch (error) {
    return toActionError(error);
  }
}

export async function deleteProductCategory(categoryId: string): Promise<ActionResult> {
  try {
    const user = await authorize('products.delete');
    const category = await prisma.productCategory.findUnique({
      where: { id: categoryId },
      include: { _count: { select: { products: true } } },
    });
    if (!category) return failure('That category no longer exists.');

    // Products survive: the relation is set to null by the schema.
    await prisma.productCategory.delete({ where: { id: categoryId } });

    await recordAudit({
      actor: user,
      action: 'deleted',
      entity: 'ProductCategory',
      entityId: categoryId,
      summary: `Deleted category “${category.name}” (${category._count.products} product(s) uncategorised)`,
    });

    revalidatePath('/admin/products/categories');
    return success(
      undefined,
      category._count.products > 0
        ? `Category deleted. ${category._count.products} product(s) are now uncategorised.`
        : 'Category deleted.',
    );
  } catch (error) {
    return toActionError(error);
  }
}

const bulkSchema = z.object({
  ids: z.array(z.string().min(1)).min(1).max(100),
  action: z.enum(['publish', 'draft', 'archive', 'feature', 'unfeature', 'delete']),
});

export async function bulkProductAction(input: unknown): Promise<ActionResult> {
  try {
    const { ids, action } = bulkSchema.parse(input);
    const user =
      action === 'delete' ? await authorize('products.delete') : await authorize('products.edit');

    const products = await prisma.product.findMany({ where: { id: { in: ids }, deletedAt: null } });

    if (action === 'delete') {
      await prisma.$transaction(
        products.map((product) =>
          prisma.product.update({
            where: { id: product.id },
            data: {
              deletedAt: new Date(),
              status: 'ARCHIVED',
              slug: `${product.slug}-deleted-${Date.now()}`,
              isFeatured: false,
            },
          }),
        ),
      );
    } else if (action === 'feature' || action === 'unfeature') {
      await prisma.product.updateMany({
        where: { id: { in: products.map((p) => p.id) } },
        data: { isFeatured: action === 'feature', updatedById: user.id },
      });
    } else {
      const status = action === 'publish' ? 'PUBLISHED' : action === 'draft' ? 'DRAFT' : 'ARCHIVED';
      await prisma.product.updateMany({
        where: { id: { in: products.map((p) => p.id) } },
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
      entity: 'Product',
      summary: `${action} applied to ${products.length} product(s)`,
    });

    revalidatePath('/admin/products');
    revalidatePath('/', 'layout');
    return success(undefined, `${products.length} product(s) updated.`);
  } catch (error) {
    return toActionError(error);
  }
}
