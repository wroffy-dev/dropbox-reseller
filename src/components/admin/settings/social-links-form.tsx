'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Plus } from 'lucide-react';
import { saveSocialLinks } from '@/lib/actions/social-links';
import { SOCIAL_NETWORKS, defaultSocialLabel } from '@/lib/social/networks';
import { Card, CardHeader, CardBody } from '@/components/ui/card';
import { Field, Input, Select, Switch } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { Spinner, TrashIcon, resolveSocialIcon } from '@/components/ui/icons';
import { cn } from '@/lib/utils/cn';

export type SocialLinkValue = {
  id: string;
  network: string;
  label: string;
  url: string;
  isVisible: boolean;
};

type Row = SocialLinkValue & { key: string };

/**
 * Social profiles for the footer.
 *
 * Saves the whole list at once — the drag order is the stored order — which is
 * the same shape as the navigation editor, so the two screens behave alike.
 */
export function SocialLinksForm({
  initial,
  canEdit,
}: {
  initial: SocialLinkValue[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [rows, setRows] = React.useState<Row[]>(() =>
    initial.map((link, index) => ({ ...link, key: link.id || `row-${index}` })),
  );
  const [pending, setPending] = React.useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function update(key: string, patch: Partial<SocialLinkValue>) {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function add() {
    setRows((current) => [
      ...current,
      {
        key: `new-${Date.now()}`,
        id: '',
        network: 'linkedin',
        label: defaultSocialLabel('linkedin'),
        url: '',
        isVisible: true,
      },
    ]);
  }

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setRows((current) => {
      const from = current.findIndex((row) => row.key === active.id);
      const to = current.findIndex((row) => row.key === over.id);
      return from === -1 || to === -1 ? current : arrayMove(current, from, to);
    });
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);

    const result = await saveSocialLinks({
      links: rows
        // A row the admin added but never filled in is dropped rather than
        // rejected — it is an abandoned blank, not a mistake worth blocking on.
        .filter((row) => row.url.trim())
        .map((row) => ({
          network: row.network,
          label: row.label.trim() || defaultSocialLabel(row.network),
          url: row.url.trim(),
          isVisible: row.isVisible,
        })),
    });

    setPending(false);
    if (!result.ok) {
      toast(result.error, 'error');
      return;
    }
    toast(result.message ?? 'Saved.');
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="mt-5">
      <Card>
        <CardHeader
          title="Social profiles"
          description="Shown as icons in the footer's brand column, in this order."
        />
        <CardBody className="space-y-3">
          <fieldset disabled={!canEdit || pending} className="space-y-3">
            {rows.length === 0 ? (
              <p className="text-sm text-muted">No social profiles yet.</p>
            ) : (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                <SortableContext
                  items={rows.map((row) => row.key)}
                  strategy={verticalListSortingStrategy}
                >
                  <ul className="space-y-3">
                    {rows.map((row) => (
                      <SocialRow
                        key={row.key}
                        row={row}
                        onChange={(patch) => update(row.key, patch)}
                        onRemove={() =>
                          setRows((current) => current.filter((r) => r.key !== row.key))
                        }
                      />
                    ))}
                  </ul>
                </SortableContext>
              </DndContext>
            )}

            <Button type="button" variant="outline" size="sm" onClick={add}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Add profile
            </Button>
          </fieldset>
        </CardBody>

        {canEdit ? (
          <div className="flex justify-end border-t border-hairline bg-muted/[0.03] px-4 py-3 sm:px-5">
            <Button type="submit" disabled={pending}>
              {pending ? (
                <>
                  <Spinner className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Saving…
                </>
              ) : (
                'Save social profiles'
              )}
            </Button>
          </div>
        ) : null}
      </Card>
    </form>
  );
}

function SocialRow({
  row,
  onChange,
  onRemove,
}: {
  row: Row;
  onChange: (patch: Partial<SocialLinkValue>) => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: row.key,
  });
  const Icon = resolveSocialIcon(row.network);

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'rounded-lg border border-hairline p-3',
        isDragging && 'opacity-60',
        !row.isVisible && 'opacity-60',
      )}
    >
      <div className="flex items-start gap-3">
        <button
          type="button"
          className="mt-2 cursor-grab text-muted"
          aria-label={`Reorder ${row.label}`}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" aria-hidden="true" />
        </button>

        <Icon className="mt-2.5 h-4 w-4 shrink-0 text-muted" aria-hidden="true" />

        <div className="grid flex-1 gap-3 sm:grid-cols-[10rem_1fr]">
          <Field label="Network" htmlFor={`${row.key}-network`}>
            <Select
              id={`${row.key}-network`}
              value={row.network}
              onChange={(e) => {
                const network = e.target.value;
                // A label the admin never customised follows the network.
                const renamed =
                  row.label === defaultSocialLabel(row.network) ? defaultSocialLabel(network) : row.label;
                onChange({ network, label: renamed });
              }}
            >
              {SOCIAL_NETWORKS.map((network) => (
                <option key={network.key} value={network.key}>
                  {network.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="URL" htmlFor={`${row.key}-url`}>
            <Input
              id={`${row.key}-url`}
              value={row.url}
              placeholder="https://"
              onChange={(e) => onChange({ url: e.target.value })}
            />
          </Field>

          <Field
            label="Label"
            htmlFor={`${row.key}-label`}
            hint="Read out by screen readers."
            className="sm:col-span-2"
          >
            <Input
              id={`${row.key}-label`}
              value={row.label}
              onChange={(e) => onChange({ label: e.target.value })}
            />
          </Field>
        </div>

        <div className="flex flex-col items-end gap-2">
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove ${row.label}`}
            className="rounded-lg p-2 text-muted transition-colors hover:text-red-600"
          >
            <TrashIcon className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="mt-3 pl-10">
        <Switch
          label="Visible"
          checked={row.isVisible}
          onChange={(v) => onChange({ isVisible: v })}
        />
      </div>
    </li>
  );
}
