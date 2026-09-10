import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { ExternalLink } from 'lucide-react';
import { prisma } from '@/lib/db/prisma';
import { requirePermission } from '@/lib/auth/guards';
import { AdminPageHeader } from '@/components/admin/page-header';
import { ProductForm, type ProductFormValues } from '@/components/admin/products/product-form';
import { ContentStatusBadge } from '@/components/admin/lead-status-badge';
import { buttonClasses } from '@/components/ui/button';
import { decimalToString } from '@/lib/utils/money';
import type { SpecItem } from '@/components/admin/list-editor';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const product = await prisma.product.findUnique({ where: { id }, select: { name: true } });
  return { title: product ? `Edit ${product.name}` : 'Product' };
}

function toLocalInput(date: Date | null): string {
  if (!date) return '';
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function asStringArray(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.map((v) => String(v)) : [];
}

function asSpecs(raw: unknown): SpecItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((s): s is { label?: unknown; value?: unknown } => typeof s === 'object' && s !== null)
    .map((s) => ({ label: String(s.label ?? ''), value: String(s.value ?? '') }));
}

export default async function EditProduct({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission('products.view');
  const { id } = await params;

  const [product, categories, brands, forms] = await Promise.all([
    prisma.product.findFirst({
      where: { id, deletedAt: null },
      include: { ctaForm: { select: { slug: true } }, _count: { select: { leads: true } } },
    }),
    prisma.productCategory.findMany({
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true },
    }),
    prisma.brand.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }], select: { id: true, name: true } }),
    prisma.form.findMany({ where: { deletedAt: null }, select: { id: true, slug: true } }),
  ]);
  if (!product) notFound();

  const initial: ProductFormValues = {
    id: product.id,
    name: product.name,
    slug: product.slug,
    sku: product.sku ?? '',
    status: product.status,
    publishedAt: toLocalInput(product.publishedAt),
    isFeatured: product.isFeatured,
    sortOrder: String(product.sortOrder),
    featuredOrder: String(product.featuredOrder),
    shortDescription: product.shortDescription ?? '',
    description: product.description ?? '',
    storage: product.storage ?? '',
    minUsers: product.minUsers === null ? '' : String(product.minUsers),
    maxUsers: product.maxUsers === null ? '' : String(product.maxUsers),
    billingPeriod: product.billingPeriod,
    currency: product.currency,
    monthlyPrice: decimalToString(product.monthlyPrice) ?? '',
    annualPrice: decimalToString(product.annualPrice) ?? '',
    compareAtPrice: decimalToString(product.compareAtPrice) ?? '',
    discountPercent: product.discountPercent === null ? '' : String(product.discountPercent),
    priceSuffix: product.priceSuffix ?? '',
    priceNote: product.priceNote ?? '',
    features: asStringArray(product.features),
    benefits: asStringArray(product.benefits),
    specs: asSpecs(product.specs),
    ctaLabel: product.ctaLabel ?? '',
    ctaUrl: product.ctaUrl ?? '',
    ctaFormSlug: product.ctaForm?.slug ?? '',
    imageId: product.imageId,
    galleryIds: asStringArray(product.galleryIds),
    ogImageId: product.ogImageId,
    categoryId: product.categoryId ?? '',
    brandId: product.brandId ?? '',
    seoTitle: product.seoTitle ?? '',
    seoDescription: product.seoDescription ?? '',
    canonicalUrl: product.canonicalUrl ?? '',
    noIndex: product.noIndex,
  };

  return (
    <div className="mx-auto max-w-3xl">
      <AdminPageHeader
        title={product.name}
        description={`${product._count.leads} lead(s) attributed to this product`}
        crumbs={[{ label: 'Products', href: '/admin/products' }, { label: product.name }]}
        actions={
          <>
            <ContentStatusBadge status={product.status} />
            {product.status === 'PUBLISHED' ? (
              <Link
                href={`/products/${product.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className={buttonClasses('outline', 'sm')}
              >
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
                View live
              </Link>
            ) : null}
          </>
        }
      />
      <ProductForm
        initial={initial}
        categories={categories}
        brands={brands}
        formIdBySlug={Object.fromEntries(forms.map((f) => [f.slug, f.id]))}
        mode="edit"
      />
    </div>
  );
}
