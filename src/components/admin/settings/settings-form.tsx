'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { saveWebsiteSettings } from '@/lib/actions/settings';
import { Card, CardHeader, CardBody } from '@/components/ui/card';
import { Field, Input, Textarea, Select, Switch } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { MediaUrlPicker } from './media-url-picker';
import { ColorField } from './color-field';
import { Alert } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { Spinner } from '@/components/ui/icons';
import { SUPPORTED_CURRENCIES } from '@/lib/utils/money';
import { cn } from '@/lib/utils/cn';

export type WebsiteSettingsValues = Record<string, string | boolean>;

const TABS = [
  { id: 'general', label: 'General' },
  { id: 'branding', label: 'Branding' },
  { id: 'theme', label: 'Colours & type' },
  { id: 'header', label: 'Header' },
  { id: 'footer', label: 'Footer' },
] as const;

type TabId = (typeof TABS)[number]['id'];

const FONTS = [
  'Inter', 'Manrope', 'Poppins', 'Roboto', 'Open Sans', 'Lato', 'Montserrat',
  'Source Sans 3', 'Nunito', 'Work Sans', 'DM Sans', 'Plus Jakarta Sans',
  'Space Grotesk', 'Outfit', 'Figtree', 'Playfair Display', 'Merriweather', 'Lora',
];

const WEIGHTS = ['300', '400', '500', '600', '700', '800'];

export function WebsiteSettingsForm({
  initial,
  canEdit,
}: {
  initial: WebsiteSettingsValues;
  canEdit: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [values, setValues] = React.useState(initial);
  const [errors, setErrors] = React.useState<Record<string, string[]>>({});
  const [pending, setPending] = React.useState(false);
  const [tab, setTab] = React.useState<TabId>('general');

  const str = (key: string) => String(values[key] ?? '');
  const bool = (key: string) => Boolean(values[key]);
  const set = (key: string, value: string | boolean) =>
    setValues((current) => ({ ...current, [key]: value }));

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setErrors({});

    const data = new FormData();
    for (const [key, value] of Object.entries(values)) data.set(key, String(value));

    const result = await saveWebsiteSettings(data);
    setPending(false);

    if (!result.ok) {
      setErrors(result.fieldErrors ?? {});
      toast(result.error, 'error');
      const firstError = Object.keys(result.fieldErrors ?? {})[0];
      if (firstError) setTab(tabForField(firstError));
      return;
    }
    toast(result.message ?? 'Saved.');
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit}>
      {bool('maintenanceMode') ? (
        <Alert tone="warning" className="mb-5" title="Maintenance mode is on">
          The public site is still served, but this flag is available for your deployment to act on.
        </Alert>
      ) : null}

      <Card>
        <div className="scroll-x flex items-center gap-1 border-b border-hairline px-3 py-2">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              aria-pressed={tab === t.id}
              className={cn(
                'shrink-0 rounded-lg px-3 py-1.5 text-sm transition-colors',
                tab === t.id ? 'bg-brand/10 font-medium text-brand' : 'text-muted hover:text-content',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        <CardBody className="space-y-4">
          <fieldset disabled={!canEdit || pending} className="space-y-4">
            {tab === 'general' ? (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Website name" htmlFor="siteName" required error={errors.siteName}>
                    <Input id="siteName" value={str('siteName')} onChange={(e) => set('siteName', e.target.value)} />
                  </Field>
                  <Field label="Website URL" htmlFor="siteUrl" required error={errors.siteUrl} hint="Used for canonical URLs and the sitemap.">
                    <Input id="siteUrl" value={str('siteUrl')} onChange={(e) => set('siteUrl', e.target.value)} />
                  </Field>
                </div>

                <Field label="Website title" htmlFor="siteTitle" hint="A short tagline used alongside the name.">
                  <Input id="siteTitle" value={str('siteTitle')} onChange={(e) => set('siteTitle', e.target.value)} />
                </Field>

                <Field label="Description" htmlFor="siteDescription">
                  <Textarea id="siteDescription" rows={3} value={str('siteDescription')} onChange={(e) => set('siteDescription', e.target.value)} />
                </Field>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Contact email" htmlFor="contactEmail" hint="Receives lead notifications when no sales address is set.">
                    <Input id="contactEmail" type="email" value={str('contactEmail')} onChange={(e) => set('contactEmail', e.target.value)} />
                  </Field>
                  <Field label="Contact phone" htmlFor="contactPhone">
                    <Input id="contactPhone" value={str('contactPhone')} onChange={(e) => set('contactPhone', e.target.value)} />
                  </Field>
                  <Field label="WhatsApp number" htmlFor="whatsappNumber">
                    <Input id="whatsappNumber" value={str('whatsappNumber')} onChange={(e) => set('whatsappNumber', e.target.value)} />
                  </Field>
                  <Field label="Default currency" htmlFor="defaultCurrency">
                    <Select id="defaultCurrency" value={str('defaultCurrency')} onChange={(e) => set('defaultCurrency', e.target.value)}>
                      {SUPPORTED_CURRENCIES.map((code) => (
                        <option key={code} value={code}>{code}</option>
                      ))}
                    </Select>
                  </Field>
                </div>

                <Field label="Address" htmlFor="address">
                  <Textarea id="address" rows={2} value={str('address')} onChange={(e) => set('address', e.target.value)} />
                </Field>

                <fieldset className="space-y-4 rounded-lg border border-hairline p-4">
                  <legend className="px-1 text-sm font-medium text-content">Social profiles</legend>
                  <div className="grid gap-4 sm:grid-cols-2">
                    {[
                      ['linkedinUrl', 'LinkedIn'],
                      ['twitterUrl', 'X / Twitter'],
                      ['facebookUrl', 'Facebook'],
                      ['instagramUrl', 'Instagram'],
                      ['youtubeUrl', 'YouTube'],
                    ].map(([key, label]) => (
                      <Field key={key} label={label!} htmlFor={key}>
                        <Input id={key} value={str(key!)} placeholder="https://" onChange={(e) => set(key!, e.target.value)} />
                      </Field>
                    ))}
                  </div>
                </fieldset>

                <div className="rounded-lg border border-hairline p-4">
                  <Switch
                    checked={bool('maintenanceMode')}
                    onChange={(next) => set('maintenanceMode', next)}
                    label="Maintenance mode"
                    hint="A flag your deployment can use to show a holding page."
                  />
                </div>
              </>
            ) : null}

            {tab === 'branding' ? (
              <>
                <MediaUrlPicker label="Logo" value={str('logoUrl')} onChange={(v) => set('logoUrl', v)} hint="Shown in the header, the admin sidebar and the sign-in page." />
                <MediaUrlPicker label="Logo for dark backgrounds" value={str('logoDarkUrl')} onChange={(v) => set('logoDarkUrl', v)} hint="Used in the footer. Falls back to the main logo." />
                <MediaUrlPicker label="Favicon" value={str('faviconUrl')} onChange={(v) => set('faviconUrl', v)} hint="A square PNG or ICO, at least 32×32." />
                <MediaUrlPicker label="Default social share image" value={str('ogImageUrl')} onChange={(v) => set('ogImageUrl', v)} hint="Recommended 1200×630." />
              </>
            ) : null}

            {tab === 'theme' ? (
              <>
                <fieldset className="space-y-4 rounded-lg border border-hairline p-4">
                  <legend className="px-1 text-sm font-medium text-content">Colours</legend>
                  <p className="text-xs text-muted">
                    These become CSS variables used across the whole site — buttons, links, headings and
                    borders all follow them.
                  </p>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <ColorField label="Primary" name="colorPrimary" value={str('colorPrimary')} error={errors.colorPrimary} onChange={(v) => set('colorPrimary', v)} />
                    <ColorField label="Secondary" name="colorSecondary" value={str('colorSecondary')} error={errors.colorSecondary} onChange={(v) => set('colorSecondary', v)} />
                    <ColorField label="Accent 1" name="colorAccent1" value={str('colorAccent1')} error={errors.colorAccent1} onChange={(v) => set('colorAccent1', v)} />
                    <ColorField label="Accent 2" name="colorAccent2" value={str('colorAccent2')} error={errors.colorAccent2} onChange={(v) => set('colorAccent2', v)} />
                    <ColorField label="Background" name="colorBackground" value={str('colorBackground')} error={errors.colorBackground} onChange={(v) => set('colorBackground', v)} />
                    <ColorField label="Text" name="colorText" value={str('colorText')} error={errors.colorText} onChange={(v) => set('colorText', v)} />
                    <ColorField label="Muted text" name="colorMuted" value={str('colorMuted')} error={errors.colorMuted} onChange={(v) => set('colorMuted', v)} />
                    <ColorField label="Borders" name="colorBorder" value={str('colorBorder')} error={errors.colorBorder} onChange={(v) => set('colorBorder', v)} />
                  </div>

                  <div
                    className="rounded-lg border p-4"
                    style={{ background: str('colorBackground'), borderColor: str('colorBorder') }}
                  >
                    <p className="text-sm font-semibold" style={{ color: str('colorText') }}>
                      Preview
                    </p>
                    <p className="mt-1 text-xs" style={{ color: str('colorMuted') }}>
                      Supporting copy uses the muted colour.
                    </p>
                    <span
                      className="mt-3 inline-flex rounded-lg px-3 py-1.5 text-xs font-medium text-white"
                      style={{ background: str('colorPrimary') }}
                    >
                      Primary button
                    </span>
                  </div>
                </fieldset>

                <fieldset className="space-y-4 rounded-lg border border-hairline p-4">
                  <legend className="px-1 text-sm font-medium text-content">Typography</legend>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Heading font" htmlFor="headingFont">
                      <Select id="headingFont" value={str('headingFont')} onChange={(e) => set('headingFont', e.target.value)}>
                        {FONTS.map((font) => (<option key={font} value={font}>{font}</option>))}
                      </Select>
                    </Field>
                    <Field label="Heading weight" htmlFor="headingWeight" error={errors.headingWeight}>
                      <Select id="headingWeight" value={str('headingWeight')} onChange={(e) => set('headingWeight', e.target.value)}>
                        {WEIGHTS.map((weight) => (<option key={weight} value={weight}>{weight}</option>))}
                      </Select>
                    </Field>
                    <Field label="Body font" htmlFor="bodyFont">
                      <Select id="bodyFont" value={str('bodyFont')} onChange={(e) => set('bodyFont', e.target.value)}>
                        {FONTS.map((font) => (<option key={font} value={font}>{font}</option>))}
                      </Select>
                    </Field>
                    <Field label="Body weight" htmlFor="bodyWeight" error={errors.bodyWeight}>
                      <Select id="bodyWeight" value={str('bodyWeight')} onChange={(e) => set('bodyWeight', e.target.value)}>
                        {WEIGHTS.map((weight) => (<option key={weight} value={weight}>{weight}</option>))}
                      </Select>
                    </Field>
                    <Field label="Base font size" htmlFor="baseFontSize" error={errors.baseFontSize} hint="Scales the whole site. 16px is the default.">
                      <Input id="baseFontSize" value={str('baseFontSize')} onChange={(e) => set('baseFontSize', e.target.value)} />
                    </Field>
                  </div>
                  <p className="text-xs text-muted">
                    Google Fonts are loaded automatically for the fonts listed here. Any other name falls back
                    to the system font stack.
                  </p>
                </fieldset>
              </>
            ) : null}

            {tab === 'header' ? (
              <>
                <fieldset className="space-y-4 rounded-lg border border-hairline p-4">
                  <legend className="px-1 text-sm font-medium text-content">Announcement bar</legend>
                  <Switch
                    checked={bool('announcementEnabled')}
                    onChange={(next) => set('announcementEnabled', next)}
                    label="Show the announcement bar"
                  />
                  <Field label="Announcement text" htmlFor="announcementText">
                    <Input id="announcementText" value={str('announcementText')} onChange={(e) => set('announcementText', e.target.value)} />
                  </Field>
                  <Field label="Announcement link" htmlFor="announcementUrl">
                    <Input id="announcementUrl" value={str('announcementUrl')} placeholder="/contact" onChange={(e) => set('announcementUrl', e.target.value)} />
                  </Field>
                </fieldset>

                <fieldset className="space-y-4 rounded-lg border border-hairline p-4">
                  <legend className="px-1 text-sm font-medium text-content">Header buttons</legend>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Primary button label" htmlFor="headerCtaLabel">
                      <Input id="headerCtaLabel" value={str('headerCtaLabel')} onChange={(e) => set('headerCtaLabel', e.target.value)} />
                    </Field>
                    <Field label="Primary button link" htmlFor="headerCtaUrl">
                      <Input id="headerCtaUrl" value={str('headerCtaUrl')} placeholder="/contact" onChange={(e) => set('headerCtaUrl', e.target.value)} />
                    </Field>
                    <Field label="Secondary button label" htmlFor="headerSecondaryCtaLabel">
                      <Input id="headerSecondaryCtaLabel" value={str('headerSecondaryCtaLabel')} onChange={(e) => set('headerSecondaryCtaLabel', e.target.value)} />
                    </Field>
                    <Field label="Secondary button link" htmlFor="headerSecondaryCtaUrl">
                      <Input id="headerSecondaryCtaUrl" value={str('headerSecondaryCtaUrl')} onChange={(e) => set('headerSecondaryCtaUrl', e.target.value)} />
                    </Field>
                  </div>
                </fieldset>
              </>
            ) : null}

            {tab === 'footer' ? (
              <>
                <Field label="Footer description" htmlFor="footerDescription" hint="Shown under the logo in the first footer column.">
                  <Textarea id="footerDescription" rows={3} value={str('footerDescription')} onChange={(e) => set('footerDescription', e.target.value)} />
                </Field>
                <Field label="Copyright line" htmlFor="copyrightText" hint="Leave blank for “© {year} {site name}”.">
                  <Input id="copyrightText" value={str('copyrightText')} onChange={(e) => set('copyrightText', e.target.value)} />
                </Field>
                <p className="text-sm text-muted">
                  Footer columns come from Navigation — every menu with a footer location becomes a column.
                </p>
              </>
            ) : null}
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
                'Save settings'
              )}
            </Button>
          </div>
        ) : null}
      </Card>
    </form>
  );
}

function tabForField(field: string): TabId {
  if (field.startsWith('color') || field.includes('Font') || field.includes('Weight')) return 'theme';
  if (field.startsWith('logo') || field.startsWith('favicon') || field.startsWith('ogImage')) return 'branding';
  if (field.startsWith('announcement') || field.startsWith('header')) return 'header';
  if (field.startsWith('footer') || field.startsWith('copyright')) return 'footer';
  return 'general';
}
