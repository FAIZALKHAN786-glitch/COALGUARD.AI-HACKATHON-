import {
  differenceInCalendarDays,
  format,
  formatDistanceToNowStrict,
  isValid,
  parseISO,
} from 'date-fns';

/**
 * Date helpers for CoalGuard.AI.
 *
 * Two kinds of date strings are used across the platform:
 *  - Date-only strings (`YYYY-MM-DD`) e.g. a compliance due date.
 *  - Full ISO date-time strings e.g. an audit timestamp.
 *
 * Date-only values are parsed as *local* calendar dates so that a due date of
 * `2026-01-31` never shifts to the previous day because of a UTC offset.
 */

export const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isDateOnly(value: string): boolean {
  return DATE_ONLY_PATTERN.test(value);
}

/** Parses a date-only or full ISO string into a Date, or null when invalid. */
export function parseDate(value: string | Date | null | undefined): Date | null {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) return isValid(value) ? value : null;
  if (isDateOnly(value)) {
    const [y, m, d] = value.split('-').map((part) => Number.parseInt(part, 10));
    if (!y || !m || !d) return null;
    const date = new Date(y, m - 1, d);
    return isValid(date) ? date : null;
  }
  const parsed = parseISO(value);
  return isValid(parsed) ? parsed : null;
}

export function formatDate(
  value: string | Date | null | undefined,
  pattern = 'dd MMM yyyy',
): string {
  const date = parseDate(value);
  return date ? format(date, pattern) : '—';
}

export function formatDateTime(
  value: string | Date | null | undefined,
  pattern = 'dd MMM yyyy, HH:mm',
): string {
  const date = parseDate(value);
  return date ? format(date, pattern) : '—';
}

/** Formats a date/time using the ISO-8601 timezone offset of the runtime. */
export function formatDateTimeWithZone(
  value: string | Date | null | undefined,
  pattern = 'dd MMM yyyy, HH:mm zzz',
): string {
  const date = parseDate(value);
  return date ? format(date, pattern) : '—';
}

export function formatRelative(
  value: string | Date | null | undefined,
  now: Date = new Date(),
): string {
  const date = parseDate(value);
  if (!date) return '—';
  const diffMs = Math.abs(date.getTime() - now.getTime());
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return formatDistanceToNowStrict(date, { addSuffix: false });
}

/**
 * Calendar-day difference between `value` and `now`.
 * Positive means the value is in the future. Date-only values are compared at
 * midnight local time so that "due today" is 0 regardless of the current hour.
 */
export function daysUntil(value: string | Date | null | undefined, now: Date = new Date()): number | null {
  const date = parseDate(value);
  if (!date) return null;
  const base = isDateOnly(String(value)) ? startOfDayLocal(now) : now;
  return differenceInCalendarDays(date, base);
}

export function startOfDayLocal(date: Date): Date {
  const copy = new Date(date.getTime());
  copy.setHours(0, 0, 0, 0);
  return copy;
}

/**
 * Deadline classification used across compliance, corrective actions and
 * contracts. `not_applicable` is returned when no deadline exists.
 */
export type DeadlineState = 'overdue' | 'due_today' | 'due_soon' | 'upcoming' | 'not_applicable';

export function deadlineState(
  dueDate: string | Date | null | undefined,
  now: Date = new Date(),
  soonWithinDays = 14,
): DeadlineState {
  const days = daysUntil(dueDate, now);
  if (days === null) return 'not_applicable';
  if (days < 0) return 'overdue';
  if (days === 0) return 'due_today';
  if (days <= soonWithinDays) return 'due_soon';
  return 'upcoming';
}

export function isOverdue(
  dueDate: string | Date | null | undefined,
  now: Date = new Date(),
): boolean {
  return deadlineState(dueDate, now) === 'overdue';
}

export function toDateOnly(value: string | Date | null | undefined): string | null {
  const date = parseDate(value);
  return date ? format(date, 'yyyy-MM-dd') : null;
}

export function addDays(date: Date, days: number): Date {
  const copy = new Date(date.getTime());
  copy.setDate(copy.getDate() + days);
  return copy;
}

export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

export function daysInMonth(date: Date): number {
  return endOfMonth(date).getDate();
}

/** ISO week key (e.g. `2026-W03`) used for grouping time series. */
export function isoWeekKey(value: string | Date): string {
  const date = parseDate(value) ?? new Date();
  const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNumber = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNumber + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const diff = target.getTime() - firstThursday.getTime();
  const week = 1 + Math.round(diff / (7 * 24 * 60 * 60 * 1000));
  return `${target.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

export function monthKey(value: string | Date): string {
  const date = parseDate(value) ?? new Date();
  return format(date, 'yyyy-MM');
}
