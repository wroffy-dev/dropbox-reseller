'use client';

import * as React from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { Search, X } from 'lucide-react';
import { Input, Select } from '@/components/ui/field';
import { cn } from '@/lib/utils/cn';

export type ToolbarFilter = {
  name: string;
  label: string;
  options: Array<{ label: string; value: string }>;
};

/**
 * Search + filter bar that keeps state in the URL, so every admin list is
 * bookmarkable, shareable and server-rendered.
 */
export function TableToolbar({
  searchPlaceholder = 'Search…',
  filters = [],
  children,
}: {
  searchPlaceholder?: string;
  filters?: ToolbarFilter[];
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [query, setQuery] = React.useState(searchParams.get('q') ?? '');

  const push = React.useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value) params.set(key, value);
        else params.delete(key);
      }
      params.delete('page');
      const qs = params.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname);
    },
    [pathname, router, searchParams],
  );

  // Debounce so typing does not fire a navigation per keystroke.
  React.useEffect(() => {
    const current = searchParams.get('q') ?? '';
    if (query === current) return;
    const timer = window.setTimeout(() => push({ q: query || null }), 350);
    return () => window.clearTimeout(timer);
  }, [query, push, searchParams]);

  const hasFilters = filters.some((f) => searchParams.get(f.name)) || Boolean(searchParams.get('q'));

  return (
    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
      <div className="relative min-w-0 flex-1 sm:max-w-xs">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
          aria-hidden="true"
        />
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={searchPlaceholder}
          aria-label={searchPlaceholder}
          className="pl-9"
        />
      </div>

      {filters.map((filter) => (
        <div key={filter.name} className="min-w-0">
          <label htmlFor={`filter-${filter.name}`} className="sr-only">
            {filter.label}
          </label>
          <Select
            id={`filter-${filter.name}`}
            value={searchParams.get(filter.name) ?? ''}
            onChange={(e) => push({ [filter.name]: e.target.value || null })}
            className="w-full sm:w-auto"
          >
            <option value="">{filter.label}: all</option>
            {filter.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </div>
      ))}

      {hasFilters ? (
        <button
          type="button"
          onClick={() => {
            setQuery('');
            router.push(pathname);
          }}
          className={cn(
            'inline-flex h-10 items-center gap-1.5 rounded-lg px-3 text-sm text-muted transition-colors hover:bg-muted/10 hover:text-content',
          )}
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
          Clear
        </button>
      ) : null}

      {children ? <div className="sm:ml-auto">{children}</div> : null}
    </div>
  );
}
