'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Copy, Trash, EllipsisVertical, ExternalLink, Pencil } from 'lucide-react';
import { duplicatePage, deletePage, setPageStatus, bulkPageAction } from '@/lib/actions/pages';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils/cn';

type Outcome = { ok: boolean; error?: string; message?: string };

export function PageRowActions({
  pageId,
  slug,
  status,
  isHomepage,
  can,
}: {
  pageId: string;
  slug: string;
  status: string;
  isHomepage: boolean;
  can: { edit: boolean; publish: boolean; create: boolean; delete: boolean };
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  async function run(fn: () => Promise<Outcome>) {
    setBusy(true);
    const result = await fn();
    setBusy(false);
    setOpen(false);
    if (!result.ok) {
      toast(result.error ?? 'Something went wrong.', 'error');
      return;
    }
    toast(result.message ?? 'Done.');
    router.refresh();
  }

  return (
    <div className="relative flex items-center justify-end gap-1" ref={ref}>
      {can.edit ? (
        <Link
          href={`/admin/pages/${pageId}`}
          className="rounded p-1.5 text-muted transition-colors hover:bg-muted/10 hover:text-content"
          aria-label="Edit page"
          title="Edit"
        >
          <Pencil className="h-4 w-4" />
        </Link>
      ) : null}

      {status === 'PUBLISHED' ? (
        <Link
          href={`/${slug}`.replace(/\/+$/, '') || '/'}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded p-1.5 text-muted transition-colors hover:bg-muted/10 hover:text-content"
          aria-label="View live page"
          title="View live"
        >
          <ExternalLink className="h-4 w-4" />
        </Link>
      ) : null}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="More actions"
        className="rounded p-1.5 text-muted transition-colors hover:bg-muted/10 hover:text-content"
      >
        <EllipsisVertical className="h-4 w-4" />
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-full z-20 mt-1 w-52 rounded-lg border border-hairline bg-surface p-1 shadow-xl"
        >
          {can.publish && status !== 'PUBLISHED' ? (
            <MenuItem onClick={() => run(() => setPageStatus(pageId, 'PUBLISHED'))} disabled={busy}>
              Publish
            </MenuItem>
          ) : null}
          {can.edit && status === 'PUBLISHED' ? (
            <MenuItem onClick={() => run(() => setPageStatus(pageId, 'DRAFT'))} disabled={busy}>
              Unpublish
            </MenuItem>
          ) : null}
          {can.edit && status !== 'ARCHIVED' ? (
            <MenuItem onClick={() => run(() => setPageStatus(pageId, 'ARCHIVED'))} disabled={busy}>
              Archive
            </MenuItem>
          ) : null}
          {can.create ? (
            <MenuItem
              onClick={() =>
                run(async () => {
                  const result = await duplicatePage(pageId);
                  if (result.ok && result.data) router.push(`/admin/pages/${result.data.id}`);
                  return result;
                })
              }
              disabled={busy}
            >
              <Copy className="h-3.5 w-3.5" aria-hidden="true" />
              Duplicate
            </MenuItem>
          ) : null}
          {can.delete && !isHomepage ? (
            <MenuItem
              onClick={() => {
                setOpen(false);
                setConfirmDelete(true);
              }}
              disabled={busy}
              tone="danger"
            >
              <Trash className="h-3.5 w-3.5" aria-hidden="true" />
              Delete
            </MenuItem>
          ) : null}
        </div>
      ) : null}

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={async () => {
          await run(() => deletePage(pageId));
          setConfirmDelete(false);
        }}
        title="Delete this page?"
        message="The page is removed from the website immediately. Existing lead attribution is preserved."
        pending={busy}
      />
    </div>
  );
}

function MenuItem({
  children,
  onClick,
  disabled,
  tone,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  tone?: 'danger';
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm transition-colors disabled:opacity-50',
        tone === 'danger' ? 'text-red-600 hover:bg-red-50' : 'text-content hover:bg-muted/10',
      )}
    >
      {children}
    </button>
  );
}

export function PageBulkBar({
  selected,
  onClear,
  can,
}: {
  selected: string[];
  onClear: () => void;
  can: { edit: boolean; publish: boolean; delete: boolean };
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [busy, setBusy] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  if (selected.length === 0) return null;

  async function apply(action: 'publish' | 'draft' | 'archive' | 'delete') {
    setBusy(true);
    const result = await bulkPageAction({ ids: selected, action });
    setBusy(false);
    setConfirmDelete(false);
    if (!result.ok) {
      toast(result.error, 'error');
      return;
    }
    toast(result.message ?? 'Updated.');
    onClear();
    router.refresh();
  }

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-brand/30 bg-brand/[0.06] px-3 py-2">
      <span className="text-sm font-medium text-content">{selected.length} selected</span>
      <div className="ml-auto flex flex-wrap gap-2">
        {can.publish ? (
          <Button size="sm" variant="outline" onClick={() => apply('publish')} disabled={busy}>
            Publish
          </Button>
        ) : null}
        {can.edit ? (
          <>
            <Button size="sm" variant="outline" onClick={() => apply('draft')} disabled={busy}>
              Unpublish
            </Button>
            <Button size="sm" variant="outline" onClick={() => apply('archive')} disabled={busy}>
              Archive
            </Button>
          </>
        ) : null}
        {can.delete ? (
          <Button size="sm" variant="danger" onClick={() => setConfirmDelete(true)} disabled={busy}>
            Delete
          </Button>
        ) : null}
        <Button size="sm" variant="ghost" onClick={onClear} disabled={busy}>
          Clear
        </Button>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => apply('delete')}
        title={`Delete ${selected.length} page(s)?`}
        message="The pages are removed from the website immediately. The homepage is always skipped."
        pending={busy}
      />
    </div>
  );
}
