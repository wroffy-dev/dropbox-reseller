import type { Prisma } from '@prisma/client';

export type LeadFilters = {
  q?: string;
  status?: string;
  assignedTo?: string;
  productId?: string;
  source?: string;
  from?: string;
  to?: string;
};

/** Shared filter builder used by the lead list, the pipeline and the CSV export. */
export function buildLeadWhere(filters: LeadFilters): Prisma.LeadWhereInput {
  const where: Prisma.LeadWhereInput = { deletedAt: null };

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
  else if (filters.assignedTo) where.assignedToId = filters.assignedTo;
  if (filters.productId) where.productId = filters.productId;
  if (filters.source) where.utmSource = filters.source;

  if (filters.from || filters.to) {
    const createdAt: Prisma.DateTimeFilter = {};
    if (filters.from) createdAt.gte = new Date(filters.from);
    if (filters.to) {
      const to = new Date(filters.to);
      to.setHours(23, 59, 59, 999);
      createdAt.lte = to;
    }
    where.createdAt = createdAt;
  }

  return where;
}
