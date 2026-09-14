import 'server-only';
import { cache } from 'react';
import { headers } from 'next/headers';
import type { CountryContext } from './types';
import { resolveCountryPath } from './registry';
import { countryPath } from './routing';

/**
 * The market the current public request belongs to.
 *
 * Middleware already forwards the request path as `x-pathname` (it did so
 * before markets existed, for the header/footer flags), so resolution needs no
 * new plumbing and no rewrite: the prefix stays in the URL, which is what keeps
 * client navigation, canonical URLs and the browser address bar honest.
 *
 * `cache()` makes this one resolution per request no matter how many layouts,
 * pages and components ask for it.
 */
export const getRequestCountry = cache(async (): Promise<CountryContext> => {
  const headerList = await headers();
  const pathname = headerList.get('x-pathname') ?? '/';
  const { country } = await resolveCountryPath(pathname);
  return country;
});

/** The current request's path with its market prefix stripped. */
export const getRequestCountryPath = cache(async (): Promise<string> => {
  const headerList = await headers();
  const pathname = headerList.get('x-pathname') ?? '/';
  const { path } = await resolveCountryPath(pathname);
  return path;
});

/** Convenience: an absolute-in-site link for the requesting market. */
export async function currentCountryPath(path = ''): Promise<string> {
  const country = await getRequestCountry();
  return countryPath(country, path);
}
