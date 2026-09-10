'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle, Spinner } from '@/components/ui/icons';
import type { PublicForm } from '@/lib/services/forms';
import { submitForm } from '@/lib/actions/submit-form';
import { collectAttribution, trackConversion } from '@/lib/analytics/attribution';
import { Input, Textarea, Select, Label, FieldError, Checkbox } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils/cn';

/** Native input type per field type — everything else falls back to text. */
const INPUT_TYPES: Record<string, string> = {
  EMAIL: 'email',
  PHONE: 'tel',
  NUMBER: 'number',
  URL: 'url',
  DATE: 'date',
};

export function PublicFormRenderer({
  form,
  productId,
  leadMagnetId,
  ctaLabel,
  ctaLocation,
  className,
  compact,
}: {
  form: PublicForm;
  productId?: string | null;
  leadMagnetId?: string | null;
  ctaLabel?: string;
  ctaLocation?: string;
  className?: string;
  compact?: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [done, setDone] = React.useState<string | null>(null);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string[]>>({});
  const mountedAt = React.useRef<number>(Date.now());
  const headingId = React.useId();

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    setPending(true);
    setFormError(null);
    setFieldErrors({});

    const data = new FormData(event.currentTarget);
    const values: Record<string, string | string[]> = {};
    for (const field of form.fields) {
      const all = data.getAll(field.name).map((v) => String(v));
      values[field.name] = field.type === 'CHECKBOX' && all.length > 1 ? all : (all[0] ?? '');
    }

    const result = await submitForm({
      formSlug: form.slug,
      productId: productId ?? null,
      leadMagnetId: leadMagnetId ?? null,
      website: String(data.get('website') ?? ''),
      elapsedMs: Date.now() - mountedAt.current,
      values,
      attribution: collectAttribution({ ctaLabel, ctaLocation }),
    });

    setPending(false);

    if (!result.ok) {
      setFormError(result.error);
      setFieldErrors(result.fieldErrors ?? {});
      return;
    }

    trackConversion('generate_lead', { form: form.slug, product_id: productId ?? undefined });

    const redirectUrl = result.data?.redirectUrl;
    if (redirectUrl) {
      router.push(redirectUrl);
      return;
    }
    setDone(result.data?.message ?? form.successMessage);
  }

  if (done) {
    return (
      <div
        className={cn(
          'flex flex-col items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-6 py-10 text-center',
          className,
        )}
        role="status"
      >
        <CheckCircle className="h-8 w-8 text-emerald-600" aria-hidden="true" />
        <p className="max-w-sm text-sm text-emerald-900">{done}</p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className={cn('space-y-4', className)} noValidate aria-labelledby={headingId}>
      <h2 id={headingId} className="sr-only">
        {form.name}
      </h2>

      {formError ? (
        <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {formError}
        </div>
      ) : null}

      <div className={cn('grid gap-4', compact ? 'sm:grid-cols-1' : 'sm:grid-cols-2')}>
        {form.fields.map((field) => {
          if (field.type === 'HIDDEN') {
            return (
              <input key={field.id} type="hidden" name={field.name} defaultValue={field.defaultValue ?? ''} />
            );
          }

          const fieldId = `f-${form.slug}-${field.name}`;
          const errors = fieldErrors[field.name];
          const invalid = Boolean(errors?.length);
          const describedBy = [
            field.helpText ? `${fieldId}-help` : null,
            invalid ? `${fieldId}-error` : null,
          ]
            .filter(Boolean)
            .join(' ');

          const shared = {
            id: fieldId,
            name: field.name,
            required: field.isRequired,
            defaultValue: field.defaultValue ?? undefined,
            placeholder: field.placeholder ?? undefined,
            'aria-invalid': invalid || undefined,
            'aria-describedby': describedBy || undefined,
          } as const;

          return (
            <div
              key={field.id}
              className={cn(
                'space-y-1.5',
                field.width === 'full' || compact ? 'sm:col-span-2' : 'sm:col-span-1',
              )}
            >
              {field.type === 'CHECKBOX' || field.type === 'CONSENT' ? (
                <Checkbox
                  id={fieldId}
                  name={field.name}
                  value="true"
                  required={field.isRequired}
                  defaultChecked={
                    field.type === 'CONSENT' && /^(true|checked|on|yes)$/i.test(field.defaultValue ?? '')
                  }
                  label={field.label}
                  hint={field.helpText ?? undefined}
                  aria-invalid={invalid || undefined}
                />
              ) : (
                <>
                  <Label htmlFor={fieldId} required={field.isRequired}>
                    {field.label}
                  </Label>

                  {field.type === 'TEXTAREA' ? (
                    <Textarea {...shared} rows={4} maxLength={field.maxLength ?? undefined} />
                  ) : field.type === 'SELECT' ? (
                    <Select {...shared} defaultValue={field.defaultValue ?? ''}>
                      <option value="">{field.placeholder || 'Please choose…'}</option>
                      {field.options.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </Select>
                  ) : field.type === 'RADIO' ? (
                    <div className="space-y-2 pt-1" role="radiogroup" aria-label={field.label}>
                      {field.options.map((option) => (
                        <label key={option.value} className="flex items-center gap-2 text-sm text-content">
                          <input
                            type="radio"
                            name={field.name}
                            value={option.value}
                            required={field.isRequired}
                            className="h-4 w-4 border-hairline text-brand focus:ring-brand/30"
                          />
                          {option.label}
                        </label>
                      ))}
                    </div>
                  ) : (
                    <Input
                      {...shared}
                      type={INPUT_TYPES[field.type] ?? 'text'}
                      autoComplete={autoCompleteFor(field.type, field.name)}
                      maxLength={field.maxLength ?? undefined}
                    />
                  )}

                  {field.helpText && !invalid ? (
                    <p id={`${fieldId}-help`} className="text-xs text-muted">
                      {field.helpText}
                    </p>
                  ) : null}
                </>
              )}

              {invalid ? (
                <div id={`${fieldId}-error`}>
                  <FieldError messages={errors} />
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      {/* Honeypot — hidden from users and screen readers, filled by bots. */}
      <div aria-hidden="true" className="absolute left-[-9999px] h-0 w-0 overflow-hidden">
        <label htmlFor={`hp-${form.slug}`}>Leave this field empty</label>
        <input id={`hp-${form.slug}`} type="text" name="website" tabIndex={-1} autoComplete="off" />
      </div>

      {form.consentText ? <p className="text-xs leading-relaxed text-muted">{form.consentText}</p> : null}

      <Button type="submit" size="lg" disabled={pending} className="w-full sm:w-auto">
        {pending ? (
          <>
            <Spinner className="h-4 w-4 animate-spin" aria-hidden="true" />
            Sending…
          </>
        ) : (
          form.submitLabel
        )}
      </Button>
    </form>
  );
}

function autoCompleteFor(type: string, name: string): string | undefined {
  if (type === 'EMAIL') return 'email';
  if (type === 'PHONE') return 'tel';
  if (type === 'NAME') return 'name';
  if (type === 'COMPANY') return 'organization';
  if (type === 'URL') return 'url';
  if (type === 'DATE') return 'bday';
  if (/first_?name/i.test(name)) return 'given-name';
  if (/last_?name/i.test(name)) return 'family-name';
  return undefined;
}
