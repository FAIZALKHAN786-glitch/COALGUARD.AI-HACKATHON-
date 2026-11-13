/**
 * CoalGuard.AI — Data Ingestion Routes
 *
 * REST API for managing official Indian coal-sector data sources,
 * dataset catalogs, ingestion jobs, and source documents.
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import multipart from '@fastify/multipart';

import { appendAudit } from '../audit';
import { addScope, type AuthContext } from '../auth';
import { config } from '../config';
import type { Database } from '../db';
import { IngestionService } from '../ingestion';
import {
  AppError, badRequest, forbidden, id, listOptions, meta,
  notFound, optionalDate, optionalString, queryValue, requireArray,
  requireEnum, requireNumber, requireString, sortColumn, type Query,
} from '../http';

function auth(req: FastifyRequest): AuthContext {
  return (req as any).auth as AuthContext;
}

export async function registerIngestionRoutes(app: FastifyInstance, db: Database): Promise<void> {
  await app.register(multipart, {
    limits: { fields: 10, files: 1, fieldNameSize: 100, fieldSize: config.documentMaxBytes },
  });

  const ingestion = new IngestionService(db);

  /* --------------------------------------------------------------- data sources */

  app.get('/api/v1/data-sources', async (req) => {
    const context = auth(req);
    context.require('admin.config');
    const filters: { category?: string; active?: boolean; sourceType?: string } = {};
    const category = queryValue(req.query as Query, 'category');
    if (category) filters.category = category;
    const active = queryValue(req.query as Query, 'active');
    if (active) filters.active = active === 'true';
    const sourceType = queryValue(req.query as Query, 'sourceType');
    if (sourceType) filters.sourceType = sourceType;
    return ingestion.listSources(context, filters);
  });

  app.post('/api/v1/data-sources', async (req) => {
    const context = auth(req);
    context.require('admin.config');
    const body = req.body as Record<string, unknown>;
    const source = await ingestion.registerSource(context, {
      name: requireString(body.name, 'name', 200),
      description: optionalString(body.description, 'description', 1000),
      sourceType: requireEnum(body.sourceType, ['government_api','downloadable_dataset','machine_readable_report','pdf_document','official_website','other'] as const, 'sourceType'),
      publisher: requireString(body.publisher, 'publisher', 200),
      jurisdiction: optionalString(body.jurisdiction, 'jurisdiction', 100),
      baseUrl: optionalString(body.baseUrl, 'baseUrl', 500),
      category: requireEnum(body.category, ['mine_identification','production','safety_compliance','environmental','workforce_contractor','statutory_regulatory','other'] as const, 'category'),
      regionCoverage: Array.isArray(body.regionCoverage) ? requireArray(body.regionCoverage, 'regionCoverage') : [],
      granularity: optionalString(body.granularity, 'granularity', 50),
      license: optionalString(body.license, 'license', 200),
      termsUrl: optionalString(body.termsUrl, 'termsUrl', 500),
      automatedRetrieval: body.automatedRetrieval === true,
      rateLimitRequestsPerMinute: body.rateLimitRequestsPerMinute !== undefined ? requireNumber(body.rateLimitRequestsPerMinute, 'rateLimitRequestsPerMinute', 1) : undefined,
      credentialsRequired: body.credentialsRequired === true,
      credentialRef: optionalString(body.credentialRef, 'credentialRef', 200),
      active: body.active !== false,
      refreshIntervalMinutes: body.refreshIntervalMinutes !== undefined ? requireNumber(body.refreshIntervalMinutes, 'refreshIntervalMinutes', 1) : undefined,
    });
    return source;
  });

  app.get('/api/v1/data-sources/:id', async (req) => {
    const context = auth(req);
    context.require('admin.config');
    const sourceId = (req.params as { id: string }).id;
    return ingestion.getSource(context, sourceId);
  });

  /* --------------------------------------------------------------- dataset catalog */

  app.get('/api/v1/datasets', async (req) => {
    const context = auth(req);
    context.require('admin.config');
    const filters: { sourceId?: string; format?: string; downloadStatus?: string } = {};
    const sourceId = queryValue(req.query as Query, 'sourceId');
    if (sourceId) filters.sourceId = sourceId;
    const format = queryValue(req.query as Query, 'format');
    if (format) filters.format = format;
    const downloadStatus = queryValue(req.query as Query, 'downloadStatus');
    if (downloadStatus) filters.downloadStatus = downloadStatus;
    return ingestion.listDatasets(context, filters);
  });

  app.post('/api/v1/datasets', async (req) => {
    const context = auth(req);
    context.require('admin.config');
    const body = req.body as Record<string, unknown>;
    return ingestion.registerDataset(context, {
      sourceId: requireString(body.sourceId, 'sourceId', 80),
      datasetName: requireString(body.datasetName, 'datasetName', 200),
      datasetTitle: optionalString(body.datasetTitle, 'datasetTitle', 300),
      description: optionalString(body.description, 'description', 1000),
      format: requireEnum(body.format, ['rest_api','csv','excel','json','xml','html_table','text_pdf','scanned_pdf','other'] as const, 'format'),
      reportingPeriodStart: optionalDate(body.reportingPeriodStart, 'reportingPeriodStart'),
      reportingPeriodEnd: optionalDate(body.reportingPeriodEnd, 'reportingPeriodEnd'),
      publicationDate: optionalDate(body.publicationDate, 'publicationDate'),
      downloadUrl: optionalString(body.downloadUrl, 'downloadUrl', 500),
      apiEndpoint: optionalString(body.apiEndpoint, 'apiEndpoint', 500),
      apiMethod: optionalString(body.apiMethod, 'apiMethod', 20),
      apiParams: typeof body.apiParams === 'object' && body.apiParams !== null ? body.apiParams as Record<string, unknown> : undefined,
      apiHeaders: typeof body.apiHeaders === 'object' && body.apiHeaders !== null ? body.apiHeaders as Record<string, string> : undefined,
      fieldMappings: typeof body.fieldMappings === 'object' && body.fieldMappings !== null ? body.fieldMappings as Record<string, unknown> : undefined,
      unitNormalizations: typeof body.unitNormalizations === 'object' && body.unitNormalizations !== null ? body.unitNormalizations as Record<string, unknown> : undefined,
    });
  });

  app.get('/api/v1/datasets/:id', async (req) => {
    const context = auth(req);
    context.require('admin.config');
    const datasetId = (req.params as { id: string }).id;
    return ingestion.getDataset(context, datasetId);
  });

  /* --------------------------------------------------------------- ingestion jobs */

  app.get('/api/v1/ingestion-jobs', async (req) => {
    const context = auth(req);
    context.require('admin.config');
    const filters: { sourceId?: string; datasetId?: string; status?: string } = {};
    const sourceId = queryValue(req.query as Query, 'sourceId');
    if (sourceId) filters.sourceId = sourceId;
    const datasetId = queryValue(req.query as Query, 'datasetId');
    if (datasetId) filters.datasetId = datasetId;
    const status = queryValue(req.query as Query, 'status');
    if (status) filters.status = status;
    return ingestion.listJobs(context, filters);
  });

  app.post('/api/v1/ingestion-jobs', async (req) => {
    const context = auth(req);
    context.require('admin.config');
    const body = req.body as Record<string, unknown>;
    return ingestion.createJob(context, {
      datasetId: requireString(body.datasetId, 'datasetId', 80),
      jobType: optionalString(body.jobType, 'jobType', 50),
    });
  });

  /* --------------------------------------------------------------- source documents */

  app.get('/api/v1/source-documents', async (req) => {
    const context = auth(req);
    context.require('admin.config');
    const filters: { datasetId?: string; extractionStatus?: string } = {};
    const datasetId = queryValue(req.query as Query, 'datasetId');
    if (datasetId) filters.datasetId = datasetId;
    const extractionStatus = queryValue(req.query as Query, 'extractionStatus');
    if (extractionStatus) filters.extractionStatus = extractionStatus;
    return ingestion.listDocuments(context, filters);
  });

  app.post('/api/v1/source-documents/upload', async (req) => {
    const context = auth(req);
    context.require('admin.config');

    const parts = await req.file();
    if (!parts) badRequest('No file part in the request.');
    const { file, fields } = parts;

    const fieldMap: Record<string, string> = {};
    const fieldsObj = (fields as unknown) as Record<string, string | string[]> | undefined;
    if (fieldsObj) {
      for (const [key, value] of Object.entries(fieldsObj)) {
        fieldMap[key] = Array.isArray(value) ? value.join(', ') : String(value);
      }
    }

    const datasetId = requireString(fieldMap.datasetId, 'datasetId', 80);
    const chunks: Buffer[] = [];
    const fileStream: any = file;
    for await (const chunk of fileStream) chunks.push(Buffer.from(chunk));
    const buffer = Buffer.concat(chunks);

    if (buffer.length === 0) badRequest('The uploaded file is empty.');
    if (buffer.length > config.documentMaxBytes) {
      badRequest(`File exceeds the ${config.documentMaxBytes} byte limit.`);
    }

    return ingestion.uploadDocument(context, {
      datasetId,
      file: buffer,
      filename: fileStream.filename,
      mimeType: fileStream.mimetype,
      sourceUrl: fieldMap.sourceUrl,
    });
  });

  app.post('/api/v1/source-documents/:id/process', async (req) => {
    const context = auth(req);
    context.require('admin.config');
    const documentId = (req.params as { id: string }).id;
    return ingestion.processDocument(context, documentId);
  });

  /* --------------------------------------------------------------- validation */

  app.post('/api/v1/ingestion/validate', async (req) => {
    const context = auth(req);
    context.require('admin.config');
    const body = req.body as Record<string, unknown>;
    const records = Array.isArray(body.records) ? body.records : [];
    const sourceId = requireString(body.sourceId, 'sourceId', 80);
    return ingestion.validateRecords(records, sourceId);
  });

  app.post('/api/v1/ingestion/persist', async (req) => {
    const context = auth(req);
    context.require('admin.config');
    const body = req.body as Record<string, unknown>;
    const records = Array.isArray(body.records) ? body.records : [];
    const sourceId = requireString(body.sourceId, 'sourceId', 80);
    return ingestion.persistRecords(records, sourceId, context);
  });

  /* --------------------------------------------------------------- mine registry */

  app.get('/api/v1/mine-registry', async (req) => {
    const context = auth(req);
    context.require('mine.view');
    const params: unknown[] = [];
    const conditions: string[] = [];
    const state = queryValue(req.query as Query, 'state');
    if (state) { params.push(state); conditions.push(`state = $${params.length}`); }
    const verificationStatus = queryValue(req.query as Query, 'verificationStatus');
    if (verificationStatus) { params.push(verificationStatus); conditions.push(`verification_status = $${params.length}`); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await db.query(
      `SELECT * FROM mine_registry ${where} ORDER BY mine_name LIMIT 100`,
      params
    );
    return result.rows;
  });

  app.get('/api/v1/mine-identifiers', async (req) => {
    const context = auth(req);
    context.require('mine.view');
    const mineId = queryValue(req.query as Query, 'mineId');
    const params: unknown[] = [];
    const conditions: string[] = [];
    if (mineId) { params.push(mineId); conditions.push(`internal_mine_id = $${params.length}`); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await db.query(
      `SELECT * FROM mine_identifiers ${where} ORDER BY source_system`,
      params
    );
    return result.rows;
  });
}
