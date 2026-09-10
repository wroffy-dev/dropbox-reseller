'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Plus, Trash, ChevronDown, Copy } from 'lucide-react';
import { saveForm } from '@/lib/actions/forms';
import { formFieldTypes } from '@/lib/validation/form';
import {
  newField,
  nextFieldKey,
  uniqueFieldName,
  FIELD_TYPE_LABELS,
  MAPPED_FIELD_TYPES,
  CHOICE_FIELD_TYPES,
  EMPTY_FORM,
  type BuilderField,
  type FormBuilderValues,
} from '@/lib/cms/form-model';
import { Card, CardHeader, CardBody } from '@/components/ui/card';
import { Field, Input, Select, Textarea, Switch } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast';
import { Spinner } from '@/components/ui/icons';
import { slugify } from '@/lib/utils/slug';
import { cn } from '@/lib/utils/cn';

/*
 * The builder's data model lives in lib/cms/form-model so Server Components can
 * use it too. These re-exports keep the original import paths working.
 */
export { EMPTY_FORM, newField };
export type { BuilderField, FormBuilderValues };

const TYPE_LABELS = FIELD_TYPE_LABELS;

export function FormBuilder({
  initial,
  products,
  mode,
  canEdit,
}: {
  initial: FormBuilderValues;
  products: Array<{ id: string; name: string }>;
  mode: 'create' | 'edit';
  canEdit: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [values, setValues] = React.useState(initial);
  const [errors, setErrors] = React.useState<Record<string, string[]>>({});
  const [pending, setPending] = React.useState(false);
  const [openField, setOpenField] = React.useState<string | null>(null);
  const [slugTouched, setSlugTouched] = React.useState(mode === 'edit');

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const set = <K extends keyof FormBuilderValues>(key: K, value: FormBuilderValues[K]) =>
    setValues((current) => ({ ...current, [key]: value }));

  const updateField = (key: string, patch: Partial<BuilderField>) =>
    setValues((current) => ({
      ...current,
      fields: current.fields.map((field) => (field.key === key ? { ...field, ...patch } : field)),
    }));

  function addField(type: string) {
    const field = newField(type);
    // Derive a machine name from the label so the admin rarely has to think about it.
    field.name = uniqueFieldName(slugify(field.label).replace(/-/g, '_'), values.fields);
    setValues((current) => ({ ...current, fields: [...current.fields, field] }));
    setOpenField(field.key);
  }

  function duplicateField(key: string) {
    const index = values.fields.findIndex((f) => f.key === key);
    if (index < 0) return;
    const source = values.fields[index]!;
    const copy: BuilderField = {
      ...source,
      // A copy is a brand-new row: it must not overwrite the original on save,
      // and its machine name has to stay unique within the form.
      key: nextFieldKey(),
      id: null,
      name: uniqueFieldName(source.name || 'field', values.fields),
      options: source.options.map((option) => ({ ...option })),
    };
    const next = [...values.fields];
    next.splice(index + 1, 0, copy);
    set('fields', next);
    setOpenField(copy.key);
  }

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = values.fields.findIndex((f) => f.key === active.id);
    const newIndex = values.fields.findIndex((f) => f.key === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    set('fields', arrayMove(values.fields, oldIndex, newIndex));
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setErrors({});

    const payload = {
      ...values,
      slug: values.slug || slugify(values.name),
      defaultProductId: values.defaultProductId || null,
      redirectUrl: values.redirectUrl || null,
      leadSource: values.leadSource || null,
      notifyEmails: values.notifyEmails || null,
      consentText: values.consentText || null,
      description: values.description || null,
      fields: values.fields.map((field) => ({
        id: field.id,
        type: field.type,
        label: field.label,
        name: field.name || slugify(field.label).replace(/-/g, '_'),
        placeholder: field.placeholder || null,
        helpText: field.helpText || null,
        defaultValue: field.defaultValue || null,
        isRequired: field.isRequired,
        width: field.width,
        options: field.options.filter((o) => o.value),
        minLength: field.minLength ? Number(field.minLength) : null,
        maxLength: field.maxLength ? Number(field.maxLength) : null,
        pattern: field.pattern || null,
      })),
    };

    const result = await saveForm(initial.id ?? null, payload);
    setPending(false);

    if (!result.ok) {
      setErrors(result.fieldErrors ?? {});
      toast(result.error, 'error');
      return;
    }
    toast(result.message ?? 'Saved.');
    if (mode === 'create' && result.data && 'id' in result.data) {
      router.push(`/admin/forms/${(result.data as { id: string }).id}`);
    } else {
      router.refresh();
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-6 xl:grid-cols-[1fr_22rem]">
      <div className="min-w-0 xl:order-1">
        <Card>
          <CardHeader
            title="Fields"
            description="Drag to reorder. Name, email, phone, company and paragraph fields map onto the lead record automatically."
          />
          <CardBody>
            {errors.fields ? (
              <p role="alert" className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
                {errors.fields.join(' ')}
              </p>
            ) : null}

            {values.fields.length === 0 ? (
              <p className="rounded-lg border border-dashed border-hairline px-4 py-8 text-center text-sm text-muted">
                No fields yet. Add an email field to start capturing leads.
              </p>
            ) : (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                <SortableContext
                  items={values.fields.map((f) => f.key)}
                  strategy={verticalListSortingStrategy}
                >
                  <ul className="space-y-2">
                    {values.fields.map((field) => (
                      <SortableFieldRow
                        key={field.key}
                        field={field}
                        canEdit={canEdit}
                        expanded={openField === field.key}
                        onToggle={() => setOpenField(openField === field.key ? null : field.key)}
                        onChange={(patch) => updateField(field.key, patch)}
                        onDuplicate={() => duplicateField(field.key)}
                        onRemove={() =>
                          set(
                            'fields',
                            values.fields.filter((f) => f.key !== field.key),
                          )
                        }
                      />
                    ))}
                  </ul>
                </SortableContext>
              </DndContext>
            )}

            {canEdit ? (
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <label htmlFor="add-field-type" className="sr-only">
                  Field type to add
                </label>
                <Select
                  id="add-field-type"
                  defaultValue=""
                  className="w-auto"
                  onChange={(e) => {
                    if (e.target.value) {
                      addField(e.target.value);
                      e.target.value = '';
                    }
                  }}
                >
                  <option value="">Add a field…</option>
                  {formFieldTypes.map((type) => (
                    <option key={type} value={type}>
                      {TYPE_LABELS[type] ?? type}
                    </option>
                  ))}
                </Select>
              </div>
            ) : null}
          </CardBody>
        </Card>
      </div>

      <div className="min-w-0 space-y-6 xl:order-2">
        <Card>
          <CardHeader title="Form settings" />
          <CardBody className="space-y-4">
            <Field label="Form name" htmlFor="form-name" required error={errors.name}>
              <Input
                id="form-name"
                value={values.name}
                required
                onChange={(e) => {
                  set('name', e.target.value);
                  if (!slugTouched) set('slug', slugify(e.target.value));
                }}
              />
            </Field>

            <Field
              label="Slug"
              htmlFor="form-slug"
              error={errors.slug}
              hint="Used to reference this form from CMS blocks and product buttons."
            >
              <Input
                id="form-slug"
                value={values.slug}
                onChange={(e) => {
                  setSlugTouched(true);
                  set('slug', e.target.value);
                }}
                onBlur={(e) => set('slug', slugify(e.target.value))}
              />
            </Field>

            <Field label="Internal description" htmlFor="form-description">
              <Textarea
                id="form-description"
                rows={2}
                value={values.description}
                onChange={(e) => set('description', e.target.value)}
              />
            </Field>

            <Field label="Submit button label" htmlFor="form-submit">
              <Input
                id="form-submit"
                value={values.submitLabel}
                onChange={(e) => set('submitLabel', e.target.value)}
              />
            </Field>

            <Field
              label="Success message"
              htmlFor="form-success"
              hint="Shown in place of the form after a successful submission."
            >
              <Textarea
                id="form-success"
                rows={2}
                value={values.successMessage}
                onChange={(e) => set('successMessage', e.target.value)}
              />
            </Field>

            <Field
              label="Redirect after submit"
              htmlFor="form-redirect"
              hint="Optional. Overrides the success message."
            >
              <Input
                id="form-redirect"
                value={values.redirectUrl}
                placeholder="/thank-you"
                onChange={(e) => set('redirectUrl', e.target.value)}
              />
            </Field>

            <Field label="Consent text" htmlFor="form-consent" hint="Shown above the submit button.">
              <Textarea
                id="form-consent"
                rows={2}
                value={values.consentText}
                onChange={(e) => set('consentText', e.target.value)}
              />
            </Field>

            <div className="rounded-lg border border-hairline p-4">
              <Switch
                checked={values.isActive}
                onChange={(next) => set('isActive', next)}
                label="Form is active"
                hint="Inactive forms stop accepting submissions everywhere."
              />
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Lead handling" />
          <CardBody className="space-y-4">
            <div className="rounded-lg border border-hairline p-4">
              <Switch
                checked={values.createsLead}
                onChange={(next) => set('createsLead', next)}
                label="Create a CRM lead"
                hint="Turn off for newsletter-style forms that only record a submission."
              />
            </div>

            <Field label="Lead source" htmlFor="form-source" hint="Recorded on every lead from this form.">
              <Input
                id="form-source"
                value={values.leadSource}
                onChange={(e) => set('leadSource', e.target.value)}
              />
            </Field>

            <Field
              label="Default product"
              htmlFor="form-product"
              hint="Used when the visitor did not arrive from a specific product."
            >
              <Select
                id="form-product"
                value={values.defaultProductId}
                onChange={(e) => set('defaultProductId', e.target.value)}
              >
                <option value="">None</option>
                {products.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name}
                  </option>
                ))}
              </Select>
            </Field>

            <Field
              label="Notify these addresses"
              htmlFor="form-notify"
              hint="Comma separated. Added to the sales addresses in Email settings."
            >
              <Input
                id="form-notify"
                value={values.notifyEmails}
                placeholder="sales@example.com, ops@example.com"
                onChange={(e) => set('notifyEmails', e.target.value)}
              />
            </Field>
          </CardBody>

          {canEdit ? (
            <div className="flex justify-end gap-2 border-t border-hairline bg-muted/[0.03] px-4 py-3 sm:px-5">
              <Link
                href="/admin/forms"
                className="rounded-lg px-3 py-2 text-sm text-muted transition-colors hover:text-content"
              >
                Cancel
              </Link>
              <Button type="submit" disabled={pending}>
                {pending ? (
                  <>
                    <Spinner className="h-4 w-4 animate-spin" aria-hidden="true" />
                    Saving…
                  </>
                ) : mode === 'create' ? (
                  'Create form'
                ) : (
                  'Save form'
                )}
              </Button>
            </div>
          ) : null}
        </Card>
      </div>
    </form>
  );
}

function SortableFieldRow({
  field,
  canEdit,
  expanded,
  onToggle,
  onChange,
  onDuplicate,
  onRemove,
}: {
  field: BuilderField;
  canEdit: boolean;
  expanded: boolean;
  onToggle: () => void;
  onChange: (patch: Partial<BuilderField>) => void;
  onDuplicate: () => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: field.key,
    disabled: !canEdit,
  });

  const hasOptions = CHOICE_FIELD_TYPES.has(field.type);

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'rounded-lg border bg-surface',
        isDragging ? 'border-brand shadow-lg' : 'border-hairline',
      )}
    >
      <div className="flex items-center gap-2 px-3 py-2.5">
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label={`Reorder ${field.label}`}
          disabled={!canEdit}
          className="cursor-grab rounded p-1 text-muted hover:bg-muted/10 active:cursor-grabbing disabled:opacity-40"
        >
          <GripVertical className="h-4 w-4" aria-hidden="true" />
        </button>

        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          className="min-w-0 flex-1 text-left"
        >
          <span className="block truncate text-sm font-medium text-content">
            {field.label || 'Untitled field'}
          </span>
          <span className="block truncate font-mono text-xs text-muted">{field.name}</span>
        </button>

        <Badge tone="neutral">{TYPE_LABELS[field.type] ?? field.type}</Badge>
        {field.isRequired ? <Badge tone="warning">Required</Badge> : null}
        {MAPPED_FIELD_TYPES.has(field.type) ? <Badge tone="brand">Mapped</Badge> : null}

        {canEdit ? (
          <>
            <button
              type="button"
              onClick={onDuplicate}
              aria-label={`Duplicate ${field.label}`}
              title="Duplicate field"
              className="rounded p-1.5 text-muted transition-colors hover:bg-muted/10 hover:text-content"
            >
              <Copy className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onRemove}
              aria-label={`Remove ${field.label}`}
              title="Remove field"
              className="rounded p-1.5 text-muted transition-colors hover:bg-red-50 hover:text-red-600"
            >
              <Trash className="h-4 w-4" />
            </button>
          </>
        ) : null}

        <ChevronDown
          className={cn('h-4 w-4 shrink-0 text-muted transition-transform', expanded && 'rotate-180')}
          aria-hidden="true"
        />
      </div>

      {expanded ? (
        <fieldset disabled={!canEdit} className="space-y-4 border-t border-hairline p-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Label" htmlFor={`${field.key}-label`}>
              <Input
                id={`${field.key}-label`}
                value={field.label}
                onChange={(e) => onChange({ label: e.target.value })}
              />
            </Field>
            <Field
              label="Machine name"
              htmlFor={`${field.key}-name`}
              hint="Key used in submissions and exports."
            >
              <Input
                id={`${field.key}-name`}
                value={field.name}
                onChange={(e) => onChange({ name: e.target.value })}
                onBlur={(e) =>
                  onChange({ name: e.target.value.toLowerCase().replace(/[^a-z0-9_]+/g, '_') })
                }
              />
            </Field>
            <Field label="Type" htmlFor={`${field.key}-type`}>
              <Select
                id={`${field.key}-type`}
                value={field.type}
                onChange={(e) => {
                  const type = e.target.value;
                  onChange({
                    type,
                    options:
                      CHOICE_FIELD_TYPES.has(type)
                        ? field.options.length
                          ? field.options
                          : [{ label: 'Option one', value: 'option-one' }]
                        : [],
                  });
                }}
              >
                {formFieldTypes.map((type) => (
                  <option key={type} value={type}>
                    {TYPE_LABELS[type] ?? type}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Width" htmlFor={`${field.key}-width`}>
              <Select
                id={`${field.key}-width`}
                value={field.width}
                onChange={(e) => onChange({ width: e.target.value as 'full' | 'half' })}
              >
                <option value="full">Full width</option>
                <option value="half">Half width</option>
              </Select>
            </Field>
            <Field label="Placeholder" htmlFor={`${field.key}-placeholder`}>
              <Input
                id={`${field.key}-placeholder`}
                value={field.placeholder}
                onChange={(e) => onChange({ placeholder: e.target.value })}
              />
            </Field>
            <Field label="Help text" htmlFor={`${field.key}-help`}>
              <Input
                id={`${field.key}-help`}
                value={field.helpText}
                onChange={(e) => onChange({ helpText: e.target.value })}
              />
            </Field>
            {field.type === 'HIDDEN' || field.type === 'CONSENT' ? (
              <Field
                label={field.type === 'HIDDEN' ? 'Value' : 'Default value'}
                htmlFor={`${field.key}-default`}
                className="sm:col-span-2"
                hint={
                  field.type === 'CONSENT'
                    ? 'Enter “checked” to tick the box by default.'
                    : 'Sent with every submission and never shown to the visitor.'
                }
              >
                <Input
                  id={`${field.key}-default`}
                  value={field.defaultValue}
                  onChange={(e) => onChange({ defaultValue: e.target.value })}
                />
              </Field>
            ) : null}
          </div>

          {hasOptions ? (
            <OptionsEditor
              options={field.options}
              onChange={(options) => onChange({ options })}
              idPrefix={field.key}
            />
          ) : null}

          <details className="rounded-lg border border-hairline p-3">
            <summary className="cursor-pointer text-sm font-medium text-content">Validation</summary>
            <div className="mt-3 grid gap-4 sm:grid-cols-3">
              <Field label="Minimum length" htmlFor={`${field.key}-min`}>
                <Input
                  id={`${field.key}-min`}
                  type="number"
                  min={0}
                  value={field.minLength}
                  onChange={(e) => onChange({ minLength: e.target.value })}
                />
              </Field>
              <Field label="Maximum length" htmlFor={`${field.key}-max`}>
                <Input
                  id={`${field.key}-max`}
                  type="number"
                  min={1}
                  value={field.maxLength}
                  onChange={(e) => onChange({ maxLength: e.target.value })}
                />
              </Field>
              <Field
                label="Pattern"
                htmlFor={`${field.key}-pattern`}
                hint="Regular expression. Leave blank for none."
              >
                <Input
                  id={`${field.key}-pattern`}
                  value={field.pattern}
                  onChange={(e) => onChange({ pattern: e.target.value })}
                />
              </Field>
            </div>
          </details>

          <div className="rounded-lg border border-hairline p-3">
            <Switch
              checked={field.isRequired}
              onChange={(next) => onChange({ isRequired: next })}
              label="Required field"
            />
          </div>
        </fieldset>
      ) : null}
    </li>
  );
}

function OptionsEditor({
  options,
  onChange,
  idPrefix,
}: {
  options: Array<{ label: string; value: string }>;
  onChange: (next: Array<{ label: string; value: string }>) => void;
  idPrefix: string;
}) {
  return (
    <fieldset className="rounded-lg border border-hairline p-3">
      <legend className="px-1 text-sm font-medium text-content">Options</legend>
      <ul className="space-y-2">
        {options.map((option, index) => (
          <li key={index} className="flex items-center gap-2">
            <Input
              value={option.label}
              aria-label={`Option ${index + 1} label`}
              placeholder="Label shown to the visitor"
              onChange={(e) =>
                onChange(
                  options.map((o, i) =>
                    i === index
                      ? { label: e.target.value, value: o.value || slugify(e.target.value) }
                      : o,
                  ),
                )
              }
            />
            <Input
              value={option.value}
              aria-label={`Option ${index + 1} stored value`}
              placeholder="stored-value"
              onChange={(e) =>
                onChange(options.map((o, i) => (i === index ? { ...o, value: e.target.value } : o)))
              }
            />
            <button
              type="button"
              onClick={() => onChange(options.filter((_, i) => i !== index))}
              aria-label={`Remove option ${index + 1}`}
              className="shrink-0 rounded p-2 text-muted transition-colors hover:bg-red-50 hover:text-red-600"
            >
              <Trash className="h-4 w-4" />
            </button>
          </li>
        ))}
      </ul>
      <Button
        variant="outline"
        size="sm"
        className="mt-3"
        onClick={() => onChange([...options, { label: '', value: '' }])}
        id={`${idPrefix}-add-option`}
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
        Add option
      </Button>
    </fieldset>
  );
}
