import { z } from 'zod';
import type { FieldDescriptor } from './fields';

/**
 * Block registry.
 *
 * Each entry pairs a Zod schema (validation + defaults) with a declarative field
 * list (drives the generated admin editor). Adding a block here plus a renderer
 * in components/cms/blocks makes it immediately available in the page builder.
 */

const linkFields = (prefix: string, label: string): FieldDescriptor[] => [
  { kind: 'text', name: `${prefix}Label`, label: `${label} label`, width: 'half' },
  { kind: 'url', name: `${prefix}Url`, label: `${label} link`, width: 'half', placeholder: '/contact' },
];

// --- hero ------------------------------------------------------------------
const heroSchema = z.object({
  eyebrow: z.string().max(120).default(''),
  heading: z.string().max(240).default('A headline that states the offer'),
  description: z.string().max(1200).default(''),
  bullets: z.array(z.string().max(160)).default([]),
  imageId: z.string().nullable().default(null),
  primaryCtaLabel: z.string().max(60).default(''),
  primaryCtaUrl: z.string().max(500).default(''),
  secondaryCtaLabel: z.string().max(60).default(''),
  secondaryCtaUrl: z.string().max(500).default(''),
  alignment: z.enum(['left', 'center']).default('left'),
});

// --- richText --------------------------------------------------------------
const richTextSchema = z.object({
  heading: z.string().max(240).default(''),
  content: z.string().default(''),
  width: z.enum(['narrow', 'default']).default('narrow'),
  align: z.enum(['left', 'center']).default('left'),
});

// --- featureGrid -----------------------------------------------------------
const featureGridSchema = z.object({
  heading: z.string().max(240).default(''),
  description: z.string().max(800).default(''),
  columns: z.coerce.number().int().min(2).max(4).default(3),
  style: z.enum(['card', 'plain']).default('card'),
  items: z
    .array(
      z.object({
        title: z.string().max(160).default(''),
        description: z.string().max(600).default(''),
        icon: z.string().max(40).default(''),
        imageId: z.string().nullable().default(null),
      }),
    )
    .default([]),
});

// --- imageContent ----------------------------------------------------------
const imageContentSchema = z.object({
  eyebrow: z.string().max(120).default(''),
  heading: z.string().max(240).default(''),
  description: z.string().default(''),
  imageId: z.string().nullable().default(null),
  imagePosition: z.enum(['left', 'right']).default('right'),
  ctaLabel: z.string().max(60).default(''),
  ctaUrl: z.string().max(500).default(''),
});

// --- productCards ----------------------------------------------------------
const productCardsSchema = z.object({
  heading: z.string().max(240).default(''),
  description: z.string().max(800).default(''),
  source: z.enum(['featured', 'all', 'category', 'selected', 'latest']).default('featured'),
  categoryId: z.string().nullable().default(null),
  productIds: z.array(z.string()).default([]),
  limit: z.coerce.number().int().min(1).max(12).default(3),
  columns: z.coerce.number().int().min(2).max(4).default(3),
  showPrice: z.boolean().default(true),
  showFeatures: z.boolean().default(true),
  billing: z.enum(['monthly', 'annual']).default('monthly'),
});

// --- productTable ----------------------------------------------------------
const productTableSchema = z.object({
  heading: z.string().max(240).default(''),
  description: z.string().max(800).default(''),
  source: z.enum(['featured', 'all', 'category', 'selected', 'latest']).default('all'),
  categoryId: z.string().nullable().default(null),
  productIds: z.array(z.string()).default([]),
  limit: z.coerce.number().int().min(1).max(12).default(6),
  showStorage: z.boolean().default(true),
  showUsers: z.boolean().default(true),
  showMonthly: z.boolean().default(true),
  showAnnual: z.boolean().default(true),
  showFeatures: z.boolean().default(true),
  ctaLabel: z.string().max(60).default('Get a quote'),
});

// --- faq -------------------------------------------------------------------
const faqSchema = z.object({
  heading: z.string().max(240).default('Frequently asked questions'),
  description: z.string().max(800).default(''),
  layout: z.enum(['single', 'split']).default('split'),
  items: z
    .array(
      z.object({
        question: z.string().max(300).default(''),
        answer: z.string().default(''),
      }),
    )
    .default([]),
});

// --- testimonials ----------------------------------------------------------
const testimonialsSchema = z.object({
  heading: z.string().max(240).default(''),
  description: z.string().max(800).default(''),
  columns: z.coerce.number().int().min(1).max(3).default(3),
  items: z
    .array(
      z.object({
        quote: z.string().max(1200).default(''),
        name: z.string().max(120).default(''),
        role: z.string().max(120).default(''),
        company: z.string().max(120).default(''),
        imageId: z.string().nullable().default(null),
      }),
    )
    .default([]),
});

// --- cta -------------------------------------------------------------------
const ctaSchema = z.object({
  heading: z.string().max(240).default(''),
  description: z.string().max(800).default(''),
  primaryCtaLabel: z.string().max(60).default(''),
  primaryCtaUrl: z.string().max(500).default(''),
  secondaryCtaLabel: z.string().max(60).default(''),
  secondaryCtaUrl: z.string().max(500).default(''),
  formSlug: z.string().max(120).default(''),
  variant: z.enum(['panel', 'plain', 'split']).default('panel'),
});

// --- leadMagnet ------------------------------------------------------------
const leadMagnetSchema = z.object({
  leadMagnetSlug: z.string().max(120).default(''),
  heading: z.string().max(240).default(''),
  description: z.string().max(800).default(''),
  imageId: z.string().nullable().default(null),
  formSlug: z.string().max(120).default(''),
  ctaLabel: z.string().max(60).default('Download'),
});

// --- formBlock -------------------------------------------------------------
const formBlockSchema = z.object({
  heading: z.string().max(240).default(''),
  description: z.string().max(800).default(''),
  formSlug: z.string().max(120).default(''),
  layout: z.enum(['single', 'split']).default('single'),
  sideHeading: z.string().max(240).default(''),
  sideBullets: z.array(z.string().max(200)).default([]),
});

// --- logoWall --------------------------------------------------------------
const logoWallSchema = z.object({
  heading: z.string().max(240).default(''),
  logos: z
    .array(
      z.object({
        label: z.string().max(80).default(''),
        imageId: z.string().nullable().default(null),
        url: z.string().max(500).default(''),
      }),
    )
    .default([]),
});

// --- stats -----------------------------------------------------------------
const statsSchema = z.object({
  heading: z.string().max(240).default(''),
  description: z.string().max(600).default(''),
  items: z
    .array(
      z.object({
        value: z.string().max(40).default(''),
        label: z.string().max(160).default(''),
      }),
    )
    .default([]),
});

// --- steps -----------------------------------------------------------------
const stepsSchema = z.object({
  heading: z.string().max(240).default(''),
  description: z.string().max(800).default(''),
  items: z
    .array(
      z.object({
        title: z.string().max(160).default(''),
        description: z.string().max(600).default(''),
      }),
    )
    .default([]),
});

const productSourceFields: FieldDescriptor[] = [
  {
    kind: 'select',
    name: 'source',
    label: 'Which products?',
    width: 'half',
    options: [
      { label: 'Featured products', value: 'featured' },
      { label: 'All published products', value: 'all' },
      { label: 'By category', value: 'category' },
      { label: 'Hand-picked', value: 'selected' },
      { label: 'Latest products', value: 'latest' },
    ],
  },
  { kind: 'number', name: 'limit', label: 'Maximum products', width: 'half', min: 1, max: 12 },
  {
    kind: 'products',
    name: 'productIds',
    label: 'Products',
    help: 'Used when "Hand-picked" is selected. Also sets the category filter.',
  },
];

export type BlockDefinition = {
  type: string;
  label: string;
  description: string;
  group: 'Content' | 'Products' | 'Conversion' | 'Social proof';
  icon: string;
  schema: z.ZodTypeAny;
  fields: FieldDescriptor[];
};

export const BLOCKS: Record<string, BlockDefinition> = {
  hero: {
    type: 'hero',
    label: 'Hero',
    description: 'Large headline, supporting copy and up to two calls to action.',
    group: 'Content',
    icon: 'layout-template',
    schema: heroSchema,
    fields: [
      { kind: 'text', name: 'eyebrow', label: 'Eyebrow', width: 'half', help: 'Small label above the heading' },
      {
        kind: 'select',
        name: 'alignment',
        label: 'Alignment',
        width: 'half',
        options: [
          { label: 'Left', value: 'left' },
          { label: 'Centre', value: 'center' },
        ],
      },
      { kind: 'text', name: 'heading', label: 'Heading' },
      { kind: 'textarea', name: 'description', label: 'Description', rows: 3 },
      {
        kind: 'repeater',
        name: 'bullets',
        label: 'Bullet points',
        itemLabel: 'Bullet',
        titleField: 'value',
        fields: [{ kind: 'text', name: 'value', label: 'Text' }],
      },
      { kind: 'media', name: 'imageId', label: 'Image' },
      ...linkFields('primaryCta', 'Primary button'),
      ...linkFields('secondaryCta', 'Secondary button'),
    ],
  },

  richText: {
    type: 'richText',
    label: 'Rich text',
    description: 'A heading with formatted body copy.',
    group: 'Content',
    icon: 'text',
    schema: richTextSchema,
    fields: [
      { kind: 'text', name: 'heading', label: 'Heading' },
      { kind: 'richtext', name: 'content', label: 'Content' },
      {
        kind: 'select',
        name: 'width',
        label: 'Text width',
        width: 'half',
        options: [
          { label: 'Narrow', value: 'narrow' },
          { label: 'Default', value: 'default' },
        ],
      },
      {
        kind: 'select',
        name: 'align',
        label: 'Alignment',
        width: 'half',
        options: [
          { label: 'Left', value: 'left' },
          { label: 'Centre', value: 'center' },
        ],
      },
    ],
  },

  featureGrid: {
    type: 'featureGrid',
    label: 'Feature grid',
    description: 'A grid of benefits or features with optional icons.',
    group: 'Content',
    icon: 'grid-3x3',
    schema: featureGridSchema,
    fields: [
      { kind: 'text', name: 'heading', label: 'Heading' },
      { kind: 'textarea', name: 'description', label: 'Description', rows: 2 },
      { kind: 'number', name: 'columns', label: 'Columns', width: 'half', min: 2, max: 4 },
      {
        kind: 'select',
        name: 'style',
        label: 'Style',
        width: 'half',
        options: [
          { label: 'Cards', value: 'card' },
          { label: 'Plain', value: 'plain' },
        ],
      },
      {
        kind: 'repeater',
        name: 'items',
        label: 'Features',
        itemLabel: 'Feature',
        titleField: 'title',
        fields: [
          { kind: 'text', name: 'title', label: 'Title' },
          { kind: 'textarea', name: 'description', label: 'Description', rows: 2 },
          {
            kind: 'text',
            name: 'icon',
            label: 'Icon name',
            width: 'half',
            help: 'Lucide icon name, e.g. shield, zap, users',
          },
          { kind: 'media', name: 'imageId', label: 'Image (overrides icon)', width: 'half' },
        ],
      },
    ],
  },

  imageContent: {
    type: 'imageContent',
    label: 'Image + content',
    description: 'An image beside a block of copy and an optional button.',
    group: 'Content',
    icon: 'image',
    schema: imageContentSchema,
    fields: [
      { kind: 'text', name: 'eyebrow', label: 'Eyebrow', width: 'half' },
      {
        kind: 'select',
        name: 'imagePosition',
        label: 'Image position',
        width: 'half',
        options: [
          { label: 'Left', value: 'left' },
          { label: 'Right', value: 'right' },
        ],
      },
      { kind: 'text', name: 'heading', label: 'Heading' },
      { kind: 'richtext', name: 'description', label: 'Content' },
      { kind: 'media', name: 'imageId', label: 'Image' },
      ...linkFields('cta', 'Button'),
    ],
  },

  productCards: {
    type: 'productCards',
    label: 'Product cards',
    description: 'Product plans displayed as pricing cards.',
    group: 'Products',
    icon: 'package',
    schema: productCardsSchema,
    fields: [
      { kind: 'text', name: 'heading', label: 'Heading' },
      { kind: 'textarea', name: 'description', label: 'Description', rows: 2 },
      ...productSourceFields,
      { kind: 'number', name: 'columns', label: 'Columns', width: 'half', min: 2, max: 4 },
      {
        kind: 'select',
        name: 'billing',
        label: 'Show price for',
        width: 'half',
        options: [
          { label: 'Monthly', value: 'monthly' },
          { label: 'Annual', value: 'annual' },
        ],
      },
      { kind: 'boolean', name: 'showPrice', label: 'Show pricing', width: 'half' },
      { kind: 'boolean', name: 'showFeatures', label: 'Show feature list', width: 'half' },
    ],
  },

  productTable: {
    type: 'productTable',
    label: 'Product comparison table',
    description: 'Side-by-side plan comparison. Becomes cards on mobile.',
    group: 'Products',
    icon: 'table',
    schema: productTableSchema,
    fields: [
      { kind: 'text', name: 'heading', label: 'Heading' },
      { kind: 'textarea', name: 'description', label: 'Description', rows: 2 },
      ...productSourceFields,
      { kind: 'text', name: 'ctaLabel', label: 'Button label', width: 'half' },
      { kind: 'boolean', name: 'showStorage', label: 'Show storage row', width: 'half' },
      { kind: 'boolean', name: 'showUsers', label: 'Show users row', width: 'half' },
      { kind: 'boolean', name: 'showMonthly', label: 'Show monthly price', width: 'half' },
      { kind: 'boolean', name: 'showAnnual', label: 'Show annual price', width: 'half' },
      { kind: 'boolean', name: 'showFeatures', label: 'Show features', width: 'half' },
    ],
  },

  faq: {
    type: 'faq',
    label: 'FAQ',
    description: 'Expandable questions and answers. Emits FAQ structured data.',
    group: 'Content',
    icon: 'circle-help',
    schema: faqSchema,
    fields: [
      { kind: 'text', name: 'heading', label: 'Heading' },
      { kind: 'textarea', name: 'description', label: 'Description', rows: 2 },
      {
        kind: 'select',
        name: 'layout',
        label: 'Layout',
        width: 'half',
        options: [
          { label: 'Single column', value: 'single' },
          { label: 'Split (heading left)', value: 'split' },
        ],
      },
      {
        kind: 'repeater',
        name: 'items',
        label: 'Questions',
        itemLabel: 'Question',
        titleField: 'question',
        fields: [
          { kind: 'text', name: 'question', label: 'Question' },
          { kind: 'richtext', name: 'answer', label: 'Answer' },
        ],
      },
    ],
  },

  testimonials: {
    type: 'testimonials',
    label: 'Testimonials',
    description: 'Customer quotes with name, role and company.',
    group: 'Social proof',
    icon: 'quote',
    schema: testimonialsSchema,
    fields: [
      { kind: 'text', name: 'heading', label: 'Heading' },
      { kind: 'textarea', name: 'description', label: 'Description', rows: 2 },
      { kind: 'number', name: 'columns', label: 'Columns', width: 'half', min: 1, max: 3 },
      {
        kind: 'repeater',
        name: 'items',
        label: 'Testimonials',
        itemLabel: 'Testimonial',
        titleField: 'name',
        fields: [
          { kind: 'textarea', name: 'quote', label: 'Quote', rows: 3 },
          { kind: 'text', name: 'name', label: 'Name', width: 'half' },
          { kind: 'text', name: 'role', label: 'Role', width: 'half' },
          { kind: 'text', name: 'company', label: 'Company', width: 'half' },
          { kind: 'media', name: 'imageId', label: 'Photo', width: 'half' },
        ],
      },
    ],
  },

  cta: {
    type: 'cta',
    label: 'Call to action',
    description: 'A conversion panel with buttons or an inline form.',
    group: 'Conversion',
    icon: 'megaphone',
    schema: ctaSchema,
    fields: [
      { kind: 'text', name: 'heading', label: 'Heading' },
      { kind: 'textarea', name: 'description', label: 'Description', rows: 2 },
      {
        kind: 'select',
        name: 'variant',
        label: 'Style',
        width: 'half',
        options: [
          { label: 'Panel', value: 'panel' },
          { label: 'Plain', value: 'plain' },
          { label: 'Split with form', value: 'split' },
        ],
      },
      { kind: 'form', name: 'formSlug', label: 'Inline form', width: 'half', help: 'Used by the split style' },
      ...linkFields('primaryCta', 'Primary button'),
      ...linkFields('secondaryCta', 'Secondary button'),
    ],
  },

  leadMagnet: {
    type: 'leadMagnet',
    label: 'Lead magnet',
    description: 'Offer a download or consultation in exchange for contact details.',
    group: 'Conversion',
    icon: 'gift',
    schema: leadMagnetSchema,
    fields: [
      { kind: 'text', name: 'leadMagnetSlug', label: 'Lead magnet slug', help: 'From Marketing → Lead magnets' },
      { kind: 'text', name: 'heading', label: 'Heading override' },
      { kind: 'textarea', name: 'description', label: 'Description override', rows: 2 },
      { kind: 'media', name: 'imageId', label: 'Image override', width: 'half' },
      { kind: 'form', name: 'formSlug', label: 'Form override', width: 'half' },
      { kind: 'text', name: 'ctaLabel', label: 'Button label', width: 'half' },
    ],
  },

  formBlock: {
    type: 'formBlock',
    label: 'Form',
    description: 'Embed any form built in Forms. Every submission creates a lead.',
    group: 'Conversion',
    icon: 'clipboard-list',
    schema: formBlockSchema,
    fields: [
      { kind: 'text', name: 'heading', label: 'Heading' },
      { kind: 'textarea', name: 'description', label: 'Description', rows: 2 },
      { kind: 'form', name: 'formSlug', label: 'Form', width: 'half' },
      {
        kind: 'select',
        name: 'layout',
        label: 'Layout',
        width: 'half',
        options: [
          { label: 'Single column', value: 'single' },
          { label: 'Split with copy', value: 'split' },
        ],
      },
      { kind: 'text', name: 'sideHeading', label: 'Side heading' },
      {
        kind: 'repeater',
        name: 'sideBullets',
        label: 'Side bullets',
        itemLabel: 'Bullet',
        titleField: 'value',
        fields: [{ kind: 'text', name: 'value', label: 'Text' }],
      },
    ],
  },

  logoWall: {
    type: 'logoWall',
    label: 'Logo wall',
    description: 'Partner or customer logos. Falls back to text when no image is set.',
    group: 'Social proof',
    icon: 'building-2',
    schema: logoWallSchema,
    fields: [
      { kind: 'text', name: 'heading', label: 'Heading' },
      {
        kind: 'repeater',
        name: 'logos',
        label: 'Logos',
        itemLabel: 'Logo',
        titleField: 'label',
        fields: [
          { kind: 'text', name: 'label', label: 'Name', width: 'half' },
          { kind: 'url', name: 'url', label: 'Link', width: 'half' },
          { kind: 'media', name: 'imageId', label: 'Logo image' },
        ],
      },
    ],
  },

  stats: {
    type: 'stats',
    label: 'Statistics',
    description: 'A row of headline numbers.',
    group: 'Social proof',
    icon: 'trending-up',
    schema: statsSchema,
    fields: [
      { kind: 'text', name: 'heading', label: 'Heading' },
      { kind: 'textarea', name: 'description', label: 'Description', rows: 2 },
      {
        kind: 'repeater',
        name: 'items',
        label: 'Statistics',
        itemLabel: 'Statistic',
        titleField: 'value',
        fields: [
          { kind: 'text', name: 'value', label: 'Value', width: 'half', placeholder: '99.9%' },
          { kind: 'text', name: 'label', label: 'Label', width: 'half' },
        ],
      },
    ],
  },

  steps: {
    type: 'steps',
    label: 'Steps / process',
    description: 'A numbered sequence describing how something works.',
    group: 'Content',
    icon: 'list-ordered',
    schema: stepsSchema,
    fields: [
      { kind: 'text', name: 'heading', label: 'Heading' },
      { kind: 'textarea', name: 'description', label: 'Description', rows: 2 },
      {
        kind: 'repeater',
        name: 'items',
        label: 'Steps',
        itemLabel: 'Step',
        titleField: 'title',
        fields: [
          { kind: 'text', name: 'title', label: 'Title' },
          { kind: 'textarea', name: 'description', label: 'Description', rows: 2 },
        ],
      },
    ],
  },
};

export type BlockType = keyof typeof BLOCKS;

export const BLOCK_LIST = Object.values(BLOCKS);

export function getBlock(type: string): BlockDefinition | null {
  return BLOCKS[type] ?? null;
}

/** Parses stored JSON with the block schema, falling back to defaults. */
export function parseBlockContent<T = Record<string, unknown>>(type: string, raw: unknown): T {
  const definition = getBlock(type);
  if (!definition) return (raw ?? {}) as T;
  const result = definition.schema.safeParse(raw ?? {});
  if (result.success) return result.data as T;
  // Partial data is common while editing — fall back to schema defaults.
  return definition.schema.parse({}) as T;
}

export function blockDefaults(type: string): Record<string, unknown> {
  const definition = getBlock(type);
  if (!definition) return {};
  return definition.schema.parse({}) as Record<string, unknown>;
}

export type HeroContent = z.infer<typeof heroSchema>;
export type RichTextContent = z.infer<typeof richTextSchema>;
export type FeatureGridContent = z.infer<typeof featureGridSchema>;
export type ImageContentContent = z.infer<typeof imageContentSchema>;
export type ProductCardsContent = z.infer<typeof productCardsSchema>;
export type ProductTableContent = z.infer<typeof productTableSchema>;
export type FaqContent = z.infer<typeof faqSchema>;
export type TestimonialsContent = z.infer<typeof testimonialsSchema>;
export type CtaContent = z.infer<typeof ctaSchema>;
export type LeadMagnetContent = z.infer<typeof leadMagnetSchema>;
export type FormBlockContent = z.infer<typeof formBlockSchema>;
export type LogoWallContent = z.infer<typeof logoWallSchema>;
export type StatsContent = z.infer<typeof statsSchema>;
export type StepsContent = z.infer<typeof stepsSchema>;
