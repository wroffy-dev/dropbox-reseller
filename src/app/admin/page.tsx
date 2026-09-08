import Link from 'next/link';
import type { Metadata } from 'next';
import { ArrowUpRight } from 'lucide-react';
import { prisma } from '@/lib/db/prisma';
import { requirePermission, userCan } from '@/lib/auth/guards';
import { getDashboardMetrics } from '@/lib/services/dashboard';
import { AdminPageHeader } from '@/components/admin/page-header';
import { StatCard } from '@/components/admin/stat-card';
import { BarChart, HorizontalBars, FunnelBars } from '@/components/admin/charts';
import { LeadStatusBadge } from '@/components/admin/lead-status-badge';
import { Card, CardHeader, CardBody } from '@/components/ui/card';
import { Alert, EmptyState } from '@/components/ui/states';
import { formatRelative, formatPercent } from '@/lib/utils/format';

// Absolute so the public site's title template does not leak into the admin.
export const metadata: Metadata = { title: { absolute: 'Dashboard · Admin' } };
export const dynamic = 'force-dynamic';

export default async function AdminDashboard({
  searchParams,
}: {
  searchParams: Promise<{ denied?: string }>;
}) {
  const user = await requirePermission('dashboard.view');
  const [params, metrics, recentLeads, contentCounts] = await Promise.all([
    searchParams,
    getDashboardMetrics(30),
    prisma.lead.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: 8,
      select: {
        id: true,
        name: true,
        email: true,
        company: true,
        status: true,
        source: true,
        createdAt: true,
        product: { select: { name: true } },
        assignedTo: { select: { name: true } },
      },
    }),
    Promise.all([
      prisma.page.count({ where: { deletedAt: null, status: 'PUBLISHED' } }),
      prisma.product.count({ where: { deletedAt: null, status: 'PUBLISHED' } }),
      prisma.blogPost.count({ where: { deletedAt: null, status: 'PUBLISHED' } }),
      prisma.formSubmission.count(),
    ]),
  ]);

  const [pagesCount, productsCount, postsCount, submissionsCount] = contentCounts;

  return (
    <>
      <AdminPageHeader
        title={`Welcome back, ${user.name.split(' ')[0]}`}
        description="Pipeline health and website activity at a glance."
      />

      {params.denied ? (
        <Alert tone="warning" className="mb-6" title="Access denied">
          Your role does not include <code className="font-mono">{params.denied}</code>. Ask a super admin to
          grant it.
        </Alert>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total leads" value={metrics.totalLeads} href="/admin/leads" />
        <StatCard
          label="New today"
          value={metrics.newToday}
          hint={`${metrics.newThisMonth} this month`}
          tone="brand"
          href="/admin/leads?status=NEW"
        />
        <StatCard
          label="Open pipeline"
          value={metrics.openPipeline}
          hint={`${metrics.qualified} qualified`}
          href="/admin/pipeline"
        />
        <StatCard
          label="Conversion rate"
          value={formatPercent(metrics.conversionRate)}
          hint={`${metrics.won} won · ${metrics.lost} lost`}
          tone={metrics.conversionRate >= 25 ? 'success' : 'default'}
        />
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Leads over the last 30 days" />
          <CardBody>
            <BarChart data={metrics.trend} label="Leads per day" />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Pipeline" />
          <CardBody>
            <FunnelBars
              stages={[
                { label: 'New', count: metrics.byStatus.NEW },
                { label: 'Contacted', count: metrics.byStatus.CONTACTED },
                { label: 'Qualified', count: metrics.byStatus.QUALIFIED },
                { label: 'Proposal', count: metrics.byStatus.PROPOSAL },
                { label: 'Negotiation', count: metrics.byStatus.NEGOTIATION },
                { label: 'Won', count: metrics.byStatus.WON, tone: 'bg-emerald-500' },
                { label: 'Lost', count: metrics.byStatus.LOST, tone: 'bg-red-400' },
              ]}
            />
          </CardBody>
        </Card>
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Recent leads"
            actions={
              <Link
                href="/admin/leads"
                className="inline-flex items-center gap-1 text-sm font-medium text-brand hover:underline"
              >
                View all
                <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            }
          />
          {recentLeads.length === 0 ? (
            <EmptyState
              title="No leads yet"
              description="Leads captured from your website forms will appear here."
            />
          ) : (
            <ul className="divide-y divide-hairline">
              {recentLeads.map((lead) => (
                <li key={lead.id}>
                  <Link
                    href={`/admin/leads/${lead.id}`}
                    className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/[0.03] sm:px-5"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-content">{lead.name}</span>
                      <span className="block truncate text-xs text-muted">
                        {[lead.company, lead.product?.name, lead.source].filter(Boolean).join(' · ') ||
                          lead.email}
                      </span>
                    </span>
                    <span className="hidden shrink-0 text-xs text-muted sm:block">
                      {lead.assignedTo?.name ?? 'Unassigned'}
                    </span>
                    <LeadStatusBadge status={lead.status} />
                    <span className="hidden w-20 shrink-0 text-right text-xs text-muted md:block">
                      {formatRelative(lead.createdAt)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Top products by lead volume" />
            <CardBody>
              <HorizontalBars
                items={metrics.topProducts.map((p) => ({ label: p.name, count: p.count }))}
                emptyLabel="No product-attributed leads yet"
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Lead sources" />
            <CardBody>
              <HorizontalBars
                items={metrics.topSources.map((s) => ({ label: s.source, count: s.count }))}
                emptyLabel="No attribution captured yet"
              />
            </CardBody>
          </Card>
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {userCan(user, 'pages.view') ? (
          <StatCard label="Published pages" value={pagesCount} href="/admin/pages" />
        ) : null}
        {userCan(user, 'products.view') ? (
          <StatCard label="Published products" value={productsCount} href="/admin/products" />
        ) : null}
        {userCan(user, 'blog.view') ? (
          <StatCard label="Published posts" value={postsCount} href="/admin/blog" />
        ) : null}
        {userCan(user, 'forms.view') ? (
          <StatCard label="Form submissions" value={submissionsCount} href="/admin/forms" />
        ) : null}
      </div>
    </>
  );
}
