/**
 * Number, quantity and text formatting helpers.
 */

const numberFormatter = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 1 });

export function formatNumber(value: number | null | undefined, fallback = '—'): string {
  if (value === null || value === undefined || Number.isNaN(value)) return fallback;
  return numberFormatter.format(value);
}

export function formatInteger(value: number | null | undefined, fallback = '—'): string {
  if (value === null || value === undefined || Number.isNaN(value)) return fallback;
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(value);
}

export function formatCompact(value: number | null | undefined, fallback = '—'): string {
  if (value === null || value === undefined || Number.isNaN(value)) return fallback;
  return new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

/** Formats a tonnage figure with the appropriate unit suffix. */
export function formatTonnes(value: number | null | undefined, fallback = '—'): string {
  if (value === null || value === undefined || Number.isNaN(value)) return fallback;
  if (Math.abs(value) >= 1_000_000) return `${formatNumber(value / 1_000_000)} Mt`;
  if (Math.abs(value) >= 1_000) return `${formatNumber(value / 1_000)} kt`;
  return `${formatInteger(value)} t`;
}

export function formatCurrencyLakhs(
  value: number | null | undefined,
  fallback = '—',
): string {
  if (value === null || value === undefined || Number.isNaN(value)) return fallback;
  return `₹${formatNumber(value)} L`;
}

export function formatPercent(
  value: number | null | undefined,
  digits = 0,
  fallback = '—',
): string {
  if (value === null || value === undefined || Number.isNaN(value)) return fallback;
  return `${value.toFixed(digits)}%`;
}

/** Safe percentage of `part` out of `total`; returns null when total is 0. */
export function ratioPercent(part: number, total: number): number | null {
  if (!total || Number.isNaN(total) || total === 0) return null;
  return (part / total) * 100;
}

export function formatFileSize(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || Number.isNaN(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}`;
}

export function truncate(value: string, max = 80): string {
  if (!value) return '';
  return value.length <= max ? value : `${value.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join('');
}
