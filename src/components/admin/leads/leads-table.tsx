'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Inbox, Download, Trash, UserPlus, Pencil } from 'lucide-react';
import type { LeadStatus } from '@prisma/client';
import { bulkLeadAction, exportLeads } from '@/lib/actions/leads';
import { RowMenu, RowMenuItem, BulkBar, useSelection } from '@/components/admin/row-menu';
import { LeadStatusBadge } from '@/components/admin/lead-status-badge';
import { Table, TableWrap, Th, Td, Tr } from '@/components/ui/table';
import { EmptyState } from '@/components/ui/states';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/field';
import { ConfirmDialog } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';
import { LEAD_STATUS_OPTIONS } from '@/lib/crm/constants';
import { formatRelative } from '@/lib/utils/format';
import { formatMoney } from '@/lib/utils/money';
import { downloadCsv } from '@/lib/utils/download';

export type LeadRow = {
  id: string;
  reference: number;
  name: string;
  email: string;
  phone: string | null;
  company: string | null;
  status: LeadStatus;
  source: string | null;
  utmSource: string | null;
  productName: string | null;
  assignedToName: string | null;
  value: string | null;
  createdAt: string;
};

export type LeadPermissions = { edit: boolean; assign: boolean; delete: boolean; export: boolean };

export function LeadsTable({
  rows,
  can,
  staff,
  filters,
  filtered,
}: {
  rows: LeadRow[];
  can: LeadPermissions;
  staff: Array<{ id: string; name: string }>;
  filters: Record<string, string | undefined>;
  filtered: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const selection = useSelection(rows);
  const [busy, setBusy] = React.useState(false);
  const [bulkStatus, setBulkStatus] = React.useState('');
  const [bulkAssignee, setBulkAssignee] = React.useState('');
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  async function run(fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) {
    setBusy(true);
    const result = await fn();
    setBusy(false);
    if (!result.ok) {
      toast(result.error ?? 'Something went wrong.', 'error');
      return false;
    }
    toast(result.message ?? 'Done.');
    selection.clear();
    router.refresh();
    return true;
  }

  async function onExport() {
    setBusy(true);
    const result = await exportLeads(filters);
    setBusy(false);
    if (!result.ok) {
      toast(result.error, 'error');
      return;
    }
    downloadCsv(result.data!.csv, result.data!.filename);
    toast('Export downloaded.');
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<Inbox className="h-5 w-5" />}
        title={filtered ? 'No leads match those filters' : 'No leads yet'}
        description={
          filtered
            ? 'Try clearing the search, status or date filters.'
            : 'Leads captured from your website forms and product buttons appear here.'
        }
      />
    );
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 px-4 pt-4 sm:px-5">
        {can.export ? (
          <Button variant="outline" size="sm" onClick={onExport} disabled={busy}>
            <Download className="h-4 w-4" aria-hidden="true" />
            Export CSV
          </Button>
        ) : null}
      </div>

      <div className="px-4 pt-3 sm:px-5">
        <BulkBar count={selection.selected.length} onClear={selection.clear}>
          {can.edit ? (
            <span className="flex items-center gap-1.5">
              <label htmlFor="bulk-status" className="sr-only">
                Set status
              </label>
              <Select
                id="bulk-status"
                value={bulkStatus}
                onChange={(e) => setBulkStatus(e.target.value)}
                className="h-8 py-0 text-xs"
              >
                <option value="">Set status…</option>
                {LEAD_STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
              <Button
                size="sm"
                variant="outline"
                disabled={!bulkStatus || busy}
                onClick={() =>
                  run(() =>
                    bulkLeadAction({
                      ids: selection.selected,
                      action: 'status',
                      status: bulkStatus as LeadStatus,
                    }),
                  )
                }
              >
                Apply
              </Button>
            </span>
          ) : null}

          {can.assign ? (
            <span className="flex items-center gap-1.5">
              <label htmlFor="bulk-assignee" className="sr-only">
                Assign to
              </label>
              <Select
                id="bulk-assignee"
                value={bulkAssignee}
                onChange={(e) => setBulkAssignee(e.target.value)}
                className="h-8 py-0 text-xs"
              >
                <option value="">Assign to…</option>
                <option value="none">Unassign</option>
                {staff.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name}
                  </option>
                ))}
              </Select>
              <Button
                size="sm"
                variant="outline"
                disabled={!bulkAssignee || busy}
                onClick={() =>
                  run(() =>
                    bulkLeadAction({
                      ids: selection.selected,
                      action: 'assign',
                      assignedToId: bulkAssignee === 'none' ? null : bulkAssignee,
                    }),
                  )
                }
              >
                Apply
              </Button>
            </span>
          ) : null}

          {can.delete ? (
            <Button size="sm" variant="danger" disabled={busy} onClick={() => setConfirmDelete(true)}>
              Delete
            </Button>
          ) : null}
        </BulkBar>
      </div>

      <TableWrap>
        <Table className="min-w-[60rem]">
          <caption className="sr-only">Leads</caption>
          <thead>
            <tr>
              {can.edit ? (
                <Th className="w-10">
                  <input
                    type="checkbox"
                    checked={selection.allSelected}
                    onChange={selection.toggleAll}
                    aria-label="Select all leads"
                    className="h-4 w-4 rounded border-hairline text-brand focus:ring-brand/30"
                  />
                </Th>
              ) : null}
              <Th className="w-14">Ref</Th>
              <Th>Lead</Th>
              <Th>Company</Th>
              <Th>Product</Th>
              <Th>Source</Th>
              <Th>Owner</Th>
              <Th align="right">Value</Th>
              <Th>Status</Th>
              <Th>Received</Th>
              <Th align="right">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <Tr key={row.id}>
                {can.edit ? (
                  <Td>
                    <input
                      type="checkbox"
                      checked={selection.selected.includes(row.id)}
                      onChange={() => selection.toggle(row.id)}
                      aria-label={`Select ${row.name}`}
                      className="h-4 w-4 rounded border-hairline text-brand focus:ring-brand/30"
                    />
                  </Td>
                ) : null}
                <Td className="font-mono text-xs text-muted">#{row.reference}</Td>
                <Td>
                  <Link
                    href={`/admin/leads/${row.id}`}
                    className="font-medium text-content hover:text-brand"
                  >
                    {row.name}
                  </Link>
                  <span className="block truncate text-xs text-muted">{row.email}</span>
                </Td>
                <Td className="text-sm text-muted">{row.company ?? '—'}</Td>
                <Td className="text-sm text-muted">{row.productName ?? '—'}</Td>
                <Td className="text-sm text-muted">{row.source ?? row.utmSource ?? '—'}</Td>
                <Td className="text-sm text-muted">{row.assignedToName ?? 'Unassigned'}</Td>
                <Td align="right" className="whitespace-nowrap text-sm">
                  {row.value ? formatMoney(row.value) : '—'}
                </Td>
                <Td>
                  <LeadStatusBadge status={row.status} />
                </Td>
                <Td className="whitespace-nowrap text-sm text-muted">{formatRelative(row.createdAt)}</Td>
                <Td align="right">
                  <div className="flex items-center justify-end gap-1">
                    <Link
                      href={`/admin/leads/${row.id}`}
                      className="rounded p-1.5 text-muted hover:bg-muted/10 hover:text-content"
                      aria-label={`Open ${row.name}`}
                      title="Open"
                    >
                      <Pencil className="h-4 w-4" />
                    </Link>
                    <RowMenu label={`Actions for ${row.name}`}>
                      <RowMenuItem onClick={() => router.push(`/admin/leads/${row.id}`)}>
                        Open lead
                      </RowMenuItem>
                      {row.phone ? (
                        <RowMenuItem onClick={() => window.open(`tel:${row.phone}`, '_self')}>
                          Call {row.phone}
                        </RowMenuItem>
                      ) : null}
                      <RowMenuItem onClick={() => window.open(`mailto:${row.email}`, '_self')}>
                        Email lead
                      </RowMenuItem>
                      {can.assign ? (
                        <RowMenuItem onClick={() => router.push(`/admin/leads/${row.id}#assign`)}>
                          <UserPlus className="h-3.5 w-3.5" aria-hidden="true" />
                          Assign
                        </RowMenuItem>
                      ) : null}
                      {can.delete ? (
                        <RowMenuItem
                          tone="danger"
                          onClick={() => {
                            selection.clear();
                            void run(() => bulkLeadAction({ ids: [row.id], action: 'delete' }));
                          }}
                        >
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
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={async () => {
          await run(() => bulkLeadAction({ ids: selection.selected, action: 'delete' }));
          setConfirmDelete(false);
        }}
        title={`Delete ${selection.selected.length} lead(s)?`}
        message="Deleted leads are hidden from the CRM and reports."
        pending={busy}
      />
    </>
  );
}
