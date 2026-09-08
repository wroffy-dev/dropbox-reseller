import type { PageSection } from '@prisma/client';
import { parseBlockContent } from '@/lib/cms/blocks';
import {
  parseSectionSettings,
  sectionClasses,
  containerClasses,
  isDarkSection,
} from '@/lib/cms/section-settings';
import type {
  HeroContent,
  RichTextContent,
  FeatureGridContent,
  ImageContentContent,
  ProductCardsContent,
  ProductTableContent,
  FaqContent,
  TestimonialsContent,
  CtaContent,
  LeadMagnetContent,
  FormBlockContent,
  LogoWallContent,
  StatsContent,
  StepsContent,
} from '@/lib/cms/blocks';

import { HeroBlock } from './blocks/hero-block';
import {
  RichTextBlock,
  ImageContentBlock,
  FeatureGridBlock,
  StatsBlock,
  StepsBlock,
  LogoWallBlock,
} from './blocks/content-blocks';
import { ProductCardsBlock, ProductTableBlock } from './blocks/product-blocks';
import { FaqBlock, TestimonialsBlock } from './blocks/social-blocks';
import { CtaBlock, FormBlock, LeadMagnetBlock } from './blocks/conversion-blocks';

/** Dispatches one stored section to its renderer. Unknown block types render nothing. */
async function BlockBody({
  section,
  inverted,
  isFirst,
}: {
  section: PageSection;
  inverted: boolean;
  isFirst: boolean;
}) {
  const { blockType, content } = section;

  switch (blockType) {
    case 'hero':
      return (
        <HeroBlock content={parseBlockContent<HeroContent>(blockType, content)} inverted={inverted} isFirst={isFirst} />
      );
    case 'richText':
      return <RichTextBlock content={parseBlockContent<RichTextContent>(blockType, content)} inverted={inverted} />;
    case 'featureGrid':
      return <FeatureGridBlock content={parseBlockContent<FeatureGridContent>(blockType, content)} inverted={inverted} />;
    case 'imageContent':
      return <ImageContentBlock content={parseBlockContent<ImageContentContent>(blockType, content)} inverted={inverted} />;
    case 'productCards':
      return <ProductCardsBlock content={parseBlockContent<ProductCardsContent>(blockType, content)} inverted={inverted} />;
    case 'productTable':
      return <ProductTableBlock content={parseBlockContent<ProductTableContent>(blockType, content)} inverted={inverted} />;
    case 'faq':
      return <FaqBlock content={parseBlockContent<FaqContent>(blockType, content)} inverted={inverted} />;
    case 'testimonials':
      return <TestimonialsBlock content={parseBlockContent<TestimonialsContent>(blockType, content)} inverted={inverted} />;
    case 'cta':
      return <CtaBlock content={parseBlockContent<CtaContent>(blockType, content)} inverted={inverted} />;
    case 'leadMagnet':
      return <LeadMagnetBlock content={parseBlockContent<LeadMagnetContent>(blockType, content)} inverted={inverted} />;
    case 'formBlock':
      return <FormBlock content={parseBlockContent<FormBlockContent>(blockType, content)} inverted={inverted} />;
    case 'logoWall':
      return <LogoWallBlock content={parseBlockContent<LogoWallContent>(blockType, content)} inverted={inverted} />;
    case 'stats':
      return <StatsBlock content={parseBlockContent<StatsContent>(blockType, content)} inverted={inverted} />;
    case 'steps':
      return <StepsBlock content={parseBlockContent<StepsContent>(blockType, content)} inverted={inverted} />;
    default:
      if (process.env.NODE_ENV !== 'production') {
        console.warn(`[cms] no renderer registered for block type "${blockType}"`);
      }
      return null;
  }
}

export async function SectionRenderer({
  section,
  isFirst = false,
}: {
  section: PageSection;
  isFirst?: boolean;
}) {
  const settings = parseSectionSettings(section.settings);
  const inverted = isDarkSection(settings);

  return (
    <section
      id={settings.anchorId || undefined}
      data-block={section.blockType}
      className={sectionClasses(settings)}
    >
      <div className={containerClasses(settings)}>
        <BlockBody section={section} inverted={inverted} isFirst={isFirst} />
      </div>
    </section>
  );
}

export async function SectionList({ sections }: { sections: PageSection[] }) {
  const visible = sections.filter((s) => s.isVisible).sort((a, b) => a.sortOrder - b.sortOrder);
  return (
    <>
      {visible.map((section, index) => (
        <SectionRenderer key={section.id} section={section} isFirst={index === 0} />
      ))}
    </>
  );
}
