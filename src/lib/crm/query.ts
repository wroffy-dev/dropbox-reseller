import type { Prisma } from '@prisma/client';

/**
 * Every filter the lead list, pipeline and CSV export understand.
 *
 * Each key maps onto a column the Lead model already stores, so nothing here
 * needed a schema change. Filters always combine with AND — choosing
 * "Qualified" and "Google" means leads that are both.
 */
export type LeadFilters = {
  q?: string;
  status?: string;
  assignedTo?: string;
  productId?: string;
  formId?: string;
  pageId?: string;
  /** Last-touch utm_source. */
  source?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmContent?: string;
  /** The free-text `source` column (e.g. "Contact form"). */
  leadSource?: string;
  /** 'due' = follow-up on or before today, 'set' = has one, 'none' = has none. */
  followUp?: string;
  /** Filter dates against creation or last update. */
  dateField?: string;
  from?: string;
  to?: string;
  sort?: string;
  dir?: string;
};

/** End of the given day, so a `to` filter includes everything that day. */
function endOfDay(value: string): Date {
  const date = new Date(value);
  date.setHours(23, 59, 59, 999);
  return date;
}

function endOfToday(): Date {
  const date = new Date();
  date.setHours(23, 59, 59, 999);
  return date;
}

/** Statuses that mean the lead is no longer being worked. */
const CLOSED_STATUSES = ['WON', 'LOST', 'SPAM'] as const;

/** Shared filter builder used by the lead list, the pipeline and the CSV export. */
export function buildLeadWhere(filters: LeadFilters): Prisma.LeadWhereInput {
  const where: Prisma.LeadWhereInput = { deletedAt: null };
  const and: Prisma.LeadWhereInput[] = [];

  if (filters.q?.trim()) {
    const q = filters.q.trim();
    where.OR = [
      { name: { contains: q, mode: 'insensitive' } },
      { email: { contains: q, mode: 'insensitive' } },
      { company: { contains: q, mode: 'insensitive' } },
      { phone: { contains: q, mode: 'insensitive' } },
      { message: { contains: q, mode: 'insensitive' } },
    ];
  }

  if (filters.status) where.status = filters.status as Prisma.LeadWhereInput['status'];

  if (filters.assignedTo === 'unassigned') where.assignedToId = null;
  else if (filters.assignedTo === 'assigned') where.assignedToId = { not: null };
  else if (filters.assignedTo) where.assignedToId = filters.assignedTo;

  if (filters.productId) where.productId = filters.productId;
  if (filters.formId) where.formId = filters.formId;
  if (filters.pageId) where.landingPageId = filters.pageId;

  if (filters.source) where.utmSource = filters.source;
  if (filters.utmMedium) where.utmMedium = filters.utmMedium;
  if (filters.utmCampaign) where.utmCampaign = filters.utmCampaign;
  if (filters.utmContent) where.utmContent = filters.utmContent;
  if (filters.leadSource) where.source = filters.leadSource;

  if (filters.followUp === 'due') {
    and.push({
      followUpAt: { lte: endOfToday() },
      status: { notIn: [...CLOSED_STATUSES] },
    });
  } else if (filters.followUp === 'set') {
    and.push({ followUpAt: { not: null } });
  } else if (filters.followUp === 'none') {
    and.push({ followUpAt: null });
  } else if (filters.followUp === 'overdue') {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    and.push({
      followUpAt: { lt: startOfToday },
      status: { notIn: [...CLOSED_STATUSES] },
    });
  }

  if (filters.from || filters.to) {
    const range: Prisma.DateTimeFilter = {};
    if (filters.from) range.gte = new Date(filters.from);
    if (filters.to) range.lte = endOfDay(filters.to);
    // "Last activity" uses updatedAt, which every write to a lead touches.
    if (filters.dateField === 'activity') where.updatedAt = range;
    else where.createdAt = range;
  }

  if (and.length > 0) where.AND = and;

  return where;
}

export const LEAD_SORT_FIELDS = ['createdAt', 'updatedAt', 'name', 'status', 'value'] as const;
export type LeadSortField = (typeof LEAD_SORT_FIELDS)[number];

/**
 * Translates the sort query params into a Prisma order.
 *
 * Unknown values fall back to newest-first rather than erroring, so a
 * hand-edited URL can never break the page.
 */
export function buildLeadOrderBy(
  filters: Pick<LeadFilters, 'sort' | 'dir'>,
): Prisma.LeadOrderByWithRelationInput {
  const field = (LEAD_SORT_FIELDS as readonly string[]).includes(filters.sort ?? '')
    ? (filters.sort as LeadSortField)
    : 'createdAt';
  const direction: Prisma.SortOrder = filters.dir === 'asc' ? 'asc' : 'desc';
  return { [field]: direction };
}
