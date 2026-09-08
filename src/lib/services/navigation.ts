import 'server-only';
import { cache } from 'react';
import { prisma } from '@/lib/db/prisma';
import type { NavigationLocation, NavLinkType } from '@prisma/client';

export type ResolvedNavItem = {
  id: string;
  label: string;
  href: string;
  description: string | null;
  openInNewTab: boolean;
  isHighlighted: boolean;
  children: ResolvedNavItem[];
};

export type ResolvedNavigation = {
  id: string;
  name: string;
  slug: string;
  items: ResolvedNavItem[];
};

function hrefFor(item: {
  linkType: NavLinkType;
  url: string | null;
  page: { slug: string } | null;
  product: { slug: string } | null;
  blogPost: { slug: string } | null;
  blogCategory: { slug: string } | null;
}): string {
  switch (item.linkType) {
    case 'PAGE':
      return item.page ? `/${item.page.slug}`.replace(/\/+$/, '') || '/' : '#';
    case 'PRODUCT':
      return item.product ? `/products/${item.product.slug}` : '#';
    case 'BLOG_POST':
      return item.blogPost ? `/blog/${item.blogPost.slug}` : '#';
    case 'BLOG_CATEGORY':
      return item.blogCategory ? `/blog/category/${item.blogCategory.slug}` : '#';
    default:
      return item.url || '#';
  }
}

const navInclude = {
  page: { select: { slug: true } },
  product: { select: { slug: true } },
  blogPost: { select: { slug: true } },
  blogCategory: { select: { slug: true } },
};

/** Loads every menu in a location with its items resolved to real hrefs. */
export const getNavigations = cache(
  async (location: NavigationLocation): Promise<ResolvedNavigation[]> => {
    const menus = await prisma.navigation.findMany({
      where: { location },
      orderBy: { createdAt: 'asc' },
      include: {
        items: {
          where: { isVisible: true },
          orderBy: { sortOrder: 'asc' },
          include: navInclude,
        },
      },
    });

    return menus.map((menu) => {
      const byParent = new Map<string | null, typeof menu.items>();
      for (const item of menu.items) {
        const key = item.parentId ?? null;
        const list = byParent.get(key) ?? [];
        list.push(item);
        byParent.set(key, list);
      }

      const build = (parentId: string | null): ResolvedNavItem[] =>
        (byParent.get(parentId) ?? []).map((item) => ({
          id: item.id,
          label: item.label,
          href: hrefFor(item),
          description: item.description,
          openInNewTab: item.openInNewTab,
          isHighlighted: item.isHighlighted,
          children: build(item.id),
        }));

      return { id: menu.id, name: menu.name, slug: menu.slug, items: build(null) };
    });
  },
);

export const getPrimaryNavigation = cache(async (): Promise<ResolvedNavItem[]> => {
  const menus = await getNavigations('HEADER');
  return menus[0]?.items ?? [];
});
