'use client';

import * as React from 'react';
import { X } from 'lucide-react';
import { getBlock } from '@/lib/cms/blocks';
import type { SectionDesign } from '@/lib/cms/design';
import { AdminTabs, TabPanel } from '@/components/admin/admin-tabs';
import { SaveStateIndicator, type SaveState } from '@/components/admin/save-state';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { FieldList, type FieldValues } from './field-renderer';
import { writeFieldPath } from '@/lib/cms/fields';
import { DesignPanel } from './design-panel';
import type { BuilderSection } from './section-builder';

/**
 * Editor for the selected section.
 *
 * Content comes from the block's own field descriptors through the shared field
 * renderer; Design, Responsive and Advanced come from the shared design panel.
 * Nothing block-specific lives here, which is what keeps a new block free.
 */
export function SectionEditorPanel({
  section,
  canEdit,
  takenAnchors,
  onSave,
  onClose,
}: {
  section: BuilderSection;
  canEdit: boolean;
  takenAnchors: string[];
  onSave: (next: {
    name: string | null;
    content: FieldValues;
    settings: FieldValues;
  }) => Promise<boolean>;
  onClose?: () => void;
}) {
  const definition = getBlock(section.blockType);

  const [tab, setTab] = React.useState('content');
  const [name, setName] = React.useState(section.name ?? '');
  const [content, setContent] = React.useState<FieldValues>(section.content);
  const [settings, setSettings] = React.useState<FieldValues>(section.settings);
  const [state, setState] = React.useState<SaveState>('idle');

  // Switching section resets the form to that section's stored values.
  React.useEffect(() => {
    setName(section.name ?? '');
    setContent(section.content);
    setSettings(section.settings);
    setState('idle');
    setTab('content');
  }, [section.id, section.name, section.content, section.settings]);

  const markDirty = () => setState('dirty');

  async function save() {
    setState('saving');
    const ok = await onSave({ name: name || null, content, settings });
    setState(ok ? 'saved' : 'error');
    if (ok) {
      // Fade the confirmation so the panel does not keep shouting "Saved".
      window.setTimeout(
        () => setState((current) => (current === 'saved' ? 'idle' : current)),
        2500,
      );
    }
  }

  if (!definition) {
    return (
      <div className="p-4">
        <p className="rounded-lg border border-dashed border-hairline p-4 text-sm text-muted">
          No editor is registered for the block type{' '}
          <code className="font-mono text-content">{section.blockType}</code>. Remove this section
          or restore the block in the registry.
        </p>
      </div>
    );
  }

  const dirty = state === 'dirty' || state === 'error';

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-start justify-between gap-2 border-b border-hairline px-3 py-2.5">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-content">
            {name || definition.label}
          </h2>
          <p className="truncate text-xs text-muted">{definition.label}</p>
        </div>
        {onClose ? (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close section editor"
            className="shrink-0 rounded-lg p-1.5 text-muted transition-colors hover:bg-muted/10 hover:text-content lg:hidden"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      <AdminTabs
        tabs={[
          { id: 'content', label: 'Content' },
          { id: 'design', label: 'Design' },
          { id: 'responsive', label: 'Responsive' },
          { id: 'advanced', label: 'Advanced' },
        ]}
        active={tab}
        onChange={setTab}
        className="shrink-0 px-2"
      />

      <div className="min-h-0 flex-1 overflow-y-auto">
        <fieldset disabled={!canEdit || state === 'saving'} className="space-y-4 p-3">
          <TabPanel id="content" active={tab} className="space-y-4">
            <FieldList
              fields={definition.fields}
              values={content}
              idPrefix={`c-${section.id}`}
              onChange={(field, value) => {
                setContent((current) => writeFieldPath(current, field, value) as FieldValues);
                markDirty();
              }}
            />
          </TabPanel>

          <TabPanel id="design" active={tab}>
            <DesignPanel
              value={settings}
              view="design"
              idPrefix={`d-${section.id}`}
              takenAnchors={takenAnchors}
              onChange={(next: SectionDesign) => {
                setSettings(next as unknown as FieldValues);
                markDirty();
              }}
            />
          </TabPanel>

          <TabPanel id="responsive" active={tab}>
            <DesignPanel
              value={settings}
              view="responsive"
              idPrefix={`r-${section.id}`}
              takenAnchors={takenAnchors}
              onChange={(next: SectionDesign) => {
                setSettings(next as unknown as FieldValues);
                markDirty();
              }}
            />
          </TabPanel>

          <TabPanel id="advanced" active={tab} className="space-y-4">
            <Field
              label="Section label"
              htmlFor={`name-${section.id}`}
              hint="Only shown in the builder, to help you find this section."
            >
              <Input
                id={`name-${section.id}`}
                value={name}
                placeholder={definition.label}
                onChange={(event) => {
                  setName(event.target.value);
                  markDirty();
                }}
              />
            </Field>

            <DesignPanel
              value={settings}
              view="advanced"
              idPrefix={`a-${section.id}`}
              takenAnchors={takenAnchors}
              onChange={(next: SectionDesign) => {
                setSettings(next as unknown as FieldValues);
                markDirty();
              }}
            />
          </TabPanel>
        </fieldset>
      </div>

      {canEdit ? (
        <div className="flex shrink-0 items-center justify-between gap-2 border-t border-hairline bg-muted/[0.03] px-3 py-2.5">
          <SaveStateIndicator state={state} />
          <Button size="sm" onClick={save} disabled={!dirty}>
            {state === 'saving' ? 'Saving…' : 'Save section'}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
