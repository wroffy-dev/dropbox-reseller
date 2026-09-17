'use client';

import { Field, Input } from '@/components/ui/field';

/**
 * Hex text input paired with a native colour picker, kept in sync.
 *
 * `optional` marks a colour that may be left empty to inherit — the footer
 * palette works that way — and adds the only affordance a native colour input
 * does not have: a way back to no value at all.
 */
export function ColorField({
  label,
  name,
  value,
  onChange,
  error,
  optional,
  hint,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (next: string) => void;
  error?: string[];
  optional?: boolean;
  hint?: string;
}) {
  const isValid = /^#[0-9a-fA-F]{6}$/.test(value);

  return (
    <Field
      label={label}
      htmlFor={name}
      error={error}
      hint={hint ?? (optional ? 'Leave empty to inherit.' : undefined)}
    >
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={isValid ? value : '#000000'}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          aria-label={`${label} colour picker`}
          className="h-10 w-12 shrink-0 cursor-pointer rounded-lg border border-hairline bg-surface p-1"
        />
        <Input
          id={name}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={(e) => onChange(e.target.value.trim().toUpperCase())}
          aria-invalid={(!isValid && value !== '') || undefined}
          placeholder={optional ? 'Inherit' : '#0061FF'}
          className="font-mono text-sm uppercase"
        />
        {optional && value ? (
          <button
            type="button"
            onClick={() => onChange('')}
            className="shrink-0 rounded-lg border border-hairline px-2.5 py-2 text-xs text-muted transition-colors hover:text-content"
          >
            Clear
          </button>
        ) : null}
      </div>
    </Field>
  );
}
