'use client';

import * as React from 'react';
import { RotateCcw, Search } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export interface FilterBarProps {
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  onReset?: () => void;
  children?: React.ReactNode;
  className?: string;
  /** Rendered on the right-hand side of the toolbar (export, create, …). */
  actions?: React.ReactNode;
  resultCount?: { from: number; to: number; total: number };
}

export function FilterBar({
  searchValue,
  onSearchChange,
  searchPlaceholder = 'Search…',
  onReset,
  children,
  className,
  actions,
  resultCount,
}: FilterBarProps) {
  const hasActiveFilters = Boolean(searchValue) || Boolean(children);

  return (
    <div
      className={cn(
        'flex flex-col gap-3 rounded-lg border border-border/80 bg-card p-3 lg:flex-row lg:items-center',
        className,
      )}
    >
      {onSearchChange && (
        <div className="relative w-full lg:max-w-xs">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            value={searchValue ?? ''}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            className="pl-8"
          />
        </div>
      )}

      <div className="flex flex-1 flex-wrap items-center gap-2">{children}</div>

      {resultCount && (
        <p className="text-xs text-muted-foreground" aria-live="polite">
          {resultCount.total === 0
            ? 'No records'
            : `Showing ${resultCount.from}–${resultCount.to} of ${resultCount.total}`}
        </p>
      )}

      <div className="flex items-center gap-2">
        {onReset && hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={onReset}>
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            Reset
          </Button>
        )}
        {actions}
      </div>
    </div>
  );
}

export function FilterSelect({
  label,
  value,
  onValueChange,
  options,
  allLabel = 'All',
  className,
}: {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  options: { value: string; label: string }[];
  allLabel?: string;
  className?: string;
}) {
  return (
    <SelectField
      label={label}
      value={value}
      onValueChange={onValueChange}
      options={[{ value: 'all', label: allLabel }, ...options]}
      className={className}
    />
  );
}

function SelectField({
  label,
  value,
  onValueChange,
  options,
  className,
}: {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  options: { value: string; label: string }[];
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <div className={cn('min-w-[9rem]', className)}>
      <button
        type="button"
        onClick={() => setOpen((previous) => !previous)}
        aria-expanded={open}
        aria-haspopup="listbox"
        className="flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-white/80 px-3 text-sm shadow-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="truncate">
          <span className="text-muted-foreground">{label}: </span>
          <span className="font-medium">
            {options.find((option) => option.value === value)?.label ?? value}
          </span>
        </span>
      </button>
      {open && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-40 cursor-default"
            aria-label="Close filter options"
            onClick={() => setOpen(false)}
          />
          <ul
            role="listbox"
            aria-label={label}
            className="absolute z-50 mt-1 max-h-64 w-[var(--trigger-width)] min-w-[9rem] overflow-auto rounded-md border border-border bg-popover p-1 shadow-glass"
            style={{ '--trigger-width': '100%' } as React.CSSProperties}
          >
            {options.map((option) => (
              <li key={option.value}>
                <button
                  type="button"
                  role="option"
                  aria-selected={option.value === value}
                  onClick={() => {
                    onValueChange(option.value);
                    setOpen(false);
                  }}
                  className={cn(
                    'w-full rounded-sm px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent',
                    option.value === value && 'bg-accent/60 font-medium',
                  )}
                >
                  {option.label}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
