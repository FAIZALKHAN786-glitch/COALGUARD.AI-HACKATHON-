import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import {
  extractDocument,
  detectFileType,
  validateFileType,
  computeSha256,
  extractCandidateFields,
  ALLOWED_MIME_TYPES,
  OCR_CONFIG,
} from '../src/ocr';

const FIXTURE_DIR = path.join(__dirname, 'fixtures', 'ocr');

function readFixture(name: string): Buffer {
  return fs.readFileSync(path.join(FIXTURE_DIR, name));
}

describe('OCR: file type detection', () => {
  test('detects text file from content', async () => {
    const buffer = readFixture('test-inspection-report.txt');
    const detected = await detectFileType(buffer, 'text/plain');
    expect(detected.mimeType).toBe('text/plain');
    expect(detected.method).toBe('extension');
  });

  test('detects CSV file from content', async () => {
    const buffer = readFixture('test-production.csv');
    const detected = await detectFileType(buffer, 'text/csv');
    expect(detected.mimeType).toBe('text/csv');
    expect(detected.method).toBe('extension');
  });

  test('detects JSON file from content', async () => {
    const buffer = readFixture('test-compliance.json');
    const detected = await detectFileType(buffer, 'application/json');
    expect(detected.mimeType).toBe('application/json');
    expect(detected.method).toBe('extension');
  });

  test('rejects unsupported file type', async () => {
    const buffer = Buffer.from([0x00, 0x01, 0x02, 0x03]);
    await expect(async () => validateFileType(await detectFileType(buffer))).rejects.toThrow();
  });
});

describe('OCR: SHA-256 computation', () => {
  test('computes deterministic hash', () => {
    const buffer = Buffer.from('test content');
    const hash1 = computeSha256(buffer);
    const hash2 = computeSha256(buffer);
    expect(hash1).toBe(hash2);
    expect(hash1.length).toBe(64);
  });
});

describe('OCR: candidate field extraction', () => {
  test('extracts mine reference, dates, and tonnes from text', () => {
    const text = 'Mine: RMC-JDH-01 (Rajmahal Pit 01)\nReporting Period: 2026-09-01 to 2026-09-30\nProduction: 12500 tonnes';
    const pages = [{ pageNumber: 1, text, method: 'native' as const }];
    const fields = extractCandidateFields(text, pages);
    const labels = fields.map((f) => f.label);
    expect(labels).toContain('Mine reference');
    expect(labels).toContain('Reporting period');
    expect(labels).toContain('Production quantity (tonnes)');
  });

  test('returns empty array for text with no patterns', () => {
    const fields = extractCandidateFields('Just some random text without patterns.', [
      { pageNumber: 1, text: 'Just some random text without patterns.', method: 'native' },
    ]);
    expect(fields).toHaveLength(0);
  });
});

describe('OCR: text file extraction', () => {
  test('extracts text from a TXT file', async () => {
    const buffer = readFixture('test-inspection-report.txt');
    const result = await extractDocument(buffer, 'test-inspection-report.txt', 'text/plain');
    expect(result.method).toBe('native');
    expect(result.fullText).toContain('CoalGuard.AI Mine Safety Inspection Report');
    expect(result.fullText).toContain('RMC-JDH-01');
    expect(result.errors).toHaveLength(0);
    expect(result.status !== 'failed').toBe(true);
  });
});

describe('OCR: CSV extraction', () => {
  test('extracts CSV content with table structure', async () => {
    const buffer = readFixture('test-production.csv');
    const result = await extractDocument(buffer, 'test-production.csv', 'text/csv');
    expect(result.method).toBe('native');
    expect(result.fullText).toContain('mine-01');
    expect(result.fullText).toContain('Rajmahal Pit 01');
    expect(result.tables.length).toBeGreaterThan(0);
    expect(result.tables[0]?.headers).toContain('mine_id');
    expect(result.errors).toHaveLength(0);
  });
});

describe('OCR: JSON extraction', () => {
  test('extracts JSON content', async () => {
    const buffer = readFixture('test-compliance.json');
    const result = await extractDocument(buffer, 'test-compliance.json', 'application/json');
    expect(result.method).toBe('native');
    expect(result.fullText).toContain('compliance_evidence');
    expect(result.fullText).toContain('mine-01');
    expect(result.errors).toHaveLength(0);
  });
});

describe('OCR: configuration', () => {
  test('OCR config has expected values', () => {
    expect(OCR_CONFIG.languages).toBe('eng');
    expect(OCR_CONFIG.maxBytes).toBeGreaterThan(0);
    expect(OCR_CONFIG.maxPages).toBe(50);
  });

  test('allowed MIME types include key formats', () => {
    expect(ALLOWED_MIME_TYPES.has('application/pdf')).toBe(true);
    expect(ALLOWED_MIME_TYPES.has('image/png')).toBe(true);
    expect(ALLOWED_MIME_TYPES.has('image/jpeg')).toBe(true);
    expect(ALLOWED_MIME_TYPES.has('text/plain')).toBe(true);
    expect(ALLOWED_MIME_TYPES.has('text/csv')).toBe(true);
    expect(ALLOWED_MIME_TYPES.has('application/json')).toBe(true);
  });
});
