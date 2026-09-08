'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import { adminSearch, type SearchHit } from '@/lib/actions/admin-search';
import { Spinner } from '@/components/ui/icons';
import { cn } from '@/lib/utils/cn';

const TYPE_TONE: Record<SearchHit['type'], string> = {
  Lead: 'bg-brand/10 text-brand',
  Customer: 'bg-violet-50 text-violet-700',
  Page: 'bg-sky-50 text-sky-700',
  Product: 'bg-emerald-50 text-emerald-700',
  Post: 'bg-amber-50 text-amber-700',
  Media: 'bg-muted/15 text-muted',
  Staff: 'bg-rose-50 text-rose-700',
  Form: 'bg-teal-50 text-teal-700',
};

export function AdminSearch() {
  const router = useRouter();
  const [query, setQuery] = React.useState('');
  const [hits, setHits] = React.useState<SearchHit[]>([]);
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [highlight, setHighlight] = React.useState(0);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  // Debounced search — one request per pause in typing.
  React.useEffect(() => {
    if (query.trim().length < 2) {
      setHits([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const timer = window.setTimeout(() => {
      adminSearch(query)
        .then((results) => {
          setHits(results);
          setHighlight(0);
        })
        .catch(() => setHits([]))
        .finally(() => setLoading(false));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
        event.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  React.useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const go = (hit: SearchHit) => {
    setOpen(false);
    setQuery('');
    router.push(hit.href);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      setOpen(false);
      inputRef.current?.blur();
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      setHighlight((h) => Math.min(h + 1, hits.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (event.key === 'Enter' && hits[highlight]) {
      event.preventDefault();
      go(hits[highlight]!);
    }
  };

  return (
    <div ref={containerRef} className="relative flex-1 sm:max-w-md">
      <label htmlFor="admin-search" className="sr-only">
        Search leads, pages, products and more
      </label>
      <Search
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
        aria-hidden="true"
      />
      <input
        id="admin-search"
        ref={inputRef}
        type="search"
        role="combobox"
        aria-expanded={open && hits.length > 0}
        aria-controls="admin-search-results"
        aria-autocomplete="list"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder="Search…"
        className="h-9 w-full rounded-lg border border-hairline bg-muted/[0.04] pl-9 pr-14 text-sm text-content placeholder:text-muted/70 focus:border-brand focus:bg-surface focus:outline-none focus:ring-2 focus:ring-brand/20"
      />
      <kbd className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded border border-hairline bg-surface px-1.5 py-0.5 font-mono text-[0.625rem] text-muted sm:block">
        ⌘K
      </kbd>

      {open && query.trim().length >= 2 ? (
        <div
          id="admin-search-results"
          role="listbox"
          className="absolute left-0 right-0 top-full z-50 mt-1.5 max-h-96 overflow-y-auto rounded-xl border border-hairline bg-surface p-1.5 shadow-xl"
        >
          {loading && hits.length === 0 ? (
            <p className="flex items-center gap-2 px-3 py-4 text-sm text-muted">
              <Spinner className="h-4 w-4 animate-spin" aria-hidden="true" />
              Searching…
            </p>
          ) : hits.length === 0 ? (
            <p className="px-3 py-4 text-sm text-muted">No matches for “{query}”.</p>
          ) : (
            <ul>
              {hits.map((hit, index) => (
                <li key={`${hit.type}-${hit.id}`}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={index === highlight}
                    onClick={() => go(hit)}
                    onMouseEnter={() => setHighlight(index)}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors',
                      index === highlight ? 'bg-muted/[0.08]' : 'hover:bg-muted/[0.05]',
                    )}
                  >
                    <span
                      className={cn(
                        'shrink-0 rounded px-1.5 py-0.5 text-[0.625rem] font-semibold uppercase tracking-wide',
                        TYPE_TONE[hit.type],
                      )}
                    >
                      {hit.type}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-content">{hit.title}</span>
                      {hit.subtitle ? (
                        <span className="block truncate text-xs text-muted">{hit.subtitle}</span>
                      ) : null}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
