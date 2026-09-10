'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ClipboardList, Plus, Pencil, Copy, Trash, Download, Power, Inbox } from 'lucide-react';
import {
  toggleFormActive,
  duplicateForm,
  deleteForm,
  exportSubmissions,
} from '@/lib/actions/forms';
import { RowMenu, RowMenuItem } from '@/components/admin/row-menu';
import { ActiveBadge } from '@/components/admin/status-badge';
import { Table, TableWrap, Th, Td, Tr } from '@/components/ui/table';
import { EmptyState } from '@/components/ui/states';
import { ButtonLink } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';
import { downloadCsv } from '@/lib/utils/download';
import { formatDate } from '@/lib/utils/format';

export type FormRow = {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  createsLead: boolean;
  fieldCount: number;
  submissionCount: number;
  leadCount: number;
  /** Product whose button opens this form, when one is attached. */
  productName: string | null;
  updatedAt: string;
};

export function FormsTable({
  rows,
  can,
}: {
  rows: FormRow[];
  can: { edit: boolean; create: boolean; delete: boolean };
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState<FormRow | null>(null);

  async function run(fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) {
    setBusy(true);
    const result = await fn();
    setBusy(false);
    if (!result.ok) {
      toast(result.error ?? 'Something went wrong.', 'error');
      return false;
    }
    toast(result.message ?? 'Done.');
    router.refresh();
    return true;
  }

  async function onExport(row: FormRow) {
    setBusy(true);
    const result = await exportSubmissions({ formId: row.id });
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
        icon={<ClipboardList className="h-5 w-5" />}
        title="No forms yet"
        description="Create your first form to start collecting leads. You can then drop it into a hero, any page section, a product button or a popup."
        action={
          can.create ? (
            <ButtonLink href="/admin/forms/new">
              <Plus className="h-4 w-4" aria-hidden="true" />
              Create form
            </ButtonLink>
          ) : undefined
        }
      />
    );
  }

  return (
    <>
      <TableWrap className="hidden md:block">
        <Table className="min-w-[52rem]">
          <caption className="sr-only">Forms</caption>
          <thead>
            <tr>
              <Th>Form</Th>
              <Th align="center">Fields</Th>
              <Th align="center">Submissions</Th>
              <Th align="center">Leads</Th>
              <Th>Used by</Th>
              <Th>Status</Th>
              <Th>Updated</Th>
              <Th align="right">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <Tr key={row.id}>
                <Td>
                  <Link
                    href={`/admin/forms/${row.id}`}
                    className="font-medium text-content transition-colors hover:text-brand"
                  >
                    {row.name}
                  </Link>
                  <code className="mt-0.5 block font-mono text-xs text-muted">{row.slug}</code>
                </Td>

                <Td align="center" className="text-sm text-muted">
                  {row.fieldCount}
                </Td>

                <Td align="center">
                  {row.submissionCount > 0 ? (
                    <Link
                      href={`/admin/forms/submissions?formId=${row.id}`}
                      className="text-sm font-medium text-brand hover:underline"
                    >
                      {row.submissionCount}
                    </Link>
                  ) : (
                    <span className="text-sm text-muted">0</span>
                  )}
                </Td>

                <Td align="center">
                  {row.leadCount > 0 ? (
                    <Link
                      href={`/admin/leads?formId=${row.id}`}
                      className="text-sm font-medium text-brand hover:underline"
                    >
                      {row.leadCount}
                    </Link>
                  ) : (
                    <span className="text-sm text-muted">0</span>
                  )}
                </Td>

                <Td className="max-w-[12rem] text-sm text-muted">
                  <span className="block truncate" title={row.productName ?? undefined}>
                    {row.productName ?? '—'}
                  </span>
                </Td>

                <Td>
                  <span className="flex flex-wrap gap-1.5">
                    <ActiveBadge active={row.isActive} />
                    {!row.createsLead ? <Badge tone="warning">No lead</Badge> : null}
                  </span>
                </Td>

                <Td className="whitespace-nowrap text-sm text-muted">
                  {formatDate(row.updatedAt)}
                </Td>

                <Td align="right">
                  <div className="flex items-center justify-end gap-1">
                    <Link
                      href={`/admin/forms/${row.id}`}
                      className="rounded p-1.5 text-muted transition-colors hover:bg-muted/10 hover:text-content"
                      aria-label={`Edit ${row.name}`}
                      title="Edit"
                    >
                      <Pencil className="h-4 w-4" />
                    </Link>

                    <RowMenu label={`Actions for ${row.name}`}>
                      <RowMenuItem onClick={() => router.push(`/admin/forms/${row.id}`)}>
                        <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                        Edit form
                      </RowMenuItem>
                      <RowMenuItem
                        onClick={() => router.push(`/admin/forms/submissions?formId=${row.id}`)}
                      >
                        <Inbox className="h-3.5 w-3.5" aria-hidden="true" />
                        View submissions
                      </RowMenuItem>
                      <RowMenuItem
                        onClick={() => onExport(row)}
                        disabled={busy || row.submissionCount === 0}
                      >
                        <Download className="h-3.5 w-3.5" aria-hidden="true" />
                        Export submissions
                      </RowMenuItem>
                      {can.edit ? (
                        <RowMenuItem
                          onClick={() => run(() => toggleFormActive(row.id))}
                          disabled={busy}
                        >
                          <Power className="h-3.5 w-3.5" aria-hidden="true" />
                          {row.isActive ? 'Deactivate' : 'Activate'}
                        </RowMenuItem>
                      ) : null}
                      {can.create ? (
                        <RowMenuItem
                          disabled={busy}
                          onClick={() =>
                            run(async () => {
                              const result = await duplicateForm(row.id);
                              if (result.ok && result.data)
                                router.push(`/admin/forms/${result.data.id}`);
                              return result;
                            })
                          }
                        >
                          <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                          Duplicate
                        </RowMenuItem>
                      ) : null}
                      {can.delete ? (
                        <RowMenuItem
                          tone="danger"
                          disabled={busy}
                          onClick={() => setConfirmDelete(row)}
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

      {/* Mobile: cards. */}
      <ul className="divide-y divide-hairline md:hidden">
        {rows.map((row) => (
          <li key={row.id} className="px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <Link href={`/admin/forms/${row.id}`} className="min-w-0">
                <span className="block truncate text-sm font-medium text-content">{row.name}</span>
                <code className="block truncate font-mono text-xs text-muted">{row.slug}</code>
              </Link>
              <ActiveBadge active={row.isActive} />
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
              <span>{row.fieldCount} fields</span>
              <span>· {row.submissionCount} submissions</span>
              <span>· {row.leadCount} leads</span>
            </div>
          </li>
        ))}
      </ul>

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        onClose={() => setConfirmDelete(null)}
        onConfirm={async () => {
          if (confirmDelete) await run(() => deleteForm(confirmDelete.id));
          setConfirmDelete(null);
        }}
        title={confirmDelete ? `Delete “${confirmDelete.name}”?` : ''}
        message={
          confirmDelete
            ? `The form stops accepting submissions and disappears from any section using it. Its ${confirmDelete.submissionCount} existing submission(s) and ${confirmDelete.leadCount} lead(s) are kept.`
            : ''
        }
        confirmLabel="Delete form"
        pending={busy}
      />
    </>
  );
}
