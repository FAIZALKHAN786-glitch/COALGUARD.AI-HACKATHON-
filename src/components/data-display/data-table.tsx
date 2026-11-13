'use client';

import * as React from 'react';
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type Row,
  type SortingState,
} from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { EmptyState, ErrorState, TableSkeleton } from './states';

export interface DataTableProps<T> {
  columns: ColumnDef<T, unknown>[];
  data: T[];
  getRowId: (row: T) => string;
  caption?: string;
  loading?: boolean;
  error?: Error | null;
  onRetry?: () => void;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: React.ReactNode;
  /** Server-driven pagination. */
  page?: number;
  pageSize?: number;
  total?: number;
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  sorting?: SortingState;
  onSortingChange?: (sorting: SortingState) => void;
  onRowClick?: (row: T) => void;
  /** Renders the mobile card list. Falls back to a key/value summary. */
  renderMobileCard?: (row: T) => React.ReactNode;
  className?: string;
  /** Column ids that are hidden on small screens (table view). */
  secondaryColumns?: string[];
}

export function DataTable<T>({
  columns,
  data,
  getRowId,
  caption,
  loading,
  error,
  onRetry,
  emptyTitle = 'No records found',
  emptyDescription,
  emptyAction,
  page = 1,
  pageSize = 20,
  total,
  onPageChange,
  onPageSizeChange,
  sorting,
  onSortingChange,
  onRowClick,
  renderMobileCard,
  className,
  secondaryColumns = [],
}: DataTableProps<T>) {
  const table = useReactTable({
    data,
    columns,
    getRowId,
    state: sorting ? { sorting } : undefined,
    manualSorting: Boolean(onSortingChange),
    manualPagination: Boolean(onPageChange),
    enableSortingRemoval: false,
    getCoreRowModel: getCoreRowModel(),
    onSortingChange: (updater) => {
      if (!onSortingChange) return;
      const next = typeof updater === 'function' ? updater(sorting ?? []) : updater;
      onSortingChange(next);
    },
  });

  const rows = table.getRowModel().rows;
  const resolvedTotal = total ?? data.length;
  const pageCount = Math.max(1, Math.ceil(resolvedTotal / pageSize));
  const firstIndex = resolvedTotal === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastIndex = Math.min(resolvedTotal, page * pageSize);

  const renderCard = (row: Row<T>): React.ReactNode => {
    if (renderMobileCard) return renderMobileCard(row.original);
    return (
      <div className="space-y-1.5">
        {row.getVisibleCells().map((cell) => (
          <div key={cell.id} className="flex items-start justify-between gap-3 text-sm">
            <span className="text-muted-foreground">
              {typeof cell.column.columnDef.meta?.label === 'string'
                ? (cell.column.columnDef.meta.label as string)
                : cell.column.id}
            </span>
            <span className="min-w-0 text-right font-medium">
              {flexRender(cell.column.columnDef.cell, cell.getContext())}
            </span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className={cn('overflow-hidden rounded-lg border border-border/80 bg-card', className)}>
      {loading ? (
        <TableSkeleton rows={6} columns={Math.min(columns.length, 5)} />
      ) : error ? (
        <ErrorState
          title="Records could not be loaded"
          description={error.message}
          onRetry={onRetry}
        />
      ) : rows.length === 0 ? (
        <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} />
      ) : (
        <>
          <div className="hidden md:block">
            <Table>
              {caption && <caption className="sr-only">{caption}</caption>}
              <TableHeader>
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow key={headerGroup.id}>
                    {headerGroup.headers.map((header) => {
                      const meta = header.column.columnDef.meta as
                        | { label?: string; className?: string; secondary?: boolean }
                        | undefined;
                      const isSecondary = secondaryColumns.includes(header.column.id) || meta?.secondary;
                      return (
                        <TableHead
                          key={header.id}
                          className={cn(meta?.className, isSecondary && 'hidden xl:table-cell')}
                          aria-sort={
                            header.column.getIsSorted() === 'asc'
                              ? 'ascending'
                              : header.column.getIsSorted() === 'desc'
                                ? 'descending'
                                : undefined
                          }
                        >
                          {header.isPlaceholder ? null : header.column.getCanSort() ? (
                            <button
                              type="button"
                              onClick={header.column.getToggleSortingHandler()}
                              className="inline-flex items-center gap-1 rounded transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                              {flexRender(header.column.columnDef.header, header.getContext())}
                              {header.column.getIsSorted() === 'asc' ? (
                                <ArrowUp className="h-3 w-3" aria-hidden="true" />
                              ) : header.column.getIsSorted() === 'desc' ? (
                                <ArrowDown className="h-3 w-3" aria-hidden="true" />
                              ) : (
                                <ArrowUpDown className="h-3 w-3 opacity-40" aria-hidden="true" />
                              )}
                            </button>
                          ) : (
                            flexRender(header.column.columnDef.header, header.getContext())
                          )}
                        </TableHead>
                      );
                    })}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <TableRow
                    key={row.id}
                    onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                    onKeyDown={
                      onRowClick
                        ? (event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              onRowClick(row.original);
                            }
                          }
                        : undefined
                    }
                    tabIndex={onRowClick ? 0 : undefined}
                    role={onRowClick ? 'button' : undefined}
                    className={cn(onRowClick && 'cursor-pointer')}
                  >
                    {row.getVisibleCells().map((cell) => {
                      const meta = cell.column.columnDef.meta as
                        | { className?: string; secondary?: boolean }
                        | undefined;
                      const isSecondary = secondaryColumns.includes(cell.column.id) || meta?.secondary;
                      return (
                        <TableCell
                          key={cell.id}
                          className={cn(meta?.className, isSecondary && 'hidden xl:table-cell')}
                        >
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <ul className="divide-y divide-border/70 md:hidden">
            {rows.map((row) => (
              <li
                key={row.id}
                className={cn('px-4 py-3', onRowClick && 'cursor-pointer')}
                onClick={onRowClick ? () => onRowClick(row.original) : undefined}
              >
                {renderCard(row)}
              </li>
            ))}
          </ul>

          {(onPageChange || onPageSizeChange) && (
            <div className="flex flex-col gap-3 border-t border-border/70 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-muted-foreground" aria-live="polite">
                Showing {firstIndex}–{lastIndex} of {resolvedTotal} records
              </p>
              <div className="flex items-center gap-2">
                {onPageSizeChange && (
                  <Select
                    value={String(pageSize)}
                    onValueChange={(value) => onPageSizeChange(Number(value))}
                  >
                    <SelectTrigger className="h-8 w-[7.5rem]" aria-label="Rows per page">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[10, 20, 50, 100].map((size) => (
                        <SelectItem key={size} value={String(size)}>
                          {size} rows
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="icon-sm"
                    onClick={() => onPageChange?.(Math.max(1, page - 1))}
                    disabled={page <= 1}
                    aria-label="Previous page"
                  >
                    <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                  </Button>
                  <span className="px-2 text-xs text-muted-foreground">
                    Page {page} of {pageCount}
                  </span>
                  <Button
                    variant="outline"
                    size="icon-sm"
                    onClick={() => onPageChange?.(Math.min(pageCount, page + 1))}
                    disabled={page >= pageCount}
                    aria-label="Next page"
                  >
                    <ChevronRight className="h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
