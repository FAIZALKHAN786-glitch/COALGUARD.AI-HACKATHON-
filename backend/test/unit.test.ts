import { describe, expect, test } from 'vitest';

import { auditHash, stableJson } from '../src/audit';
import { AppError, compact, dateOnly, listOptions, requireArray, requireEnum, requireNumber, requireString, sortColumn } from '../src/http';

describe('deterministic audit JSON', () => {
  test('sorts nested keys and normalises undefined values', () => {
    expect(stableJson({ b: 1, a: { d: 2, c: undefined } })).toBe('{"a":{"c":null,"d":2},"b":1}');
  });

  test('normalises dates and non-finite numbers', () => {
    expect(stableJson({ at: new Date('2026-10-23T12:00:00.000Z') })).toBe(
      '{"at":"2026-10-23T12:00:00.000Z"}',
    );
    expect(stableJson(Number.NaN)).toBe('null');
    expect(stableJson(Number.POSITIVE_INFINITY)).toBe('null');
  });

  test('hashing is stable regardless of object key insertion order', () => {
    const base = {
      prevHash: null,
      timestamp: '2026-10-23T12:00:00.000Z',
      actorId: 'usr-01',
      action: 'create',
      entityType: 'mine',
      entityId: 'mine-01',
      reason: null,
      requestId: 'req-1',
    };
    expect(auditHash({ ...base, previousValue: { b: 2, a: 1 }, updatedValue: null })).toBe(
      auditHash({ ...base, previousValue: { a: 1, b: 2 }, updatedValue: null }),
    );
  });
});

describe('HTTP input validation', () => {
  test('rejects blank and oversized strings', () => {
    expect(() => requireString('  ', 'title')).toThrow(AppError);
    expect(() => requireString('x'.repeat(11), 'title', 10)).toThrow(/long/);
  });

  test('rejects non-finite and out-of-range numbers', () => {
    expect(() => requireNumber('abc', 'limit')).toThrow(AppError);
    expect(() => requireNumber(-1, 'limit', 0)).toThrow(AppError);
    expect(() => requireNumber(Number.NaN, 'limit')).toThrow(AppError);
    expect(requireNumber('2.5', 'limit', 0)).toBe(2.5);
  });

  test('enforces enums and string arrays', () => {
    expect(requireEnum('csv', ['csv', 'pdf'], 'format')).toBe('csv');
    expect(() => requireEnum('xlsx', ['csv', 'pdf'], 'format')).toThrow(AppError);
    expect(requireArray(['a', 'b'], 'mineIds')).toEqual(['a', 'b']);
    expect(() => requireArray(['a', 3], 'mineIds')).toThrow(AppError);
  });

  test('compact removes undefined but preserves false and zero', () => {
    expect(compact({ a: 0, b: false, c: undefined, d: '' })).toEqual({ a: 0, b: false, d: '' });
  });

  test('dateOnly emits a ISO calendar date without shifting UTC days', () => {
    expect(dateOnly(new Date('2026-10-23T23:30:00.000Z'))).toBe('2026-10-23');
    expect(dateOnly('2026-10-23')).toBe('2026-10-23');
    expect(dateOnly(null)).toBeUndefined();
  });

  test('pagination is clamped and sort columns are allow-listed', () => {
    const options = listOptions({ page: '-2', pageSize: '10000', sortBy: 'password', sortDir: 'evil' }, 'updated_at');
    expect(options.pageSize).toBe(100);
    expect(options.offset).toBe(0);
    expect(options.sortDir).toBe('desc');
    expect(sortColumn(options.sortBy, { title: 'c.title' }, 'c.updated_at')).toBe('c.updated_at');
    expect(sortColumn('title', { title: 'c.title' }, 'c.updated_at')).toBe('c.title');
  });
});
