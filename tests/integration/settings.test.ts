import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mockAuth, formData, uniqueSuffix, TEST_ACTOR } from '../helpers';

mockAuth();

const { prisma } = await import('@/lib/db/prisma');
const { saveWebsiteSettings, saveEmailSettings } = await import('@/lib/actions/settings');
const { saveNavigation, saveNavigationItems, deleteNavigation } = await import(
  '@/lib/actions/navigation'
);
const { saveSocialLinks } = await import('@/lib/actions/social-links');
const { decryptSecret } = await import('@/lib/utils/crypto');

const suffix = uniqueSuffix();
let navigationId = '';
let websiteBackup: Record<string, unknown> | null = null;
let emailBackup: Record<string, unknown> | null = null;
let socialBackup: Array<Record<string, unknown>> = [];

const BASE_SETTINGS = {
  siteName: 'Test Site',
  siteTitle: 'Test title',
  siteDescription: 'Test description',
  siteUrl: 'https://example.test',
  headingFont: 'Inter',
  bodyFont: 'Inter',
  headingWeight: '700',
  bodyWeight: '400',
  baseFontSize: '16px',
  colorPrimary: '#0061FF',
  colorSecondary: '#0B1B34',
  colorAccent1: '#1AC1A5',
  colorAccent2: '#FF8A3D',
  colorBackground: '#FFFFFF',
  colorText: '#0B1B34',
  colorMuted: '#5B6B85',
  colorBorder: '#E3E8F0',
  defaultCurrency: 'INR',
};

beforeAll(async () => {
  const role = await prisma.userRole.upsert({
    where: { slug: 'test-role-settings' },
    update: {},
    create: { slug: 'test-role-settings', name: 'Test Role Settings', rank: 5 },
  });
  await prisma.user.upsert({
    where: { id: TEST_ACTOR.id },
    update: {},
    create: { id: TEST_ACTOR.id, email: TEST_ACTOR.email, name: TEST_ACTOR.name, roleId: role.id },
  });

  websiteBackup = await prisma.websiteSettings.findUnique({ where: { id: 'singleton' } });
  emailBackup = await prisma.emailSettings.findUnique({ where: { id: 'singleton' } });
  // saveSocialLinks replaces the whole table, so the seeded rows other suites
  // read are put back afterwards.
  socialBackup = await prisma.socialLink.findMany();
});

afterAll(async () => {
  if (navigationId) await prisma.navigation.deleteMany({ where: { id: navigationId } });
  await prisma.socialLink.deleteMany({});
  if (socialBackup.length > 0) {
    await prisma.socialLink.createMany({ data: socialBackup as never });
  }
  if (websiteBackup) {
    await prisma.websiteSettings.update({ where: { id: 'singleton' }, data: websiteBackup });
  }
  if (emailBackup) {
    await prisma.emailSettings.update({ where: { id: 'singleton' }, data: emailBackup });
  }
  await prisma.auditLog.deleteMany({ where: { actorId: TEST_ACTOR.id } });
  await prisma.user.deleteMany({ where: { id: TEST_ACTOR.id } });
  await prisma.userRole.deleteMany({ where: { slug: 'test-role-settings' } });
  await prisma.$disconnect();
});

describe('website settings', () => {
  it('saves branding and palette values', async () => {
    const result = await saveWebsiteSettings(
      formData({ ...BASE_SETTINGS, siteName: `Brand ${suffix}`, colorPrimary: '#123456' }),
    );
    expect(result.ok).toBe(true);

    const settings = await prisma.websiteSettings.findUniqueOrThrow({ where: { id: 'singleton' } });
    expect(settings.siteName).toBe(`Brand ${suffix}`);
    expect(settings.colorPrimary).toBe('#123456');
  });

  it('rejects a colour that is not a 6-digit hex value', async () => {
    const result = await saveWebsiteSettings(formData({ ...BASE_SETTINGS, colorPrimary: 'blue' }));
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.fieldErrors?.colorPrimary).toBeTruthy();
  });

  it('rejects a site URL that is not absolute', async () => {
    const result = await saveWebsiteSettings(formData({ ...BASE_SETTINGS, siteUrl: 'example.test' }));
    expect(result.ok).toBe(false);
  });

  it('rejects a malformed base font size', async () => {
    const result = await saveWebsiteSettings(formData({ ...BASE_SETTINGS, baseFontSize: 'huge' }));
    expect(result.ok).toBe(false);
  });

  it('strips a javascript: URL from a link field', async () => {
    const result = await saveWebsiteSettings(
      formData({
        ...BASE_SETTINGS,
        headerCtaLabel: 'Click',
        headerCtaUrl: 'javascript:alert(1)',
        footerLogoUrl: 'javascript:alert(2)',
      }),
    );
    expect(result.ok).toBe(true);

    const settings = await prisma.websiteSettings.findUniqueOrThrow({ where: { id: 'singleton' } });
    expect(settings.headerCtaUrl).toBeNull();
    expect(settings.footerLogoUrl).toBeNull();
  });

  it('keeps an empty footer colour as inherit and rejects a malformed one', async () => {
    const inherit = await saveWebsiteSettings(
      formData({ ...BASE_SETTINGS, footerBackground: '', footerTextColor: '#FFFFFF' }),
    );
    expect(inherit.ok).toBe(true);

    const stored = await prisma.websiteSettings.findUniqueOrThrow({ where: { id: 'singleton' } });
    expect(stored.footerBackground).toBe('');
    expect(stored.footerTextColor).toBe('#FFFFFF');

    const bad = await saveWebsiteSettings(
      formData({ ...BASE_SETTINGS, footerBackground: 'darkish' }),
    );
    expect(bad.ok).toBe(false);
  });

  it('falls back to the documented defaults for blank newsletter copy', async () => {
    const result = await saveWebsiteSettings(
      formData({ ...BASE_SETTINGS, footerNewsletterHeading: '', footerNewsletterButtonLabel: '' }),
    );
    expect(result.ok).toBe(true);

    const settings = await prisma.websiteSettings.findUniqueOrThrow({ where: { id: 'singleton' } });
    expect(settings.footerNewsletterHeading).toBe('Stay updated');
    expect(settings.footerNewsletterButtonLabel).toBe('Send');
  });
});

describe('social links', () => {
  it('stores the list in drag order and drops a javascript: URL', async () => {
    const ok = await saveSocialLinks({
      links: [
        { network: 'x', label: 'X', url: 'https://x.com/acme', isVisible: true },
        { network: 'linkedin', label: '', url: 'https://linkedin.com/company/acme', isVisible: false },
      ],
    });
    expect(ok.ok).toBe(true);

    const rows = await prisma.socialLink.findMany({ orderBy: { sortOrder: 'asc' } });
    expect(rows.map((r) => r.network)).toEqual(['x', 'linkedin']);
    // A blank label falls back to the network's own name.
    expect(rows[1]!.label).toBe('LinkedIn');
    expect(rows[1]!.isVisible).toBe(false);

    const rejected = await saveSocialLinks({
      links: [{ network: 'x', label: 'X', url: 'javascript:alert(1)', isVisible: true }],
    });
    expect(rejected.ok).toBe(false);
    // The rejected save leaves the stored list untouched.
    expect(await prisma.socialLink.count()).toBe(2);
  });

  it('replaces the whole list rather than appending to it', async () => {
    await saveSocialLinks({
      links: [{ network: 'youtube', label: 'YouTube', url: 'https://youtube.com/@acme', isVisible: true }],
    });

    const rows = await prisma.socialLink.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.network).toBe('youtube');
  });
});

describe('email settings', () => {
  it('encrypts the SMTP password at rest', async () => {
    const result = await saveEmailSettings(
      formData({
        host: 'smtp.example.test',
        port: '587',
        username: 'mailer',
        password: 'super-secret-value',
        encryption: 'tls',
        fromName: 'Test Sender',
        fromEmail: 'noreply@example.test',
        isEnabled: true,
      }),
    );
    expect(result.ok).toBe(true);

    const settings = await prisma.emailSettings.findUniqueOrThrow({ where: { id: 'singleton' } });
    expect(settings.password).not.toBe('super-secret-value');
    expect(settings.password).toMatch(/^enc:v1:/);
    expect(decryptSecret(settings.password)).toBe('super-secret-value');
  });

  it('keeps the stored password when the field is left blank', async () => {
    const before = await prisma.emailSettings.findUniqueOrThrow({ where: { id: 'singleton' } });

    await saveEmailSettings(
      formData({
        host: 'smtp.example.test',
        port: '587',
        username: 'mailer',
        password: '',
        encryption: 'tls',
        fromName: 'Renamed Sender',
        fromEmail: 'noreply@example.test',
        isEnabled: true,
      }),
    );

    const after = await prisma.emailSettings.findUniqueOrThrow({ where: { id: 'singleton' } });
    expect(after.fromName).toBe('Renamed Sender');
    expect(after.password).toBe(before.password);
  });

  it('refuses to enable email without a host', async () => {
    const result = await saveEmailSettings(
      formData({ host: '', port: '587', fromName: 'Test', fromEmail: 'a@b.test', isEnabled: true }),
    );
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.fieldErrors?.host).toBeTruthy();
  });

  it('never exposes the password through the safe projection', async () => {
    const { getEmailSettingsSafe } = await import('@/lib/services/settings');
    const safe = await getEmailSettingsSafe();
    expect('password' in safe).toBe(false);
    expect(safe.hasPassword).toBe(true);
  });
});

describe('navigation', () => {
  it('creates a menu', async () => {
    const result = await saveNavigation(null, formData({ name: `Test Menu ${suffix}`, location: 'HEADER' }));
    expect(result.ok).toBe(true);
    navigationId = (result as { data: { id: string } }).data.id;

    const menu = await prisma.navigation.findUniqueOrThrow({ where: { id: navigationId } });
    expect(menu.slug).toBe(`test-menu-${suffix}`);
  });

  it('saves a nested item tree with stable ordering', async () => {
    const result = await saveNavigationItems({
      navigationId,
      items: [
        {
          label: 'Plans',
          linkType: 'INTERNAL',
          url: '/pricing',
          openInNewTab: false,
          isHighlighted: false,
          isVisible: true,
          children: [
            {
              label: 'Business',
              linkType: 'INTERNAL',
              url: '/products/business',
              openInNewTab: false,
              isHighlighted: false,
              isVisible: true,
              children: [],
            },
          ],
        },
        {
          label: 'Contact',
          linkType: 'INTERNAL',
          url: '/contact',
          openInNewTab: false,
          isHighlighted: true,
          isVisible: true,
          children: [],
        },
      ],
    });
    expect(result.ok).toBe(true);

    const items = await prisma.navigationItem.findMany({
      where: { navigationId },
      orderBy: { sortOrder: 'asc' },
    });
    expect(items).toHaveLength(3);

    const roots = items.filter((i) => i.parentId === null);
    expect(roots.map((i) => i.label)).toEqual(['Plans', 'Contact']);
    expect(items.find((i) => i.label === 'Business')?.parentId).toBe(
      roots.find((i) => i.label === 'Plans')?.id,
    );
  });

  it('strips an unsafe URL from a nav item', async () => {
    await saveNavigationItems({
      navigationId,
      items: [
        {
          label: 'Bad link',
          linkType: 'INTERNAL',
          url: 'javascript:alert(1)',
          openInNewTab: false,
          isHighlighted: false,
          isVisible: true,
          children: [],
        },
      ],
    });

    const item = await prisma.navigationItem.findFirstOrThrow({ where: { navigationId } });
    expect(item.url).toBeNull();
  });

  it('replaces the tree rather than appending to it', async () => {
    await saveNavigationItems({
      navigationId,
      items: [
        {
          label: 'Only item',
          linkType: 'INTERNAL',
          url: '/',
          openInNewTab: false,
          isHighlighted: false,
          isVisible: true,
          children: [],
        },
      ],
    });
    expect(await prisma.navigationItem.count({ where: { navigationId } })).toBe(1);
  });

  it('deletes a menu and its items', async () => {
    const result = await deleteNavigation(navigationId);
    expect(result.ok).toBe(true);
    expect(await prisma.navigationItem.count({ where: { navigationId } })).toBe(0);
    navigationId = '';
  });
});
