'use server';

import { prisma } from '@/lib/db/prisma';
import { getCurrentUser, userCan } from '@/lib/auth/guards';

export type PickerOption = { value: string; label: string; hint?: string | null };

/** Product options for CMS block pickers. Requires products.view. */
export async function listProductOptions(): Promise<PickerOption[]> {
  const user = await getCurrentUser();
  if (!userCan(user, 'products.view')) return [];

  const rows = await prisma.product.findMany({
    where: { deletedAt: null },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    take: 200,
    select: { id: true, name: true, status: true, sku: true },
  });
  return rows.map((row) => ({
    value: row.id,
    label: row.name,
    hint: [row.sku, row.status.toLowerCase()].filter(Boolean).join(' · '),
  }));
}

export async function listFormOptions(): Promise<PickerOption[]> {
  const user = await getCurrentUser();
  if (!userCan(user, 'forms.view') && !userCan(user, 'pages.edit')) return [];

  const rows = await prisma.form.findMany({
    where: { deletedAt: null },
    orderBy: { name: 'asc' },
    take: 100,
    select: { slug: true, name: true, isActive: true },
  });
  return rows.map((row) => ({
    value: row.slug,
    label: row.name,
    hint: row.isActive ? null : 'inactive',
  }));
}

export async function listProductCategoryOptions(): Promise<PickerOption[]> {
  const user = await getCurrentUser();
  // A page editor needs these to configure a product section, even without
  // full product permissions.
  if (!userCan(user, 'products.view') && !userCan(user, 'pages.edit')) return [];
  const rows = await prisma.productCategory.findMany({
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    select: { id: true, name: true },
  });
  return rows.map((row) => ({ value: row.id, label: row.name }));
}

/** Brand options for the product grid and the product editor. */
export async function listBrandOptions(): Promise<PickerOption[]> {
  const user = await getCurrentUser();
  if (!userCan(user, 'products.view') && !userCan(user, 'pages.edit')) return [];
  const rows = await prisma.brand.findMany({
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    select: { id: true, name: true, _count: { select: { products: true } } },
  });
  return rows.map((row) => ({
    value: row.id,
    label: row.name,
    hint: `${row._count.products} product${row._count.products === 1 ? '' : 's'}`,
  }));
}
