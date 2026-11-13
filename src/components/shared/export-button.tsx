'use client';

import * as React from 'react';
import { Download } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { downloadTextFile, safeFileName, toCsv, type CsvColumn } from '@/lib/export/csv';

export interface ExportButtonProps<T> {
  rows: T[];
  columns: CsvColumn<T>[];
  fileName: string;
  label?: string;
  disabled?: boolean;
  className?: string;
  /** Extra explanation surfaced in the tooltip / accessible description. */
  description?: string;
}

/**
 * Exports the supplied rows to a CSV file in the browser.
 *
 * The file name is sanitised and every field is escaped (including the
 * spreadsheet formula-injection mitigation) before the download starts.
 */
export function ExportButton<T>({
  rows,
  columns,
  fileName,
  label = 'Export CSV',
  disabled,
  className,
  description,
}: ExportButtonProps<T>) {
  const [busy, setBusy] = React.useState(false);

  const handleExport = React.useCallback(() => {
    if (rows.length === 0) return;
    setBusy(true);
    try {
      const csv = toCsv(rows, columns);
      downloadTextFile(csv, `${safeFileName(fileName)}.csv`);
    } finally {
      setBusy(false);
    }
  }, [columns, fileName, rows]);

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={handleExport}
      disabled={disabled || rows.length === 0 || busy}
      loading={busy}
      loadingLabel="Preparing…"
      className={className}
      title={description ?? `Download ${rows.length} rows as a CSV file`}
    >
      {!busy && <Download className="h-3.5 w-3.5" aria-hidden="true" />}
      {label}
    </Button>
  );
}
