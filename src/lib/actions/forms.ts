'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';
import { authorize } from '@/lib/auth/guards';
import { recordAudit } from '@/lib/services/audit';
import { formInputSchema, duplicateFieldNames } from '@/lib/validation/form';
import { uniqueSlug, slugify } from '@/lib/utils/slug';
import { sanitizeText } from '@/lib/utils/sanitize';
import { toCsv } from '@/lib/utils/csv';
import { success, failure, toActionError, type ActionResult } from '@/lib/utils/result';
import type { Prisma } from '@prisma/client';

export async function saveForm(
  formId: string | null,
  payload: unknown,
): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await authorize(formId ? 'forms.edit' : 'forms.create');
    const input = formInputSchema.parse(payload);

    const blankNames = input.fields.filter((f) => !f.name);
    if (blankNames.length > 0) {
      return failure('Every field needs a machine name.', {
        fields: ['One or more fields have an empty name'],
      });
    }

    const duplicates = duplicateFieldNames(input.fields);
    if (duplicates.length > 0) {
      return failure(`Duplicate field names: ${duplicates.join(', ')}`, {
        fields: [`These names are used more than once: ${duplicates.join(', ')}`],
      });
    }

    const slug =
      formId === null
        ? await uniqueSlug(input.slug || slugify(input.name), async (candidate) => {
            const existing = await prisma.form.findUnique({
              where: { slug: candidate },
              select: { id: true },
            });
            return Boolean(existing);
          })
        : input.slug;

    if (formId) {
      const clash = await prisma.form.findFirst({
        where: { slug, id: { not: formId } },
        select: { id: true },
      });
      if (clash) return failure('Another form already uses that slug.', { slug: ['This slug is taken'] });
    }

    const data = {
      name: sanitizeText(input.name),
      slug,
      description: input.description ? sanitizeText(input.description) : null,
      isActive: input.isActive,
      submitLabel: sanitizeText(input.submitLabel),
      successMessage: sanitizeText(input.successMessage),
      redirectUrl: input.redirectUrl,
      leadSource: input.leadSource,
      defaultProductId: input.defaultProductId,
      createsLead: input.createsLead,
      notifyEmails: input.notifyEmails,
      consentText: input.consentText ? sanitizeText(input.consentText) : null,
    };

    const form = await prisma.$transaction(async (tx) => {
      const record = formId
        ? await tx.form.update({ where: { id: formId }, data })
        : await tx.form.create({ data });

      const keepIds = input.fields.map((f) => f.id).filter((id): id is string => Boolean(id));
      // Removing a field also removes it from future submissions; historical
      // submission payloads are stored as JSON and keep their original keys.
      await tx.formField.deleteMany({
        where: { formId: record.id, ...(keepIds.length ? { id: { notIn: keepIds } } : {}) },
      });

      for (const [index, field] of input.fields.entries()) {
        const fieldData = {
          formId: record.id,
          type: field.type,
          label: sanitizeText(field.label),
          name: field.name,
          placeholder: field.placeholder,
          helpText: field.helpText,
          defaultValue: field.defaultValue,
          isRequired: field.isRequired,
          width: field.width,
          sortOrder: (index + 1) * 10,
          options: field.options as Prisma.InputJsonValue,
          minLength: field.minLength ?? null,
          maxLength: field.maxLength ?? null,
          pattern: field.pattern,
        };

        if (field.id) {
          await tx.formField.update({ where: { id: field.id }, data: fieldData });
        } else {
          await tx.formField.create({ data: fieldData });
        }
      }

      return record;
    });

    await recordAudit({
      actor: user,
      action: formId ? 'updated' : 'created',
      entity: 'Form',
      entityId: form.id,
      summary: `${formId ? 'Updated' : 'Created'} form “${form.name}” (${input.fields.length} field(s))`,
    });

    revalidatePath('/admin/forms');
    revalidatePath('/', 'layout');
    return success({ id: form.id }, 'Form saved.');
  } catch (error) {
    return toActionError(error);
  }
}

export async function toggleFormActive(formId: string): Promise<ActionResult> {
  try {
    const user = await authorize('forms.edit');
    const form = await prisma.form.findUnique({ where: { id: formId } });
    if (!form) return failure('That form no longer exists.');

    await prisma.form.update({ where: { id: formId }, data: { isActive: !form.isActive } });

    await recordAudit({
      actor: user,
      action: form.isActive ? 'deactivated' : 'activated',
      entity: 'Form',
      entityId: formId,
      summary: `${form.isActive ? 'Deactivated' : 'Activated'} form “${form.name}”`,
    });

    revalidatePath('/admin/forms');
    revalidatePath('/', 'layout');
    return success(undefined, form.isActive ? 'Form deactivated.' : 'Form activated.');
  } catch (error) {
    return toActionError(error);
  }
}

export async function duplicateForm(formId: string): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await authorize('forms.create');
    const source = await prisma.form.findUnique({
      where: { id: formId },
      include: { fields: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!source) return failure('That form no longer exists.');

    const slug = await uniqueSlug(`${source.slug}-copy`, async (candidate) => {
      const existing = await prisma.form.findUnique({ where: { slug: candidate }, select: { id: true } });
      return Boolean(existing);
    });

    const copy = await prisma.form.create({
      data: {
        name: `${source.name} (copy)`,
        slug,
        description: source.description,
        isActive: false,
        submitLabel: source.submitLabel,
        successMessage: source.successMessage,
        redirectUrl: source.redirectUrl,
        leadSource: source.leadSource,
        defaultProductId: source.defaultProductId,
        createsLead: source.createsLead,
        notifyEmails: source.notifyEmails,
        consentText: source.consentText,
        fields: {
          create: source.fields.map((field) => ({
            type: field.type,
            label: field.label,
            name: field.name,
            placeholder: field.placeholder,
            helpText: field.helpText,
            defaultValue: field.defaultValue,
            isRequired: field.isRequired,
            width: field.width,
            sortOrder: field.sortOrder,
            options: field.options as Prisma.InputJsonValue,
            minLength: field.minLength,
            maxLength: field.maxLength,
            pattern: field.pattern,
          })),
        },
      },
    });

    await recordAudit({
      actor: user,
      action: 'duplicated',
      entity: 'Form',
      entityId: copy.id,
      summary: `Duplicated form “${source.name}”`,
    });

    revalidatePath('/admin/forms');
    return success({ id: copy.id }, 'Form duplicated.');
  } catch (error) {
    return toActionError(error);
  }
}

export async function deleteForm(formId: string): Promise<ActionResult> {
  try {
    const user = await authorize('forms.delete');
    const form = await prisma.form.findUnique({
      where: { id: formId },
      include: { _count: { select: { submissions: true, leads: true } } },
    });
    if (!form) return failure('That form no longer exists.');

    // Soft delete: submissions and leads reference the form.
    await prisma.form.update({
      where: { id: formId },
      data: { deletedAt: new Date(), isActive: false, slug: `${form.slug}-deleted-${Date.now()}` },
    });

    await recordAudit({
      actor: user,
      action: 'deleted',
      entity: 'Form',
      entityId: formId,
      summary: `Deleted form “${form.name}” (${form._count.submissions} submission(s) retained)`,
    });

    revalidatePath('/admin/forms');
    revalidatePath('/', 'layout');
    return success(undefined, 'Form deleted. Existing submissions and leads are retained.');
  } catch (error) {
    return toActionError(error);
  }
}

const exportSchema = z.object({ formId: z.string().min(1) });

/** CSV of a form's submissions. Header order follows the current field order. */
export async function exportSubmissions(input: unknown): Promise<ActionResult<{ csv: string; filename: string }>> {
  try {
    const user = await authorize('forms.view');
    const { formId } = exportSchema.parse(input);

    const form = await prisma.form.findUnique({
      where: { id: formId },
      include: { fields: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!form) return failure('That form no longer exists.');

    const submissions = await prisma.formSubmission.findMany({
      where: { formId },
      orderBy: { createdAt: 'desc' },
      take: 5000,
      select: { createdAt: true, data: true, pageUrl: true, referrer: true },
    });

    const columns = form.fields.map((f) => f.name);
    const header = ['submitted_at', ...columns, 'page_url', 'referrer'];
    const rows = submissions.map((submission) => {
      const values = (submission.data ?? {}) as Record<string, unknown>;
      return [
        submission.createdAt.toISOString(),
        ...columns.map((column) => String(values[column] ?? '')),
        submission.pageUrl ?? '',
        submission.referrer ?? '',
      ];
    });

    await recordAudit({
      actor: user,
      action: 'exported',
      entity: 'Form',
      entityId: formId,
      summary: `Exported ${submissions.length} submission(s) from “${form.name}”`,
    });

    return success({
      csv: toCsv([header, ...rows]),
      filename: `${form.slug}-submissions-${new Date().toISOString().slice(0, 10)}.csv`,
    });
  } catch (error) {
    return toActionError(error);
  }
}
