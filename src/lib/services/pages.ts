import 'server-only';
import { cache } from 'react';
import { prisma } from '@/lib/db/prisma';
import type { Page, PageSection } from '@prisma/client';

export type PageWithSections = Page & { sections: PageSection[] };

/** Only content that is genuinely live is ever returned to a public request. */
export const publishedPageWhere = {
  deletedAt: null,
  status: 'PUBLISHED' as const,
  OR: [{ publishedAt: null }, { publishedAt: { lte: new Date() } }],
};

export const getPublishedPage = cache(async (slug: string): Promise<PageWithSections | null> => {
  return prisma.page.findFirst({
    where: { ...publishedPageWhere, slug },
    include: { sections: { orderBy: { sortOrder: 'asc' } } },
  });
});

/** Preview bypasses the publish gate. Callers must check authorisation first. */
export const getPageForPreview = cache(async (id: string): Promise<PageWithSections | null> => {
  return prisma.page.findFirst({
    where: { id, deletedAt: null },
    include: { sections: { orderBy: { sortOrder: 'asc' } } },
  });
});

/**
 * Resolves an active redirect for a path that produced no page.
 * Loop protection: a redirect whose destination equals its own source is ignored.
 */
export async function findRedirect(path: string): Promise<{ destination: string; permanent: boolean } | null> {
  const candidates = [path, path.startsWith('/') ? path : `/${path}`, path.replace(/^\//, '')];
  const redirect = await prisma.redirect.findFirst({
    where: { isActive: true, source: { in: Array.from(new Set(candidates)) } },
  });
  if (!redirect) return null;

  const normalise = (value: string) => value.replace(/^\/+|\/+$/g, '');
  if (normalise(redirect.destination) === normalise(redirect.source)) return null;

  // Best-effort hit counter; never block the redirect on it.
  prisma.redirect
    .update({ where: { id: redirect.id }, data: { hitCount: { increment: 1 } } })
    .catch(() => undefined);

  return { destination: redirect.destination, permanent: redirect.type === 'PERMANENT' };
}
