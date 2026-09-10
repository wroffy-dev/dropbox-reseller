import type { Metadata } from 'next';
import Link from 'next/link';
import { Plus, Tag, ArrowUpDown, Building2 } from 'lucide-react';
import { prisma } from '@/lib/db/prisma';
import { requirePermission, userCan } from '@/lib/auth/guards';
import { AdminPageHeader } from '@/components/admin/page-header';
import { FilterBar } from '@/components/admin/filter-bar';
import type { FilterDefinition, FilterPreset } from '@/lib/admin/filters';
import { AdminPagination } from '@/components/admin/admin-pagination';
import { ProductsTable, type ProductRow } from '@/components/admin/products/products-table';
import { Card } from '@/components/ui/card';
import { ButtonLink, buttonClasses } from '@/components/ui/button';
import { decimalToString } from '@/lib/utils/money';
import type { Prisma } from '@prisma/client';

export const metadata: Metadata = { title: 'Products' };
export const dynamic = 'force-dynamic';

const PER_PAGE = 20;

export default async function ProductsAdmin({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    status?: string;
    category?: string;
    brand?: string;
    featured?: string;
    page?: string;
  }>;
}) {
  const user = await requirePermission('products.view');
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);

  const where: Prisma.ProductWhereInput = { deletedAt: null };
  if (params.q?.trim()) {
    where.OR = [
      { name: { contains: params.q.trim(), mode: 'insensitive' } },
      { slug: { contains: params.q.trim(), mode: 'insensitive' } },
      { sku: { contains: params.q.trim(), mode: 'insensitive' } },
    ];
  }
  if (params.status) where.status = params.status as Prisma.ProductWhereInput['status'];
  if (params.category) where.categoryId = params.category;
  if (params.brand) where.brandId = params.brand;
  if (params.featured === 'yes') where.isFeatured = true;
  if (params.featured === 'no') where.isFeatured = false;

  const [rows, total, categories, brands] = await Promise.all([
    prisma.product.findMany({
      where,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      skip: (page - 1) * PER_PAGE,
      take: PER_PAGE,
      select: {
        id: true,
        name: true,
        slug: true,
        sku: true,
        status: true,
        isFeatured: true,
        storage: true,
        currency: true,
        monthlyPrice: true,
        annualPrice: true,
        category: { select: { name: true } },
        _count: { select: { leads: true } },
      },
    }),
    prisma.product.count({ where }),
    prisma.productCategory.findMany({
      orderBy: { sortOrder: 'asc' },
      select: { id: true, name: true },
    }),
    prisma.brand.findMany({
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
  ]);

  const can = {
    edit: userCan(user, 'products.edit'),
    create: userCan(user, 'products.create'),
    delete: userCan(user, 'products.delete'),
  };

  const tableRows: ProductRow[] = rows.map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    sku: row.sku,
    status: row.status,
    isFeatured: row.isFeatured,
    categoryName: row.category?.name ?? null,
    storage: row.storage,
    currency: row.currency,
    monthlyPrice: decimalToString(row.monthlyPrice),
    annualPrice: decimalToString(row.annualPrice),
    leadCount: row._count.leads,
  }));

  const definitions: FilterDefinition[] = [
    {
      name: 'status',
      label: 'Status',
      allLabel: 'Any status',
      options: [
        { label: 'Published', value: 'PUBLISHED' },
        { label: 'Draft', value: 'DRAFT' },
        { label: 'Scheduled', value: 'SCHEDULED' },
        { label: 'Archived', value: 'ARCHIVED' },
      ],
    },
    {
      name: 'category',
      label: 'Category',
      allLabel: 'Any category',
      options: categories.map((category) => ({
        label: category.name,
        value: category.id,
      })),
    },
    {
      name: 'brand',
      label: 'Brand',
      allLabel: 'Any brand',
      advanced: true,
      options: brands.map((brand) => ({ label: brand.name, value: brand.id })),
    },
    {
      name: 'featured',
      label: 'Featured',
      allLabel: 'Featured or not',
      options: [
        { label: 'Featured only', value: 'yes' },
        { label: 'Not featured', value: 'no' },
      ],
    },
  ];

  const presets: FilterPreset[] = [
    { id: 'all', label: 'All products', params: {} },
    { id: 'published', label: 'Published', params: { status: 'PUBLISHED' } },
    { id: 'drafts', label: 'Drafts', params: { status: 'DRAFT' } },
    { id: 'featured', label: 'Featured', params: { featured: 'yes' } },
  ];

  return (
    <>
      <AdminPageHeader
        title="Products"
        description="Plans shown on the website. Pricing here drives every product card and comparison table."
        crumbs={[{ label: 'Products' }]}
        actions={
          <>
            {can.edit ? (
              <>
                <Link href="/admin/products/order" className={buttonClasses('outline', 'md')}>
                  <ArrowUpDown className="h-4 w-4" aria-hidden="true" />
                  Order
                </Link>
                <Link href="/admin/products/brands" className={buttonClasses('outline', 'md')}>
                  <Building2 className="h-4 w-4" aria-hidden="true" />
                  Brands
                </Link>
                <Link href="/admin/products/categories" className={buttonClasses('outline', 'md')}>
                  <Tag className="h-4 w-4" aria-hidden="true" />
                  Categories
                </Link>
              </>
            ) : null}
            {can.create ? (
              <ButtonLink href="/admin/products/new">
                <Plus className="h-4 w-4" aria-hidden="true" />
                New product
              </ButtonLink>
            ) : null}
          </>
        }
      />

      <FilterBar
        searchPlaceholder="Search products by name or SKU"
        definitions={definitions}
        presets={presets}
      />

      <Card>
        <ProductsTable
          rows={tableRows}
          can={can}
          filtered={Boolean(
            params.q || params.status || params.category || params.brand || params.featured,
          )}
        />
        {tableRows.length > 0 ? (
          <AdminPagination
            page={page}
            pages={Math.max(1, Math.ceil(total / PER_PAGE))}
            total={total}
            basePath="/admin/products"
            params={params}
          />
        ) : null}
      </Card>
    </>
  );
}
