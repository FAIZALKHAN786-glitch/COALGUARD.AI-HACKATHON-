/**
 * CSV generation with spreadsheet-safety escaping.
 *
 * - Fields containing commas, quotes, CR or LF are quoted.
 * - Embedded quotes are doubled.
 * - Fields starting with `=`, `+`, `-`, `@`, tab or carriage return are
 *   prefixed with a single quote so spreadsheet applications treat them as
 *   text (formula-injection mitigation).
 */

const FORMULA_PREFIXES = ['=', '+', '-', '@', '\t', '\r'];

export interface CsvColumn<T> {
  key: string;
  label: string;
  value: (row: T) => unknown;
}

/** Escapes a single CSV field. */
export function escapeCsvValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  let text = value instanceof Date ? value.toISOString() : String(value);

  // Mitigate spreadsheet formula injection.
  if (text.length > 0 && FORMULA_PREFIXES.includes(text.charAt(0))) {
    text = `'${text}`;
  }

  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const header = columns.map((column) => escapeCsvValue(column.label)).join(',');
  const body = rows.map((row) =>
    columns.map((column) => escapeCsvValue(column.value(row))).join(','),
  );
  return [header, ...body].join('\r\n');
}

/**
 * Sanitises a file name so it cannot contain path separators or characters
 * that are illegal on common filesystems.
 */
export function safeFileName(name: string, fallback = 'export'): string {
  const cleaned = name
    // Collapse every run of unsafe characters (including whitespace, path
    // separators and punctuation) into a single separator.
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-.]+/, '')
    .replace(/[-.]+$/, '')
    .slice(0, 120);
  return cleaned || fallback;
}

/** Triggers a client-side download of the supplied text content. */
export function downloadTextFile(content: string, fileName: string, mimeType = 'text/csv;charset=utf-8'): void {
  if (typeof window === 'undefined') return;
  const blob = new Blob([`\uFEFF${content}`], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  // Revoke on the next tick so Safari has time to start the download.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
