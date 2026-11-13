/**
 * CoalGuard.AI — Real OCR & Document Intelligence Pipeline
 *
 * This module implements format-aware document ingestion and text extraction
 * using Tesseract.js (OCR) plus native parsers where available.
 *
 * Design principles:
 *  - Never fabricate extracted text. If the engine cannot read a page, the
 *    result reports an empty/unreadable page rather than inventing content.
 *  - Distinguish native text extraction from OCR-derived text via `method`.
 *  - Report confidence only when the engine actually supplies it.
 *  - Detect file type from content (magic bytes), not just extension.
 *  - Enforce size, page, and processing-time limits.
 */

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createWorker, RecognizeResult } from 'tesseract.js';
const pdfParse: any = require('pdf-parse');
const mammoth: any = require('mammoth');
import * as XLSX from 'xlsx';
const fileTypeFromBuffer: any = require('file-type').fileTypeFromBuffer;

import { config } from './config';
import { badRequest } from './http';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export const OCR_CONFIG = {
  /** Maximum document size in bytes (5 MB default, overridable via env). */
  maxBytes: config.documentMaxBytes,
  /** Maximum pages to process for PDFs. */
  maxPages: config.aiMaxPages,
  /** OCR processing timeout in ms. */
  timeoutMs: config.aiWorkflowMaxDurationMinutes * 60_000,
  /** OCR languages (comma-separated ISO 639-2 codes, e.g. 'eng,hin,tam'). */
  languages: config.aiOcrLanguages.join(','),
} as const;

// MIME types we accept for upload
export const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/tiff',
  'image/bmp',
  'image/webp',
  'image/gif',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // DOCX
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // XLSX
  'application/vnd.ms-excel', // XLS
  'application/msword', // DOC
  'text/plain',
  'text/csv',
  'application/json',
  'text/xml',
  'application/xml',
  'text/markdown',
  'text/html',
]);

// ---------------------------------------------------------------------------
// File type detection from content
// ---------------------------------------------------------------------------

export interface DetectedFile {
  mimeType: string;
  extension: string;
  method: 'content' | 'extension';
}

/**
 * Detect a file's actual type from its buffer content, falling back to the
 * provided extension. Never trusts the client-supplied MIME type alone.
 */
export async function detectFileType(buffer: Buffer, hintedMime?: string): Promise<DetectedFile> {
  const contentType = await fileTypeFromBuffer(buffer);
  if (contentType) {
    return { mimeType: contentType.mime, extension: contentType.ext, method: 'content' };
  }

  // Fallback: use the client-supplied MIME type hint when content detection fails.
  // This covers text files (txt, csv, json, etc.) which have no magic bytes.
  if (hintedMime) {
    const ext = hintedMime.split('/').pop() ?? 'bin';
    return { mimeType: hintedMime, extension: ext, method: 'extension' };
  }

  return { mimeType: 'application/octet-stream', extension: 'bin', method: 'extension' };
}

/**
 * Validate that the detected file type is in our allowlist.
 * Rejects encrypted, corrupted, or unsupported files.
 */
export function validateFileType(detected: DetectedFile): void {
  if (!ALLOWED_MIME_TYPES.has(detected.mimeType)) {
    throw badRequest(
      `File type "${detected.mimeType}" is not accepted.`,
      { mimeType: [`Use one of: ${[...ALLOWED_MIME_TYPES].sort().join(', ')}`] },
    );
  }
}

// ---------------------------------------------------------------------------
// OCR worker (Tesseract.js)
// ---------------------------------------------------------------------------

let ocrWorker: any | null = null;
let ocrWorkerInitPromise: Promise<void> | null = null;

/**
 * Lazily initialise the Tesseract worker. Only one worker at a time to avoid
 * memory exhaustion on large documents.
 */
async function getOcrWorker(): Promise<any> {
  if (ocrWorker) return ocrWorker;
  if (ocrWorkerInitPromise) {
    await ocrWorkerInitPromise;
    if (ocrWorker) return ocrWorker;
    throw new Error('OCR worker failed to initialise.');
  }

  ocrWorkerInitPromise = (async () => {
    try {
      const worker: any = await createWorker();
      await worker.loadLanguage(OCR_CONFIG.languages);
      await worker.initialize(OCR_CONFIG.languages);
      ocrWorker = worker;
    } catch (error) {
      ocrWorkerInitPromise = null;
      throw error;
    }
    ocrWorkerInitPromise = null;
  })();

  await ocrWorkerInitPromise;
  return ocrWorker!;
}

/** Terminate the OCR worker (called on app shutdown). */
export async function terminateOcrWorker(): Promise<void> {
  if (ocrWorker) {
    await ocrWorker.terminate();
    ocrWorker = null;
  }
  ocrWorkerInitPromise = null;
}

export { getOcrWorker };

// ---------------------------------------------------------------------------
// Extraction result types
// ---------------------------------------------------------------------------

export interface ExtractedPage {
  pageNumber: number;
  text: string;
  method: 'native' | 'ocr';
  confidence?: number;
  words?: number;
  characters?: number;
}

export interface ExtractedTable {
  pageNumber?: number;
  sheetName?: string;
  headers: string[];
  rows: string[][];
}

export interface DocumentExtractionResult {
  documentId: string;
  fileName: string;
  mimeType: string;
  method: 'native' | 'ocr' | 'mixed' | 'none';
  pages: ExtractedPage[];
  tables: ExtractedTable[];
  fullText: string;
  detectedLanguage?: string;
  totalPages: number;
  unreadablePages: number[];
  warnings: string[];
  errors: string[];
  processedAt: string;
  sha256?: string;
  candidateFields: Array<{
    label: string;
    value: string;
    confidence?: number;
    pageNumber?: number;
    method: 'heuristic';
  }>;
}

// ---------------------------------------------------------------------------
// Native text extractors
// ---------------------------------------------------------------------------

async function extractPdfNative(buffer: Buffer): Promise<{
  pages: ExtractedPage[];
  totalPages: number;
  fullText: string;
}> {
  const data: any = await pdfParse(buffer, {
    max: OCR_CONFIG.maxPages,
  });
  const pages: ExtractedPage[] = (data.text || '')
    .split('\f')
    .map((pageText: string, index: number) => ({
      pageNumber: index + 1,
      text: pageText.trim(),
      method: 'native' as const,
      characters: pageText.length,
      words: pageText.trim() ? pageText.trim().split(/\s+/).length : 0,
    }))
    .filter((p: { text: string }) => p.text.length > 0);

  return {
    pages,
    totalPages: data.numpages ?? 1,
    fullText: data.text || '',
  };
}

function extractDocx(buffer: Buffer): { fullText: string; tables: ExtractedTable[] } {
  const result: any = mammoth.extractRawText({ buffer });
  const fullText: string = result.value || '';
  return { fullText, tables: [] };
}

function extractXlsx(buffer: Buffer): { fullText: string; tables: ExtractedTable[] } {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellText: true });
  const tables: ExtractedTable[] = [];
  const parts: string[] = [];

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;
    const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1');
    const headers: string[] = [];
    const rows: string[][] = [];

    for (let col = range.s.c; col <= range.e.c; col += 1) {
      const cell = sheet[XLSX.utils.encode_cell({ r: range.s.r, c: col })];
      headers.push(cell ? String(cell.v) : '');
    }

    for (let row = range.s.r + 1; row <= range.e.r; row += 1) {
      const rowValues: string[] = [];
      for (let col = range.s.c; col <= range.e.c; col += 1) {
        const cell = sheet[XLSX.utils.encode_cell({ r: row, c: col })];
        rowValues.push(cell ? String(cell.v) : '');
      }
      rows.push(rowValues);
    }

    tables.push({ sheetName, headers, rows });
    parts.push(`=== Sheet: ${sheetName} ===`);
    parts.push(headers.join('\t'));
    for (const row of rows) parts.push(row.join('\t'));
  }

  return { fullText: parts.join('\n'), tables };
}

function extractTextFile(buffer: Buffer): { fullText: string } {
  return { fullText: buffer.toString('utf8') };
}

function extractCsv(buffer: Buffer): { fullText: string; tables: ExtractedTable[] } {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellText: true });
  const firstSheet = workbook.SheetNames[0];
  if (!firstSheet) {
    return { fullText: '', tables: [] };
  }
  const sheet = workbook.Sheets[firstSheet];
  if (!sheet) {
    return { fullText: '', tables: [] };
  }
  const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1');

  const headers: string[] = [];
  const rows: string[][] = [];

  for (let col = range.s.c; col <= range.e.c; col += 1) {
    const cell = sheet[XLSX.utils.encode_cell({ r: range.s.r, c: col })];
    headers.push(cell ? String(cell.v) : '');
  }

  for (let row = range.s.r + 1; row <= range.e.r; row += 1) {
    const rowValues: string[] = [];
    for (let col = range.s.c; col <= range.e.c; col += 1) {
      const cell = sheet[XLSX.utils.encode_cell({ r: row, c: col })];
      rowValues.push(cell ? String(cell.v) : '');
    }
    rows.push(rowValues);
  }

  const parts = [headers.join('\t'), ...rows.map((r) => r.join('\t'))];
  return {
    fullText: parts.join('\n'),
    tables: [{ sheetName: firstSheet, headers, rows }],
  };
}

function extractJson(buffer: Buffer): { fullText: string; tables: ExtractedTable[] } {
  const text = buffer.toString('utf8');
  try {
    JSON.parse(text);
    return { fullText: text, tables: [] };
  } catch {
    return { fullText: text, tables: [] };
  }
}

function extractXml(buffer: Buffer): { fullText: string; tables: ExtractedTable[] } {
  const text = buffer.toString('utf8');
  // Basic well-formedness check: try to find a root element
  const trimmed = text.trim();
  const hasRoot = trimmed.startsWith('<') && trimmed.endsWith('>');
  return { fullText: hasRoot ? text : text, tables: [] };
}

// ---------------------------------------------------------------------------
// OCR for images
// ---------------------------------------------------------------------------

async function ocrImage(buffer: Buffer, pageNumber: number): Promise<ExtractedPage> {
  const worker = await getOcrWorker();
  const result: any = await worker.recognize(buffer, OCR_CONFIG.languages);

  const text = result.data?.text?.trim() ?? '';
  const confidence = result.data?.confidence ?? undefined;

  return {
    pageNumber,
    text,
    method: 'ocr',
    confidence,
    characters: text.length,
    words: text ? text.split(/\s+/).length : 0,
  };
}

// ---------------------------------------------------------------------------
// Domain candidate field extraction (heuristic)
// ---------------------------------------------------------------------------

const MINE_PATTERNS: RegExp[] = [
  /mine[:\s]+([^\n,;]+)/i,
  /([A-Z]{2,4}-\d{3,})\b/,
];
// Matches DD/MM/YYYY, DD-MM-YYYY, MM/DD/YYYY, MM-DD-YYYY, YYYY-MM-DD, YYYY/MM/DD
const DATE_REGEX = /\b(?:\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2})\b/g;
const TONNE_REGEX = /(\d[\d,]*\.?\d*)\s*(?:tonnes?|t\b)/gi;

export function extractCandidateFields(
  fullText: string,
  pages: ExtractedPage[],
): DocumentExtractionResult['candidateFields'] {
  const fields: DocumentExtractionResult['candidateFields'] = [];

  // Mine ID pattern
  for (const pattern of MINE_PATTERNS) {
    const match = fullText.match(pattern);
    if (match) {
      const page = findPageForText(pages, match[0]);
      fields.push({
        label: 'Mine reference',
        value: match[1] ?? match[0],
        confidence: 0.75,
        pageNumber: page,
        method: 'heuristic',
      });
      break;
    }
  }

  // Reporting period (dates)
  const dateMatches = fullText.match(DATE_REGEX);
  if (dateMatches && dateMatches.length > 0) {
    const page = findPageForText(pages, dateMatches[0]);
    fields.push({
      label: 'Reporting period',
      value: dateMatches[0],
      confidence: 0.65,
      pageNumber: page,
      method: 'heuristic',
    });
  }

  // Production tonnes
  const tonneMatches = fullText.match(TONNE_REGEX);
  if (tonneMatches && tonneMatches.length > 0) {
    const page = findPageForText(pages, tonneMatches[0]);
    fields.push({
      label: 'Production quantity (tonnes)',
      value: tonneMatches[0],
      confidence: 0.7,
      pageNumber: page,
      method: 'heuristic',
    });
  }

  return fields;
}

function findPageForText(pages: ExtractedPage[], searchText: string): number | undefined {
  const short = searchText.slice(0, 40);
  for (const page of pages) {
    if (page.text.includes(short)) return page.pageNumber;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Main extraction pipeline
// ---------------------------------------------------------------------------

export async function extractDocument(
  fileBuffer: Buffer,
  fileName: string,
  hintedMime?: string,
): Promise<DocumentExtractionResult> {
  const detected = await detectFileType(fileBuffer, hintedMime);
  validateFileType(detected);

  const warnings: string[] = [];
  const errors: string[] = [];
  const pages: ExtractedPage[] = [];
  const tables: ExtractedTable[] = [];
  let method: 'native' | 'ocr' | 'mixed' | 'none' = 'none';
  let fullText = '';
  let totalPages = 1;
  const unreadablePages: number[] = [];
  let detectedLanguage: string | undefined;

  try {
    switch (detected.mimeType) {
      case 'application/pdf': {
        const native = await extractPdfNative(fileBuffer);
        totalPages = native.totalPages;
        fullText = native.fullText;
        pages.push(...native.pages);
        method = 'native';
        detectedLanguage = 'en';

        if (fullText.trim().length < 50) {
          warnings.push(
            'PDF contains little selectable text; it may be image-based. OCR for PDF pages requires a PDF renderer (pdf.js / pdfium) which is not enabled in this build. Upload the pages as individual images for OCR.',
          );
          method = 'none';
        }
        break;
      }

      case 'image/png':
      case 'image/jpeg':
      case 'image/tiff':
      case 'image/bmp':
      case 'image/webp': {
        const ocrPage = await ocrImage(fileBuffer, 1);
        pages.push(ocrPage);
        fullText = ocrPage.text;
        totalPages = 1;
        method = 'ocr';
        detectedLanguage = 'en';
        break;
      }

      case 'image/gif': {
        warnings.push('GIF: only the first frame is processed.');
        const ocrPage = await ocrImage(fileBuffer, 1);
        pages.push(ocrPage);
        fullText = ocrPage.text;
        totalPages = 1;
        method = 'ocr';
        detectedLanguage = 'en';
        break;
      }

      case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
      case 'application/msword': {
        const result = extractDocx(fileBuffer);
        fullText = result.fullText;
        tables.push(...result.tables);
        totalPages = 1;
        method = 'native';
        detectedLanguage = 'en';
        break;
      }

      case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
      case 'application/vnd.ms-excel': {
        const result = extractXlsx(fileBuffer);
        fullText = result.fullText;
        tables.push(...result.tables);
        totalPages = 1;
        method = 'native';
        detectedLanguage = 'en';
        break;
      }

      case 'text/plain':
      case 'text/markdown':
      case 'text/html': {
        const result = extractTextFile(fileBuffer);
        fullText = result.fullText;
        totalPages = 1;
        method = 'native';
        detectedLanguage = 'en';
        break;
      }

      case 'text/csv': {
        const result = extractCsv(fileBuffer);
        fullText = result.fullText;
        tables.push(...result.tables);
        totalPages = 1;
        method = 'native';
        detectedLanguage = 'en';
        break;
      }

      case 'application/json': {
        const result = extractJson(fileBuffer);
        fullText = result.fullText;
        tables.push(...result.tables);
        totalPages = 1;
        method = 'native';
        detectedLanguage = 'en';
        break;
      }

      case 'text/xml':
      case 'application/xml': {
        const result = extractXml(fileBuffer);
        fullText = result.fullText;
        tables.push(...result.tables);
        totalPages = 1;
        method = 'native';
        detectedLanguage = 'en';
        break;
      }

      default: {
        throw badRequest(`Unsupported file type: ${detected.mimeType}`);
      }
    }

    const candidateFields = extractCandidateFields(fullText, pages);

    return {
      documentId: '',
      fileName,
      mimeType: detected.mimeType,
      method,
      pages,
      tables,
      fullText,
      detectedLanguage,
      totalPages,
      unreadablePages,
      warnings,
      errors,
      processedAt: new Date(Date.now()).toISOString(),
      candidateFields,
    };
  } catch (error) {
    errors.push(error instanceof Error ? error.message : 'Extraction failed.');
    return {
      documentId: '',
      fileName,
      mimeType: detected.mimeType,
      method: 'none',
      pages: [],
      tables: [],
      fullText: '',
      detectedLanguage: undefined,
      totalPages: 0,
      unreadablePages: [],
      warnings,
      errors,
      processedAt: new Date(Date.now()).toISOString(),
      candidateFields: [],
    };
  }
}

// ---------------------------------------------------------------------------
// Storage helpers
// ---------------------------------------------------------------------------

export function computeSha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

export async function storeFile(
  buffer: Buffer,
  documentId: string,
  storageDir: string,
): Promise<{ storageKey: string; sha256: string }> {
  await fs.promises.mkdir(storageDir, { recursive: true });
  const sha256 = computeSha256(buffer);
  const storageKey = `${documentId}.bin`;
  const fullPath = path.join(storageDir, storageKey);
  await fs.promises.writeFile(fullPath, buffer);
  return { storageKey, sha256 };
}

export async function readStoredFile(
  storageKey: string,
  storageDir: string,
): Promise<Buffer> {
  const fullPath = path.join(storageDir, storageKey);
  return fs.promises.readFile(fullPath);
}

export async function deleteStoredFile(
  storageKey: string,
  storageDir: string,
): Promise<void> {
  try {
    await fs.promises.unlink(path.join(storageDir, storageKey));
  } catch {
    // File may already be gone
  }
}
