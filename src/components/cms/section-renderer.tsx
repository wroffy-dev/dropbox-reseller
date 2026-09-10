import type { PageSection } from '@prisma/client';
import { parseBlockContent } from '@/lib/cms/blocks';
import {
  parseSectionDesign,
  buildSectionStyles,
  resolveAnchors,
  type SectionDesign,
} from '@/lib/cms/design';
import { getMedia } from '@/lib/services/media';
import type {
  HeroContent,
  RichTextContent,
  FeatureGridContent,
  ImageContentContent,
  ProductCardsContent,
  ProductTableContent,
  ProductGridContent,
  FaqContent,
  TestimonialsContent,
  CtaContent,
  LeadMagnetContent,
  FormBlockContent,
  LogoWallContent,
  StatsContent,
  StepsContent,
  ImageCardsContent,
  IconCardsContent,
  ImageBoxContent,
  IconBoxContent,
  ListSectionContent,
  HeadingTextContent,
  TextListImageContent,
  StatisticsContent,
} from '@/lib/cms/blocks';

import type { BlockContext } from './blocks/shared';
import { HeroBlock } from './blocks/hero-block';
import {
  RichTextBlock,
  ImageContentBlock,
  FeatureGridBlock,
  StatsBlock,
  StepsBlock,
  LogoWallBlock,
} from './blocks/content-blocks';
import { ProductCardsBlock, ProductTableBlock, ProductGridBlock } from './blocks/product-blocks';
import { FaqBlock, TestimonialsBlock } from './blocks/social-blocks';
import { CtaBlock, FormBlock, LeadMagnetBlock } from './blocks/conversion-blocks';
import {
  ImageCardsBlock,
  IconCardsBlock,
  ImageBoxBlock,
  IconBoxBlock,
  ListSectionBlock,
  HeadingTextBlock,
  TextListImageBlock,
  StatisticsBlock,
} from './blocks/card-blocks';

/**
 * Dispatches one stored section to its renderer.
 *
 * This switch is the single mapping from a CMS block type to a frontend
 * component. Adding a block means adding a schema in lib/cms/blocks.ts, a
 * component, and one case here — never a new page-specific component tree.
 * Unknown block types render nothing rather than breaking the page.
 */
async function BlockBody({ section, ctx }: { section: PageSection; ctx: BlockContext }) {
  const { blockType, content } = section;
  const parse = <T,>() => parseBlockContent<T>(blockType, content);

  switch (blockType) {
    case 'hero':
      return <HeroBlock content={parse<HeroContent>()} ctx={ctx} />;
    case 'richText':
      return <RichTextBlock content={parse<RichTextContent>()} ctx={ctx} />;
    case 'featureGrid':
      return <FeatureGridBlock content={parse<FeatureGridContent>()} ctx={ctx} />;
    case 'imageContent':
      return <ImageContentBlock content={parse<ImageContentContent>()} ctx={ctx} />;
    case 'productCards':
      return <ProductCardsBlock content={parse<ProductCardsContent>()} ctx={ctx} />;
    case 'productTable':
      return <ProductTableBlock content={parse<ProductTableContent>()} ctx={ctx} />;
    case 'productGrid':
      return <ProductGridBlock content={parse<ProductGridContent>()} ctx={ctx} />;
    case 'faq':
      return <FaqBlock content={parse<FaqContent>()} ctx={ctx} />;
    case 'testimonials':
      return <TestimonialsBlock content={parse<TestimonialsContent>()} ctx={ctx} />;
    case 'cta':
      return <CtaBlock content={parse<CtaContent>()} ctx={ctx} />;
    case 'leadMagnet':
      return <LeadMagnetBlock content={parse<LeadMagnetContent>()} ctx={ctx} />;
    case 'formBlock':
      return <FormBlock content={parse<FormBlockContent>()} ctx={ctx} />;
    case 'logoWall':
      return <LogoWallBlock content={parse<LogoWallContent>()} ctx={ctx} />;
    case 'stats':
      return <StatsBlock content={parse<StatsContent>()} ctx={ctx} />;
    case 'steps':
      return <StepsBlock content={parse<StepsContent>()} ctx={ctx} />;
    case 'imageCards':
      return <ImageCardsBlock content={parse<ImageCardsContent>()} ctx={ctx} />;
    case 'iconCards':
      return <IconCardsBlock content={parse<IconCardsContent>()} ctx={ctx} />;
    case 'imageBox':
      return <ImageBoxBlock content={parse<ImageBoxContent>()} ctx={ctx} />;
    case 'iconBox':
      return <IconBoxBlock content={parse<IconBoxContent>()} ctx={ctx} />;
    case 'listSection':
      return <ListSectionBlock content={parse<ListSectionContent>()} ctx={ctx} />;
    case 'headingText':
      return <HeadingTextBlock content={parse<HeadingTextContent>()} ctx={ctx} />;
    case 'textListImage':
      return <TextListImageBlock content={parse<TextListImageContent>()} ctx={ctx} />;
    case 'statistics':
      return <StatisticsBlock content={parse<StatisticsContent>()} ctx={ctx} />;
    default:
      if (process.env.NODE_ENV !== 'production') {
        console.warn(`[cms] no renderer registered for block type "${blockType}"`);
      }
      return null;
  }
}

/**
 * Renders one section: its design wrapper, background layers and block body.
 *
 * Desktop design values are written as inline CSS custom properties; tablet and
 * mobile overrides ship as one small <style> element per section, and a section
 * left at its defaults emits no CSS at all.
 */
export async function SectionRenderer({
  section,
  isFirst = false,
  anchorId,
  design: providedDesign,
}: {
  section: PageSection;
  isFirst?: boolean;
  anchorId?: string;
  design?: SectionDesign;
}) {
  const design = providedDesign ?? parseSectionDesign(section.settings);

  const backgroundMedia =
    design.background.type === 'image' && design.background.imageId
      ? await getMedia(design.background.imageId)
      : null;

  const styles = buildSectionStyles(design, section.id, backgroundMedia?.url ?? null);
  const ctx: BlockContext = { inverted: styles.inverted, isFirst, design };

  return (
    <>
      {styles.css ? <style dangerouslySetInnerHTML={{ __html: styles.css }} /> : null}
      <section
        id={anchorId || design.anchorId || undefined}
        data-block={section.blockType}
        className={`cms-section ${styles.className}`}
        style={styles.style as React.CSSProperties}
      >
        {styles.layer ? (
          <div
            className="cms-section-layer"
            aria-hidden="true"
            style={{
              backgroundImage: styles.layer.image ?? undefined,
              backgroundPosition: styles.layer.position,
              backgroundSize: styles.layer.size,
              backgroundRepeat: styles.layer.repeat,
              backgroundAttachment: styles.layer.attachment,
            }}
          />
        ) : null}
        {styles.overlay ? (
          <div className="cms-section-overlay" aria-hidden="true" style={{ backgroundColor: styles.overlay }} />
        ) : null}

        <div className="cms-container">
          <BlockBody section={section} ctx={ctx} />
        </div>
      </section>
    </>
  );
}

/**
 * Renders every visible section of a page in order.
 *
 * Anchor IDs are de-duplicated across the page here rather than per section, so
 * two sections that were both given `#pricing` cannot emit the same DOM id.
 */
export async function SectionList({ sections }: { sections: PageSection[] }) {
  const visible = sections.filter((s) => s.isVisible).sort((a, b) => a.sortOrder - b.sortOrder);
  const anchors = resolveAnchors(visible);

  return (
    <>
      {visible.map((section, index) => (
        <SectionRenderer
          key={section.id}
          section={section}
          isFirst={index === 0}
          anchorId={anchors.get(section.id)}
        />
      ))}
    </>
  );
}
