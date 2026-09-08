'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Building2, Plus, Pencil, Trash } from 'lucide-react';
import { deleteCustomer } from '@/lib/actions/customers';
import { RowMenu, RowMenuItem } from '@/components/admin/row-menu';
import { Table, TableWrap, Th, Td, Tr } from '@/components/ui/table';
import { EmptyState } from '@/components/ui/states';
import { ButtonLink } from '@/components/ui/button';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';
import { CUSTOMER_STATUS_LABELS } from '@/lib/crm/constants';
import { formatDate } from '@/lib/utils/format';

export type CustomerRow = {
  id: string;
  reference: number;
  name: string;
  company: string | null;
  email: string;
  phone: string | null;
  status: string;
  assignedToName: string | null;
  productCount: number;
  leadCount: number;
  createdAt: string;
};

const STATUS_TONE: Record<string, BadgeTone> = {
  PROSPECT: 'info',
  ACTIVE: 'success',
  INACTIVE: 'warning',
  FORMER: 'neutral',
};

export function CustomersTable({
  rows,
  can,
  filtered,
}: {
  rows: CustomerRow[];
  can: { edit: boolean; create: boolean; delete: boolean };
  filtered: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState<CustomerRow | null>(null);

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<Building2 className="h-5 w-5" />}
        title={filtered ? 'No customers match those filters' : 'No customers yet'}
        description={
          filtered
            ? 'Try clearing the search or the status filter.'
            : 'Convert a won lead, or add a customer directly.'
        }
        action={
          can.create ? (
            <ButtonLink href="/admin/customers/new">
              <Plus className="h-4 w-4" aria-hidden="true" />
              New customer
            </ButtonLink>
          ) : undefined
        }
      />
    );
  }

  return (
    <>
      <TableWrap>
        <Table className="min-w-[46rem]">
          <caption className="sr-only">Customers</caption>
          <thead>
            <tr>
              <Th className="w-14">Ref</Th>
              <Th>Customer</Th>
              <Th>Company</Th>
              <Th>Owner</Th>
              <Th align="center">Products</Th>
              <Th align="center">Leads</Th>
              <Th>Status</Th>
              <Th>Since</Th>
              <Th align="right">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <Tr key={row.id}>
                <Td className="font-mono text-xs text-muted">#{row.reference}</Td>
                <Td>
                  <Link
                    href={`/admin/customers/${row.id}`}
                    className="font-medium text-content hover:text-brand"
                  >
                    {row.name}
                  </Link>
                  <span className="block truncate text-xs text-muted">{row.email}</span>
                </Td>
                <Td className="text-sm text-muted">{row.company ?? '—'}</Td>
                <Td className="text-sm text-muted">{row.assignedToName ?? 'Unassigned'}</Td>
                <Td align="center" className="text-sm text-muted">
                  {row.productCount}
                </Td>
                <Td align="center" className="text-sm text-muted">
                  {row.leadCount}
                </Td>
                <Td>
                  <Badge tone={STATUS_TONE[row.status] ?? 'neutral'}>
                    {CUSTOMER_STATUS_LABELS[row.status] ?? row.status}
                  </Badge>
                </Td>
                <Td className="whitespace-nowrap text-sm text-muted">{formatDate(row.createdAt)}</Td>
                <Td align="right">
                  <div className="flex items-center justify-end gap-1">
                    <Link
                      href={`/admin/customers/${row.id}`}
                      className="rounded p-1.5 text-muted hover:bg-muted/10 hover:text-content"
                      aria-label={`Open ${row.name}`}
                      title="Open"
                    >
                      <Pencil className="h-4 w-4" />
                    </Link>
                    <RowMenu label={`Actions for ${row.name}`}>
                      <RowMenuItem onClick={() => router.push(`/admin/customers/${row.id}`)}>
                        Open customer
                      </RowMenuItem>
                      <RowMenuItem onClick={() => window.open(`mailto:${row.email}`, '_self')}>
                        Email customer
                      </RowMenuItem>
                      {can.delete ? (
                        <RowMenuItem tone="danger" onClick={() => setConfirmDelete(row)} disabled={busy}>
                          <Trash className="h-3.5 w-3.5" aria-hidden="true" />
                          Delete
                        </RowMenuItem>
                      ) : null}
                    </RowMenu>
                  </div>
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </TableWrap>

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        onClose={() => setConfirmDelete(null)}
        onConfirm={async () => {
          if (!confirmDelete) return;
          setBusy(true);
          const result = await deleteCustomer(confirmDelete.id);
          setBusy(false);
          setConfirmDelete(null);
          if (!result.ok) {
            toast(result.error, 'error');
            return;
          }
          toast(result.message ?? 'Deleted.');
          router.refresh();
        }}
        title="Delete this customer?"
        message="The customer is hidden from the CRM. Linked leads keep their history."
        pending={busy}
      />
    </>
  );
}
