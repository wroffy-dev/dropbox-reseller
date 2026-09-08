'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FileText, Plus, Pencil, ExternalLink, Copy, Trash, Star } from 'lucide-react';
import {
  setBlogPostStatus,
  duplicateBlogPost,
  deleteBlogPost,
  bulkBlogAction,
} from '@/lib/actions/blog';
import { RowMenu, RowMenuItem, BulkBar, useSelection } from '@/components/admin/row-menu';
import { ContentStatusBadge } from '@/components/admin/lead-status-badge';
import { Table, TableWrap, Th, Td, Tr } from '@/components/ui/table';
import { EmptyState } from '@/components/ui/states';
import { Button, ButtonLink } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';
import { formatDate } from '@/lib/utils/format';

export type PostRow = {
  id: string;
  title: string;
  slug: string;
  status: string;
  isFeatured: boolean;
  categoryName: string | null;
  authorName: string | null;
  readingTime: number;
  publishedAt: string | null;
  updatedAt: string;
};

export function PostsTable({
  rows,
  can,
  filtered,
}: {
  rows: PostRow[];
  can: { edit: boolean; create: boolean; delete: boolean; publish: boolean };
  filtered: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const selection = useSelection(rows);
  const [busy, setBusy] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState<string | null>(null);
  const [confirmBulkDelete, setConfirmBulkDelete] = React.useState(false);

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

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<FileText className="h-5 w-5" />}
        title={filtered ? 'No posts match those filters' : 'No posts yet'}
        description={
          filtered
            ? 'Try clearing the search or the status filter.'
            : 'Write your first article to start building organic traffic.'
        }
        action={
          can.create ? (
            <ButtonLink href="/admin/blog/new">
              <Plus className="h-4 w-4" aria-hidden="true" />
              New post
            </ButtonLink>
          ) : undefined
        }
      />
    );
  }

  return (
    <>
      {can.edit || can.delete ? (
        <div className="px-4 pt-4 sm:px-5">
          <BulkBar count={selection.selected.length} onClear={selection.clear}>
            {can.publish ? (
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() =>
                  run(() => bulkBlogAction({ ids: selection.selected, action: 'publish' })).then(
                    (ok) => ok && selection.clear(),
                  )
                }
              >
                Publish
              </Button>
            ) : null}
            {can.edit ? (
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() =>
                  run(() => bulkBlogAction({ ids: selection.selected, action: 'draft' })).then(
                    (ok) => ok && selection.clear(),
                  )
                }
              >
                Unpublish
              </Button>
            ) : null}
            {can.delete ? (
              <Button size="sm" variant="danger" disabled={busy} onClick={() => setConfirmBulkDelete(true)}>
                Delete
              </Button>
            ) : null}
          </BulkBar>
        </div>
      ) : null}

      <TableWrap>
        <Table className="min-w-[48rem]">
          <caption className="sr-only">Blog posts</caption>
          <thead>
            <tr>
              {can.edit ? (
                <Th className="w-10">
                  <input
                    type="checkbox"
                    checked={selection.allSelected}
                    onChange={selection.toggleAll}
                    aria-label="Select all posts"
                    className="h-4 w-4 rounded border-hairline text-brand focus:ring-brand/30"
                  />
                </Th>
              ) : null}
              <Th>Title</Th>
              <Th>Category</Th>
              <Th>Author</Th>
              <Th align="center">Read</Th>
              <Th>Status</Th>
              <Th>Published</Th>
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
                      aria-label={`Select ${row.title}`}
                      className="h-4 w-4 rounded border-hairline text-brand focus:ring-brand/30"
                    />
                  </Td>
                ) : null}
                <Td>
                  <span className="flex items-center gap-2">
                    <Link href={`/admin/blog/${row.id}`} className="font-medium text-content hover:text-brand">
                      {row.title}
                    </Link>
                    {row.isFeatured ? (
                      <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" aria-label="Featured" />
                    ) : null}
                  </span>
                  <code className="mt-0.5 block font-mono text-xs text-muted">/blog/{row.slug}</code>
                </Td>
                <Td className="text-sm text-muted">{row.categoryName ?? '—'}</Td>
                <Td className="text-sm text-muted">{row.authorName ?? '—'}</Td>
                <Td align="center" className="whitespace-nowrap text-sm text-muted">
                  {row.readingTime} min
                </Td>
                <Td>
                  <ContentStatusBadge status={row.status} />
                </Td>
                <Td className="whitespace-nowrap text-sm text-muted">
                  {row.publishedAt ? formatDate(row.publishedAt) : '—'}
                </Td>
                <Td align="right">
                  <div className="flex items-center justify-end gap-1">
                    {can.edit ? (
                      <Link
                        href={`/admin/blog/${row.id}`}
                        className="rounded p-1.5 text-muted hover:bg-muted/10 hover:text-content"
                        aria-label={`Edit ${row.title}`}
                        title="Edit"
                      >
                        <Pencil className="h-4 w-4" />
                      </Link>
                    ) : null}
                    {row.status === 'PUBLISHED' ? (
                      <Link
                        href={`/blog/${row.slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded p-1.5 text-muted hover:bg-muted/10 hover:text-content"
                        aria-label={`View ${row.title}`}
                        title="View live"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Link>
                    ) : null}
                    <RowMenu label={`Actions for ${row.title}`}>
                      {can.publish && row.status !== 'PUBLISHED' ? (
                        <RowMenuItem
                          disabled={busy}
                          onClick={() => run(() => setBlogPostStatus(row.id, 'PUBLISHED'))}
                        >
                          Publish
                        </RowMenuItem>
                      ) : null}
                      {can.edit && row.status === 'PUBLISHED' ? (
                        <RowMenuItem
                          disabled={busy}
                          onClick={() => run(() => setBlogPostStatus(row.id, 'DRAFT'))}
                        >
                          Unpublish
                        </RowMenuItem>
                      ) : null}
                      {can.create ? (
                        <RowMenuItem
                          disabled={busy}
                          onClick={() =>
                            run(async () => {
                              const result = await duplicateBlogPost(row.id);
                              if (result.ok && result.data) router.push(`/admin/blog/${result.data.id}`);
                              return result;
                            })
                          }
                        >
                          <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                          Duplicate
                        </RowMenuItem>
                      ) : null}
                      {can.delete ? (
                        <RowMenuItem tone="danger" disabled={busy} onClick={() => setConfirmDelete(row.id)}>
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
          if (confirmDelete) await run(() => deleteBlogPost(confirmDelete));
          setConfirmDelete(null);
        }}
        title="Delete this post?"
        message="It is removed from the blog and the sitemap immediately."
        pending={busy}
      />

      <ConfirmDialog
        open={confirmBulkDelete}
        onClose={() => setConfirmBulkDelete(false)}
        onConfirm={async () => {
          const ok = await run(() => bulkBlogAction({ ids: selection.selected, action: 'delete' }));
          if (ok) selection.clear();
          setConfirmBulkDelete(false);
        }}
        title={`Delete ${selection.selected.length} post(s)?`}
        message="They are removed from the blog and the sitemap immediately."
        pending={busy}
      />
    </>
  );
}
