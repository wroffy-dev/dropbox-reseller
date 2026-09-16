import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mockAuth, uniqueSuffix, ensureSystemRoles, TEST_ACTOR } from '../helpers';

mockAuth();

const { prisma } = await import('@/lib/db/prisma');
const { syncCountryContent } = await import('@/lib/actions/country-sync');
const { invalidateCountryCache } = await import('@/lib/country/registry');

const suffix = uniqueSuffix();
let sourceId = '';
let targetId = '';
const pageSlug = `sync-page-${suffix}`;

beforeAll(async () => {
  /*
   * A sync run records who started it, so the actor has to be a real row. Run
   * alone this suite happened to find one another suite had left behind, which
   * is exactly the kind of order dependence that passes locally and fails in
   * CI — it provisions its own now.
   */
  await ensureSystemRoles();
  const role = await prisma.userRole.findFirstOrThrow({ where: { slug: 'super-admin' } });
  await prisma.user.upsert({
    where: { id: TEST_ACTOR.id },
    update: {},
    create: { id: TEST_ACTOR.id, email: TEST_ACTOR.email, name: TEST_ACTOR.name, roleId: role.id },
  });

  const source = await prisma.country.findFirstOrThrow({ where: { isDefault: true } });
  sourceId = source.id;

  const target = await prisma.country.upsert({
    where: { code: 'QA' },
    update: { isActive: true },
    create: {
      name: 'Qatar',
      code: 'QA',
      slug: 'qa',
      locale: 'en-QA',
      currency: 'QAR',
      currencySymbol: 'QAR',
      timezone: 'Asia/Qatar',
      isActive: true,
    },
    select: { id: true },
  });
  targetId = target.id;
  invalidateCountryCache();

  // A source page with a section carrying an internal link, an external one
  // and a blog link — the three cases link rewriting has to tell apart.
  await prisma.page.create({
    data: {
      countryId: sourceId,
      title: `Sync Source ${suffix}`,
      slug: pageSlug,
      status: 'PUBLISHED',
      publishedAt: new Date(),
      seoDescription: 'Plans from ₹1,250 for teams in India.',
      sections: {
        create: [
          {
            blockType: 'cta',
            sortOrder: 0,
            content: {
              heading: 'Talk to sales in India',
              ctaUrl: '/contact',
              secondaryUrl: 'https://example.com/external',
              blogUrl: '/blog/some-article',
            },
          },
        ],
      },
    },
  });
});

afterAll(async () => {
  await prisma.countrySyncMapping.deleteMany({ where: { targetCountryId: targetId } });
  await prisma.countrySyncRun.deleteMany({ where: { targetCountryId: targetId } });
  await prisma.page.deleteMany({ where: { slug: pageSlug } });
  await prisma.productCountry.deleteMany({ where: { countryId: targetId } });
  await prisma.page.deleteMany({ where: { countryId: targetId } });
  await prisma.form.deleteMany({ where: { countryId: targetId } });
});

const sync = (over: Record<string, unknown> = {}) =>
  syncCountryContent({ targetCountryId: targetId, mode: 'ADD_MISSING', ...over });

describe('sync from the default market', () => {
  it('previews without writing anything', async () => {
    const result = await sync({ previewOnly: true });
    expect(result.ok).toBe(true);
    expect(result.ok && result.data!.created).toBeGreaterThan(0);
    // Nothing was created: a preview must take the same decisions and write none.
    expect(await prisma.page.count({ where: { countryId: targetId } })).toBe(0);
  });

  it('copies pages as drafts, never published on somebody’s behalf', async () => {
    const result = await sync();
    expect(result.ok, result.ok === false ? result.error : '').toBe(true);

    const copied = await prisma.page.findFirstOrThrow({
      where: { countryId: targetId, slug: pageSlug },
      include: { sections: true },
    });
    expect(copied.status).toBe('DRAFT');
    expect(copied.publishedAt).toBeNull();
    expect(copied.sections).toHaveLength(1);
  });

  it('rewrites internal links into the destination and leaves the rest alone', async () => {
    const page = await prisma.page.findFirstOrThrow({
      where: { countryId: targetId, slug: pageSlug },
      include: { sections: true },
    });
    const content = page.sections[0].content as Record<string, string>;

    expect(content.ctaUrl).toBe('/qa/contact');
    // External URLs are not ours to rewrite.
    expect(content.secondaryUrl).toBe('https://example.com/external');
    // The blog is root-only: prefixing it would make a URL that redirects back.
    expect(content.blogUrl).toBe('/blog/some-article');
  });

  it('never relabels money — the copy is in its own currency with no prices', async () => {
    const rows = await prisma.productCountry.findMany({ where: { countryId: targetId } });
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.currency).toBe('QAR');
      // India's 1,250 is not 1,250 of anything else.
      expect(row.monthlyPrice).toBeNull();
      expect(row.annualPrice).toBeNull();
      expect(row.status).toBe('DRAFT');
    }
  });

  it('flags the values that could not be carried across', async () => {
    const result = await sync({ previewOnly: true, mode: 'UPDATE_EXISTING' });
    expect(result.ok).toBe(true);
    const flags = result.ok ? (result.data?.log ?? []).flatMap((entry) => entry.localise ?? []) : [];
    expect(flags.some((flag) => /rupees|India/i.test(flag))).toBe(true);
  });

  it('creates no duplicates when run again', async () => {
    const before = await prisma.page.count({ where: { countryId: targetId } });
    const productsBefore = await prisma.productCountry.count({ where: { countryId: targetId } });

    const second = await sync();
    expect(second.ok).toBe(true);
    expect(second.ok && second.data!.created).toBe(0);
    expect(second.ok && second.data!.skipped).toBeGreaterThan(0);

    expect(await prisma.page.count({ where: { countryId: targetId } })).toBe(before);
    expect(await prisma.productCountry.count({ where: { countryId: targetId } })).toBe(
      productsBefore,
    );
  });

  it('preserves a local edit in the default mode, and reports it in the other', async () => {
    const page = await prisma.page.findFirstOrThrow({
      where: { countryId: targetId, slug: pageSlug },
    });
    await prisma.page.update({
      where: { id: page.id },
      data: { title: 'Edited locally in Qatar' },
    });

    // Add-missing does not touch it at all.
    await sync();
    let after = await prisma.page.findFirstOrThrow({ where: { id: page.id } });
    expect(after.title).toBe('Edited locally in Qatar');

    // Update-existing sees the edit and refuses to overwrite it, reporting a
    // conflict for a person to resolve.
    const update = await sync({ mode: 'UPDATE_EXISTING' });
    expect(update.ok).toBe(true);
    expect(update.ok && update.data!.conflicts).toBeGreaterThan(0);

    after = await prisma.page.findFirstOrThrow({ where: { id: page.id } });
    expect(after.title).toBe('Edited locally in Qatar');
  });

  it('never deletes content that exists only in the destination', async () => {
    const local = await prisma.page.create({
      data: {
        countryId: targetId,
        title: 'Qatar-only page',
        slug: `qatar-only-${suffix}`,
        status: 'DRAFT',
      },
      select: { id: true },
    });

    await sync({ mode: 'UPDATE_EXISTING' });
    expect(await prisma.page.findUnique({ where: { id: local.id } })).not.toBeNull();
  });

  it('leaves the source market completely untouched', async () => {
    const source = await prisma.page.findFirstOrThrow({
      where: { countryId: sourceId, slug: pageSlug },
      include: { sections: true },
    });
    expect(source.status).toBe('PUBLISHED');
    expect(source.title).toBe(`Sync Source ${suffix}`);
    const content = source.sections[0].content as Record<string, string>;
    expect(content.ctaUrl).toBe('/contact');
  });

  it('copies nothing from the excluded kinds', async () => {
    // Blogs, leads, submissions and consent records are outside the allowlist.
    expect(await prisma.blogPost.count({ where: { countryId: targetId } })).toBe(0);
    expect(await prisma.lead.count({ where: { countryId: targetId } })).toBe(0);
    expect(await prisma.formSubmission.count({ where: { countryId: targetId } })).toBe(0);
    expect(await prisma.consentRecord.count({ where: { countryId: targetId } })).toBe(0);
  });

  it('refuses to sync the source market into itself', async () => {
    const result = await syncCountryContent({ targetCountryId: sourceId, mode: 'ADD_MISSING' });
    expect(result.ok).toBe(false);
  });

  it('records a run with its counts, so the history is auditable', async () => {
    const runs = await prisma.countrySyncRun.findMany({
      where: { targetCountryId: targetId },
      orderBy: { startedAt: 'desc' },
    });
    expect(runs.length).toBeGreaterThan(0);
    expect(runs[0].status).toBe('COMPLETED');
    expect(runs[0].finishedAt).not.toBeNull();
  });
});
