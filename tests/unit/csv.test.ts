import { describe, expect, it } from 'vitest';

import { escapeCsvValue, safeFileName, toCsv, type CsvColumn } from '@/lib/export/csv';

interface Row {
  name: string;
  note: string;
  count: number;
}

const columns: CsvColumn<Row>[] = [
  { key: 'name', label: 'Name', value: (row) => row.name },
  { key: 'note', label: 'Note', value: (row) => row.note },
  { key: 'count', label: 'Count', value: (row) => row.count },
];

describe('CSV escaping', () => {
  it('returns an empty string for null and undefined', () => {
    expect(escapeCsvValue(null)).toBe('');
    expect(escapeCsvValue(undefined)).toBe('');
  });

  it('quotes values containing commas, quotes, CR or LF', () => {
    expect(escapeCsvValue('a,b')).toBe('"a,b"');
    expect(escapeCsvValue('say "hi"')).toBe('"say ""hi"""');
    expect(escapeCsvValue('line1\nline2')).toBe('"line1\nline2"');
    expect(escapeCsvValue('line1\rline2')).toBe('"line1\rline2"');
  });

  it('neutralises spreadsheet formula injection', () => {
    const unquote = (value: string) =>
      value.startsWith('"') && value.endsWith('"')
        ? value.slice(1, -1).replace(/""/g, '"')
        : value;
    for (const value of ['=SUM(A1:A9)', '+1+1', '-2+3', '@cmd', '\tpayload', '\rpayload']) {
      expect(unquote(escapeCsvValue(value)).startsWith("'")).toBe(true);
    }
    expect(escapeCsvValue('=SUM(A1)')).toBe("'=SUM(A1)");
    // Quoting still happens after the prefix is added when needed.
    expect(escapeCsvValue('=A1,B1')).toBe("\"'=A1,B1\"");
  });

  it('does not prefix harmless values', () => {
    expect(escapeCsvValue('Mine A')).toBe('Mine A');
    expect(escapeCsvValue(12)).toBe('12');
    expect(escapeCsvValue('a=b')).toBe('a=b');
  });

  it('serialises a header and escaped body', () => {
    const csv = toCsv([{ name: 'Alpha', note: '=cmd', count: 2 }], columns);
    const [header, body] = csv.split('\r\n');
    expect(header).toBe('Name,Note,Count');
    expect(body).toBe("Alpha,'=cmd,2");
  });
});

describe('safeFileName', () => {
  it('strips path separators and unsafe characters', () => {
    expect(safeFileName('report: q3/2026 *final*')).toBe('report-q3-2026-final');
  });

  it('collapses whitespace and punctuation runs into a single separator', () => {
    expect(safeFileName('compliance   summary')).toBe('compliance-summary');
  });

  it('falls back when nothing usable remains', () => {
    expect(safeFileName('***')).toBe('export');
    expect(safeFileName('***', 'fallback-name')).toBe('fallback-name');
  });

  it('bounds the length so a pathological title cannot break the download', () => {
    expect(safeFileName('a'.repeat(400)).length).toBeLessThanOrEqual(120);
  });
});
