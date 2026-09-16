import 'server-only';
import { prisma } from '@/lib/db/prisma';
import { localiseContent } from '@/lib/country/routing';
import type { CountryContext } from '@/lib/country/types';
import { Prisma } from '@prisma/client';
import type { SyncMode } from '@prisma/client';

/**
 * Copying one market's content into another.
 *
 * ## What is copied, and what turns out not to need copying
 *
 * The schema already answers most of this. Products, product categories and
 * brands are **global** rows with no country on them — a category is one
 * category, visible to every market — so there is nothing to duplicate and
 * duplicating them would be the bug. What a market actually needs for a product
 * is its own `ProductCountry` row: the status, ordering, pricing and SEO for
 * that market. That is what gets created.
 *
 * Pages genuinely are per-market (`Page.countryId`), so pages and their
 * sections are copied. Forms are per-market only when they have been restricted
 * to one; a form with no country already works everywhere and is left alone.
 *
 * ## The allowlist
 *
 * Only the four entity kinds below are ever touched. It is an explicit list
 * rather than "everything except…" because the exclusions — blogs, leads,
 * submissions, consent records, users, permissions, credentials and India's own
 * country settings — must not depend on somebody remembering to add a new model
 * to a deny-list.
 *
 * ## Money
 *
 * Prices are **not** copied. India's ₹1,250 is not 1,250 of anything else, and
 * writing it into a row labelled AED would relabel a value rather than convert
 * it. The destination row is created in the destination's own currency with its
 * prices left empty, and reported as needing localisation — an empty price an
 * administrator must fill in is safe; a wrong one that looks filled in is not.
 */

/** The only things this ever writes into a destination market. */
export const SYNC_ENTITIES = ['PAGE', 'PAGE_SECTION', 'PRODUCT', 'FORM'] as const;
export type SyncEntity = (typeof SYNC_ENTITIES)[number];

export type SyncOutcome = 'created' | 'updated' | 'skipped' | 'conflict' | 'failed';

export type SyncLogEntry = {
  entity: SyncEntity;
  outcome: SyncOutcome;
  /** What the row is, in words an administrator recognises. */
  label: string;
  sourceId: string;
  targetId?: string;
  /** Why it was skipped, or what needs a human. */
  note?: string;
  /** Country-specific values the copy could not carry across. */
  localise?: string[];
};

export type SyncResult = {
  created: number;
  updated: number;
  skipped: number;
  conflicts: number;
  failed: number;
  log: SyncLogEntry[];
};

const EMPTY: SyncResult = { created: 0, updated: 0, skipped: 0, conflicts: 0, failed: 0, log: [] };

function tally(log: SyncLogEntry[]): SyncResult {
  return {
    created: log.filter((entry) => entry.outcome === 'created').length,
    updated: log.filter((entry) => entry.outcome === 'updated').length,
    skipped: log.filter((entry) => entry.outcome === 'skipped').length,
    conflicts: log.filter((entry) => entry.outcome === 'conflict').length,
    failed: log.filter((entry) => entry.outcome === 'failed').length,
    log,
  };
}

/**
 * Has the destination row been edited since it was last synced?
 *
 * `targetSyncedAt` holds the destination row's **own** `updatedAt` as it stood
 * when the sync finished with it — not the wall clock at that moment. Comparing
 * two readings of the same column needs no tolerance: any difference is an edit
 * by somebody else, whether it happened a second later or a month later.
 *
 * Using the wall clock instead needed a tolerance to stop a freshly written row
 * looking edited, and that tolerance then swallowed real edits made inside it.
 */
function locallyEdited(targetUpdatedAt: Date, syncedAt: Date | null): boolean {
  if (!syncedAt) return false;
  return targetUpdatedAt.getTime() !== syncedAt.getTime();
}

/** Values that are about one market and cannot be carried into another. */
function localisationFlags(text: Array<string | null | undefined>): string[] {
  const joined = text.filter(Boolean).join(' ');
  const flags: string[] = [];
  if (/₹|\bINR\b|\brupee/i.test(joined)) flags.push('mentions rupees');
  if (/\bIndia\b|\bIndian\b/i.test(joined)) flags.push('mentions India');
  if (/\bGST\b|\bPAN\b|\bCIN\b/i.test(joined)) flags.push('mentions Indian tax or registration');
  if (/\+91[\s\d-]/.test(joined)) flags.push('contains an Indian phone number');
  return flags;
}

type Ctx = {
  source: CountryContext;
  target: CountryContext;
  mode: SyncMode;
  previewOnly: boolean;
};

/**
 * Runs the sync, or reports what it would do.
 *
 * A preview takes exactly the same decisions as a real run and writes nothing,
 * so the counts an administrator approves are the counts they get.
 */
export async function runCountrySync(ctx: Ctx): Promise<SyncResult> {
  if (ctx.source.id === ctx.target.id) return EMPTY;

  const log: SyncLogEntry[] = [];
  await syncForms(ctx, log);
  await syncProducts(ctx, log);
  await syncPages(ctx, log);
  return tally(log);
}

/** Existing source→target mappings for one entity kind. */
async function mappings(ctx: Ctx, entity: SyncEntity) {
  const rows = await prisma.countrySyncMapping.findMany({
    where: { targetCountryId: ctx.target.id, entityType: entity },
    select: { sourceId: true, targetId: true, targetSyncedAt: true, sourceUpdatedAt: true },
  });
  return new Map(rows.map((row) => [row.sourceId, row]));
}

async function remember(
  ctx: Ctx,
  entity: SyncEntity,
  sourceId: string,
  targetId: string,
  sourceUpdatedAt: Date,
  /**
   * The destination row's `updatedAt` after the write. Read back rather than
   * guessed, because it is the value a later run compares against to decide
   * whether a human has since edited the row.
   */
  targetUpdatedAt: Date,
) {
  await prisma.countrySyncMapping.upsert({
    where: {
      targetCountryId_entityType_sourceId: {
        targetCountryId: ctx.target.id,
        entityType: entity,
        sourceId,
      },
    },
    update: { targetId, sourceUpdatedAt, targetSyncedAt: targetUpdatedAt },
    create: {
      sourceCountryId: ctx.source.id,
      targetCountryId: ctx.target.id,
      entityType: entity,
      sourceId,
      targetId,
      sourceUpdatedAt,
      targetSyncedAt: targetUpdatedAt,
    },
  });
}

// --- forms ------------------------------------------------------------------

/**
 * Forms restricted to the source market.
 *
 * A form with no country is already available everywhere, so copying it would
 * produce a second form doing the same job — it is reported as shared and left
 * alone.
 */
async function syncForms(ctx: Ctx, log: SyncLogEntry[]): Promise<void> {
  const forms = await prisma.form.findMany({
    where: { countryId: ctx.source.id, deletedAt: null },
    include: { fields: { orderBy: { sortOrder: 'asc' } } },
  });

  const known = await mappings(ctx, 'FORM');

  for (const form of forms) {
    const existing = known.get(form.id);

    if (existing) {
      const target = await prisma.form.findUnique({
        where: { id: existing.targetId },
        select: { id: true, updatedAt: true, name: true },
      });
      if (!target) {
        // The destination copy was deleted. Recreating it would resurrect
        // something somebody removed on purpose.
        log.push({
          entity: 'FORM',
          outcome: 'skipped',
          label: form.name,
          sourceId: form.id,
          note: 'The copy in this market was deleted. Remove the mapping to import it again.',
        });
        continue;
      }
      if (ctx.mode === 'ADD_MISSING') {
        log.push({ entity: 'FORM', outcome: 'skipped', label: form.name, sourceId: form.id, targetId: target.id, note: 'Already imported' });
        continue;
      }
      if (locallyEdited(target.updatedAt, existing.targetSyncedAt)) {
        log.push({
          entity: 'FORM',
          outcome: 'conflict',
          label: form.name,
          sourceId: form.id,
          targetId: target.id,
          note: 'Edited in this market since it was imported. Left as it is.',
        });
        continue;
      }
      log.push({ entity: 'FORM', outcome: 'updated', label: form.name, sourceId: form.id, targetId: target.id });
      if (!ctx.previewOnly) {
        const written = await prisma.form.update({
          where: { id: target.id },
          data: { name: form.name, description: form.description, submitLabel: form.submitLabel },
          select: { updatedAt: true },
        });
        await remember(ctx, 'FORM', form.id, target.id, form.updatedAt, written.updatedAt);
      }
      continue;
    }

    const slug = `${form.slug}-${ctx.target.code.toLowerCase()}`;
    log.push({
      entity: 'FORM',
      outcome: 'created',
      label: form.name,
      sourceId: form.id,
      localise: localisationFlags([form.name, form.description, form.consentText]),
    });

    if (ctx.previewOnly) continue;

    const created = await prisma.form.create({
      data: {
        name: form.name,
        slug,
        countryId: ctx.target.id,
        description: form.description,
        // Inactive on arrival, like a draft page: a form that starts taking
        // submissions before anyone has read it is worse than one that waits.
        isActive: false,
        submitLabel: form.submitLabel,
        successMessage: form.successMessage,
        redirectUrl: form.redirectUrl,
        leadSource: form.leadSource,
        createsLead: form.createsLead,
        consentText: form.consentText,
        lawfulBasis: form.lawfulBasis,
        collectsPersonalData: form.collectsPersonalData,
        offerMarketingConsent: form.offerMarketingConsent,
        requireTermsAcceptance: form.requireTermsAcceptance,
        consentCombinedLabel: form.consentCombinedLabel,
        requireCaptcha: form.requireCaptcha,
        // A null design means "use the defaults", which is what omitting it does.
        ...(form.design ? { design: form.design as Prisma.InputJsonValue } : {}),
        /*
         * Deliberately not copied: notifyEmails and defaultProductId. Sales
         * notifications go to the team that owns the market, and a default
         * product is a pricing decision.
         */
        fields: {
          create: form.fields.map((field) => ({
            type: field.type,
            label: field.label,
            name: field.name,
            placeholder: field.placeholder,
            helpText: field.helpText,
            defaultValue: field.defaultValue,
            isRequired: field.isRequired,
            sortOrder: field.sortOrder,
            width: field.width,
            options: (field.options ?? []) as Prisma.InputJsonValue,
            minLength: field.minLength,
            maxLength: field.maxLength,
            pattern: field.pattern,
            showLabel: field.showLabel,
            isEnabled: field.isEnabled,
            isHidden: field.isHidden,
            isReadOnly: field.isReadOnly,
            colSpan: field.colSpan,
            cssClass: field.cssClass,
            settings: (field.settings ?? {}) as Prisma.InputJsonValue,
          })),
        },
      },
      select: { id: true, updatedAt: true },
    });
    await remember(ctx, 'FORM', form.id, created.id, form.updatedAt, created.updatedAt);
  }

  const shared = await prisma.form.count({ where: { countryId: null, deletedAt: null } });
  if (shared > 0) {
    log.push({
      entity: 'FORM',
      outcome: 'skipped',
      label: `${shared} shared form${shared === 1 ? '' : 's'}`,
      sourceId: '-',
      note: 'Available in every market already, so there is nothing to copy.',
    });
  }
}

// --- products ---------------------------------------------------------------

/**
 * Products, as destination market configurations.
 *
 * The product row itself is global and shared, so nothing about it is
 * duplicated — what is created is the `ProductCountry` row that makes the
 * product available in this market, with its own status, order and pricing.
 * Categories and brands are global too, which is why they appear here only as
 * a note rather than as work.
 */
async function syncProducts(ctx: Ctx, log: SyncLogEntry[]): Promise<void> {
  const source = await prisma.productCountry.findMany({
    where: { countryId: ctx.source.id, product: { deletedAt: null } },
    include: { product: { select: { id: true, name: true, slug: true } } },
  });

  const known = await mappings(ctx, 'PRODUCT');

  for (const row of source) {
    const existing = known.get(row.id);
    const label = row.product.name;

    if (existing) {
      const target = await prisma.productCountry.findUnique({
        where: { id: existing.targetId },
        select: { id: true, updatedAt: true },
      });
      if (!target) {
        log.push({ entity: 'PRODUCT', outcome: 'skipped', label, sourceId: row.id, note: 'The configuration in this market was deleted.' });
        continue;
      }
      if (ctx.mode === 'ADD_MISSING') {
        log.push({ entity: 'PRODUCT', outcome: 'skipped', label, sourceId: row.id, targetId: target.id, note: 'Already imported' });
        continue;
      }
      if (locallyEdited(target.updatedAt, existing.targetSyncedAt)) {
        log.push({
          entity: 'PRODUCT',
          outcome: 'conflict',
          label,
          sourceId: row.id,
          targetId: target.id,
          note: 'Edited in this market since it was imported. Left as it is.',
        });
        continue;
      }
      log.push({
        entity: 'PRODUCT',
        outcome: 'updated',
        label,
        sourceId: row.id,
        targetId: target.id,
        localise: localisationFlags([row.shortDescription, row.description, row.priceNote]),
      });
      if (!ctx.previewOnly) {
        // Descriptions and ordering only. Prices and status stay whatever this
        // market decided; an update must never quietly re-price a market.
        const written = await prisma.productCountry.update({
          where: { id: target.id },
          data: {
            shortDescription: row.shortDescription,
            description: row.description,
            sortOrder: row.sortOrder,
          },
          select: { updatedAt: true },
        });
        await remember(ctx, 'PRODUCT', row.id, target.id, row.updatedAt, written.updatedAt);
      }
      continue;
    }

    // A market may already have the product configured without this ever
    // having run — that is not a duplicate to create over.
    const already = await prisma.productCountry.findUnique({
      where: { productId_countryId: { productId: row.productId, countryId: ctx.target.id } },
      select: { id: true, updatedAt: true },
    });

    if (already) {
      log.push({
        entity: 'PRODUCT',
        outcome: 'skipped',
        label,
        sourceId: row.id,
        targetId: already.id,
        note: 'This market already offers the product.',
      });
      if (!ctx.previewOnly) {
        await remember(ctx, 'PRODUCT', row.id, already.id, row.updatedAt, already.updatedAt);
      }
      continue;
    }

    log.push({
      entity: 'PRODUCT',
      outcome: 'created',
      label,
      sourceId: row.id,
      localise: [
        `prices are not copied — set them in ${ctx.target.currency}`,
        ...localisationFlags([row.shortDescription, row.description, row.priceNote, row.ctaLabel]),
      ],
    });

    if (ctx.previewOnly) continue;

    const created = await prisma.productCountry.create({
      data: {
        productId: row.productId,
        countryId: ctx.target.id,
        // Draft: imported content is never published on somebody's behalf.
        status: 'DRAFT',
        publishedAt: null,
        isFeatured: row.isFeatured,
        sortOrder: row.sortOrder,
        featuredOrder: row.featuredOrder,
        /*
         * The destination's own currency, with no prices.
         *
         * Copying 1250 from an INR row into an AED row would relabel the
         * number, not convert it. An empty price an administrator must fill in
         * is safe; a wrong one that looks filled in is not.
         */
        currency: ctx.target.currency,
        monthlyPrice: null,
        annualPrice: null,
        compareAtPrice: null,
        discountPercent: null,
        priceSuffix: row.priceSuffix,
        priceNote: null,
        shortDescription: row.shortDescription,
        description: row.description,
        ctaLabel: row.ctaLabel,
        ctaUrl: row.ctaUrl,
        seoTitle: row.seoTitle,
        seoDescription: row.seoDescription,
        // Not copied: canonicalUrl points at a source-market URL, and ctaFormId
        // points at a form this market may not have.
        noIndex: row.noIndex,
        // Media is shared, so the same row is referenced rather than copied —
        // no file is duplicated and none is at risk of being deleted from
        // under the market that still uses it.
        ogImageId: row.ogImageId,
      },
      select: { id: true, updatedAt: true },
    });
    await remember(ctx, 'PRODUCT', row.id, created.id, row.updatedAt, created.updatedAt);
  }

  const [categories, brands] = await Promise.all([
    prisma.productCategory.count(),
    prisma.brand.count(),
  ]);
  if (categories > 0 || brands > 0) {
    log.push({
      entity: 'PRODUCT',
      outcome: 'skipped',
      label: `${categories} categories and ${brands} brands`,
      sourceId: '-',
      note: 'Shared by every market in this system, so there is nothing to copy.',
    });
  }
}

// --- pages ------------------------------------------------------------------

async function syncPages(ctx: Ctx, log: SyncLogEntry[]): Promise<void> {
  const pages = await prisma.page.findMany({
    where: { countryId: ctx.source.id, deletedAt: null },
    include: { sections: { orderBy: { sortOrder: 'asc' } } },
  });

  const known = await mappings(ctx, 'PAGE');

  for (const page of pages) {
    const existing = known.get(page.id);
    const label = page.title;

    if (existing) {
      const target = await prisma.page.findFirst({
        where: { id: existing.targetId, deletedAt: null },
        select: { id: true, updatedAt: true },
      });
      if (!target) {
        log.push({ entity: 'PAGE', outcome: 'skipped', label, sourceId: page.id, note: 'The copy in this market was deleted.' });
        continue;
      }
      if (ctx.mode === 'ADD_MISSING') {
        log.push({ entity: 'PAGE', outcome: 'skipped', label, sourceId: page.id, targetId: target.id, note: 'Already imported' });
        continue;
      }
      if (locallyEdited(target.updatedAt, existing.targetSyncedAt)) {
        log.push({
          entity: 'PAGE',
          outcome: 'conflict',
          label,
          sourceId: page.id,
          targetId: target.id,
          note: 'Edited in this market since it was imported. Left as it is.',
        });
        continue;
      }

      log.push({
        entity: 'PAGE',
        outcome: 'updated',
        label,
        sourceId: page.id,
        targetId: target.id,
        localise: localisationFlags([
          page.title,
          page.seoDescription,
          ...page.sections.map((section) => JSON.stringify(section.content)),
        ]),
      });
      if (!ctx.previewOnly) {
        await prisma.$transaction(async (tx) => {
          await tx.page.update({
            where: { id: target.id },
            data: { title: page.title, seoTitle: page.seoTitle, seoDescription: page.seoDescription },
          });
          // Sections are replaced wholesale: they are an ordered arrangement,
          // and merging two arrangements produces one nobody designed.
          await tx.pageSection.deleteMany({ where: { pageId: target.id } });
          await tx.pageSection.createMany({
            data: page.sections.map((section) => ({
              pageId: target.id,
              blockType: section.blockType,
              name: section.name,
              sortOrder: section.sortOrder,
              isVisible: section.isVisible,
              content: localiseContent(section.content, ctx.target) as Prisma.InputJsonValue,
              settings: (section.settings ?? {}) as Prisma.InputJsonValue,
            })),
          });
        });
        const written = await prisma.page.findUniqueOrThrow({
          where: { id: target.id },
          select: { updatedAt: true },
        });
        await remember(ctx, 'PAGE', page.id, target.id, page.updatedAt, written.updatedAt);
      }
      continue;
    }

    // A page with this slug may already exist in the destination — created by
    // hand, or by an earlier run whose mapping was removed. Never overwrite it.
    const clash = await prisma.page.findFirst({
      where: { countryId: ctx.target.id, slug: page.slug, deletedAt: null },
      select: { id: true },
    });
    if (clash) {
      log.push({
        entity: 'PAGE',
        outcome: 'conflict',
        label,
        sourceId: page.id,
        targetId: clash.id,
        note: `This market already has a page at “/${page.slug}”. It was left alone.`,
      });
      continue;
    }

    const sectionText = page.sections.flatMap((section) => [JSON.stringify(section.content)]);
    log.push({
      entity: 'PAGE',
      outcome: 'created',
      label,
      sourceId: page.id,
      localise: localisationFlags([page.title, page.seoDescription, ...sectionText]),
    });
    log.push({
      entity: 'PAGE_SECTION',
      outcome: 'created',
      label: `${page.sections.length} section${page.sections.length === 1 ? '' : 's'} of “${page.title}”`,
      sourceId: page.id,
    });

    if (ctx.previewOnly) continue;

    const created = await prisma.page.create({
      data: {
        countryId: ctx.target.id,
        title: page.title,
        slug: page.slug,
        // Draft, always. Imported content is reviewed before it is published,
        // which is also what keeps it out of the sitemaps until then.
        status: 'DRAFT',
        publishedAt: null,
        isHomepage: page.isHomepage,
        categoryId: page.categoryId,
        showHeader: page.showHeader,
        showFooter: page.showFooter,
        seoTitle: page.seoTitle,
        seoDescription: page.seoDescription,
        // Not copied: canonicalUrl, which points at a source-market URL.
        noIndex: page.noIndex,
        noFollow: page.noFollow,
        ogTitle: page.ogTitle,
        ogDescription: page.ogDescription,
        ogImageId: page.ogImageId,
        twitterTitle: page.twitterTitle,
        twitterDescription: page.twitterDescription,
        twitterImageId: page.twitterImageId,
        sections: {
          create: page.sections.map((section) => ({
            blockType: section.blockType,
            name: section.name,
            sortOrder: section.sortOrder,
            isVisible: section.isVisible,
            /*
             * Internal links are rewritten into the destination market by the
             * same function the renderer uses — so external URLs, anchors,
             * mailto/tel and the root-only blog links are all left exactly as
             * they are, because that function already knows which is which.
             */
            content: localiseContent(section.content, ctx.target) as Prisma.InputJsonValue,
            settings: (section.settings ?? {}) as Prisma.InputJsonValue,
          })),
        },
      },
      select: { id: true, updatedAt: true },
    });
    await remember(ctx, 'PAGE', page.id, created.id, page.updatedAt, created.updatedAt);
  }
}
