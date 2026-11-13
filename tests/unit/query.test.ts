import { describe, expect, it } from 'vitest';

import { filterByField, filterBySearch, paginate, sortBy, withinDateRange } from '@/lib/api/query';

interface Record {
  id: string;
  name: string;
  status: string;
  mineIds?: string[];
  dueDate?: string;
  score?: number;
}

const records: Record[] = [
  { id: '1', name: 'Alpha mine', status: 'open', mineIds: ['mine-1'], dueDate: '2026-01-10', score: 3 },
  { id: '2', name: 'Beta mine', status: 'closed', mineIds: ['mine-1', 'mine-2'], dueDate: '2026-02-10', score: 1 },
  { id: '3', name: 'Gamma mine', status: 'open', mineIds: ['mine-2'], score: 2 },
];

describe('filterByField', () => {
  it('returns everything when no filter is supplied', () => {
    expect(filterByField(records)).toHaveLength(3);
  });

  it('matches scalar values as strings', () => {
    expect(filterByField(records, { status: 'open' }).map((row) => row.id)).toEqual(['1', '3']);
  });

  it('treats an empty filter value as no filter', () => {
    expect(filterByField(records, { status: '' })).toHaveLength(3);
  });

  it('matches membership for array fields', () => {
    expect(filterByField(records, { mineIds: 'mine-2' }).map((row) => row.id)).toEqual(['2', '3']);
  });

  it('accepts an array of permitted values and requires every field to match', () => {
    expect(filterByField(records, { mineIds: ['mine-1', 'mine-2'], status: 'open' }).map((row) => row.id)).toEqual([
      '1',
      '3',
    ]);
  });

  it('excludes records that lack the field', () => {
    expect(filterByField(records, { dueDate: '2026-01-10' }).map((row) => row.id)).toEqual(['1']);
  });
});

describe('filterBySearch', () => {
  it('searches case-insensitively across searchable fields', () => {
    expect(filterBySearch(records, 'GAMMA').map((row) => row.id)).toEqual(['3']);
  });

  it('returns everything for an empty or whitespace term', () => {
    expect(filterBySearch(records, '   ')).toHaveLength(3);
  });

  it('returns nothing when no record matches', () => {
    expect(filterBySearch(records, 'delta')).toEqual([]);
  });
});

describe('sortBy', () => {
  it('returns the original order without a key', () => {
    expect(sortBy(records).map((row) => row.id)).toEqual(['1', '2', '3']);
  });

  it('sorts numbers numerically in both directions and does not mutate the input', () => {
    expect(sortBy(records, 'score', 'asc').map((row) => row.id)).toEqual(['2', '3', '1']);
    expect(sortBy(records, 'score', 'desc').map((row) => row.id)).toEqual(['1', '3', '2']);
    expect(records.map((row) => row.id)).toEqual(['1', '2', '3']);
  });

  it('sorts strings and pushes missing values to the end', () => {
    expect(sortBy(records, 'dueDate', 'asc').map((row) => row.id)).toEqual(['1', '2', '3']);
    expect(sortBy(records, 'dueDate', 'desc').map((row) => row.id)).toEqual(['2', '1', '3']);
  });
});

describe('paginate', () => {
  it('clamps page size to the documented maximum of 200 and page to at least 1', () => {
    const result = paginate(records, { page: 0, pageSize: 5000 }, 'development', '2026-01-01T00:00:00.000Z');
    expect(result.meta.page).toBe(1);
    expect(result.meta.pageSize).toBe(200);
    expect(result.meta.total).toBe(3);
    expect(result.items).toHaveLength(3);
  });

  it('returns an empty page beyond the end while keeping the true total', () => {
    const result = paginate(records, { page: 4, pageSize: 1 }, 'development', '2026-01-01T00:00:00.000Z');
    expect(result.items).toEqual([]);
    expect(result.meta.total).toBe(3);
  });
});

describe('withinDateRange', () => {
  it('returns false for a missing value', () => {
    expect(withinDateRange(undefined, '2026-01-01', '2026-12-31')).toBe(false);
  });

  it('is inclusive of both bounds', () => {
    expect(withinDateRange('2026-01-01', '2026-01-01', '2026-12-31')).toBe(true);
    expect(withinDateRange('2026-12-31', '2026-01-01', '2026-12-31')).toBe(true);
  });

  it('excludes values outside the bounds', () => {
    expect(withinDateRange('2025-12-31', '2026-01-01', '2026-12-31')).toBe(false);
    expect(withinDateRange('2027-01-01', '2026-01-01', '2026-12-31')).toBe(false);
  });
});
