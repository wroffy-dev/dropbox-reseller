/**
 * Declarative field descriptors.
 *
 * The admin block editor is generated from these, so adding a new CMS block
 * means adding a schema + field list — never touching the editor UI.
 */

export type FieldWidth = 'full' | 'half' | 'third';

/**
 * Conditional visibility. A control with `showWhen` stays hidden until another
 * field in the same group holds one of the listed values, which keeps the basic
 * editing surface small without pushing advanced options into raw JSON.
 */
export type FieldCondition = { field: string; equals: Array<string | number | boolean> };

type FieldVariant =
  | { kind: 'text'; name: string; label: string; help?: string; placeholder?: string; width?: FieldWidth }
  | { kind: 'textarea'; name: string; label: string; help?: string; rows?: number; width?: FieldWidth }
  | { kind: 'richtext'; name: string; label: string; help?: string; width?: FieldWidth }
  | { kind: 'number'; name: string; label: string; help?: string; min?: number; max?: number; width?: FieldWidth }
  | { kind: 'boolean'; name: string; label: string; help?: string; width?: FieldWidth }
  | {
      kind: 'select';
      name: string;
      label: string;
      help?: string;
      options: Array<{ label: string; value: string }>;
      width?: FieldWidth;
    }
  | { kind: 'url'; name: string; label: string; help?: string; placeholder?: string; width?: FieldWidth }
  | { kind: 'media'; name: string; label: string; help?: string; width?: FieldWidth }
  | { kind: 'form'; name: string; label: string; help?: string; width?: FieldWidth }
  | { kind: 'products'; name: string; label: string; help?: string; width?: FieldWidth }
  | { kind: 'productCategory'; name: string; label: string; help?: string; width?: FieldWidth }
  | { kind: 'brand'; name: string; label: string; help?: string; width?: FieldWidth }
  /** Searchable picker over the allow-listed CMS icon set. */
  | { kind: 'icon'; name: string; label: string; help?: string; width?: FieldWidth }
  /** Colour picker and hex input, kept in sync. */
  | { kind: 'color'; name: string; label: string; help?: string; width?: FieldWidth }
  /** Number + unit control producing a CSS length such as "40px". */
  | { kind: 'length'; name: string; label: string; help?: string; placeholder?: string; width?: FieldWidth }
  | {
      kind: 'repeater';
      name: string;
      label: string;
      help?: string;
      itemLabel: string;
      /** Field on the item used as the collapsed row title. */
      titleField: string;
      fields: FieldDescriptor[];
      max?: number;
    };

export type FieldDescriptor = FieldVariant & { showWhen?: FieldCondition };

export type FieldKind = FieldVariant['kind'];

/** Evaluates a descriptor's `showWhen` against the current values of its group. */
export function isFieldVisible(field: FieldDescriptor, values: Record<string, unknown>): boolean {
  if (!field.showWhen) return true;
  const current = values[field.showWhen.field];
  return field.showWhen.equals.some((candidate) => candidate === current);
}
