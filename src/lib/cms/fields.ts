/**
 * Declarative field descriptors.
 *
 * The admin block editor is generated from these, so adding a new CMS block
 * means adding a schema + field list — never touching the editor UI.
 */
export type FieldDescriptor =
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

export type FieldWidth = 'full' | 'half' | 'third';

export type FieldKind = FieldDescriptor['kind'];
