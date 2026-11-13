/**
 * Augments the TanStack Table column metadata with the fields CoalGuard tables
 * rely on. Keeping this in one declaration file means every `ColumnDef` gets the
 * labels and hints the shared `DataTable` renders in mobile card mode, without
 * repeating a cast at each call site.
 */

import type { RowData } from '@tanstack/react-table';

declare module '@tanstack/react-table' {
  interface ColumnMeta<TData extends RowData, TValue> {
    /** Human-readable column heading used on the mobile card layout. */
    label?: string;
    /** Marks the column as secondary: hidden from the mobile card by default. */
    secondary?: boolean;
    /** Optional helper text shown against the column in the header. */
    hint?: string;
  }
}
