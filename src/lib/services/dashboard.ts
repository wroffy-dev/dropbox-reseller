import 'server-only';
import { prisma } from '@/lib/db/prisma';
import type { LeadStatus } from '@prisma/client';

export type DashboardMetrics = {
  totalLeads: number;
  newToday: number;
  newThisMonth: number;
  qualified: number;
  won: number;
  lost: number;
  openPipeline: number;
  conversionRate: number;
  byStatus: Record<LeadStatus, number>;
  topProducts: Array<{ name: string; count: number }>;
  topSources: Array<{ source: string; count: number }>;
  trend: Array<{ date: string; count: number }>;
};

function startOfDay(date = new Date()): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfMonth(date = new Date()): Date {
  const d = new Date(date);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Single round-trip batch of the dashboard aggregates. */
export async function getDashboardMetrics(days = 30): Promise<DashboardMetrics> {
  const notDeleted = { deletedAt: null };
  const since = startOfDay(new Date(Date.now() - (days - 1) * 86_400_000));

  const [total, today, month, grouped, productGroups, sourceGroups, recentLeads] = await Promise.all([
    prisma.lead.count({ where: notDeleted }),
    prisma.lead.count({ where: { ...notDeleted, createdAt: { gte: startOfDay() } } }),
    prisma.lead.count({ where: { ...notDeleted, createdAt: { gte: startOfMonth() } } }),
    prisma.lead.groupBy({ by: ['status'], where: notDeleted, _count: { _all: true } }),
    prisma.lead.groupBy({
      by: ['productId'],
      where: { ...notDeleted, productId: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { productId: 'desc' } },
      take: 5,
    }),
    prisma.lead.groupBy({
      by: ['utmSource'],
      where: notDeleted,
      _count: { _all: true },
      orderBy: { _count: { utmSource: 'desc' } },
      take: 6,
    }),
    prisma.lead.findMany({
      where: { ...notDeleted, createdAt: { gte: since } },
      select: { createdAt: true },
    }),
  ]);

  const byStatus = {
    NEW: 0,
    CONTACTED: 0,
    QUALIFIED: 0,
    PROPOSAL: 0,
    NEGOTIATION: 0,
    WON: 0,
    LOST: 0,
    SPAM: 0,
  } as Record<LeadStatus, number>;
  for (const row of grouped) byStatus[row.status] = row._count._all;

  const productIds = productGroups.map((g) => g.productId).filter((id): id is string => Boolean(id));
  const products = productIds.length
    ? await prisma.product.findMany({ where: { id: { in: productIds } }, select: { id: true, name: true } })
    : [];
  const productNames = new Map(products.map((p) => [p.id, p.name]));

  // Fill missing days so the sparkline has a continuous x-axis.
  const counts = new Map<string, number>();
  for (let i = 0; i < days; i += 1) {
    const key = new Date(since.getTime() + i * 86_400_000).toISOString().slice(0, 10);
    counts.set(key, 0);
  }
  for (const lead of recentLeads) {
    const key = lead.createdAt.toISOString().slice(0, 10);
    if (counts.has(key)) counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const decided = byStatus.WON + byStatus.LOST;
  const openPipeline =
    byStatus.NEW + byStatus.CONTACTED + byStatus.QUALIFIED + byStatus.PROPOSAL + byStatus.NEGOTIATION;

  return {
    totalLeads: total,
    newToday: today,
    newThisMonth: month,
    qualified: byStatus.QUALIFIED,
    won: byStatus.WON,
    lost: byStatus.LOST,
    openPipeline,
    conversionRate: decided > 0 ? (byStatus.WON / decided) * 100 : 0,
    byStatus,
    topProducts: productGroups.map((g) => ({
      name: productNames.get(g.productId ?? '') ?? 'Unknown',
      count: g._count._all,
    })),
    topSources: sourceGroups.map((g) => ({
      source: g.utmSource || 'Direct / none',
      count: g._count._all,
    })),
    trend: Array.from(counts.entries()).map(([date, count]) => ({ date, count })),
  };
}
