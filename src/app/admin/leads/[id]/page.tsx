import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { prisma } from '@/lib/db/prisma';
import { requirePermission, userCan } from '@/lib/auth/guards';
import { AdminPageHeader } from '@/components/admin/page-header';
import { LeadDetail, type LeadDetailData } from '@/components/admin/leads/lead-detail';
import { decimalToString } from '@/lib/utils/money';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const lead = await prisma.lead.findUnique({ where: { id }, select: { name: true, reference: true } });
  return { title: lead ? `Lead #${lead.reference} — ${lead.name}` : 'Lead' };
}

export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission('leads.view');
  const { id } = await params;

  const [lead, staff, products] = await Promise.all([
    prisma.lead.findFirst({
      where: { id, deletedAt: null },
      include: {
        product: { select: { id: true, name: true } },
        form: { select: { name: true } },
        notes: { orderBy: { createdAt: 'desc' }, include: { author: { select: { name: true } } } },
        activities: {
          orderBy: { createdAt: 'desc' },
          take: 50,
          include: { actor: { select: { name: true } } },
        },
      },
    }),
    prisma.user.findMany({
      where: { deletedAt: null, status: 'ACTIVE' },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
    prisma.product.findMany({
      where: { deletedAt: null },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
  ]);
  if (!lead) notFound();

  const data: LeadDetailData = {
    id: lead.id,
    reference: lead.reference,
    name: lead.name,
    email: lead.email,
    phone: lead.phone,
    company: lead.company,
    jobTitle: lead.jobTitle,
    message: lead.message,
    status: lead.status,
    priority: lead.priority,
    source: lead.source,
    campaign: lead.campaign,
    ctaLabel: lead.ctaLabel,
    ctaLocation: lead.ctaLocation,
    value: decimalToString(lead.value),
    followUpAt: lead.followUpAt?.toISOString() ?? null,
    lostReason: lead.lostReason,
    createdAt: lead.createdAt.toISOString(),
    productId: lead.productId,
    productName: lead.product?.name ?? null,
    assignedToId: lead.assignedToId,
    customerId: lead.customerId,
    formName: lead.form?.name ?? null,
    landingUrl: lead.landingUrl,
    referrer: lead.referrer,
    utm: {
      source: lead.utmSource,
      medium: lead.utmMedium,
      campaign: lead.utmCampaign,
      term: lead.utmTerm,
      content: lead.utmContent,
    },
    firstTouch: {
      source: lead.firstUtmSource,
      medium: lead.firstUtmMedium,
      campaign: lead.firstUtmCampaign,
      landingUrl: lead.firstLandingUrl,
      at: lead.firstTouchAt?.toISOString() ?? null,
    },
    notes: lead.notes.map((note) => ({
      id: note.id,
      body: note.body,
      authorName: note.author?.name ?? null,
      createdAt: note.createdAt.toISOString(),
    })),
    activities: lead.activities.map((activity) => ({
      id: activity.id,
      type: activity.type,
      summary: activity.summary,
      actorName: activity.actor?.name ?? null,
      createdAt: activity.createdAt.toISOString(),
    })),
  };

  return (
    <>
      <AdminPageHeader
        title={lead.name}
        description={[lead.company, lead.email].filter(Boolean).join(' · ')}
        crumbs={[{ label: 'Leads', href: '/admin/leads' }, { label: `#${lead.reference}` }]}
      />
      <LeadDetail
        lead={data}
        staff={staff}
        products={products}
        can={{
          edit: userCan(user, 'leads.edit'),
          assign: userCan(user, 'leads.assign'),
          delete: userCan(user, 'leads.delete'),
          createCustomer: userCan(user, 'customers.create'),
        }}
      />
    </>
  );
}
