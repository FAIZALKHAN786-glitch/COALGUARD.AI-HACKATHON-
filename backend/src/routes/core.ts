import type { FastifyInstance, FastifyRequest } from 'fastify';

import { appendAudit } from '../audit';
import { addScope, type AuthContext } from '../auth';
import type { Database } from '../db';
import { hasSubmissionBlockers, inspectionSubmissionIssues, detectInspectionAnomalies } from './assurance';
import {
  AppError, badRequest, compact, conflict, dateOnly, forbidden, id, listOptions, meta,
  nextCode, notFound, numberOrUndefined, optionalDate, optionalString, queryArray, queryValue,
  requireArray, requireEnum, requireString, sortColumn, today, type Query,
} from '../http';
import {
  serializeCompliance, serializeFinding, serializeInspection, serializeMine,
  serializeReview, serializeSubsidiary, serializeUser,
} from '../serializers';

const COMPLIANCE_STATUSES = ['draft','pending_submission','submitted','under_review','compliant','non_compliant','overdue','awaiting_verification'] as const;
const PRIORITIES = ['low','medium','high','critical'] as const;
const CATEGORIES = ['mine_safety','environment','production','labour','contractor','other'] as const;
const INSPECTION_TYPES = ['statutory_safety','environment','production','labour','contractor','ad_hoc'] as const;
const INSPECTION_STATUSES = ['scheduled','in_progress','submitted','under_review','completed','cancelled'] as const;

const COMPLIANCE_TRANSITIONS: Record<string, string[]> = {
  draft: ['pending_submission'],
  pending_submission: ['submitted', 'draft'],
  submitted: ['under_review', 'pending_submission'],
  under_review: ['compliant', 'non_compliant', 'awaiting_verification'],
  compliant: ['under_review'],
  non_compliant: ['under_review'],
  overdue: ['under_review', 'pending_submission'],
  awaiting_verification: ['compliant', 'non_compliant'],
};
const INSPECTION_TRANSITIONS: Record<string, string[]> = {
  scheduled: ['in_progress', 'cancelled'],
  in_progress: ['submitted', 'cancelled'],
  submitted: ['under_review'],
  under_review: ['completed', 'in_progress'],
  completed: [],
  cancelled: [],
};

function auth(req: FastifyRequest): AuthContext {
  return (req as any).auth as AuthContext;
}

function actor(context: AuthContext) {
  return { id: context.user.id, name: context.user.name, role: context.user.role, ipHash: context.ipHash };
}

async function mineSubsidiary(db: Database, mineId: string): Promise<{ id: string; subsidiary_id: string }> {
  const row = await db.one<{ id: string; subsidiary_id: string }>('SELECT id, subsidiary_id FROM mines WHERE id=$1', [mineId]);
  if (!row) notFound('Mine');
  return row;
}

function ensureMine(authContext: AuthContext, mineId: string, subsidiaryId?: string): void {
  if (!authContext.canAccessMine(mineId, subsidiaryId)) forbidden('That mine is outside your assigned scope.');
}

async function validateMineAccess(db: Database, authContext: AuthContext, mineId: string): Promise<void> {
  const mine = await mineSubsidiary(db, mineId);
  ensureMine(authContext, mine.id, mine.subsidiary_id);
}

export async function registerCoreRoutes(app: FastifyInstance, db: Database): Promise<void> {
  /* ------------------------------------------------------------------ mines */
  app.get('/api/v1/subsidiaries', async (req) => {
    const context = auth(req);
    context.require('subsidiary.view');
    // Scope subsidiaries to user's assigned subsidiaries or all if org-wide
    const user = context.user as any;
    if (user.orgWide) {
      const result = await db.query('SELECT * FROM subsidiaries ORDER BY name');
      return result.rows.map(serializeSubsidiary);
    }
    if (user.subsidiaryIds && user.subsidiaryIds.length > 0) {
      const result = await db.query('SELECT * FROM subsidiaries WHERE id = ANY($1) ORDER BY name', [user.subsidiaryIds]);
      return result.rows.map(serializeSubsidiary);
    }
    if (user.effectiveMineIds && user.effectiveMineIds.length > 0) {
      const result = await db.query('SELECT DISTINCT s.* FROM subsidiaries s JOIN mines m ON m.subsidiary_id = s.id WHERE m.id = ANY($1) ORDER BY s.name', [user.effectiveMineIds]);
      return result.rows.map(serializeSubsidiary);
    }
    return [];
  });

  app.get('/api/v1/users', async (req) => {
    const context = auth(req);
    context.require('admin.users');
    const options = listOptions(req.query as Query, 'name');
    const params: unknown[] = [];
    const conditions: string[] = [];
    const search = options.search ? `%${options.search}%` : null;
    if (search) {
      params.push(search);
      conditions.push(`(u.name ILIKE $${params.length} OR u.email ILIKE $${params.length} OR u.title ILIKE $${params.length})`);
    }
    const role = queryValue(req.query as Query, 'role');
    if (role) { params.push(role); conditions.push(`u.role = $${params.length}`); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const totalResult = await db.query(`SELECT count(*)::int AS total FROM users u ${where}`, params);
    const dataParams = [...params, options.pageSize, options.offset];
    const result = await db.query(
      `SELECT u.*, COALESCE(array_agg(DISTINCT ms.mine_id) FILTER (WHERE ms.mine_id IS NOT NULL), '{}') AS mine_ids,
              COALESCE(array_agg(DISTINCT ss.subsidiary_id) FILTER (WHERE ss.subsidiary_id IS NOT NULL), '{}') AS subsidiary_ids,
              COALESCE(array_agg(DISTINCT m.name) FILTER (WHERE m.name IS NOT NULL), '{}') AS mine_names
       FROM users u
       LEFT JOIN user_mine_scopes ms ON ms.user_id=u.id
       LEFT JOIN user_subsidiary_scopes ss ON ss.user_id=u.id
       LEFT JOIN mines m ON m.id=ms.mine_id
       ${where}
       GROUP BY u.id
       ORDER BY u.name
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      dataParams,
    );
    return { items: result.rows.map(serializeUser), meta: meta(totalResult.rows[0]?.total ?? 0, options) };
  });

  app.get('/api/v1/mines', async (req) => {
    const context = auth(req);
    context.require('mine.view');
    const options = listOptions(req.query as Query, 'name');
    const params: unknown[] = [];
    const conditions: string[] = [addScope(context, params, 'm.id', 'm.subsidiary_id')];
    const search = options.search ? `%${options.search}%` : null;
    if (search) {
      params.push(search);
      conditions.push(`(m.name ILIKE $${params.length} OR m.code ILIKE $${params.length} OR m.district ILIKE $${params.length})`);
    }
    const subsidiaryId = queryValue(req.query as Query, 'subsidiaryId');
    if (subsidiaryId) { params.push(subsidiaryId); conditions.push(`m.subsidiary_id = $${params.length}`); }
    const region = queryValue(req.query as Query, 'region');
    if (region) { params.push(region); conditions.push(`m.region = $${params.length}`); }
    const status = queryValue(req.query as Query, 'operationalStatus');
    if (status) { params.push(status); conditions.push(`m.operational_status = $${params.length}`); }
    const where = `WHERE ${conditions.join(' AND ')}`;
    const total = await db.one<{ total: number }>(`SELECT count(*)::int AS total FROM mines m ${where}`, params);
    const dataParams = [...params, options.pageSize, options.offset];
    const result = await db.query(
      `SELECT m.*, s.name AS subsidiary_name FROM mines m JOIN subsidiaries s ON s.id=m.subsidiary_id
       ${where} ORDER BY ${sortColumn(options.sortBy, { name: 'm.name', code: 'm.code', region: 'm.region', updatedAt: 'm.updated_at', operationalStatus: 'm.operational_status' }, 'm.name')} ${options.sortDir}
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      dataParams,
    );
    return { items: result.rows.map(serializeMine), meta: meta(total?.total ?? 0, options) };
  });

  app.get('/api/v1/mines/:id', async (req) => {
    const context = auth(req);
    context.require('mine.view');
    const { id: mineId } = req.params as { id: string };
    const row = await db.one(
      `SELECT m.*, s.name AS subsidiary_name FROM mines m JOIN subsidiaries s ON s.id=m.subsidiary_id WHERE m.id=$1`,
      [mineId],
    );
    if (!row) notFound('Mine');
    ensureMine(context, row.id, row.subsidiary_id);
    return serializeMine(row);
  });

  app.post('/api/v1/mines', async (req) => {
    const context = auth(req);
    context.require('mine.create');
    const body = req.body as Record<string, unknown>;
    const subsidiaryId = requireString(body.subsidiaryId, 'subsidiaryId', 80);
    const subsidiary = await db.one<{ id: string }>('SELECT id FROM subsidiaries WHERE id=$1', [subsidiaryId]);
    if (!subsidiary) badRequest('subsidiaryId does not exist.', { subsidiaryId: ['Unknown subsidiary'] });
    const code = requireString(body.code, 'code', 40).toUpperCase();
    const name = requireString(body.name, 'name', 160);
    const region = requireString(body.region, 'region', 120);
    const district = requireString(body.district, 'district', 120);
    const state = requireString(body.state, 'state', 120);
    const operationalStatus = requireEnum(body.operationalStatus, ['operational','partial','suspended','decommissioned'] as const, 'operationalStatus');
    const location = body.location as { lat?: unknown; lng?: unknown; source?: unknown; capturedAt?: unknown } | undefined;
    if (location && (location.lat === undefined || location.lng === undefined)) {
      badRequest('Both latitude and longitude are required when a location is supplied.');
    }
    const mineId = id('mine');
    const created = await db.transaction(async (client) => {
      const result = await client.query(
        `INSERT INTO mines (id,subsidiary_id,code,name,region,district,state,operational_status,approved_capacity_tpa,commissioned_on,
          mine_manager_id,safety_officer_id,compliance_officer_id,environmental_officer_id,contact_phone,note,
          latitude,longitude,geo_source,geo_accuracy_m,geo_captured_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21) RETURNING *`,
        [mineId, subsidiaryId, code, name, region, district, state, operationalStatus,
          body.approvedCapacityTPA === undefined ? null : requireNumberAsNumber(body.approvedCapacityTPA, 'approvedCapacityTPA'),
          optionalDate(body.commissionedOn, 'commissionedOn') ?? null,
          optionalString(body.mineManagerId, 'mineManagerId') ?? null,
          optionalString(body.safetyOfficerId, 'safetyOfficerId') ?? null,
          optionalString(body.complianceOfficerId, 'complianceOfficerId') ?? null,
          optionalString(body.environmentalOfficerId, 'environmentalOfficerId') ?? null,
          optionalString(body.contactPhone, 'contactPhone') ?? null,
          optionalString(body.note, 'note') ?? null,
          location ? Number(location.lat) : null,
          location ? Number(location.lng) : null,
          location?.source ?? null,
          location && 'accuracyM' in location ? Number((location as any).accuracyM) : null,
          location?.capturedAt ? new Date(String(location.capturedAt)) : null,
        ],
      );
      await appendAudit(client, { actor: actor(context), action: 'create', entityType: 'mine', entityId: mineId, entityLabel: name, updatedValue: result.rows[0], mineIds: [mineId], requestId: context.requestId });
      return result.rows[0];
    }).catch((error) => mapUnique(error, 'A mine with that code already exists.'));
    return serializeMine(created);
  });

  app.patch('/api/v1/mines/:id', async (req) => {
    const context = auth(req);
    context.require('mine.edit');
    const { id: mineId } = req.params as { id: string };
    const existing = await db.one('SELECT * FROM mines WHERE id=$1', [mineId]);
    if (!existing) notFound('Mine');
    ensureMine(context, existing.id, existing.subsidiary_id);
    const body = req.body as Record<string, unknown>;
    const allowed: Record<string, string> = {
      name: 'name', region: 'region', district: 'district', state: 'state',
      operationalStatus: 'operational_status', approvedCapacityTPA: 'approved_capacity_tpa',
      commissionedOn: 'commissioned_on', mineManagerId: 'mine_manager_id',
      safetyOfficerId: 'safety_officer_id', complianceOfficerId: 'compliance_officer_id',
      environmentalOfficerId: 'environmental_officer_id', contactPhone: 'contact_phone', note: 'note',
    };
    const updates: string[] = [];
    const params: unknown[] = [];
    for (const [field, column] of Object.entries(allowed)) {
      if (!(field in body)) continue;
      params.push(body[field] === null || body[field] === '' ? null : body[field]);
      updates.push(`${column} = $${params.length}`);
    }
    if (body.location && typeof body.location === 'object') {
      const location = body.location as Record<string, unknown>;
      if (location.lat === undefined || location.lng === undefined) badRequest('A location requires latitude and longitude.');
      for (const [column, value] of [['latitude', location.lat], ['longitude', location.lng], ['geo_source', location.source ?? null], ['geo_accuracy_m', location.accuracyM ?? null], ['geo_captured_at', location.capturedAt ?? null]]) {
        params.push(value); updates.push(`${column} = $${params.length}`);
      }
    }
    if (!updates.length) return serializeMine(existing);
    params.push(mineId);
    const updated = await db.transaction(async (client) => {
      const result = await client.query(`UPDATE mines SET ${updates.join(', ')}, updated_at=now() WHERE id=$${params.length} RETURNING *`, params);
      await appendAudit(client, { actor: actor(context), action: 'update', entityType: 'mine', entityId: mineId, entityLabel: result.rows[0].name, previousValue: existing, updatedValue: result.rows[0], mineIds: [mineId], requestId: context.requestId });
      return result.rows[0];
    }).catch((error) => mapUnique(error, 'That mine update conflicts with an existing record.'));
    return serializeMine(updated);
  });

  app.post('/api/v1/mines/:id/archive', async (req) => {
    const context = auth(req);
    context.require('mine.archive');
    const { id: mineId } = req.params as { id: string };
    const reason = requireString((req.body as Record<string, unknown>)?.reason, 'reason', 1000);
    const existing = await db.one('SELECT * FROM mines WHERE id=$1', [mineId]);
    if (!existing) notFound('Mine');
    const updated = await db.transaction(async (client) => {
      const result = await client.query(
        `UPDATE mines SET operational_status='decommissioned', archived_at=now(), archive_reason=$2, updated_at=now() WHERE id=$1 RETURNING *`,
        [mineId, reason],
      );
      await client.query(`UPDATE contractors SET compliance_status='unassessed', updated_at=now() WHERE id IN (SELECT contractor_id FROM contractor_mines WHERE mine_id=$1)`, [mineId]);
      await appendAudit(client, { actor: actor(context), action: 'archive', entityType: 'mine', entityId: mineId, entityLabel: existing.name, previousValue: existing, updatedValue: result.rows[0], reason, mineIds: [mineId], requestId: context.requestId });
      return result.rows[0];
    });
    return serializeMine(updated);
  });

  /* ------------------------------------------------------------- compliance */
  const complianceSelect = `SELECT c.*,
    COALESCE((SELECT array_agg(crm.mine_id) FROM compliance_requirement_mines crm WHERE crm.compliance_id=c.id), '{}') AS applicable_mine_ids,
    COALESCE((SELECT array_agg(ce.document_id) FROM compliance_evidence ce WHERE ce.compliance_id=c.id), '{}') AS evidence_document_ids,
    COALESCE((SELECT array_agg(cv.violation_id) FROM compliance_violations cv WHERE cv.compliance_id=c.id), '{}') AS linked_violation_ids,
    COALESCE((SELECT array_agg(cca.corrective_action_id) FROM compliance_corrective_actions cca WHERE cca.compliance_id=c.id), '{}') AS linked_corrective_action_ids,
    (SELECT string_agg(DISTINCT m.name, ', ') FROM compliance_requirement_mines crm JOIN mines m ON m.id=crm.mine_id WHERE crm.compliance_id=c.id) AS mine_name,
    (SELECT string_agg(DISTINCT s.name, ', ') FROM compliance_requirement_mines crm JOIN mines m ON m.id=crm.mine_id JOIN subsidiaries s ON s.id=m.subsidiary_id WHERE crm.compliance_id=c.id) AS subsidiary_name,
    (c.due_date < CURRENT_DATE AND c.status NOT IN ('compliant')) AS is_overdue,
    (c.due_date - CURRENT_DATE) AS days_to_due
    FROM compliance_requirements c`;

  async function complianceRow(context: AuthContext, complianceId: string) {
    const row = await db.one(`${complianceSelect} WHERE c.id=$1`, [complianceId]);
    if (!row) notFound('Compliance requirement');
    const mineIds: string[] = row.applicable_mine_ids ?? [];
    if (mineIds.length && !mineIds.some((mineId) => context.canAccessMine(mineId))) forbidden('That compliance requirement is outside your assigned scope.');
    return row;
  }

  app.get('/api/v1/compliance', async (req) => {
    const context = auth(req);
    context.require('compliance.view');
    const options = listOptions(req.query as Query, 'due_date');
    const params: unknown[] = [];
    const conditions: string[] = [];
    const search = options.search ? `%${options.search}%` : null;
    if (search) { params.push(search); conditions.push(`(c.code ILIKE $${params.length} OR c.title ILIKE $${params.length} OR c.description ILIKE $${params.length})`); }
    for (const [field, column] of [['status','c.status'],['priority','c.priority'],['category','c.category'],['responsibleOfficerId','c.responsible_officer_id']] as const) {
      const value = queryValue(req.query as Query, field);
      if (value) { params.push(value); conditions.push(`${column} = $${params.length}`); }
    }
    const mineId = queryValue(req.query as Query, 'mineId');
    if (mineId) { params.push(mineId); conditions.push(`EXISTS (SELECT 1 FROM compliance_requirement_mines x WHERE x.compliance_id=c.id AND x.mine_id=$${params.length})`); }
    const subsidiaryId = queryValue(req.query as Query, 'subsidiaryId');
    if (subsidiaryId) { params.push(subsidiaryId); conditions.push(`EXISTS (SELECT 1 FROM compliance_requirement_mines x JOIN mines mx ON mx.id=x.mine_id WHERE x.compliance_id=c.id AND mx.subsidiary_id=$${params.length})`); }
    const mineScope = addScope(context, params, 'x.mine_id', 'mx.subsidiary_id');
    conditions.push(`(${mineScope === 'TRUE' ? 'TRUE' : `EXISTS (SELECT 1 FROM compliance_requirement_mines x JOIN mines mx ON mx.id=x.mine_id WHERE x.compliance_id=c.id AND ${mineScope})`})`);
    const where = `WHERE ${conditions.join(' AND ')}`;
    const total = await db.one<{ total: number }>(`SELECT count(*)::int AS total FROM compliance_requirements c ${where}`, params);
    const dataParams = [...params, options.pageSize, options.offset];
    const result = await db.query(
      `${complianceSelect} ${where}
       ORDER BY ${sortColumn(options.sortBy, { dueDate: 'c.due_date', updatedAt: 'c.updated_at', title: 'c.title', status: 'c.status', priority: "CASE c.priority WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END" }, 'c.due_date')} ${options.sortDir} NULLS LAST
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      dataParams,
    );
    return { items: result.rows.map(serializeCompliance), meta: meta(total?.total ?? 0, options) };
  });

  app.get('/api/v1/compliance/calendar', async (req) => {
    const context = auth(req);
    context.require('compliance.view');
    const options = listOptions(req.query as Query, 'due_date');
    options.pageSize = Math.min(200, options.pageSize);
    const params: unknown[] = [];
    const conditions: string[] = [];
    const from = queryValue(req.query as Query, 'dateFrom') ?? queryValue(req.query as Query, 'from');
    const to = queryValue(req.query as Query, 'dateTo') ?? queryValue(req.query as Query, 'to');
    if (from) { params.push(from); conditions.push(`c.due_date >= $${params.length}`); }
    if (to) { params.push(to); conditions.push(`c.due_date <= $${params.length}`); }
    const mineScope = addScope(context, params, 'x.mine_id', 'mx.subsidiary_id');
    if (mineScope !== 'TRUE') conditions.push(`EXISTS (SELECT 1 FROM compliance_requirement_mines x JOIN mines mx ON mx.id=x.mine_id WHERE x.compliance_id=c.id AND ${mineScope})`);
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const total = await db.one<{ total: number }>(`SELECT count(*)::int AS total FROM compliance_requirements c ${where}`, params);
    const result = await db.query(`${complianceSelect} ${where} ORDER BY c.due_date NULLS LAST LIMIT $${params.length + 1} OFFSET $${params.length + 2}`, [...params, options.pageSize, options.offset]);
    return { items: result.rows.map(serializeCompliance), meta: meta(total?.total ?? 0, options) };
  });

  app.get('/api/v1/compliance/:id', async (req) => { const context = auth(req); context.require('compliance.view'); return serializeCompliance(await complianceRow(context, (req.params as { id: string }).id)); });

  app.post('/api/v1/compliance', async (req) => {
    const context = auth(req);
    context.require('compliance.create');
    const body = req.body as Record<string, unknown>;
    const code = requireString(body.code, 'code', 60);
    const title = requireString(body.title, 'title', 240);
    const description = requireString(body.description, 'description', 8000);
    const category = requireEnum(body.category, CATEGORIES, 'category');
    const priority = requireEnum(body.priority, PRIORITIES, 'priority');
    const applicableMineIds = requireArray(body.applicableMineIds, 'applicableMineIds');
    if (!applicableMineIds.length) badRequest('At least one applicable mine is required.');
    for (const mineId of applicableMineIds) await validateMineAccess(db, context, mineId);
    const dueDate = optionalDate(body.dueDate, 'dueDate');
    const status = body.status === undefined ? 'draft' : requireEnum(body.status, COMPLIANCE_STATUSES, 'status');
    const complianceId = id('cmp');
    const record = await db.transaction(async (client) => {
      const result = await client.query(
        `INSERT INTO compliance_requirements (id,code,title,description,category,responsible_officer_id,source_reference,effective_from,due_date,status,priority,submission_frequency,notes,updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING *`,
        [complianceId, code, title, description, category, optionalString(body.responsibleOfficerId, 'responsibleOfficerId') ?? null,
          optionalString(body.sourceReference, 'sourceReference') ?? null, optionalDate(body.effectiveFrom, 'effectiveFrom') ?? null,
          dueDate ?? null, status, priority, optionalString(body.submissionFrequency, 'submissionFrequency') ?? null,
          optionalString(body.notes, 'notes') ?? null, context.user.id],
      );
      for (const mineId of applicableMineIds) await client.query('INSERT INTO compliance_requirement_mines (compliance_id,mine_id) VALUES ($1,$2)', [complianceId, mineId]);
      await appendAudit(client, { actor: actor(context), action: 'create', entityType: 'compliance', entityId: complianceId, entityLabel: title, updatedValue: result.rows[0], mineIds: applicableMineIds, requestId: context.requestId });
      return result.rows[0];
    }).catch((error) => mapUnique(error, 'A compliance requirement with that code already exists.'));
    return serializeCompliance(await complianceRow(context, record.id));
  });

  app.patch('/api/v1/compliance/:id', async (req) => {
    const context = auth(req);
    context.require('compliance.edit');
    const complianceId = (req.params as { id: string }).id;
    const existing = await complianceRow(context, complianceId);
    const body = req.body as Record<string, unknown>;
    const definitions: Record<string, string> = {
      title: 'title', description: 'description', category: 'category', priority: 'priority',
      responsibleOfficerId: 'responsible_officer_id', sourceReference: 'source_reference',
      effectiveFrom: 'effective_from', dueDate: 'due_date', submissionFrequency: 'submission_frequency', notes: 'notes',
    };
    const params: unknown[] = [];
    const updates: string[] = [];
    for (const [field, column] of Object.entries(definitions)) {
      if (!(field in body)) continue;
      params.push(body[field] === '' ? null : body[field]);
      updates.push(`${column}=$${params.length}`);
    }
    if (Array.isArray(body.applicableMineIds)) {
      const mines = requireArray(body.applicableMineIds, 'applicableMineIds');
      if (!mines.length) badRequest('At least one applicable mine is required.');
      for (const mineId of mines) await validateMineAccess(db, context, mineId);
    }
    if (!updates.length && !Array.isArray(body.applicableMineIds)) return serializeCompliance(existing);
    params.push(complianceId);
    const updated = await db.transaction(async (client) => {
      const result = updates.length
        ? await client.query(`UPDATE compliance_requirements SET ${updates.join(', ')}, updated_at=now(), updated_by=$${params.length + 1} WHERE id=$${params.length} RETURNING *`, [...params, context.user.id])
        : { rows: [existing] };
      if (Array.isArray(body.applicableMineIds)) {
        await client.query('DELETE FROM compliance_requirement_mines WHERE compliance_id=$1', [complianceId]);
        for (const mineId of requireArray(body.applicableMineIds, 'applicableMineIds')) {
          await client.query('INSERT INTO compliance_requirement_mines (compliance_id,mine_id) VALUES ($1,$2)', [complianceId, mineId]);
        }
      }
      await appendAudit(client, { actor: actor(context), action: 'update', entityType: 'compliance', entityId: complianceId, entityLabel: existing.title, previousValue: existing, updatedValue: result.rows[0], mineIds: existing.applicable_mine_ids, requestId: context.requestId });
      return result.rows[0];
    });
    return serializeCompliance(await complianceRow(context, updated.id));
  });

  app.post('/api/v1/compliance/:id/transition', async (req) => {
    const context = auth(req);
    const complianceId = (req.params as { id: string }).id;
    const existing = await complianceRow(context, complianceId);
    const body = req.body as Record<string, unknown>;
    const to = requireEnum(body.to, COMPLIANCE_STATUSES, 'to');
    if (to === 'submitted') context.require('compliance.submit');
    else if (to === 'compliant' || to === 'non_compliant') context.require('compliance.verify');
    else context.require('compliance.edit');
    if (!(COMPLIANCE_TRANSITIONS[existing.status] ?? []).includes(to)) {
      conflict(`Cannot move a compliance requirement from ${existing.status} to ${to}.`, 'invalid_transition');
    }
    // Evidence required on submission
    if (to === 'submitted') {
      const evidences = await db.many('SELECT document_id FROM compliance_evidence WHERE compliance_id=$1', [complianceId]);
      if (evidences.length === 0) {
        throw new AppError(400, 'bad_request', 'Submission requires at least one piece of supporting evidence.');
      }
    }
    // Separation of duties: prevent self-approval/verification
    if (to === 'compliant' || to === 'non_compliant') {
      const lastSubmit = await db.one<{ actor_id: string }>(`SELECT actor_id FROM compliance_status_history WHERE compliance_id=$1 AND to_status='submitted' ORDER BY created_at DESC LIMIT 1`, [complianceId]);
      if (lastSubmit && lastSubmit.actor_id === context.user.id) {
        throw new AppError(403, 'forbidden', 'Separation of duties requires a different reviewer to approve or reject this submission.');
      }
      if (existing.responsible_officer_id === context.user.id) {
        throw new AppError(403, 'forbidden', 'Separation of duties requires a different reviewer to approve or reject this submission.');
      }
    }
    const comment = optionalString(body.comment, 'comment', 2000);
    const updated = await db.transaction(async (client) => {
      const result = await client.query(
        `UPDATE compliance_requirements SET status=$2, updated_at=now(), updated_by=$3,
          last_submitted_at=CASE WHEN $2='submitted' THEN now() ELSE last_submitted_at END,
          last_verified_at=CASE WHEN $2 IN ('compliant','non_compliant') THEN now() ELSE last_verified_at END,
          verification_status=CASE WHEN $2='compliant' THEN 'verified' WHEN $2='non_compliant' THEN 'rejected' ELSE verification_status END
         WHERE id=$1 RETURNING *`,
        [complianceId, to, context.user.id],
      );
      await client.query(`INSERT INTO compliance_status_history (id,compliance_id,from_status,to_status,actor_id,comment) VALUES ($1,$2,$3,$4,$5,$6)`,
        [id('csh'), complianceId, existing.status, to, context.user.id, comment ?? null]);
      await appendAudit(client, { actor: actor(context), action: to === 'compliant' || to === 'non_compliant' ? 'verify' : (to === 'submitted' ? 'submit' : 'status_change'), entityType: 'compliance', entityId: complianceId, entityLabel: existing.title, previousValue: { status: existing.status }, updatedValue: { status: to }, reason: comment ?? null, mineIds: existing.applicable_mine_ids, requestId: context.requestId });
      return result.rows[0];
    });
    return serializeCompliance(await complianceRow(context, updated.id));
  });

  app.post('/api/v1/compliance/:id/evidence', async (req) => {
    const context = auth(req);
    context.require('compliance.edit');
    const complianceId = (req.params as { id: string }).id;
    const existing = await complianceRow(context, complianceId);
    const documentId = requireString((req.body as Record<string, unknown>).documentId, 'documentId', 80);
    const document = await db.one('SELECT * FROM documents WHERE id=$1', [documentId]);
    if (!document) notFound('Document');
    if (document.mine_id && !context.canAccessMine(document.mine_id)) forbidden('That document is outside your scope.');
    await db.transaction(async (client) => {
      await client.query(`INSERT INTO compliance_evidence (compliance_id,document_id,attached_by) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`, [complianceId, documentId, context.user.id]);
      await client.query(`INSERT INTO document_compliance_links (document_id,compliance_id,linked_by) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`, [documentId, complianceId, context.user.id]);
      await appendAudit(client, { actor: actor(context), action: 'update', entityType: 'compliance', entityId: complianceId, entityLabel: existing.title, updatedValue: { evidenceDocumentId: documentId }, mineIds: existing.applicable_mine_ids, requestId: context.requestId });
    });
    return serializeCompliance(await complianceRow(context, complianceId));
  });

  /* -------------------------------------------------------------- inspections */
  const inspectionSelect = `SELECT i.*, m.name AS mine_name, u.name AS inspector_name,
    COALESCE((SELECT array_agg(ief.document_id) FROM inspection_evidence ief WHERE ief.inspection_id=i.id), '{}') AS evidence_document_ids,
    COALESCE((SELECT array_agg(icl.compliance_id) FROM inspection_compliance_links icl WHERE icl.inspection_id=i.id), '{}') AS compliance_record_ids,
    COALESCE((SELECT array_agg(ica.corrective_action_id) FROM inspection_corrective_actions ica WHERE ica.inspection_id=i.id), '{}') AS corrective_action_ids
    FROM inspections i JOIN mines m ON m.id=i.mine_id JOIN users u ON u.id=i.inspector_id`;
  async function inspectionRow(context: AuthContext, inspectionId: string) {
    const row = await db.one(`${inspectionSelect} WHERE i.id=$1`, [inspectionId]);
    if (!row) notFound('Inspection');
    ensureMine(context, row.mine_id);
    const findings = await db.many(
      `SELECT f.*, COALESCE((SELECT array_agg(l.compliance_id) FROM inspection_finding_compliance_links l WHERE l.finding_id=f.id), '{}') AS compliance_record_ids
       FROM inspection_findings f WHERE f.inspection_id=$1 ORDER BY f.sort_order, f.raised_at`, [inspectionId]);
    const history = await db.many('SELECT * FROM inspection_status_history WHERE inspection_id=$1 ORDER BY created_at', [inspectionId]);
    row.findings = findings.map(serializeFinding);
    row.review_history = history.map(serializeReview);
    return row;
  }

  app.get('/api/v1/inspections', async (req) => {
    const context = auth(req);
    context.require('inspection.view');
    const options = listOptions(req.query as Query, 'scheduled_date');
    const params: unknown[] = [];
    const conditions: string[] = [addScope(context, params, 'i.mine_id', 'm.subsidiary_id')];
    const search = options.search ? `%${options.search}%` : null;
    if (search) { params.push(search); conditions.push(`(i.code ILIKE $${params.length} OR i.scope ILIKE $${params.length} OR m.name ILIKE $${params.length})`); }
    for (const [field, column] of [['status','i.status'],['type','i.type'],['mineId','i.mine_id'],['inspectorId','i.inspector_id'],['subsidiaryId','m.subsidiary_id']] as const) {
      const value = queryValue(req.query as Query, field);
      if (value) { params.push(value); conditions.push(`${column}=$${params.length}`); }
    }
    const where = `WHERE ${conditions.join(' AND ')}`;
    const total = await db.one<{ total: number }>(`SELECT count(*)::int AS total FROM inspections i JOIN mines m ON m.id=i.mine_id ${where}`, params);
    const result = await db.query(
      `${inspectionSelect} ${where} ORDER BY ${sortColumn(options.sortBy, { scheduledDate: 'i.scheduled_date', status: 'i.status', code: 'i.code', updatedAt: 'i.updated_at' }, 'i.scheduled_date')} ${options.sortDir}
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`, [...params, options.pageSize, options.offset]);
    const items = [];
    for (const row of result.rows) items.push(serializeInspection(await inspectionRow(context, row.id)));
    return { items, meta: meta(total?.total ?? 0, options) };
  });

  app.get('/api/v1/inspections/:id', async (req) => { const context = auth(req); context.require('inspection.view'); return serializeInspection(await inspectionRow(context, (req.params as { id: string }).id)); });

  app.post('/api/v1/inspections', async (req) => {
    const context = auth(req);
    context.require('inspection.create');
    const body = req.body as Record<string, unknown>;
    const mineId = requireString(body.mineId, 'mineId', 80);
    await validateMineAccess(db, context, mineId);
    const inspectorId = optionalString(body.inspectorId, 'inspectorId') ?? context.user.id;
    const type = requireEnum(body.type, INSPECTION_TYPES, 'type');
    const scheduledDate = optionalDate(body.scheduledDate, 'scheduledDate') ?? today();
    const scope = requireString(body.scope, 'scope', 4000);
    const complianceRecordIds = Array.isArray(body.complianceRecordIds) ? requireArray(body.complianceRecordIds, 'complianceRecordIds') : [];
    for (const complianceId of complianceRecordIds) await complianceRow(context, complianceId);
    const inspectionId = id('insp');
    const created = await db.transaction(async (client) => {
      const code = await nextCode(client, 'inspections', 'code', 'INS');
      const result = await client.query(
        `INSERT INTO inspections (id,code,mine_id,type,inspector_id,scheduled_date,status,scope,created_by)
         VALUES ($1,$2,$3,$4,$5,$6,'scheduled',$7,$8) RETURNING *`,
        [inspectionId, code, mineId, type, inspectorId, scheduledDate, scope, context.user.id],
      );
      for (const complianceId of complianceRecordIds) await client.query('INSERT INTO inspection_compliance_links (inspection_id,compliance_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [inspectionId, complianceId]);
      await appendAudit(client, { actor: actor(context), action: 'create', entityType: 'inspection', entityId: inspectionId, entityLabel: code, updatedValue: result.rows[0], mineIds: [mineId], requestId: context.requestId });
      return result.rows[0];
    });
    return serializeInspection(await inspectionRow(context, created.id));
  });

  app.patch('/api/v1/inspections/:id', async (req) => {
    const context = auth(req);
    context.require('inspection.edit');
    const inspectionId = (req.params as { id: string }).id;
    const existing = await inspectionRow(context, inspectionId);
    if (['completed','cancelled'].includes(existing.status)) conflict('A completed or cancelled inspection cannot be edited.', 'invalid_transition');
    const body = req.body as Record<string, unknown>;
    const params: unknown[] = [];
    const updates: string[] = [];
    for (const [field, column] of [['scheduledDate','scheduled_date'],['actualDate','actual_date'],['scope','scope'],['inspectorId','inspector_id'] ] as const) {
      if (!(field in body)) continue;
      params.push(body[field] === '' ? null : body[field]); updates.push(`${column}=$${params.length}`);
    }
    if (typeof body.scope === 'string' && !body.scope.trim()) badRequest('scope cannot be empty.');
    if (!updates.length) return serializeInspection(existing);
    params.push(inspectionId);
    const updated = await db.transaction(async (client) => {
      const result = await client.query(`UPDATE inspections SET ${updates.join(', ')}, updated_at=now() WHERE id=$${params.length} RETURNING *`, params);
      await appendAudit(client, { actor: actor(context), action: 'update', entityType: 'inspection', entityId: inspectionId, entityLabel: existing.code, previousValue: existing, updatedValue: result.rows[0], mineIds: [existing.mine_id], requestId: context.requestId });
      return result.rows[0];
    });
    return serializeInspection(await inspectionRow(context, updated.id));
  });

  app.post('/api/v1/inspections/:id/transition', async (req) => {
    const context = auth(req);
    const inspectionId = (req.params as { id: string }).id;
    const existing = await inspectionRow(context, inspectionId);
    const body = req.body as Record<string, unknown>;
    const to = requireEnum(body.to, INSPECTION_STATUSES, 'to');
    if (to === 'submitted') context.require('inspection.submit');
    else if (to === 'under_review' || to === 'completed') context.require('inspection.review');
    else context.require('inspection.edit');
    if (!(INSPECTION_TRANSITIONS[existing.status] ?? []).includes(to)) conflict(`Cannot move an inspection from ${existing.status} to ${to}.`, 'invalid_transition');
    // Separation of duties: inspector cannot review/complete their own inspection
    if ((to === 'under_review' || to === 'completed') && existing.inspector_id === context.user.id) {
      throw new AppError(403, 'forbidden', 'Separation of duties requires a different reviewer to review or complete this inspection.');
    }
    // Evidence enforcement on submit
    if (to === 'submitted') {
      const issues = await inspectionSubmissionIssues(db, inspectionId, existing.type, existing.mine_id);
      if (hasSubmissionBlockers(issues)) {
        throw new AppError(400, 'bad_request', 'Inspection cannot be submitted until every required checklist item is recorded and evidence obligations are met.', issues as unknown as Record<string, string[]>);
      }
      const findings = await db.many('SELECT * FROM inspection_findings WHERE inspection_id=$1', [inspectionId]);
      const evidences = await db.many('SELECT document_id FROM inspection_evidence WHERE inspection_id=$1', [inspectionId]);
      if (findings.length === 0 && evidences.length === 0) {
        throw new AppError(400, 'bad_request', 'Submission requires at least one finding or attached evidence.');
      }
    }
    // Evidence enforcement on complete
    if (to === 'completed') {
      const findings = await db.many('SELECT * FROM inspection_findings WHERE inspection_id=$1', [inspectionId]);
      const violations = findings.filter((f: any) => f.is_violation);
      if (violations.length > 0) {
        const evidences = await db.many('SELECT document_id FROM inspection_evidence WHERE inspection_id=$1', [inspectionId]);
        if (evidences.length === 0) {
          throw new AppError(400, 'bad_request', 'High-risk/violations require supporting evidence before completion.');
        }
      }
    }
    const comment = optionalString(body.comment, 'comment', 2000);
    const attestation = optionalString(body.attestation, 'attestation', 2000);
    const updated = await db.transaction(async (client) => {
      const result = await client.query(
        `UPDATE inspections SET status=$2, updated_at=now(),
          started_at=CASE WHEN $2='in_progress' AND started_at IS NULL THEN now() ELSE started_at END,
          actual_date=CASE WHEN $2='in_progress' AND actual_date IS NULL THEN CURRENT_DATE ELSE actual_date END,
          submitted_at=CASE WHEN $2='submitted' THEN now() ELSE submitted_at END,
          completed_at=CASE WHEN $2='completed' THEN now() ELSE completed_at END,
          reviewer_id=CASE WHEN $2 IN ('under_review','completed') THEN $3 ELSE reviewer_id END,
          attested_by=CASE WHEN $2='submitted' THEN $4 ELSE attested_by END,
          attested_at=CASE WHEN $2='submitted' THEN now() ELSE attested_at END,
          attestation_text=CASE WHEN $2='submitted' THEN $5 ELSE attestation_text END
         WHERE id=$1 RETURNING *`, [inspectionId, to, context.user.id, context.user.id, attestation ?? 'I attest this inspection reflects work actually performed.']);
      await client.query(`INSERT INTO inspection_status_history (id,inspection_id,from_status,to_status,actor_id,actor_name,comment) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [id('ish'), inspectionId, existing.status, to, context.user.id, context.user.name, comment ?? null]);
      await appendAudit(client, { actor: actor(context), action: to === 'completed' ? 'verify' : (to === 'submitted' ? 'submit' : 'status_change'), entityType: 'inspection', entityId: inspectionId, entityLabel: existing.code, previousValue: { status: existing.status }, updatedValue: { status: to }, reason: comment ?? null, mineIds: [existing.mine_id], requestId: context.requestId });
      return result.rows[0];
    });
    if (to === 'submitted' || to === 'completed') {
      await detectInspectionAnomalies(db, inspectionId).catch(() => undefined);
    }
    return serializeInspection(await inspectionRow(context, updated.id));
  });

  app.post('/api/v1/inspections/:id/assign', async (req) => {
    const context = auth(req);
    context.require('inspection.edit');
    const inspectionId = (req.params as { id: string }).id;
    const existing = await inspectionRow(context, inspectionId);
    const inspectorId = requireString((req.body as Record<string, unknown>).inspectorId, 'inspectorId', 80);
    const user = await db.one('SELECT id,name,role,mine_ids,subsidiary_ids FROM users u LEFT JOIN LATERAL (SELECT array_agg(mine_id) AS mine_ids FROM user_mine_scopes WHERE user_id=u.id) ms ON true LEFT JOIN LATERAL (SELECT array_agg(subsidiary_id) AS subsidiary_ids FROM user_subsidiary_scopes WHERE user_id=u.id) ss ON true WHERE u.id=$1 AND u.deactivated_at IS NULL', [inspectorId]);
    if (!user) badRequest('inspectorId does not identify an active user.');
    // Ensure assignee can access mine
    const { canAccessMine } = await import('../auth');
    const assigneeUser = { role: user.role, mineIds: user.mine_ids || [], subsidiaryIds: user.subsidiary_ids || [] } as any;
    if (!canAccessMine(assigneeUser, existing.mine_id)) badRequest('The assigned inspector is not scoped to this mine.');
    const updated = await db.transaction(async (client) => {
      const result = await client.query('UPDATE inspections SET inspector_id=$2, updated_at=now() WHERE id=$1 RETURNING *', [inspectionId, inspectorId]);
      await appendAudit(client, { actor: actor(context), action: 'assign', entityType: 'inspection', entityId: inspectionId, entityLabel: existing.code, previousValue: { inspectorId: existing.inspector_id }, updatedValue: { inspectorId }, mineIds: [existing.mine_id], requestId: context.requestId });
      return result.rows[0];
    });
    return serializeInspection(await inspectionRow(context, updated.id));
  });

  app.post('/api/v1/inspections/:id/findings', async (req) => {
    const context = auth(req);
    context.require('inspection.edit');
    const inspectionId = (req.params as { id: string }).id;
    const existing = await inspectionRow(context, inspectionId);
    if (['completed','cancelled'].includes(existing.status)) conflict('Findings cannot be added to a closed inspection.', 'invalid_transition');
    const body = req.body as Record<string, unknown>;
    const description = requireString(body.description, 'description', 8000);
    const category = requireEnum(body.category, CATEGORIES, 'category');
    const severity = requireEnum(body.severity, PRIORITIES, 'severity');
    const isViolation = body.isViolation === true;
    const complianceRecordIds = Array.isArray(body.complianceRecordIds) ? requireArray(body.complianceRecordIds, 'complianceRecordIds') : [];
    for (const complianceId of complianceRecordIds) await complianceRow(context, complianceId);
    const findingId = id('fnd');
    await db.transaction(async (client) => {
      await client.query(`INSERT INTO inspection_findings (id,inspection_id,description,category,severity,is_violation,recorded_by) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [findingId, inspectionId, description, category, severity, isViolation, context.user.id]);
      for (const complianceId of complianceRecordIds) await client.query('INSERT INTO inspection_finding_compliance_links (finding_id,compliance_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [findingId, complianceId]);
      if (isViolation) {
        const code = await nextCode(client, 'violations', 'code', 'VIO');
        await client.query(
          `INSERT INTO violations (id,code,mine_id,source_type,source_id,source_code,description,severity,category,raised_by,due_date,status)
           VALUES ($1,$2,$3,'inspection',$4,$5,$6,$7,$8,$9,CURRENT_DATE + 14,'open')`,
          [id('vio'), code, existing.mine_id, inspectionId, existing.code, description, severity, category, context.user.id]);
      }
      await appendAudit(client, { actor: actor(context), action: 'update', entityType: 'inspection', entityId: inspectionId, entityLabel: existing.code, updatedValue: { findingId, description, severity, isViolation }, mineIds: [existing.mine_id], requestId: context.requestId });
    });
    return serializeInspection(await inspectionRow(context, inspectionId));
  });

  /* ------------------------------------------------------------------ map (GIS) */

  /** Lightweight, map-optimised list of mine locations with status. */
  app.get('/api/v1/map/mines', async (req) => {
    const context = auth(req);
    context.require('map.view');
    const options = listOptions(req.query as Query, 'name');
    options.pageSize = Math.min(500, options.pageSize);
    const params: unknown[] = [];
    const conditions: string[] = [addScope(context, params, 'm.id', 'm.subsidiary_id')];
    const search = options.search ? `%${options.search}%` : null;
    if (search) {
      params.push(search);
      conditions.push(`(m.name ILIKE $${params.length} OR m.code ILIKE $${params.length})`);
    }
    const status = queryValue(req.query as Query, 'operationalStatus');
    if (status) { params.push(status); conditions.push(`m.operational_status = $${params.length}`); }
    const region = queryValue(req.query as Query, 'region');
    if (region) { params.push(region); conditions.push(`m.region = $${params.length}`); }
    const hasLocation = queryValue(req.query as Query, 'hasLocation');
    if (hasLocation === 'true') conditions.push(`m.latitude IS NOT NULL AND m.longitude IS NOT NULL`);
    if (hasLocation === 'false') conditions.push(`m.latitude IS NULL OR m.longitude IS NULL`);
    const where = `WHERE ${conditions.join(' AND ')}`;
    const result = await db.query(
      `SELECT m.id, m.code, m.name, m.subsidiary_id, m.region, m.district, m.state,
              m.operational_status, m.latitude, m.longitude, m.geo_source, m.geo_accuracy_m, m.geo_captured_at,
              s.name AS subsidiary_name
       FROM mines m JOIN subsidiaries s ON s.id=m.subsidiary_id
       ${where} ORDER BY ${sortColumn(options.sortBy, { name: 'm.name', code: 'm.code', region: 'm.region', updatedAt: 'm.updated_at' }, 'm.name')} ${options.sortDir}
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, options.pageSize, options.offset],
    );
    const items = result.rows.map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      subsidiaryId: row.subsidiary_id,
      subsidiaryName: row.subsidiary_name,
      region: row.region,
      district: row.district,
      state: row.state,
      operationalStatus: row.operational_status,
      location: row.latitude === null || row.latitude === undefined || row.longitude === null
        ? undefined
        : { lat: Number(row.latitude), lng: Number(row.longitude), accuracyM: row.geo_accuracy_m ?? undefined, source: row.geo_source ?? undefined, capturedAt: row.geo_captured_at ? new Date(row.geo_captured_at).toISOString() : undefined },
    }));
    return { items, meta: meta(items.length, options) };
  });

  /** Mine summary for the details panel - authorised fields only. */
  app.get('/api/v1/map/mines/:id/summary', async (req) => {
    const context = auth(req);
    context.require('map.view');
    const { id: mineId } = req.params as { id: string };
    const row = await db.one(
      `SELECT m.*, s.name AS subsidiary_name FROM mines m JOIN subsidiaries s ON s.id=m.subsidiary_id WHERE m.id=$1`,
      [mineId],
    );
    if (!row) notFound('Mine');
    ensureMine(context, row.id, row.subsidiary_id);

    const [openViolations, openActions, latestIncident, latestInspection] = await Promise.all([
      db.many(`SELECT v.id, v.code, v.severity, v.category, v.status, v.due_date, v.source_code
        FROM violations v WHERE v.mine_id=$1 AND v.status IN ('open','under_remediation','awaiting_verification') ORDER BY v.due_date ASC NULLS LAST LIMIT 5`, [mineId]),
      db.many(`SELECT ca.id, ca.code, ca.priority, ca.status, ca.due_date, ca.source_id
        FROM corrective_actions ca WHERE ca.mine_id=$1 AND ca.status NOT IN ('verified','closed') ORDER BY ca.due_date ASC NULLS LAST LIMIT 5`, [mineId]),
      db.many(`SELECT i.id, i.code, i.title, i.severity, i.status, i.occurred_at
        FROM incidents i WHERE i.mine_id=$1 ORDER BY i.occurred_at DESC LIMIT 3`, [mineId]),
      db.many(`SELECT insp.id, insp.code, insp.type, insp.status, insp.scheduled_date
        FROM inspections insp WHERE insp.mine_id=$1 ORDER BY insp.scheduled_date DESC LIMIT 3`, [mineId]),
    ]);

    return {
      id: row.id,
      code: row.code,
      name: row.name,
      subsidiaryId: row.subsidiary_id,
      subsidiaryName: row.subsidiary_name,
      region: row.region,
      district: row.district,
      state: row.state,
      operationalStatus: row.operational_status,
      approvedCapacityTPA: row.approved_capacity_tpa ?? undefined,
      commissionedOn: row.commissioned_on ? new Date(row.commissioned_on).toISOString() : undefined,
      location: row.latitude === null || row.latitude === undefined || row.longitude === null
        ? undefined
        : { lat: Number(row.latitude), lng: Number(row.longitude), accuracyM: row.geo_accuracy_m ?? undefined, source: row.geo_source ?? undefined, capturedAt: row.geo_captured_at ? new Date(row.geo_captured_at).toISOString() : undefined },
      openViolations: openViolations.map((v: any) => ({ id: v.id, code: v.code, severity: v.severity, category: v.category, status: v.status, dueDate: v.due_date ? new Date(v.due_date).toISOString() : undefined, sourceCode: v.source_code })),
      openCorrectiveActions: openActions.map((a: any) => ({ id: a.id, code: a.code, priority: a.priority, status: a.status, dueDate: a.due_date ? new Date(a.due_date).toISOString() : undefined, sourceCode: a.source_id })),
      latestIncidents: latestIncident.map((i: any) => ({ id: i.id, code: i.code, title: i.title, severity: i.severity, status: i.status, occurredAt: i.occurred_at ? new Date(i.occurred_at).toISOString() : undefined })),
      latestInspections: latestInspection.map((i: any) => ({ id: i.id, code: i.code, type: i.type, status: i.status, scheduledDate: i.scheduled_date ? new Date(i.scheduled_date).toISOString() : undefined })),
    };
  });

  /** Open violations with mine context for the compliance layer. */
  app.get('/api/v1/map/violations', async (req) => {
    const context = auth(req);
    context.require('map.view');
    const options = listOptions(req.query as Query, 'raised_at');
    options.pageSize = Math.min(500, options.pageSize);
    const params: unknown[] = [];
    const conditions: string[] = [addScope(context, params, 'v.mine_id', 'm.subsidiary_id')];
    const status = queryValue(req.query as Query, 'status');
    if (status) { params.push(status); conditions.push(`v.status = $${params.length}`); }
    const severity = queryValue(req.query as Query, 'severity');
    if (severity) { params.push(severity); conditions.push(`v.severity = $${params.length}`); }
    const category = queryValue(req.query as Query, 'category');
    if (category) { params.push(category); conditions.push(`v.category = $${params.length}`); }
    const where = `WHERE ${conditions.join(' AND ')}`;
    const result = await db.query(
      `SELECT v.id, v.code, v.mine_id, v.severity, v.category, v.status, v.due_date, v.raised_at, v.source_code,
              m.name AS mine_name, m.code AS mine_code,
              m.latitude, m.longitude, m.geo_source, m.geo_accuracy_m, m.geo_captured_at
       FROM violations v JOIN mines m ON m.id=v.mine_id
       ${where} ORDER BY ${sortColumn(options.sortBy, { raisedAt: 'v.raised_at', dueDate: 'v.due_date', severity: 'v.severity' }, 'v.raised_at')} ${options.sortDir}
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, options.pageSize, options.offset],
    );
    return {
      items: result.rows.map((row: any) => ({
        id: row.id,
        code: row.code,
        mineId: row.mine_id,
        mineName: row.mine_name,
        mineCode: row.mine_code,
        severity: row.severity,
        category: row.category,
        status: row.status,
        dueDate: row.due_date ? new Date(row.due_date).toISOString() : undefined,
        raisedAt: row.raised_at ? new Date(row.raised_at).toISOString() : undefined,
        sourceCode: row.source_code,
        location: row.latitude === null || row.latitude === undefined || row.longitude === null
          ? undefined
          : { lat: Number(row.latitude), lng: Number(row.longitude), accuracyM: row.geo_accuracy_m ?? undefined, source: row.geo_source ?? undefined, capturedAt: row.geo_captured_at ? new Date(row.geo_captured_at).toISOString() : undefined },
      })),
      meta: meta(result.rows.length, options),
    };
  });

  /** Open / overdue corrective actions with mine context for the action layer. */
  app.get('/api/v1/map/corrective-actions', async (req) => {
    const context = auth(req);
    context.require('map.view');
    const options = listOptions(req.query as Query, 'due_date');
    options.pageSize = Math.min(500, options.pageSize);
    const params: unknown[] = [];
    const conditions: string[] = [addScope(context, params, 'ca.mine_id', 'm.subsidiary_id')];
    const status = queryValue(req.query as Query, 'status');
    if (status) { params.push(status); conditions.push(`ca.status = $${params.length}`); }
    const priority = queryValue(req.query as Query, 'priority');
    if (priority) { params.push(priority); conditions.push(`ca.priority = $${params.length}`); }
    const where = `WHERE ${conditions.join(' AND ')}`;
    const result = await db.query(
      `SELECT ca.id, ca.code, ca.mine_id, ca.priority, ca.status, ca.due_date, ca.description, ca.source_id,
              m.name AS mine_name, m.code AS mine_code,
              m.latitude, m.longitude, m.geo_source, m.geo_accuracy_m, m.geo_captured_at
       FROM corrective_actions ca JOIN mines m ON m.id=ca.mine_id
       ${where} ORDER BY ${sortColumn(options.sortBy, { dueDate: 'ca.due_date', priority: 'ca.priority', createdAt: 'ca.created_at' }, 'ca.due_date')} ${options.sortDir} NULLS LAST
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, options.pageSize, options.offset],
    );
    return {
      items: result.rows.map((row: any) => ({
        id: row.id,
        code: row.code,
        mineId: row.mine_id,
        mineName: row.mine_name,
        mineCode: row.mine_code,
        priority: row.priority,
        status: row.status,
        dueDate: row.due_date ? new Date(row.due_date).toISOString() : undefined,
        description: row.description,
        sourceCode: row.source_id,
        location: row.latitude === null || row.latitude === undefined || row.longitude === null
          ? undefined
          : { lat: Number(row.latitude), lng: Number(row.longitude), accuracyM: row.geo_accuracy_m ?? undefined, source: row.geo_source ?? undefined, capturedAt: row.geo_captured_at ? new Date(row.geo_captured_at).toISOString() : undefined },
      })),
      meta: meta(result.rows.length, options),
    };
  });

  /** Per-mine risk summary for the heatmap layer. Based on open violations,
   *  overdue corrective actions, and critical/high severity incidents. */
  app.get('/api/v1/map/risk-summary', async (req) => {
    const context = auth(req);
    context.require('map.view');
    const params: unknown[] = [];
    const conditions: string[] = [addScope(context, params, 'm.id', 'm.subsidiary_id')];
    const where = `WHERE ${conditions.join(' AND ')}`;
    const result = await db.query(
      `SELECT m.id, m.code, m.name, m.region,
              m.latitude, m.longitude,
              COALESCE(v.open_violations, 0) AS open_violations,
              COALESCE(a.open_actions, 0) AS open_actions,
              COALESCE(i.critical_incidents, 0) AS critical_incidents,
              (COALESCE(v.open_violations, 0) * 3 + COALESCE(a.open_actions, 0) * 2 + COALESCE(i.critical_incidents, 0) * 5) AS risk_score
       FROM mines m
       LEFT JOIN (
         SELECT mine_id, count(*)::int AS open_violations
         FROM violations WHERE status IN ('open','under_remediation','awaiting_verification')
         GROUP BY mine_id
       ) v ON v.mine_id = m.id
       LEFT JOIN (
         SELECT mine_id, count(*)::int AS open_actions
         FROM corrective_actions WHERE status NOT IN ('verified','closed')
         GROUP BY mine_id
       ) a ON a.mine_id = m.id
       LEFT JOIN (
         SELECT mine_id, count(*)::int AS critical_incidents
         FROM incidents WHERE severity = 'critical' AND status IN ('open','under_investigation','action_assigned')
         GROUP BY mine_id
       ) i ON i.mine_id = m.id
       ${where}
       ORDER BY risk_score DESC, m.name`,
      params,
    );
    return {
      items: result.rows.map((row: any) => ({
        id: row.id,
        code: row.code,
        name: row.name,
        region: row.region,
        location: row.latitude === null || row.latitude === undefined || row.longitude === null
          ? undefined
          : { lat: Number(row.latitude), lng: Number(row.longitude) },
        openViolations: row.open_violations,
        openActions: row.open_actions,
        criticalIncidents: row.critical_incidents,
        riskScore: row.risk_score,
      })),
      meta: meta(result.rows.length, { page: 1, pageSize: result.rows.length, offset: 0, sortDir: 'asc' }),
    };
  });
}

function requireNumberAsNumber(value: unknown, field: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) badRequest(`${field} must be a non-negative number.`);
  return parsed;
}

function mapUnique(error: unknown, message: string): never {
  if ((error as { code?: string }).code === '23505') conflict(message);
  throw error;
}
