import 'server-only';
import { revalidatePath } from 'next/cache';
import { countryPath } from './routing';
import type { CountryContext } from './types';

/**
 * Cache invalidation for market-scoped content.
 *
 * Every public path carries its market prefix, so a market's cached pages are
 * addressed by a different path from another market's and cannot be confused
 * for one another. What this adds is the one thing that is easy to get wrong by
 * hand: revalidating the *market's* URL rather than the root market's, which is
 * why nothing outside this module builds a path to revalidate.
 */

/** Invalidates one page within a market, plus the sitemap it appears in. */
export function revalidateCountryPage(
  country: Pick<CountryContext, 'slug'>,
  slug: string,
  type: 'page' | 'layout' = 'page',
): void {
  revalidatePath(countryPath(country, slug), type);
  revalidatePath('/sitemap.xml');
}

/** Invalidates a market's blog surfaces after an article or taxonomy change. */
export function revalidateCountryBlog(
  country: Pick<CountryContext, 'slug'>,
  slug?: string | null,
): void {
  revalidatePath(countryPath(country, 'blog'), 'layout');
  if (slug) revalidatePath(countryPath(country, `blog/${slug}`));
  revalidatePath('/sitemap.xml');
}
