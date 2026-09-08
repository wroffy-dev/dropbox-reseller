import { z } from 'zod';
import type { FieldDescriptor } from './fields';

/** Presentation settings shared by every section, independent of block type. */
export const sectionSettingsSchema = z.object({
  background: z.enum(['default', 'muted', 'brand', 'dark', 'gradient']).default('default'),
  paddingTop: z.enum(['none', 'sm', 'md', 'lg', 'xl']).default('lg'),
  paddingBottom: z.enum(['none', 'sm', 'md', 'lg', 'xl']).default('lg'),
  width: z.enum(['narrow', 'default', 'wide', 'full']).default('default'),
  anchorId: z.string().max(64).optional().nullable(),
  hideOnMobile: z.boolean().default(false),
  hideOnDesktop: z.boolean().default(false),
});

export type SectionSettings = z.infer<typeof sectionSettingsSchema>;

export const DEFAULT_SECTION_SETTINGS: SectionSettings = sectionSettingsSchema.parse({});

export function parseSectionSettings(raw: unknown): SectionSettings {
  const result = sectionSettingsSchema.safeParse(raw ?? {});
  return result.success ? result.data : DEFAULT_SECTION_SETTINGS;
}

export const SECTION_SETTING_FIELDS: FieldDescriptor[] = [
  {
    kind: 'select',
    name: 'background',
    label: 'Background',
    width: 'half',
    options: [
      { label: 'Default', value: 'default' },
      { label: 'Muted', value: 'muted' },
      { label: 'Brand', value: 'brand' },
      { label: 'Dark', value: 'dark' },
      { label: 'Gradient', value: 'gradient' },
    ],
  },
  {
    kind: 'select',
    name: 'width',
    label: 'Content width',
    width: 'half',
    options: [
      { label: 'Narrow', value: 'narrow' },
      { label: 'Default', value: 'default' },
      { label: 'Wide', value: 'wide' },
      { label: 'Full bleed', value: 'full' },
    ],
  },
  {
    kind: 'select',
    name: 'paddingTop',
    label: 'Space above',
    width: 'half',
    options: [
      { label: 'None', value: 'none' },
      { label: 'Small', value: 'sm' },
      { label: 'Medium', value: 'md' },
      { label: 'Large', value: 'lg' },
      { label: 'Extra large', value: 'xl' },
    ],
  },
  {
    kind: 'select',
    name: 'paddingBottom',
    label: 'Space below',
    width: 'half',
    options: [
      { label: 'None', value: 'none' },
      { label: 'Small', value: 'sm' },
      { label: 'Medium', value: 'md' },
      { label: 'Large', value: 'lg' },
      { label: 'Extra large', value: 'xl' },
    ],
  },
  {
    kind: 'text',
    name: 'anchorId',
    label: 'Anchor ID',
    help: 'Lets you link straight to this section, e.g. #pricing',
    width: 'half',
  },
  { kind: 'boolean', name: 'hideOnMobile', label: 'Hide on mobile', width: 'half' },
  { kind: 'boolean', name: 'hideOnDesktop', label: 'Hide on desktop', width: 'half' },
];

/** Tailwind classes derived from settings — used by the public renderer. */
export function sectionClasses(settings: SectionSettings): string {
  const bg = {
    default: 'bg-surface text-content',
    muted: 'bg-muted/[0.045] text-content',
    brand: 'bg-brand text-white',
    dark: 'bg-[rgb(var(--brand-secondary))] text-white',
    gradient:
      'bg-gradient-to-b from-brand/[0.07] via-surface to-surface text-content',
  }[settings.background];

  const pt = {
    none: 'pt-0',
    sm: 'pt-6 sm:pt-8',
    md: 'pt-10 sm:pt-14',
    lg: 'pt-14 sm:pt-20',
    xl: 'pt-20 sm:pt-28',
  }[settings.paddingTop];

  const pb = {
    none: 'pb-0',
    sm: 'pb-6 sm:pb-8',
    md: 'pb-10 sm:pb-14',
    lg: 'pb-14 sm:pb-20',
    xl: 'pb-20 sm:pb-28',
  }[settings.paddingBottom];

  const visibility = [
    settings.hideOnMobile ? 'hidden lg:block' : '',
    settings.hideOnDesktop ? 'lg:hidden' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return [bg, pt, pb, visibility].filter(Boolean).join(' ');
}

export function containerClasses(settings: SectionSettings): string {
  return {
    narrow: 'mx-auto w-full max-w-3xl px-4 sm:px-6',
    default: 'mx-auto w-full max-w-6xl px-4 sm:px-6',
    wide: 'mx-auto w-full max-w-7xl px-4 sm:px-6',
    full: 'w-full',
  }[settings.width];
}

/** True when the section paints a dark surface and needs inverted text. */
export function isDarkSection(settings: SectionSettings): boolean {
  return settings.background === 'brand' || settings.background === 'dark';
}
