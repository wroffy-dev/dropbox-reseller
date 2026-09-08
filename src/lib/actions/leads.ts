'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/db/prisma';
import { authorize } from '@/lib/auth/guards';
import { recordAudit } from '@/lib/services/audit';
import { logLeadActivity, notifyLeadAssignment } from '@/lib/services/leads';
import {
  leadInputSchema,
  leadNoteSchema,
  leadStatusChangeSchema,
  leadAssignSchema,
  pipelineMoveSchema,
  leadBulkSchema,
} from '@/lib/validation/lead';
import { toCsv } from '@/lib/utils/csv';
import { buildLeadWhere, type LeadFilters } from '@/lib/crm/query';
import { toDecimal } from '@/lib/utils/money';
import { sanitizeText } from '@/lib/utils/sanitize';
import { LEAD_STATUS_LABELS } from '@/lib/crm/constants';
import { success, failure, toActionError, type ActionResult } from '@/lib/utils/result';

function revalidateCrm(leadId?: string) {
  revalidatePath('/admin/leads');
  revalidatePath('/admin/pipeline');
  revalidatePath('/admin');
  if (leadId) revalidatePath(`/admin/leads/${leadId}`);
}

export async function createLead(formData: FormData): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await authorize('leads.create');
    const input = leadInputSchema.parse(Object.fromEntries(formData.entries()));

    const lead = await prisma.lead.create({
      data: {
        name: sanitizeText(input.name),
        email: input.email.toLowerCase(),
        phone: input.phone,
        company: input.company ? sanitizeText(input.company) : null,
        jobTitle: input.jobTitle ? sanitizeText(input.jobTitle) : null,
        message: input.message ? sanitizeText(input.message) : null,
        status: input.status,
        priority: input.priority,
        source: input.source ?? 'Added manually',
        campaign: input.campaign,
        productId: input.productId,
        assignedToId: input.assignedToId,
        customerId: input.customerId,
        followUpAt: input.followUpAt,
        lostReason: input.lostReason,
        value: toDecimal(input.value),
      },
    });

    await logLeadActivity({
      leadId: lead.id,
      type: 'CREATED',
      summary: `Lead added manually by ${user.name}`,
      actorId: user.id,
    });
    await recordAudit({
      actor: user,
      action: 'created',
      entity: 'Lead',
      entityId: lead.id,
      summary: `Created lead “${lead.name}”`,
    });

    revalidateCrm();
    return success({ id: lead.id }, 'Lead created.');
  } catch (error) {
    return toActionError(error);
  }
}

export async function updateLead(leadId: string, formData: FormData): Promise<ActionResult> {
  try {
    const user = await authorize('leads.edit');
    const before = await prisma.lead.findUnique({ where: { id: leadId } });
    if (!before || before.deletedAt) return failure('That lead no longer exists.');

    const input = leadInputSchema.parse(Object.fromEntries(formData.entries()));

    // Assignment changes require the dedicated permission.
    if (input.assignedToId !== before.assignedToId) await authorize('leads.assign');

    const updated = await prisma.lead.update({
      where: { id: leadId },
      data: {
        name: sanitizeText(input.name),
        email: input.email.toLowerCase(),
        phone: input.phone,
        company: input.company ? sanitizeText(input.company) : null,
        jobTitle: input.jobTitle ? sanitizeText(input.jobTitle) : null,
        message: input.message ? sanitizeText(input.message) : null,
        status: input.status,
        priority: input.priority,
        source: input.source,
        campaign: input.campaign,
        productId: input.productId,
        assignedToId: input.assignedToId,
        customerId: input.customerId,
        followUpAt: input.followUpAt,
        lostReason: input.lostReason,
        value: toDecimal(input.value),
      },
    });

    if (before.status !== updated.status) {
      await logLeadActivity({
        leadId,
        type: 'STATUS_CHANGED',
        summary: `Status changed from ${LEAD_STATUS_LABELS[before.status]} to ${LEAD_STATUS_LABELS[updated.status]}`,
        actorId: user.id,
        meta: { from: before.status, to: updated.status },
      });
    }
    if (before.assignedToId !== updated.assignedToId && updated.assignedToId) {
      await logLeadActivity({
        leadId,
        type: 'ASSIGNED',
        summary: 'Lead reassigned',
        actorId: user.id,
      });
      void notifyLeadAssignment({ leadId, assigneeId: updated.assignedToId, actorName: user.name });
    }
    if (before.followUpAt?.getTime() !== updated.followUpAt?.getTime() && updated.followUpAt) {
      await logLeadActivity({
        leadId,
        type: 'FOLLOW_UP_SET',
        summary: `Follow-up set for ${updated.followUpAt.toDateString()}`,
        actorId: user.id,
      });
    }

    await recordAudit({
      actor: user,
      action: 'updated',
      entity: 'Lead',
      entityId: leadId,
      summary: `Updated lead “${updated.name}”`,
      before: { status: before.status, assignedToId: before.assignedToId },
      after: { status: updated.status, assignedToId: updated.assignedToId },
    });

    revalidateCrm(leadId);
    return success(undefined, 'Lead saved.');
  } catch (error) {
    return toActionError(error);
  }
}

export async function changeLeadStatus(input: unknown): Promise<ActionResult> {
  try {
    const user = await authorize('leads.edit');
    const { leadId, status, lostReason } = leadStatusChangeSchema.parse(input);

    const before = await prisma.lead.findUnique({ where: { id: leadId } });
    if (!before || before.deletedAt) return failure('That lead no longer exists.');
    if (before.status === status) return success(undefined, 'No change.');

    await prisma.lead.update({
      where: { id: leadId },
      data: { status, lostReason: status === 'LOST' ? lostReason : before.lostReason },
    });

    await logLeadActivity({
      leadId,
      type: 'STATUS_CHANGED',
      summary: `Status changed from ${LEAD_STATUS_LABELS[before.status]} to ${LEAD_STATUS_LABELS[status]}`,
      actorId: user.id,
      meta: { from: before.status, to: status, reason: lostReason ?? null },
    });
    await recordAudit({
      actor: user,
      action: 'status.changed',
      entity: 'Lead',
      entityId: leadId,
      summary: `${before.name}: ${LEAD_STATUS_LABELS[before.status]} → ${LEAD_STATUS_LABELS[status]}`,
      before: { status: before.status },
      after: { status },
    });

    revalidateCrm(leadId);
    return success(undefined, `Moved to ${LEAD_STATUS_LABELS[status]}.`);
  } catch (error) {
    return toActionError(error);
  }
}

export async function assignLead(input: unknown): Promise<ActionResult> {
  try {
    const user = await authorize('leads.assign');
    const { leadId, assignedToId } = leadAssignSchema.parse(input);

    const lead = await prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead || lead.deletedAt) return failure('That lead no longer exists.');

    if (assignedToId) {
      const assignee = await prisma.user.findFirst({
        where: { id: assignedToId, deletedAt: null, status: 'ACTIVE' },
        select: { id: true, name: true },
      });
      if (!assignee) return failure('That staff member is not available.');
    }

    await prisma.lead.update({ where: { id: leadId }, data: { assignedToId } });

    await logLeadActivity({
      leadId,
      type: 'ASSIGNED',
      summary: assignedToId ? 'Lead assigned' : 'Lead unassigned',
      actorId: user.id,
    });
    if (assignedToId) {
      void notifyLeadAssignment({ leadId, assigneeId: assignedToId, actorName: user.name });
    }

    revalidateCrm(leadId);
    return success(undefined, assignedToId ? 'Lead assigned.' : 'Lead unassigned.');
  } catch (error) {
    return toActionError(error);
  }
}

/** Kanban drag: sets the stage and persists the manual order of the column. */
export async function moveLeadInPipeline(input: unknown): Promise<ActionResult> {
  try {
    const user = await authorize('leads.edit');
    const { leadId, status, order } = pipelineMoveSchema.parse(input);

    const before = await prisma.lead.findUnique({ where: { id: leadId } });
    if (!before || before.deletedAt) return failure('That lead no longer exists.');

    const ids = order.length > 0 ? order : [leadId];
    const owned = await prisma.lead.findMany({
      where: { id: { in: ids }, deletedAt: null },
      select: { id: true },
    });
    const ownedIds = new Set(owned.map((l) => l.id));

    await prisma.$transaction([
      prisma.lead.update({ where: { id: leadId }, data: { status } }),
      ...ids
        .filter((id) => ownedIds.has(id))
        .map((id, index) =>
          prisma.lead.update({ where: { id }, data: { pipelineOrder: (index + 1) * 10 } }),
        ),
    ]);

    if (before.status !== status) {
      await logLeadActivity({
        leadId,
        type: 'STATUS_CHANGED',
        summary: `Moved from ${LEAD_STATUS_LABELS[before.status]} to ${LEAD_STATUS_LABELS[status]}`,
        actorId: user.id,
        meta: { from: before.status, to: status, via: 'pipeline' },
      });
      await recordAudit({
        actor: user,
        action: 'status.changed',
        entity: 'Lead',
        entityId: leadId,
        summary: `${before.name}: ${LEAD_STATUS_LABELS[before.status]} → ${LEAD_STATUS_LABELS[status]}`,
      });
    }

    revalidatePath('/admin/pipeline');
    return success(undefined, `Moved to ${LEAD_STATUS_LABELS[status]}.`);
  } catch (error) {
    return toActionError(error);
  }
}

export async function addLeadNote(input: unknown): Promise<ActionResult> {
  try {
    const user = await authorize('leads.edit');
    const { leadId, body } = leadNoteSchema.parse(input);

    const lead = await prisma.lead.findUnique({ where: { id: leadId }, select: { id: true } });
    if (!lead) return failure('That lead no longer exists.');

    await prisma.leadNote.create({
      data: { leadId, authorId: user.id, body: sanitizeText(body) },
    });
    await logLeadActivity({
      leadId,
      type: 'NOTE_ADDED',
      summary: 'Note added',
      actorId: user.id,
    });

    revalidatePath(`/admin/leads/${leadId}`);
    return success(undefined, 'Note added.');
  } catch (error) {
    return toActionError(error);
  }
}

export async function deleteLead(leadId: string): Promise<ActionResult> {
  try {
    const user = await authorize('leads.delete');
    const lead = await prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead) return failure('That lead no longer exists.');

    await prisma.lead.update({ where: { id: leadId }, data: { deletedAt: new Date() } });

    await recordAudit({
      actor: user,
      action: 'deleted',
      entity: 'Lead',
      entityId: leadId,
      summary: `Deleted lead “${lead.name}”`,
      before: { name: lead.name, email: lead.email, status: lead.status },
    });

    revalidateCrm();
    return success(undefined, 'Lead deleted.');
  } catch (error) {
    return toActionError(error);
  }
}

export async function bulkLeadAction(input: unknown): Promise<ActionResult> {
  try {
    const parsed = leadBulkSchema.parse(input);
    const user =
      parsed.action === 'delete'
        ? await authorize('leads.delete')
        : parsed.action === 'assign'
          ? await authorize('leads.assign')
          : await authorize('leads.edit');

    const leads = await prisma.lead.findMany({
      where: { id: { in: parsed.ids }, deletedAt: null },
      select: { id: true, status: true },
    });
    const ids = leads.map((l) => l.id);
    if (ids.length === 0) return failure('No matching leads.');

    if (parsed.action === 'delete') {
      await prisma.lead.updateMany({ where: { id: { in: ids } }, data: { deletedAt: new Date() } });
    } else if (parsed.action === 'assign') {
      if (parsed.assignedToId) {
        const assignee = await prisma.user.findFirst({
          where: { id: parsed.assignedToId, deletedAt: null, status: 'ACTIVE' },
          select: { id: true },
        });
        if (!assignee) return failure('That staff member is not available.');
      }
      await prisma.lead.updateMany({
        where: { id: { in: ids } },
        data: { assignedToId: parsed.assignedToId ?? null },
      });
      await prisma.leadActivity.createMany({
        data: ids.map((id) => ({
          leadId: id,
          type: 'ASSIGNED' as const,
          summary: parsed.assignedToId ? 'Lead assigned (bulk)' : 'Lead unassigned (bulk)',
          actorId: user.id,
        })),
      });
    } else {
      if (!parsed.status) return failure('Choose a status first.');
      await prisma.lead.updateMany({ where: { id: { in: ids } }, data: { status: parsed.status } });
      await prisma.leadActivity.createMany({
        data: leads
          .filter((lead) => lead.status !== parsed.status)
          .map((lead) => ({
            leadId: lead.id,
            type: 'STATUS_CHANGED' as const,
            summary: `Status changed to ${LEAD_STATUS_LABELS[parsed.status!]} (bulk)`,
            actorId: user.id,
          })),
      });
    }

    await recordAudit({
      actor: user,
      action: `bulk.${parsed.action}`,
      entity: 'Lead',
      summary: `${parsed.action} applied to ${ids.length} lead(s)`,
    });

    revalidateCrm();
    return success(undefined, `${ids.length} lead(s) updated.`);
  } catch (error) {
    return toActionError(error);
  }
}

export async function exportLeads(filters: LeadFilters): Promise<ActionResult<{ csv: string; filename: string }>> {
  try {
    const user = await authorize('leads.export');

    const where = buildLeadWhere(filters);
    const leads = await prisma.lead.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 10_000,
      include: {
        product: { select: { name: true } },
        assignedTo: { select: { name: true } },
        form: { select: { name: true } },
      },
    });

    const header = [
      'reference', 'created_at', 'name', 'email', 'phone', 'company', 'job_title',
      'status', 'priority', 'value', 'source', 'campaign', 'product', 'form',
      'assigned_to', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_term',
      'utm_content', 'first_utm_source', 'first_utm_campaign', 'landing_url',
      'referrer', 'cta_label', 'follow_up_at', 'message',
    ];

    const rows = leads.map((lead) => [
      String(lead.reference),
      lead.createdAt.toISOString(),
      lead.name,
      lead.email,
      lead.phone ?? '',
      lead.company ?? '',
      lead.jobTitle ?? '',
      lead.status,
      lead.priority,
      lead.value?.toString() ?? '',
      lead.source ?? '',
      lead.campaign ?? '',
      lead.product?.name ?? '',
      lead.form?.name ?? '',
      lead.assignedTo?.name ?? '',
      lead.utmSource ?? '',
      lead.utmMedium ?? '',
      lead.utmCampaign ?? '',
      lead.utmTerm ?? '',
      lead.utmContent ?? '',
      lead.firstUtmSource ?? '',
      lead.firstUtmCampaign ?? '',
      lead.landingUrl ?? '',
      lead.referrer ?? '',
      lead.ctaLabel ?? '',
      lead.followUpAt?.toISOString() ?? '',
      (lead.message ?? '').replace(/\s+/g, ' '),
    ]);

    await recordAudit({
      actor: user,
      action: 'exported',
      entity: 'Lead',
      summary: `Exported ${leads.length} lead(s)`,
    });

    return success({
      csv: toCsv([header, ...rows]),
      filename: `leads-${new Date().toISOString().slice(0, 10)}.csv`,
    });
  } catch (error) {
    return toActionError(error);
  }
}

/** Promotes a won lead into a customer record, preserving the lead history. */
export async function convertLeadToCustomer(leadId: string): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await authorize('customers.create');
    const lead = await prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead || lead.deletedAt) return failure('That lead no longer exists.');
    if (lead.customerId) return failure('This lead is already linked to a customer.');

    const existing = await prisma.customer.findFirst({
      where: { email: lead.email.toLowerCase(), deletedAt: null },
    });

    const customer =
      existing ??
      (await prisma.customer.create({
        data: {
          name: lead.name,
          company: lead.company,
          email: lead.email.toLowerCase(),
          phone: lead.phone,
          status: 'ACTIVE',
          assignedToId: lead.assignedToId,
        },
      }));

    await prisma.lead.update({ where: { id: leadId }, data: { customerId: customer.id } });

    if (lead.productId) {
      await prisma.customerProduct.upsert({
        where: { customerId_productId: { customerId: customer.id, productId: lead.productId } },
        update: {},
        create: { customerId: customer.id, productId: lead.productId, quantity: 1 },
      });
    }

    await logLeadActivity({
      leadId,
      type: 'CONVERTED',
      summary: existing ? 'Linked to an existing customer' : 'Converted to a customer',
      actorId: user.id,
    });
    await recordAudit({
      actor: user,
      action: 'converted',
      entity: 'Lead',
      entityId: leadId,
      summary: `Converted “${lead.name}” to customer`,
    });

    revalidateCrm(leadId);
    revalidatePath('/admin/customers');
    return success({ id: customer.id }, existing ? 'Linked to an existing customer.' : 'Customer created.');
  } catch (error) {
    return toActionError(error);
  }
}
