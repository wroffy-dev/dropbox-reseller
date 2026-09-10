'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Layers, Settings2 } from 'lucide-react';
import {
  addSection,
  updateSection,
  deleteSection,
  duplicateSection,
  reorderSections,
  toggleSectionVisibility,
} from '@/lib/actions/pages';
import { parseSectionDesign } from '@/lib/cms/design';
import { getBlock } from '@/lib/cms/blocks';
import { ConfirmDialog } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils/cn';
import type { BuilderSection } from './section-builder';
import type { FieldValues } from './field-renderer';
import { SectionListPanel } from './section-list-panel';
import { SectionEditorPanel } from './section-editor-panel';
import { AddSectionDialog } from './add-section-dialog';

type MobilePane = 'sections' | 'editor';

/**
 * The page builder workspace.
 *
 * Two panels on desktop — the section outline and the editor for whichever
 * section is selected — and one pane at a time on small screens, because a
 * multi-column builder is unusable on a phone.
 *
 * There is deliberately no embedded preview: an iframe of the page competed
 * for width with the editor and had to be reloaded after every save. Preview
 * now opens in its own tab from the page header, where it gets the full
 * viewport and behaves like the real page. The preview route itself is
 * unchanged and still permission-protected.
 *
 * Every mutation goes through the existing page Server Actions, so ordering,
 * visibility and content are persisted exactly as they were before.
 */
export function PageWorkspace({
  pageId,
  initialSections,
  canEdit,
}: {
  pageId: string;
  initialSections: BuilderSection[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();

  const [sections, setSections] = React.useState(initialSections);
  const [selectedId, setSelectedId] = React.useState<string | null>(initialSections[0]?.id ?? null);
  const [addOpen, setAddOpen] = React.useState(false);
  const [pendingDelete, setPendingDelete] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [mobilePane, setMobilePane] = React.useState<MobilePane>('sections');

  React.useEffect(() => {
    setSections(initialSections);
  }, [initialSections]);

  const selected = sections.find((section) => section.id === selectedId) ?? null;

  const anchorsForOthers = React.useCallback(
    (sectionId: string) =>
      sections
        .filter((section) => section.id !== sectionId)
        .map((section) => parseSectionDesign(section.settings).anchorId)
        .filter(Boolean),
    [sections],
  );

  async function onReorder(ordered: BuilderSection[]) {
    const previous = sections;
    setSections(ordered); // optimistic
    const result = await reorderSections({
      pageId,
      order: ordered.map((section) => section.id),
    });
    if (!result.ok) {
      setSections(previous);
      toast(result.error, 'error');
      return;
    }
  }

  async function onAdd(blockType: string) {
    setBusy(true);
    const result = await addSection(pageId, blockType);
    setBusy(false);
    setAddOpen(false);

    if (!result.ok) {
      toast(result.error, 'error');
      return;
    }

    const definition = getBlock(blockType);
    const created: BuilderSection = {
      id: result.data!.id,
      blockType,
      name: definition?.label ?? blockType,
      isVisible: true,
      sortOrder: (sections[sections.length - 1]?.sortOrder ?? 0) + 10,
      content: (definition ? (definition.schema.parse({}) as FieldValues) : {}) as FieldValues,
      settings: {},
    };

    setSections((current) => [...current, created]);
    setSelectedId(created.id);
    setMobilePane('editor');
    toast(result.message ?? 'Section added.');
  }

  async function onSaveSection(next: {
    name: string | null;
    content: FieldValues;
    settings: FieldValues;
  }): Promise<boolean> {
    if (!selected) return false;
    const result = await updateSection(selected.id, next);
    if (!result.ok) {
      toast(result.error, 'error');
      return false;
    }
    setSections((current) =>
      current.map((section) => (section.id === selected.id ? { ...section, ...next } : section)),
    );
    return true;
  }

  async function onDuplicate(sectionId: string) {
    setBusy(true);
    const result = await duplicateSection(sectionId);
    setBusy(false);
    if (!result.ok) {
      toast(result.error, 'error');
      return;
    }
    toast('Section duplicated.');
    // The copy is created server-side, so pull the authoritative list back.
    router.refresh();
  }

  async function onDelete(sectionId: string) {
    setBusy(true);
    const result = await deleteSection(sectionId);
    setBusy(false);
    setPendingDelete(null);
    if (!result.ok) {
      toast(result.error, 'error');
      return;
    }
    setSections((current) => current.filter((section) => section.id !== sectionId));
    setSelectedId((current) => (current === sectionId ? null : current));
    toast('Section removed.');
  }

  async function onToggleVisibility(sectionId: string) {
    const previous = sections;
    setSections((current) =>
      current.map((section) =>
        section.id === sectionId ? { ...section, isVisible: !section.isVisible } : section,
      ),
    );
    const result = await toggleSectionVisibility(sectionId);
    if (!result.ok) {
      setSections(previous);
      toast(result.error, 'error');
      return;
    }
  }

  const deleteTarget = sections.find((section) => section.id === pendingDelete);

  return (
    <>
      {/* Pane switcher — small screens only. */}
      <div className="mb-3 grid grid-cols-2 gap-1 rounded-lg bg-muted/[0.06] p-1 lg:hidden">
        {(
          [
            ['sections', 'Sections', Layers],
            ['editor', 'Edit', Settings2],
          ] as const
        ).map(([pane, label, Icon]) => (
          <button
            key={pane}
            type="button"
            onClick={() => setMobilePane(pane)}
            aria-pressed={mobilePane === pane}
            className={cn(
              'flex items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors',
              mobilePane === pane
                ? 'bg-surface text-content shadow-sm'
                : 'text-muted hover:text-content',
            )}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:h-[calc(100vh-13rem)] lg:grid-cols-[18rem_1fr] lg:gap-3">
        {/* Left: outline */}
        <div
          className={cn(
            'overflow-hidden rounded-xl border border-hairline bg-surface',
            'lg:flex lg:min-h-0 lg:flex-col',
            mobilePane === 'sections' ? 'flex min-h-[24rem] flex-col' : 'hidden',
          )}
        >
          <SectionListPanel
            sections={sections}
            selectedId={selectedId}
            canEdit={canEdit}
            busy={busy}
            onSelect={(id) => {
              setSelectedId(id);
              setMobilePane('editor');
            }}
            onReorder={onReorder}
            onToggleVisibility={onToggleVisibility}
            onDuplicate={onDuplicate}
            onDelete={(id) => setPendingDelete(id)}
            onAdd={() => setAddOpen(true)}
          />
        </div>

        {/* Right: the selected section's editor */}
        <div
          className={cn(
            'overflow-hidden rounded-xl border border-hairline bg-surface',
            'lg:flex lg:min-h-0 lg:flex-col',
            mobilePane === 'editor' ? 'flex min-h-[24rem] flex-col' : 'hidden',
          )}
        >
          {selected ? (
            <SectionEditorPanel
              key={selected.id}
              section={selected}
              canEdit={canEdit}
              takenAnchors={anchorsForOthers(selected.id)}
              onSave={onSaveSection}
              onClose={() => setMobilePane('sections')}
            />
          ) : (
            <div className="flex flex-1 items-center justify-center p-6 text-center">
              <div>
                <Settings2 className="mx-auto h-8 w-8 text-muted/40" aria-hidden="true" />
                <p className="mt-3 text-sm font-medium text-content">No section selected</p>
                <p className="mt-1 text-xs text-muted">
                  {sections.length === 0
                    ? 'Add a section to start building this page.'
                    : 'Choose a section on the left to edit its content and design.'}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      <AddSectionDialog
        open={addOpen}
        busy={busy}
        onClose={() => setAddOpen(false)}
        onAdd={onAdd}
      />

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        onClose={() => setPendingDelete(null)}
        onConfirm={() => pendingDelete && onDelete(pendingDelete)}
        title={
          deleteTarget
            ? `Remove “${deleteTarget.name || getBlock(deleteTarget.blockType)?.label}”?`
            : 'Remove this section?'
        }
        message="The section and everything you have written in it are permanently removed from this page. To take it off the website without losing the content, hide it instead."
        confirmLabel="Remove section"
        pending={busy}
      />
    </>
  );
}
