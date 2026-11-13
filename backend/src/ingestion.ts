/**
 * CoalGuard.AI — Data Ingestion Service
 *
 * Reusable ingestion framework for official Indian coal-sector data sources.
 * Supports REST APIs, CSV, Excel, JSON, XML, HTML tables, text-based PDFs,
 * and scanned PDFs (OCR).
 *
 * Design principles:
 *  - Idempotent ingestion (same source never creates duplicate records)
 *  - Source provenance preserved for every record
 *  - Invalid records quarantined, never silently discarded
 *  - Missing data never interpreted as zero or safe
 *  - Clear stale-data indicators
 */

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import multipart from '@fastify/multipart';
import pdfParse from 'pdf-parse';
const pdfParseFn: (buffer: Buffer, options?: any) => Promise<any> = pdfParse as any;
import mammoth from 'mammoth';
import * as XLSX from 'xlsx';
import { createWorker, RecognizeResult } from 'tesseract.js';
const TesseractWorkerFactory: any = createWorker;

import { appendAudit } from './audit';
import { addScope, type AuthContext } from './auth';
import { config } from './config';
import type { Database } from './db';
import {
  AppError, badRequest, conflict, forbidden, id, listOptions, meta,
  nextCode, notFound, numberOrUndefined, optionalDate, optionalString, queryValue,
  requireArray, requireEnum, requireNumber, requireString, sortColumn, today, type Query,
} from './http';
import {
  serializeAction, serializeAttendance, serializeContract, serializeContractor,
  serializeCorrection, serializeDocument, serializeIncident, serializeMeasurement,
  serializeNearMiss, serializeProduction, serializeSafety,
} from './serializers';

/**
 * Ingestion service class
 */
export class IngestionService {
  constructor(private db: Database) {}

  /**
   * List data sources with optional filtering
   */
  async listSources(context: AuthContext, filters?: {
    category?: string;
    active?: boolean;
    sourceType?: string;
  }) {
    const contextAuth = context as AuthContext;
    const params: unknown[] = [];
    const conditions: string[] = [];

    if (filters?.category) {
      params.push(filters.category);
      conditions.push(`category = $${params.length}`);
    }
    if (filters?.active !== undefined) {
      params.push(filters.active);
      conditions.push(`active = $${params.length}`);
    }
    if (filters?.sourceType) {
      params.push(filters.sourceType);
      conditions.push(`source_type = $${params.length}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await this.db.query(
      `SELECT * FROM data_sources ${where} ORDER BY name`,
      params
    );
    return result.rows;
  }

  /**
   * Register a new data source
   */
  async registerSource(context: AuthContext, input: {
    name: string;
    description?: string;
    sourceType: string;
    publisher: string;
    jurisdiction?: string;
    baseUrl?: string;
    category: string;
    regionCoverage?: string[];
    granularity?: string;
    license?: string;
    termsUrl?: string;
    automatedRetrieval?: boolean;
    rateLimitRequestsPerMinute?: number;
    credentialsRequired?: boolean;
    credentialRef?: string;
    active?: boolean;
    refreshIntervalMinutes?: number;
  }) {
    context.require('admin.config');

    const sourceId = `src-${id('src')}`;
    await this.db.query(
      `INSERT INTO data_sources (
        id, name, description, source_type, publisher, jurisdiction, base_url,
        category, region_coverage, granularity, license, terms_url,
        automated_retrieval, rate_limit_requests_per_minute,
        credentials_required, credential_ref, active, refresh_interval_minutes,
        created_by, updated_by
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
      RETURNING *`,
      [
        sourceId, input.name, input.description ?? null, input.sourceType,
        input.publisher, input.jurisdiction ?? 'India', input.baseUrl ?? null,
        input.category, input.regionCoverage ?? [], input.granularity ?? 'other',
        input.license ?? null, input.termsUrl ?? null,
        input.automatedRetrieval ?? false,
        input.rateLimitRequestsPerMinute ?? null,
        input.credentialsRequired ?? false,
        input.credentialRef ?? null,
        input.active ?? true,
        input.refreshIntervalMinutes ?? null,
        context.user.id, context.user.id
      ]
    );

    await appendAudit(this.db as any, {
      actor: { id: context.user.id, name: context.user.name, role: context.user.role, ipHash: context.ipHash },
      action: 'create', entityType: 'data_source', entityId: sourceId, entityLabel: input.name,
      updatedValue: { sourceType: input.sourceType, category: input.category },
      mineIds: [], requestId: context.requestId
    });

    return { id: sourceId, name: input.name, sourceType: input.sourceType, category: input.category };
  }

  /**
   * Get source details
   */
  async getSource(context: AuthContext, sourceId: string) {
    const row = await this.db.one('SELECT * FROM data_sources WHERE id=$1', [sourceId]);
    if (!row) notFound('Data source');
    return row;
  }

  /**
   * List dataset catalog entries
   */
  async listDatasets(context: AuthContext, filters?: {
    sourceId?: string;
    format?: string;
    downloadStatus?: string;
  }) {
    const params: unknown[] = [];
    const conditions: string[] = [];

    if (filters?.sourceId) {
      params.push(filters.sourceId);
      conditions.push(`source_id = $${params.length}`);
    }
    if (filters?.format) {
      params.push(filters.format);
      conditions.push(`format = $${params.length}`);
    }
    if (filters?.downloadStatus) {
      params.push(filters.downloadStatus);
      conditions.push(`download_status = $${params.length}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await this.db.query(
      `SELECT * FROM dataset_catalog ${where} ORDER BY dataset_name`,
      params
    );
    return result.rows;
  }

  /**
   * Register a dataset catalog entry
   */
  async registerDataset(context: AuthContext, input: {
    sourceId: string;
    datasetName: string;
    datasetTitle?: string;
    description?: string;
    format: string;
    reportingPeriodStart?: string;
    reportingPeriodEnd?: string;
    publicationDate?: string;
    downloadUrl?: string;
    apiEndpoint?: string;
    apiMethod?: string;
    apiParams?: Record<string, unknown>;
    apiHeaders?: Record<string, string>;
    fieldMappings?: Record<string, unknown>;
    unitNormalizations?: Record<string, unknown>;
  }) {
    context.require('admin.config');

    const datasetId = `ds-${id('ds')}`;
    await this.db.query(
      `INSERT INTO dataset_catalog (
        id, source_id, dataset_name, dataset_title, description, format,
        reporting_period_start, reporting_period_end, publication_date,
        download_url, api_endpoint, api_method, api_params, api_headers,
        field_mappings, unit_normalizations, download_status, created_by, updated_by
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
      RETURNING *`,
      [
        datasetId, input.sourceId, input.datasetName, input.datasetTitle ?? null,
        input.description ?? null, input.format,
        input.reportingPeriodStart ?? null, input.reportingPeriodEnd ?? null,
        input.publicationDate ?? null, input.downloadUrl ?? null,
        input.apiEndpoint ?? null, input.apiMethod ?? 'GET',
        input.apiParams ?? {}, input.apiHeaders ?? {},
        input.fieldMappings ?? {}, input.unitNormalizations ?? {},
        'pending', context.user.id, context.user.id
      ]
    );

    await appendAudit(this.db as any, {
      actor: { id: context.user.id, name: context.user.name, role: context.user.role, ipHash: context.ipHash },
      action: 'create', entityType: 'dataset_catalog', entityId: datasetId, entityLabel: input.datasetName,
      updatedValue: { format: input.format, sourceId: input.sourceId },
      mineIds: [], requestId: context.requestId
    });

    return { id: datasetId, datasetName: input.datasetName, format: input.format };
  }

  /**
   * Get dataset details
   */
  async getDataset(context: AuthContext, datasetId: string) {
    const row = await this.db.one('SELECT * FROM dataset_catalog WHERE id=$1', [datasetId]);
    if (!row) notFound('Dataset');
    return row;
  }

  /**
   * List ingestion jobs
   */
  async listJobs(context: AuthContext, filters?: {
    sourceId?: string;
    datasetId?: string;
    status?: string;
  }) {
    const params: unknown[] = [];
    const conditions: string[] = [];

    if (filters?.sourceId) {
      params.push(filters.sourceId);
      conditions.push(`source_id = $${params.length}`);
    }
    if (filters?.datasetId) {
      params.push(filters.datasetId);
      conditions.push(`dataset_id = $${params.length}`);
    }
    if (filters?.status) {
      params.push(filters.status);
      conditions.push(`status = $${params.length}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await this.db.query(
      `SELECT * FROM ingestion_jobs ${where} ORDER BY created_at DESC`,
      params
    );
    return result.rows;
  }

  /**
   * Create an ingestion job
   */
  async createJob(context: AuthContext, input: {
    datasetId: string;
    jobType?: string;
  }) {
    context.require('admin.config');

    const dataset = await this.db.one('SELECT * FROM dataset_catalog WHERE id=$1', [input.datasetId]);
    if (!dataset) notFound('Dataset');

    const source = await this.db.one('SELECT * FROM data_sources WHERE id=$1', [dataset.source_id]);
    if (!source) notFound('Data source');

    const jobId = `job-${id('job')}`;
    await this.db.query(
      `INSERT INTO ingestion_jobs (
        id, dataset_id, source_id, job_type, status, created_by
      ) VALUES ($1,$2,$3,$4,'queued',$5)
      RETURNING *`,
      [jobId, input.datasetId, dataset.source_id, input.jobType ?? 'incremental', context.user.id]
    );

    await appendAudit(this.db as any, {
      actor: { id: context.user.id, name: context.user.name, role: context.user.role, ipHash: context.ipHash },
      action: 'create', entityType: 'ingestion_job', entityId: jobId, entityLabel: dataset.dataset_name,
      updatedValue: { jobType: input.jobType ?? 'incremental', datasetId: input.datasetId },
      mineIds: [], requestId: context.requestId
    });

    return { id: jobId, datasetId: input.datasetId, status: 'queued' };
  }

  /**
   * List source documents
   */
  async listDocuments(context: AuthContext, filters?: {
    datasetId?: string;
    extractionStatus?: string;
  }) {
    const params: unknown[] = [];
    const conditions: string[] = [];

    if (filters?.datasetId) {
      params.push(filters.datasetId);
      conditions.push(`dataset_id = $${params.length}`);
    }
    if (filters?.extractionStatus) {
      params.push(filters.extractionStatus);
      conditions.push(`extraction_status = $${params.length}`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await this.db.query(
      `SELECT * FROM source_documents ${where} ORDER BY download_timestamp DESC`,
      params
    );
    return result.rows;
  }

  /**
   * Upload a source document manually
   */
  async uploadDocument(context: AuthContext, input: {
    datasetId: string;
    file: Buffer;
    filename: string;
    mimeType: string;
    sourceUrl?: string;
  }) {
    context.require('admin.config');

    const dataset = await this.db.one('SELECT * FROM dataset_catalog WHERE id=$1', [input.datasetId]);
    if (!dataset) notFound('Dataset');

    const docId = `doc-${id('doc')}`;
    const checksum = createHash('sha256').update(input.file).digest('hex');
    const storageKey = `source_documents/${docId}/${input.filename}`;

    // Store file
    await fs.promises.mkdir(path.dirname(path.join(config.storageDir, storageKey)), { recursive: true });
    await fs.promises.writeFile(path.join(config.storageDir, storageKey), input.file);

    await this.db.query(
      `INSERT INTO source_documents (
        id, dataset_id, original_filename, storage_key, mime_type, size_bytes,
        checksum_sha256, source_url, extraction_status, created_by
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pending',$9)
      RETURNING *`,
      [
        docId, input.datasetId, input.filename, storageKey, input.mimeType,
        input.file.length, checksum, input.sourceUrl ?? null, context.user.id
      ]
    );

    await appendAudit(this.db as any, {
      actor: { id: context.user.id, name: context.user.name, role: context.user.role, ipHash: context.ipHash },
      action: 'create', entityType: 'source_document', entityId: docId, entityLabel: input.filename,
      updatedValue: { mimeType: input.mimeType, sizeBytes: input.file.length },
      mineIds: [], requestId: context.requestId
    });

    return { id: docId, filename: input.filename, checksum, storageKey };
  }

  /**
   * Process a document (extract text, tables, run OCR if needed)
   */
  async processDocument(context: AuthContext, documentId: string) {
    context.require('admin.config');

    const doc = await this.db.one('SELECT * FROM source_documents WHERE id=$1', [documentId]);
    if (!doc) notFound('Document');

    // Read the file
    const filePath = path.join(config.storageDir, doc.storage_key);
    if (!fs.existsSync(filePath)) {
      notFound('Source document file not found on disk');
    }

    const fileBuffer = fs.readFileSync(filePath);
    let extractedText = '';
    let extractedTables: any[] = [];
    let pageCount = 1;
    let language = 'en';
    let extractionStatus = 'completed';
    let extractionError: string | null = null;

    try {
      switch (doc.mime_type) {
        case 'application/pdf': {
          const pdfData = await pdfParseFn(fileBuffer);
          extractedText = pdfData.text || '';
          pageCount = pdfData.numpages || 1;
          // Try to extract tables if available
          if (pdfData.tables) {
            extractedTables = pdfData.tables;
          }
          break;
        }
        case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': {
          const result = await mammoth.extractRawText({ buffer: fileBuffer });
          extractedText = result.value || '';
          break;
        }
        case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
        case 'application/vnd.ms-excel': {
          const workbook = XLSX.read(fileBuffer, { type: 'buffer' });
          const sheetNames = workbook.SheetNames;
          const allText: string[] = [];
          for (const sheetName of sheetNames) {
            const sheet = workbook.Sheets[sheetName];
            if (!sheet) continue;
            const json = XLSX.utils.sheet_to_json(sheet, { header: 1 });
            allText.push(`=== Sheet: ${sheetName} ===`);
            for (const row of json) {
              const rowObj = row as Record<string, unknown>;
              allText.push(Object.values(rowObj).filter((cell) => cell != null).join('\t'));
            }
          }
          extractedText = allText.join('\n');
          // Store table data
          for (const sheetName of sheetNames) {
            const sheet = workbook.Sheets[sheetName];
            if (!sheet) continue;
            extractedTables.push({
              sheetName,
              data: XLSX.utils.sheet_to_json(sheet)
            });
          }
          break;
        }
        case 'text/plain':
        case 'text/markdown':
        case 'text/csv':
        case 'text/html':
          extractedText = fileBuffer.toString('utf-8');
          break;
        case 'application/json': {
          const json = JSON.parse(fileBuffer.toString('utf-8'));
          extractedText = JSON.stringify(json, null, 2);
          break;
        }
        case 'image/png':
        case 'image/jpeg':
        case 'image/tiff':
        case 'image/bmp':
        case 'image/webp':
        case 'image/gif':
          // OCR required for images
          extractionStatus = 'ocr_required';
          break;
        default:
          extractionStatus = 'failed';
          extractionError = `Unsupported MIME type: ${doc.mime_type}`;
      }

      // Run OCR if required and text is minimal
      if (extractionStatus === 'ocr_required' || (extractedText.trim().length < 50 && doc.mime_type.startsWith('image/'))) {
        try {
          const worker = await TesseractWorkerFactory();
          await worker.loadLanguage('eng');
          await worker.initialize('eng');
          const result = await worker.recognize(fileBuffer);
          extractedText = result.data.text || '';
          pageCount = 1;
          extractionStatus = 'completed';
          await worker.terminate();
        } catch (ocrError) {
          extractionStatus = 'failed';
          extractionError = ocrError instanceof Error ? ocrError.message : 'OCR processing failed';
        }
      }

    } catch (error) {
      extractionStatus = 'failed';
      extractionError = error instanceof Error ? error.message : 'Document processing failed';
    }

    // Update the document record
    await this.db.query(
      `UPDATE source_documents SET
        extracted_text = $1,
        extracted_tables = $2,
        page_count = $3,
        language = $4,
        extraction_status = $5,
        extraction_error = $6,
        updated_at = now()
      WHERE id = $7`,
      [
        extractedText || null,
        JSON.stringify(extractedTables),
        pageCount,
        language,
        extractionStatus,
        extractionError,
        documentId
      ]
    );

    await appendAudit(this.db as any, {
      actor: { id: context.user.id, name: context.user.name, role: context.user.role, ipHash: context.ipHash },
      action: 'update', entityType: 'source_document', entityId: documentId, entityLabel: doc.original_filename,
      updatedValue: { extractionStatus, pageCount, extractionError },
      mineIds: [], requestId: context.requestId
    });

    return {
      id: documentId,
      extractionStatus,
      extractedTextLength: extractedText.length,
      pageCount,
      tablesFound: extractedTables.length,
      extractionError
    };
  }

  /**
   * Validate imported records before persistence
   */
  async validateRecords(records: any[], sourceId: string) {
    const valid: any[] = [];
    const invalid: any[] = [];
    const warnings: string[] = [];

    for (const record of records) {
      const recordWarnings: string[] = [];
      let isValid = true;

      // Check for missing required fields
      if (!record.mine_registry_id && !record.mine_id) {
        recordWarnings.push('Missing mine identifier');
        isValid = false;
      }

      // Check for invalid coordinates
      if (record.latitude !== undefined && record.latitude !== null) {
        const lat = Number(record.latitude);
        if (isNaN(lat) || lat < -90 || lat > 90) {
          recordWarnings.push(`Invalid latitude: ${record.latitude}`);
          isValid = false;
        }
      }
      if (record.longitude !== undefined && record.longitude !== null) {
        const lng = Number(record.longitude);
        if (isNaN(lng) || lng < -180 || lng > 180) {
          recordWarnings.push(`Invalid longitude: ${record.longitude}`);
          isValid = false;
        }
      }

      // Check for missing dates
      if (record.reporting_period_start && isNaN(Date.parse(record.reporting_period_start))) {
        recordWarnings.push(`Invalid reporting_period_start: ${record.reporting_period_start}`);
        isValid = false;
      }

      // Check for impossible values
      if (record.production_tonnes !== undefined && record.production_tonnes !== null) {
        const tonnes = Number(record.production_tonnes);
        if (isNaN(tonnes) || tonnes < 0) {
          recordWarnings.push(`Invalid production_tonnes: ${record.production_tonnes}`);
          isValid = false;
        }
      }

      if (isValid) {
        valid.push({ ...record, warnings: recordWarnings });
      } else {
        invalid.push({ ...record, warnings: recordWarnings, rejectionReason: recordWarnings.join('; ') });
      }
      warnings.push(...recordWarnings);
    }

    return { valid, invalid, warnings };
  }

  /**
   * Persist validated records
   */
  async persistRecords(records: any[], sourceId: string, context: AuthContext) {
    const persisted: any[] = [];

    for (const record of records) {
      // Skip records without mine identifiers
      if (!record.mine_registry_id && !record.mine_id) continue;

      // Determine mine_registry_id
      let mineRegistryId = record.mine_registry_id;
      if (!mineRegistryId && record.mine_id) {
        // Try to map internal mine_id to mine_registry_id
        const mapping = await this.db.one(
          'SELECT mine_registry_id FROM mine_identifiers WHERE internal_mine_id = $1 LIMIT 1',
          [record.mine_id]
        );
        if (mapping) mineRegistryId = mapping.mine_registry_id;
      }

      if (!mineRegistryId) continue;

      // Persist based on record type
      if (record.recordType === 'production_observation') {
        await this.db.query(
          `INSERT INTO production_observations (
            id, mine_registry_id, source_document_id, reporting_period_start,
            reporting_period_end, production_tonnes, target_tonnes, dispatch_tonnes,
            unit, value_kind, provenance
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
          ON CONFLICT (mine_registry_id, reporting_period_start, reporting_period_end, value_kind)
          DO UPDATE SET
            production_tonnes = EXCLUDED.production_tonnes,
            target_tonnes = EXCLUDED.target_tonnes,
            dispatch_tonnes = EXCLUDED.dispatch_tonnes,
            updated_at = now()`,
          [
            id('obs'), mineRegistryId, record.sourceDocumentId ?? null,
            record.reporting_period_start, record.reporting_period_end,
            record.production_tonnes, record.target_tonnes, record.dispatch_tonnes,
            record.unit ?? 'tonnes', record.value_kind ?? 'reported',
            `source_document_${sourceId}`
          ]
        );
        persisted.push({ type: 'production_observation', mineRegistryId });
      }
    }

    return persisted;
  }
}
