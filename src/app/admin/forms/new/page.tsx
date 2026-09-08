import type { Metadata } from 'next';
import { prisma } from '@/lib/db/prisma';
import { requirePermission } from '@/lib/auth/guards';
import { AdminPageHeader } from '@/components/admin/page-header';
import { FormBuilder, EMPTY_FORM, newField } from '@/components/admin/forms/form-builder';

export const metadata: Metadata = { title: 'New form' };
export const dynamic = 'force-dynamic';

export default async function NewForm() {
  await requirePermission('forms.create');

  const products = await prisma.product.findMany({
    where: { deletedAt: null },
    orderBy: { name: 'asc' },
    select: { id: true, name: true },
  });

  // A sensible starting point: the four fields that map onto a lead.
  const starter = ['NAME', 'EMAIL', 'PHONE', 'COMPANY'].map((type) => {
    const field = newField(type);
    field.name = type.toLowerCase();
    field.label = { NAME: 'Full name', EMAIL: 'Work email', PHONE: 'Phone', COMPANY: 'Company' }[type]!;
    field.isRequired = type === 'NAME' || type === 'EMAIL';
    return field;
  });

  return (
    <>
      <AdminPageHeader
        title="New form"
        description="Add fields, then use this form in a CMS block, a product button or a popup."
        crumbs={[{ label: 'Forms', href: '/admin/forms' }, { label: 'New' }]}
      />
      <FormBuilder
        initial={{ ...EMPTY_FORM, fields: starter }}
        products={products}
        mode="create"
        canEdit
      />
    </>
  );
}
