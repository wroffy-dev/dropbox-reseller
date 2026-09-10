/**
 * Blog post shape shared by the editor and the routes that render it.
 *
 * This lives outside the `'use client'` component on purpose. Exporting a value
 * from a client module and then spreading it on the server hands back a client
 * *reference*, not the object — so `{ ...EMPTY_POST }` produced a value with no
 * `tags` or `relatedIds`, and the editor threw on `.includes` before the page
 * could render. Same failure the "New form" route had; same fix.
 */

export type PostFormValues = {
  id?: string;
  title: string;
  slug: string;
  status: string;
  publishedAt: string;
  excerpt: string;
  content: string;
  isFeatured: boolean;
  featuredImageId: string | null;
  categoryId: string;
  authorId: string;
  tags: string[];
  relatedIds: string[];
  seoTitle: string;
  seoDescription: string;
  canonicalUrl: string;
  noIndex: boolean;
  ogTitle: string;
  ogDescription: string;
  ogImageId: string | null;
};

export const EMPTY_POST: PostFormValues = {
  title: '',
  slug: '',
  status: 'DRAFT',
  publishedAt: '',
  excerpt: '',
  content: '',
  isFeatured: false,
  featuredImageId: null,
  categoryId: '',
  authorId: '',
  tags: [],
  relatedIds: [],
  seoTitle: '',
  seoDescription: '',
  canonicalUrl: '',
  noIndex: false,
  ogTitle: '',
  ogDescription: '',
  ogImageId: null,
};
