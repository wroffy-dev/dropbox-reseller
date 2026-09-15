import { describe, it, expect } from 'vitest';
import { BLOCKS, BLOCK_PICKER_LIST, getBlock, blockDefaults, parseBlockContent } from '@/lib/cms/blocks';
import { SLIDER_BLOCKS } from '@/lib/cms/slider-blocks';
import { sliderSettingsSchema, sliderSettingsShape, SLIDER_FIELDS, readSliderSettings } from '@/lib/cms/slider';
import type { FieldDescriptor } from '@/lib/cms/fields';

const SLIDER_TYPES = [
  'logoSlider',
  'imageSlider',
  'testimonialSlider',
  'contentSlider',
  'textBoxSlider',
] as const;

/** Every field a block declares, repeater children included. */
function allFields(fields: FieldDescriptor[]): FieldDescriptor[] {
  return fields.flatMap((field) =>
    field.kind === 'repeater' ? [field, ...allFields(field.fields)] : [field],
  );
}

describe('slider blocks', () => {
  it('registers every slider in the one block registry', () => {
    for (const type of SLIDER_TYPES) {
      expect(getBlock(type), `missing block: ${type}`).not.toBeNull();
      expect(BLOCKS[type]).toBe(SLIDER_BLOCKS[type]);
    }
  });

  it('offers every slider in the page builder', () => {
    for (const type of SLIDER_TYPES) {
      expect(
        BLOCK_PICKER_LIST.some((block) => block.type === type),
        `${type} is not offered in "Add section"`,
      ).toBe(true);
    }
  });

  it('gives every slider the shared track controls, so none can drift', () => {
    const shared = Object.keys(sliderSettingsShape);
    for (const type of SLIDER_TYPES) {
      const defaults = blockDefaults(type) as Record<string, unknown>;
      const names = new Set(allFields(BLOCKS[type]!.fields).map((field) => field.name));
      for (const control of shared) {
        expect(control in defaults, `${type} content is missing ${control}`).toBe(true);
        expect(names.has(control), `${type} has no editor control for ${control}`).toBe(true);
      }
    }
  });

  it('never repeats a control the Design tab already owns', () => {
    // A slider is a section: width, background, padding, margin, radius and
    // alignment come from SectionDesign. Two controls for one thing is how an
    // editor ends up with a section that ignores half of what they set.
    const owned = ['background', 'padding', 'margin', 'width', 'contentWidth', 'align'];
    for (const type of SLIDER_TYPES) {
      const names = allFields(BLOCKS[type]!.fields).map((field) => field.name);
      for (const control of owned) {
        expect(names, `${type} repeats the Design tab's ${control}`).not.toContain(control);
      }
    }
  });

  it('starts every slider empty and valid, with no slides configured', () => {
    for (const type of SLIDER_TYPES) {
      const defaults = blockDefaults(type) as { items: unknown[] };
      expect(Array.isArray(defaults.items), `${type} needs an items array`).toBe(true);
      expect(defaults.items).toHaveLength(0);
    }
  });

  it('keeps a slide list through a parse rather than dropping it', () => {
    const parsed = parseBlockContent<{ items: Array<{ title: string }>; heading: string }>(
      'logoSlider',
      { heading: 'Partners', items: [{ title: 'Acme' }, { title: 'Globex' }] },
    );
    expect(parsed.heading).toBe('Partners');
    expect(parsed.items.map((item) => item.title)).toEqual(['Acme', 'Globex']);
  });

  it('declares an editor control for every field each slider stores', () => {
    for (const type of SLIDER_TYPES) {
      const stored = Object.keys(blockDefaults(type) as Record<string, unknown>);
      const names = new Set(allFields(BLOCKS[type]!.fields).map((field) => field.name));
      const orphans = stored.filter((key) => !names.has(key));
      expect(orphans, `${type} stores fields the editor cannot reach: ${orphans.join(', ')}`).toEqual([]);
    }
  });
});

describe('slider settings', () => {
  it('falls back to a working slider when the stored value is nonsense', () => {
    const settings = readSliderSettings({
      autoplay: 'yes please',
      autoplayDelay: 'soon',
      speed: -1,
      gap: 9999,
      slidesDesktop: 99,
      slidesMobile: 0,
    });
    expect(settings.autoplayDelay).toBe(5000);
    expect(settings.speed).toBe(400);
    expect(settings.gap).toBe(24);
    expect(settings.slidesDesktop).toBe(3);
    expect(settings.slidesMobile).toBe(1);
  });

  it('keeps the counts inside what the CSS can lay out', () => {
    const shape = sliderSettingsSchema.parse({
      slidesDesktop: 6,
      slidesTablet: 4,
      slidesMobile: 2,
    });
    expect([shape.slidesDesktop, shape.slidesTablet, shape.slidesMobile]).toEqual([6, 4, 2]);
  });

  it('shows the autoplay timing only once autoplay is on', () => {
    const delay = SLIDER_FIELDS.find((field) => field.name === 'autoplayDelay');
    expect(delay?.showWhen).toEqual({ field: 'autoplay', equals: [true] });
  });

  it('treats zero speed as "no animation" rather than an invalid value', () => {
    expect(sliderSettingsSchema.parse({ speed: 0 }).speed).toBe(0);
  });
});
