'use client';

import * as React from 'react';
import { Upload, Search, Trash, Copy, Check, Image as ImageIcon } from 'lucide-react';
import {
  listMedia,
  uploadMedia,
  updateMediaMetadata,
  deleteMedia,
  type MediaDto,
} from '@/lib/actions/media';
import { Card } from '@/components/ui/card';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { Dialog, ConfirmDialog } from '@/components/ui/dialog';
import { EmptyState, Skeleton } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { Spinner } from '@/components/ui/icons';
import { formatBytes, formatDate } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';

export function MediaLibrary({
  initialItems,
  initialCursor,
  can,
  selectedId,
}: {
  initialItems: MediaDto[];
  initialCursor: string | null;
  can: { upload: boolean; edit: boolean; delete: boolean };
  selectedId?: string;
}) {
  const { toast } = useToast();
  const [items, setItems] = React.useState(initialItems);
  const [cursor, setCursor] = React.useState(initialCursor);
  const [query, setQuery] = React.useState('');
  const [kind, setKind] = React.useState<'ALL' | 'IMAGE' | 'DOCUMENT' | 'VIDEO'>('ALL');
  const [loading, setLoading] = React.useState(false);
  const [uploading, setUploading] = React.useState(false);
  const [dragOver, setDragOver] = React.useState(false);
  const [active, setActive] = React.useState<MediaDto | null>(
    selectedId ? (initialItems.find((i) => i.id === selectedId) ?? null) : null,
  );
  const inputRef = React.useRef<HTMLInputElement>(null);
  const firstRender = React.useRef(true);

  // Refetch when the search or type filter changes, debounced.
  React.useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    setLoading(true);
    const timer = window.setTimeout(() => {
      listMedia({ query, kind })
        .then((result) => {
          setItems(result.items);
          setCursor(result.nextCursor);
        })
        .catch(() => toast('Could not load the media library.', 'error'))
        .finally(() => setLoading(false));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query, kind, toast]);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    let succeeded = 0;

    for (const file of Array.from(files)) {
      const data = new FormData();
      data.set('file', file);
      const result = await uploadMedia(data);
      if (result.ok && result.data) {
        setItems((current) => [result.data as MediaDto, ...current]);
        succeeded += 1;
      } else if (!result.ok) {
        toast(`${file.name}: ${result.error}`, 'error');
      }
    }

    setUploading(false);
    if (succeeded > 0) toast(`${succeeded} file(s) uploaded.`);
  }

  async function loadMore() {
    if (!cursor) return;
    setLoading(true);
    const result = await listMedia({ query, kind, cursor });
    setItems((current) => [...current, ...result.items]);
    setCursor(result.nextCursor);
    setLoading(false);
  }

  return (
    <>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
            aria-hidden="true"
          />
          <Input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by filename or alt text"
            aria-label="Search media"
            className="pl-9"
          />
        </div>
        <div>
          <label htmlFor="media-kind" className="sr-only">
            File type
          </label>
          <Select
            id="media-kind"
            value={kind}
            onChange={(e) => setKind(e.target.value as typeof kind)}
            className="w-auto"
          >
            <option value="ALL">All types</option>
            <option value="IMAGE">Images</option>
            <option value="DOCUMENT">Documents</option>
            <option value="VIDEO">Video</option>
          </Select>
        </div>
        {can.upload ? (
          <Button className="sm:ml-auto" onClick={() => inputRef.current?.click()} disabled={uploading}>
            {uploading ? (
              <>
                <Spinner className="h-4 w-4 animate-spin" aria-hidden="true" />
                Uploading…
              </>
            ) : (
              <>
                <Upload className="h-4 w-4" aria-hidden="true" />
                Upload files
              </>
            )}
          </Button>
        ) : null}
      </div>

      <input
        ref={inputRef}
        type="file"
        multiple
        className="sr-only"
        onChange={(e) => {
          void handleFiles(e.target.files);
          e.target.value = '';
        }}
      />

      <Card
        className={cn('p-4 transition-colors sm:p-5', dragOver && 'border-brand bg-brand/[0.04]')}
        onDragOver={(e) => {
          if (!can.upload) return;
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          if (!can.upload) return;
          e.preventDefault();
          setDragOver(false);
          void handleFiles(e.dataTransfer.files);
        }}
      >
        {loading && items.length === 0 ? (
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {Array.from({ length: 10 }).map((_, i) => (
              <li key={i}>
                <Skeleton className="aspect-square" />
              </li>
            ))}
          </ul>
        ) : items.length === 0 ? (
          <EmptyState
            icon={<ImageIcon className="h-5 w-5" />}
            title={query ? `No files match “${query}”` : 'No files yet'}
            description={
              can.upload
                ? 'Drag files here, or use the upload button. Images up to the configured size limit.'
                : 'Ask an administrator to upload files.'
            }
            action={
              can.upload ? <Button onClick={() => inputRef.current?.click()}>Upload files</Button> : undefined
            }
          />
        ) : (
          <>
            <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
              {items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => setActive(item)}
                    className="group block w-full overflow-hidden rounded-lg border border-hairline text-left transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                  >
                    <span className="block aspect-square bg-muted/10">
                      {item.kind === 'IMAGE' ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={item.url}
                          alt={item.altText ?? ''}
                          loading="lazy"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span className="flex h-full w-full items-center justify-center text-sm font-medium text-muted">
                          {item.mimeType.split('/')[1]?.slice(0, 6).toUpperCase()}
                        </span>
                      )}
                    </span>
                    <span className="block border-t border-hairline p-2">
                      <span className="block truncate text-xs font-medium text-content">
                        {item.title || item.filename}
                      </span>
                      <span className="block text-[0.6875rem] text-muted">
                        {formatBytes(item.size)}
                        {item.width ? ` · ${item.width}×${item.height}` : ''}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>

            {cursor ? (
              <div className="mt-6 flex justify-center">
                <Button variant="outline" onClick={loadMore} disabled={loading}>
                  {loading ? 'Loading…' : 'Load more'}
                </Button>
              </div>
            ) : null}
          </>
        )}
      </Card>

      <MediaDetail
        media={active}
        can={can}
        onClose={() => setActive(null)}
        onUpdated={(updated) => {
          setItems((current) => current.map((i) => (i.id === updated.id ? updated : i)));
          setActive(updated);
        }}
        onDeleted={(id) => {
          setItems((current) => current.filter((i) => i.id !== id));
          setActive(null);
        }}
      />
    </>
  );
}

function MediaDetail({
  media,
  can,
  onClose,
  onUpdated,
  onDeleted,
}: {
  media: MediaDto | null;
  can: { edit: boolean; delete: boolean };
  onClose: () => void;
  onUpdated: (media: MediaDto) => void;
  onDeleted: (id: string) => void;
}) {
  const { toast } = useToast();
  const [pending, setPending] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [values, setValues] = React.useState({ altText: '', title: '', caption: '', description: '' });

  React.useEffect(() => {
    if (media) {
      setValues({
        altText: media.altText ?? '',
        title: media.title ?? '',
        caption: '',
        description: '',
      });
      setCopied(false);
    }
  }, [media]);

  if (!media) return null;

  async function save() {
    if (!media) return;
    setPending(true);
    const result = await updateMediaMetadata({ id: media.id, ...values });
    setPending(false);
    if (!result.ok) {
      toast(result.error, 'error');
      return;
    }
    toast(result.message ?? 'Saved.');
    onUpdated({ ...media, altText: values.altText || null, title: values.title || null });
  }

  async function remove() {
    if (!media) return;
    setPending(true);
    const result = await deleteMedia(media.id);
    setPending(false);
    setConfirmDelete(false);
    if (!result.ok) {
      toast(result.error, 'error');
      return;
    }
    toast(result.message ?? 'Deleted.');
    onDeleted(media.id);
  }

  return (
    <>
      <Dialog
        open={Boolean(media)}
        onClose={onClose}
        title={media.title || media.filename}
        size="lg"
        footer={
          <>
            {can.delete ? (
              <Button
                variant="danger"
                className="mr-auto"
                onClick={() => setConfirmDelete(true)}
                disabled={pending}
              >
                <Trash className="h-4 w-4" aria-hidden="true" />
                Delete
              </Button>
            ) : null}
            <Button variant="outline" onClick={onClose} disabled={pending}>
              Close
            </Button>
            {can.edit ? (
              <Button onClick={save} disabled={pending}>
                {pending ? 'Saving…' : 'Save details'}
              </Button>
            ) : null}
          </>
        }
      >
        <div className="grid gap-5 sm:grid-cols-[minmax(0,14rem)_1fr]">
          <div>
            {media.kind === 'IMAGE' ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={media.url}
                alt={media.altText ?? ''}
                className="w-full rounded-lg border border-hairline object-contain"
              />
            ) : (
              <div className="flex aspect-square items-center justify-center rounded-lg border border-hairline bg-muted/10 text-sm text-muted">
                {media.mimeType}
              </div>
            )}

            <dl className="mt-3 space-y-1 text-xs text-muted">
              <div className="flex justify-between gap-2">
                <dt>Size</dt>
                <dd>{formatBytes(media.size)}</dd>
              </div>
              {media.width ? (
                <div className="flex justify-between gap-2">
                  <dt>Dimensions</dt>
                  <dd>
                    {media.width} × {media.height}
                  </dd>
                </div>
              ) : null}
              <div className="flex justify-between gap-2">
                <dt>Type</dt>
                <dd>{media.mimeType}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt>Uploaded</dt>
                <dd>{formatDate(media.createdAt)}</dd>
              </div>
            </dl>
          </div>

          <div className="space-y-4">
            <Field label="File URL">
              <div className="flex gap-2">
                <Input readOnly value={media.url} onFocus={(e) => e.currentTarget.select()} />
                <Button
                  variant="outline"
                  size="md"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(media.url);
                      setCopied(true);
                      window.setTimeout(() => setCopied(false), 2000);
                    } catch {
                      toast('Could not copy — select the field and copy manually.', 'error');
                    }
                  }}
                >
                  {copied ? (
                    <Check className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <Copy className="h-4 w-4" aria-hidden="true" />
                  )}
                  <span className="sr-only">Copy URL</span>
                </Button>
              </div>
            </Field>

            <fieldset disabled={!can.edit} className="space-y-4">
              <Field
                label="Alt text"
                htmlFor="media-alt"
                hint="Describes the image for screen readers and search engines."
              >
                <Input
                  id="media-alt"
                  value={values.altText}
                  onChange={(e) => setValues({ ...values, altText: e.target.value })}
                />
              </Field>
              <Field label="Title" htmlFor="media-title">
                <Input
                  id="media-title"
                  value={values.title}
                  onChange={(e) => setValues({ ...values, title: e.target.value })}
                />
              </Field>
              <Field label="Caption" htmlFor="media-caption">
                <Input
                  id="media-caption"
                  value={values.caption}
                  onChange={(e) => setValues({ ...values, caption: e.target.value })}
                />
              </Field>
              <Field label="Description" htmlFor="media-description">
                <Textarea
                  id="media-description"
                  rows={3}
                  value={values.description}
                  onChange={(e) => setValues({ ...values, description: e.target.value })}
                />
              </Field>
            </fieldset>
          </div>
        </div>
      </Dialog>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={remove}
        title="Delete this file?"
        message="The file is removed from storage. Anything still referencing it will show a broken image."
        pending={pending}
      />
    </>
  );
}
