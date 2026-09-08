'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ClipboardList, Plus, Pencil, Copy, Trash, Download, Power } from 'lucide-react';
import { toggleFormActive, duplicateForm, deleteForm, exportSubmissions } from '@/lib/actions/forms';
import { RowMenu, RowMenuItem } from '@/components/admin/row-menu';
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
        description="Build a form, then drop it onto any page with the Form block or attach it to a product button."
        action={
          can.create ? (
            <ButtonLink href="/admin/forms/new">
              <Plus className="h-4 w-4" aria-hidden="true" />
              New form
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
          <caption className="sr-only">Forms</caption>
          <thead>
            <tr>
              <Th>Form</Th>
              <Th align="center">Fields</Th>
              <Th align="center">Submissions</Th>
              <Th align="center">Leads</Th>
              <Th>Status</Th>
              <Th>Updated</Th>
              <Th align="right">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <Tr key={row.id}>
                <Td>
                  <Link href={`/admin/forms/${row.id}`} className="font-medium text-content hover:text-brand">
                    {row.name}
                  </Link>
                  <code className="mt-0.5 block font-mono text-xs text-muted">{row.slug}</code>
                </Td>
                <Td align="center" className="text-sm text-muted">
                  {row.fieldCount}
                </Td>
                <Td align="center" className="text-sm text-muted">
                  {row.submissionCount}
                </Td>
                <Td align="center">
                  {row.leadCount > 0 ? (
                    <Link
                      href={`/admin/leads?q=${encodeURIComponent(row.name)}`}
                      className="text-sm font-medium text-brand hover:underline"
                    >
                      {row.leadCount}
                    </Link>
                  ) : (
                    <span className="text-sm text-muted">0</span>
                  )}
                </Td>
                <Td>
                  <span className="flex flex-wrap gap-1.5">
                    <Badge tone={row.isActive ? 'success' : 'neutral'}>
                      {row.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                    {!row.createsLead ? <Badge tone="warning">No lead</Badge> : null}
                  </span>
                </Td>
                <Td className="whitespace-nowrap text-sm text-muted">{formatDate(row.updatedAt)}</Td>
                <Td align="right">
                  <div className="flex items-center justify-end gap-1">
                    <Link
                      href={`/admin/forms/${row.id}`}
                      className="rounded p-1.5 text-muted hover:bg-muted/10 hover:text-content"
                      aria-label={`Edit ${row.name}`}
                      title="Edit"
                    >
                      <Pencil className="h-4 w-4" />
                    </Link>
                    <RowMenu label={`Actions for ${row.name}`}>
                      <RowMenuItem onClick={() => onExport(row)} disabled={busy || row.submissionCount === 0}>
                        <Download className="h-3.5 w-3.5" aria-hidden="true" />
                        Export submissions
                      </RowMenuItem>
                      {can.edit ? (
                        <RowMenuItem onClick={() => run(() => toggleFormActive(row.id))} disabled={busy}>
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
                              if (result.ok && result.data) router.push(`/admin/forms/${result.data.id}`);
                              return result;
                            })
                          }
                        >
                          <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                          Duplicate
                        </RowMenuItem>
                      ) : null}
                      {can.delete ? (
                        <RowMenuItem tone="danger" disabled={busy} onClick={() => setConfirmDelete(row)}>
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
          if (confirmDelete) await run(() => deleteForm(confirmDelete.id));
          setConfirmDelete(null);
        }}
        title="Delete this form?"
        message={
          confirmDelete
            ? `The form stops accepting submissions. Its ${confirmDelete.submissionCount} existing submission(s) and ${confirmDelete.leadCount} lead(s) are retained.`
            : ''
        }
        pending={busy}
      />
    </>
  );
}
