'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FileSearch, Loader2, Search } from 'lucide-react';

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useServices } from '@/lib/api/use-services';
import type { SearchResults } from '@/services/types';

const MIN_QUERY_LENGTH = 2;
const DEBOUNCE_MS = 250;

export function GlobalSearch({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const services = useServices();
  const router = useRouter();
  const [query, setQuery] = React.useState('');
  const [results, setResults] = React.useState<SearchResults | null>(null);
  const [status, setStatus] = React.useState<'idle' | 'loading' | 'error' | 'ready'>('idle');
  const [activeIndex, setActiveIndex] = React.useState(0);

  const flatItems = React.useMemo(() => {
    if (!results) return [] as { id: string; title: string; subtitle: string; href: string }[];
    return results.groups.flatMap((group) => group.items);
  }, [results]);

  React.useEffect(() => {
    if (!open) {
      setQuery('');
      setResults(null);
      setStatus('idle');
      setActiveIndex(0);
      return;
    }
  }, [open]);

  React.useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < MIN_QUERY_LENGTH) {
      setResults(null);
      setStatus('idle');
      return;
    }
    let cancelled = false;
    setStatus('loading');
    const handle = window.setTimeout(() => {
      services.search
        .search(trimmed)
        .then((response) => {
          if (cancelled) return;
          setResults(response);
          setActiveIndex(0);
          setStatus('ready');
        })
        .catch(() => {
          if (cancelled) return;
          setResults(null);
          setStatus('error');
        });
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [query, services]);

  const navigateTo = React.useCallback(
    (href: string) => {
      onOpenChange(false);
      router.push(href);
    },
    [onOpenChange, router],
  );

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, flatItems.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === 'Enter') {
      const item = flatItems[activeIndex];
      if (item) {
        event.preventDefault();
        navigateTo(item.href);
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl gap-0 p-0" aria-describedby="global-search-description">
        <DialogHeader className="border-b border-border px-4 py-3">
          <DialogTitle className="flex items-center gap-2 text-sm">
            <Search className="h-4 w-4" aria-hidden="true" />
            Global search
          </DialogTitle>
          <DialogDescription id="global-search-description" className="sr-only">
            Search mines, inspections, compliance requirements, corrective actions, contractors, documents and incidents.
          </DialogDescription>
        </DialogHeader>
        <div className="border-b border-border px-4 py-3">
          <Input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search by name, code or reference…"
            aria-label="Search platform records"
            role="combobox"
            aria-expanded={status === 'ready'}
            aria-controls="global-search-results"
          />
        </div>
        <div id="global-search-results" role="listbox" className="max-h-[22rem] overflow-y-auto p-2">
          {status === 'loading' && (
            <p className="flex items-center gap-2 px-3 py-6 text-sm text-muted-foreground" aria-live="polite">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Searching…
            </p>
          )}
          {status === 'error' && (
            <p className="px-3 py-6 text-sm text-destructive" role="alert">
              Search is currently unavailable. Please try again.
            </p>
          )}
          {status === 'ready' && flatItems.length === 0 && (
            <div className="flex flex-col items-center gap-2 px-3 py-10 text-center">
              <FileSearch className="h-6 w-6 text-muted-foreground" aria-hidden="true" />
              <p className="text-sm font-medium">No matching records</p>
              <p className="text-xs text-muted-foreground">
                Try a mine code, inspection reference or compliance requirement title.
              </p>
            </div>
          )}
          {status === 'ready' && results?.groups.map((group) => (
            <div key={group.type} className="mb-2">
              <p className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {group.label}
              </p>
              <ul>
                {group.items.map((item) => {
                  const index = flatItems.indexOf(item);
                  return (
                    <li key={`${group.type}-${item.id}`}>
                      <Link
                        href={item.href}
                        role="option"
                        aria-selected={index === activeIndex}
                        onClick={() => onOpenChange(false)}
                        onMouseEnter={() => setActiveIndex(index)}
                        className={`block rounded-md px-3 py-2 text-sm transition-colors ${
                          index === activeIndex ? 'bg-accent text-accent-foreground' : 'hover:bg-muted'
                        }`}
                      >
                        <span className="block font-medium">{item.title}</span>
                        <span className="block text-xs text-muted-foreground">{item.subtitle}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between border-t border-border px-4 py-2 text-[11px] text-muted-foreground">
          <span>Use ↑ ↓ to navigate, Enter to open, Esc to close.</span>
          {results && status === 'ready' && <span>{results.tookMs} ms</span>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
