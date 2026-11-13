/**
 * Pure query helpers shared by the HTTP and development adapters.
 *
 * These implement the pagination / filtering / sorting conventions documented
 * in `docs/API_CONTRACT.md`, so both adapters behave identically.
 */

import type { ListQuery, ListResult } from '@/services/types';
import type { ApiMeta, DataSource } from '@/types';

export interface QueryableRecord {
  id: string;
  [key: string]: unknown;
}

type WithId = { id: string };

function readField(item: WithId, field: string): unknown {
  return (item as unknown as Record<string, unknown>)[field];
}

function matchesText(haystack: unknown, needle: string): boolean {
  if (haystack === null || haystack === undefined) return false;
  const text = Array.isArray(haystack) ? haystack.join(' ') : String(haystack);
  return text.toLowerCase().includes(needle.toLowerCase());
}

/** Returns the set of values a record exposes for free-text search. */
export function searchFieldsOf(record: WithId): unknown[] {
  const keys = ['name', 'code', 'title', 'description', 'label', 'reference', 'workerDisplayName'];
  const values: unknown[] = [];
  for (const key of keys) {
    const value = readField(record, key);
    if (value !== undefined) values.push(value);
  }
  return values;
}

export function filterBySearch<T extends WithId>(items: T[], search?: string): T[] {
  const needle = search?.trim();
  if (!needle) return items;
  return items.filter((item) => searchFieldsOf(item).some((value) => matchesText(value, needle)));
}

export function filterByField<T extends WithId>(
  items: T[],
  filters?: Record<string, string | string[] | undefined>,
): T[] {
  if (!filters) return items;
  let result = items;
  for (const [field, rawValue] of Object.entries(filters)) {
    if (rawValue === undefined || rawValue === '') continue;
    const values = (Array.isArray(rawValue) ? rawValue : [rawValue]).filter((v) => v !== '');
    if (values.length === 0) continue;
    result = result.filter((item) => {
      const actual = readField(item, field);
      if (actual === undefined || actual === null) return false;
      if (Array.isArray(actual)) return actual.some((entry) => values.includes(String(entry)));
      return values.includes(String(actual));
    });
  }
  return result;
}

export function sortBy<T extends WithId>(
  items: T[],
  sortByKey?: string,
  sortDir: 'asc' | 'desc' = 'asc',
): T[] {
  if (!sortByKey) return items;
  const copy = [...items];
  const factor = sortDir === 'desc' ? -1 : 1;
  copy.sort((a, b) => {
    const left = readField(a, sortByKey);
    const right = readField(b, sortByKey);
    if (left === right) return 0;
    if (left === null || left === undefined) return 1;
    if (right === null || right === undefined) return -1;
    if (typeof left === 'number' && typeof right === 'number') return (left - right) * factor;
    return String(left).localeCompare(String(right)) * factor;
  });
  return copy;
}

export function paginate<T>(
  items: T[],
  query: ListQuery | undefined,
  source: DataSource,
  generatedAt: string,
): ListResult<T> {
  const page = Math.max(1, query?.page ?? 1);
  const pageSize = Math.min(200, Math.max(1, query?.pageSize ?? 20));
  const total = items.length;
  const start = (page - 1) * pageSize;
  const pageItems = items.slice(start, start + pageSize);
  const meta: ApiMeta = {
    source,
    generatedAt,
    total,
    page,
    pageSize,
  };
  return { items: pageItems, meta };
}

/** Applies the standard pipeline: search → filter → sort → paginate. */
export function applyQuery<T extends WithId>(
  items: T[],
  query: ListQuery | undefined,
  source: DataSource,
  generatedAt: string,
): ListResult<T> {
  let result = filterBySearch(items, query?.search);
  result = filterByField(result, query?.filters);
  result = sortBy(result, query?.sortBy, query?.sortDir);
  return paginate(result, query, source, generatedAt);
}

/** Range filter helper for `from`/`to` ISO date bounds. */
export function withinDateRange(
  value: string | null | undefined,
  from?: string,
  to?: string,
): boolean {
  if (!value) return false;
  if (from && value < from) return false;
  if (to && value > to) return false;
  return true;
}
