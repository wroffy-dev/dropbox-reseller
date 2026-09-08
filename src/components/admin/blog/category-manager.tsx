'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Pencil, Trash, Tag } from 'lucide-react';
import { saveBlogCategory, deleteBlogCategory } from '@/lib/actions/blog';
import { Dialog, ConfirmDialog } from '@/components/ui/dialog';
import { Field, Input, Textarea } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { Table, TableWrap, Th, Td, Tr } from '@/components/ui/table';
import { EmptyState } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { Spinner } from '@/components/ui/icons';
import { slugify } from '@/lib/utils/slug';

export type BlogCategoryRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  sortOrder: number;
  seoTitle: string | null;
  seoDescription: string | null;
  postCount: number;
};

const BLANK = {
  id: '',
  name: '',
  slug: '',
  description: '',
  sortOrder: '0',
  seoTitle: '',
  seoDescription: '',
};

export function BlogCategoryManager({
  rows,
  canEdit,
  canDelete,
}: {
  rows: BlogCategoryRow[];
  canEdit: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [editing, setEditing] = React.useState<typeof BLANK | null>(null);
  const [confirmDelete, setConfirmDelete] = React.useState<BlogCategoryRow | null>(null);
  const [pending, setPending] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string[]>>({});

  async function save() {
    if (!editing) return;
    setPending(true);
    setErrors({});

    const data = new FormData();
    for (const [key, value] of Object.entries(editing)) {
      if (key !== 'id') data.set(key, value);
    }

    const result = await saveBlogCategory(editing.id || null, data);
    setPending(false);

    if (!result.ok) {
      setErrors(result.fieldErrors ?? {});
      toast(result.error, 'error');
      return;
    }
    toast(result.message ?? 'Saved.');
    setEditing(null);
    router.refresh();
  }

  return (
    <>
      {canEdit ? (
        <div className="mb-4">
          <Button onClick={() => setEditing({ ...BLANK })}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            New category
          </Button>
        </div>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState
          icon={<Tag className="h-5 w-5" />}
          title="No categories yet"
          description="Categories create archive pages at /blog/category/…"
          action={canEdit ? <Button onClick={() => setEditing({ ...BLANK })}>New category</Button> : undefined}
        />
      ) : (
        <TableWrap>
          <Table className="min-w-[36rem]">
            <caption className="sr-only">Blog categories</caption>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>URL</Th>
                <Th align="center">Posts</Th>
                <Th align="center">Order</Th>
                <Th align="right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <Tr key={row.id}>
                  <Td>
                    <span className="font-medium text-content">{row.name}</span>
                    {row.description ? (
                      <span className="block text-xs text-muted">{row.description}</span>
                    ) : null}
                  </Td>
                  <Td>
                    <code className="rounded bg-muted/10 px-1.5 py-0.5 font-mono text-xs text-muted">
                      /blog/category/{row.slug}
                    </code>
                  </Td>
                  <Td align="center" className="text-sm text-muted">
                    {row.postCount}
                  </Td>
                  <Td align="center" className="text-sm text-muted">
                    {row.sortOrder}
                  </Td>
                  <Td align="right">
                    <div className="flex items-center justify-end gap-1">
                      {canEdit ? (
                        <button
                          type="button"
                          onClick={() =>
                            setEditing({
                              id: row.id,
                              name: row.name,
                              slug: row.slug,
                              description: row.description ?? '',
                              sortOrder: String(row.sortOrder),
                              seoTitle: row.seoTitle ?? '',
                              seoDescription: row.seoDescription ?? '',
                            })
                          }
                          aria-label={`Edit ${row.name}`}
                          className="rounded p-1.5 text-muted hover:bg-muted/10 hover:text-content"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                      ) : null}
                      {canDelete ? (
                        <button
                          type="button"
                          onClick={() => setConfirmDelete(row)}
                          aria-label={`Delete ${row.name}`}
                          className="rounded p-1.5 text-muted hover:bg-red-50 hover:text-red-600"
                        >
                          <Trash className="h-4 w-4" />
                        </button>
                      ) : null}
                    </div>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </TableWrap>
      )}

      <Dialog
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={editing?.id ? 'Edit category' : 'New category'}
        footer={
          <>
            <Button variant="outline" onClick={() => setEditing(null)} disabled={pending}>
              Cancel
            </Button>
            <Button onClick={save} disabled={pending || !editing?.name.trim()}>
              {pending ? (
                <>
                  <Spinner className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Saving…
                </>
              ) : (
                'Save category'
              )}
            </Button>
          </>
        }
      >
        {editing ? (
          <div className="space-y-4">
            <Field label="Name" htmlFor="bcat-name" required error={errors.name}>
              <Input
                id="bcat-name"
                value={editing.name}
                onChange={(e) =>
                  setEditing({
                    ...editing,
                    name: e.target.value,
                    slug: editing.id ? editing.slug : slugify(e.target.value),
                  })
                }
              />
            </Field>
            <Field label="URL slug" htmlFor="bcat-slug" error={errors.slug}>
              <Input
                id="bcat-slug"
                value={editing.slug}
                onChange={(e) => setEditing({ ...editing, slug: e.target.value })}
                onBlur={(e) => setEditing({ ...editing, slug: slugify(e.target.value) })}
              />
            </Field>
            <Field label="Description" htmlFor="bcat-description">
              <Textarea
                id="bcat-description"
                rows={2}
                value={editing.description}
                onChange={(e) => setEditing({ ...editing, description: e.target.value })}
              />
            </Field>
            <Field label="Sort order" htmlFor="bcat-order">
              <Input
                id="bcat-order"
                type="number"
                min={0}
                value={editing.sortOrder}
                onChange={(e) => setEditing({ ...editing, sortOrder: e.target.value })}
              />
            </Field>
            <Field label="SEO title" htmlFor="bcat-seo-title">
              <Input
                id="bcat-seo-title"
                value={editing.seoTitle}
                placeholder={`${editing.name} articles`}
                onChange={(e) => setEditing({ ...editing, seoTitle: e.target.value })}
              />
            </Field>
            <Field label="Meta description" htmlFor="bcat-seo-description">
              <Textarea
                id="bcat-seo-description"
                rows={2}
                value={editing.seoDescription}
                onChange={(e) => setEditing({ ...editing, seoDescription: e.target.value })}
              />
            </Field>
          </div>
        ) : null}
      </Dialog>

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        onClose={() => setConfirmDelete(null)}
        onConfirm={async () => {
          if (!confirmDelete) return;
          setPending(true);
          const result = await deleteBlogCategory(confirmDelete.id);
          setPending(false);
          setConfirmDelete(null);
          if (!result.ok) {
            toast(result.error, 'error');
            return;
          }
          toast(result.message ?? 'Deleted.');
          router.refresh();
        }}
        title="Delete this category?"
        message={
          confirmDelete && confirmDelete.postCount > 0
            ? `${confirmDelete.postCount} post(s) will become uncategorised. The posts themselves are not deleted.`
            : 'The category and its archive page will be removed.'
        }
        pending={pending}
      />
    </>
  );
}
