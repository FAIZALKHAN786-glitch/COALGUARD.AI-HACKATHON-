import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import multipart from '@fastify/multipart';

import { appendAudit } from '../audit';
import { addScope, type AuthContext } from '../auth';
import { config } from '../config';
import type { Database } from '../db';
import {
  AppError, badRequest, boolOrUndefined, conflict, forbidden, id, listOptions, meta,
  nextCode, notFound, numberOrUndefined, optionalDate, optionalString, queryValue,
  requireArray, requireEnum, requireNumber, requireString, sortColumn, today, type Query,
} from '../http';
import {
  serializeAction, serializeAttendance, serializeContract, serializeContractor,
  serializeCorrection, serializeDocument, serializeIncident, serializeMeasurement,
  serializeNearMiss, serializeProduction, serializeSafety,
} from '../serializers';
import {
  extractDocument, computeSha256, storeFile, readStoredFile, deleteStoredFile,
  detectFileType, validateFileType, ALLOWED_MIME_TYPES, OCR_CONFIG,
} from '../ocr';

const PRIORITIES = ['low','medium','high','critical'] as const;
const CATEGORIES = ['mine_safety','environment','production','labour','contractor','other'] as const;
const SAFETY_STATUSES = ['open','under_investigation','action_assigned','resolved','closed'] as const;
const ACTION_STATUSES = ['proposed','assigned','in_progress','submitted_for_verification','verified','rejected','closed'] as const;
const INDICATORS = ['air_quality_pm10','air_quality_pm25','dust_deposition','water_quality_ph','water_quality_tds','noise_level','stack_emission','waste_generation'] as const;
const SHIFTS = ['day','swing','night'] as const;
const ATTENDANCE_STATUSES = ['present','absent','leave','half_day','not_recorded'] as const;
const DOCUMENT_TYPES = ['compliance_evidence','inspection_report','contract','worker_record','environment_log','production_report','other'] as const;
const MIME_ALLOWLIST = new Set(['application/pdf','image/png','image/jpeg','text/plain','text/csv']);

const SAFETY_TRANSITIONS: Record<string, string[]> = {
  open: ['under_investigation', 'action_assigned'],
  under_investigation: ['action_assigned', 'resolved'],
  action_assigned: ['resolved'],
  resolved: ['closed', 'action_assigned'],
  closed: [],
};
const ACTION_TRANSITIONS: Record<string, string[]> = {
  proposed: ['assigned','rejected'], assigned: ['in_progress','rejected'], in_progress: ['submitted_for_verification'],
  submitted_for_verification: ['verified','rejected'], verified: ['closed'], rejected: ['assigned','in_progress'], closed: [],
};

function auth(req: FastifyRequest): AuthContext { return (req as any).auth as AuthContext; }
function actor(context: AuthContext) { return { id: context.user.id, name: context.user.name, role: context.user.role, ipHash: context.ipHash }; }

async function ensureMine(db: Database, context: AuthContext, mineId: string): Promise<void> {
  const row = await db.one<{ id: string; subsidiary_id: string }>('SELECT id,subsidiary_id FROM mines WHERE id=$1', [mineId]);
  if (!row) badRequest('mineId does not identify a mine.', { mineId: ['Unknown mine'] });
  if (!context.canAccessMine(row.id, row.subsidiary_id)) forbidden('That mine is outside your assigned scope.');
}

function locationColumns(body: Record<string, unknown>): { columns: string[]; values: unknown[] } {
  if (body.lat === undefined && body.lng === undefined) return { columns: [], values: [] };
  if (body.lat === undefined || body.lng === undefined) badRequest('Both lat and lng are required for a location.');
  return {
    columns: ['latitude','longitude','geo_source','geo_accuracy_m','geo_captured_at'],
    values: [Number(body.lat), Number(body.lng), 'device_gps', body.accuracyM === undefined ? null : Number(body.accuracyM), new Date()],
  };
}

export async function registerOperationRoutes(app: FastifyInstance, db: Database): Promise<void> {
  await app.register(multipart, { limits: { fields: 10, files: 1, fieldNameSize: 100, fieldSize: config.documentMaxBytes } });

  /* ----------------------------------------------------------------- safety */
  const safetySelect = `SELECT s.*, m.name AS mine_name, ru.name AS reported_by_name, au.name AS assignee_name,
    COALESCE((SELECT array_agg(d.document_id) FROM safety_record_documents d WHERE d.safety_record_id=s.id), '{}') AS evidence_document_ids,
    COALESCE((SELECT array_agg(a.corrective_action_id) FROM safety_record_corrective_actions a WHERE a.safety_record_id=s.id), '{}') AS corrective_action_ids
    FROM safety_records s JOIN mines m ON m.id=s.mine_id JOIN users ru ON ru.id=s.reported_by LEFT JOIN users au ON au.id=s.assigned_to`;
  async function safetyRow(context: AuthContext, recordId: string) {
    const row = await db.one(`${safetySelect} WHERE s.id=$1`, [recordId]);
    if (!row) notFound('Safety observation');
    if (!context.canAccessMine(row.mine_id)) forbidden('That safety record is outside your assigned scope.');
    return row;
  }

  app.get('/api/v1/safety/observations', async (req) => {
    const context = auth(req); context.require('safety.view');
    const options = listOptions(req.query as Query, 'reported_at');
    const params: unknown[] = []; const conditions: string[] = [addScope(context, params, 's.mine_id', 'm.subsidiary_id')];
    const search = options.search ? `%${options.search}%` : null;
    if (search) { params.push(search); conditions.push(`(s.code ILIKE $${params.length} OR s.title ILIKE $${params.length} OR s.description ILIKE $${params.length})`); }
    for (const [field, column] of [['status','s.status'],['type','s.type'],['severity','s.severity'],['mineId','s.mine_id'],['assignedTo','s.assigned_to']] as const) {
      const value = queryValue(req.query as Query, field); if (value) { params.push(value); conditions.push(`${column}=$${params.length}`); }
    }
    const where = `WHERE ${conditions.join(' AND ')}`;
    const total = await db.one<{ total: number }>(`SELECT count(*)::int AS total FROM safety_records s JOIN mines m ON m.id=s.mine_id ${where}`, params);
    const result = await db.query(`${safetySelect} ${where} ORDER BY ${sortColumn(options.sortBy,{reportedAt:'s.reported_at',severity:"CASE s.severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END",status:'s.status'},'s.reported_at')} ${options.sortDir} LIMIT $${params.length+1} OFFSET $${params.length+2}`, [...params, options.pageSize, options.offset]);
    return { items: result.rows.map(serializeSafety), meta: meta(total?.total ?? 0, options) };
  });

  app.get('/api/v1/safety/observations/:id', async (req) => { const context = auth(req); context.require('safety.view'); return serializeSafety(await safetyRow(context, (req.params as { id: string }).id)); });

  app.post('/api/v1/safety/observations', async (req) => {
    const context = auth(req); context.require('safety.create');
    const body = req.body as Record<string, unknown>;
    const mineId = requireString(body.mineId, 'mineId', 80); await ensureMine(db, context, mineId);
    const type = requireEnum(body.type, ['observation','hazard','near_miss','incident'] as const, 'type');
    const title = requireString(body.title, 'title', 240);
    const description = requireString(body.description, 'description', 8000);
    const severity = requireEnum(body.severity, PRIORITIES, 'severity');
    const location = locationColumns(body);
    const recordId = id('saf');
    const created = await db.transaction(async (client) => {
      const code = await nextCode(client, 'safety_records', 'code', 'OBS');
      const columns = ['id','code','type','mine_id','title','description','severity','status','reported_by','reported_at','location_description','assigned_to','related_inspection_id', ...location.columns];
      const values = [recordId, code, type, mineId, title, description, severity, 'open', context.user.id, new Date(), optionalString(body.locationDescription,'locationDescription') ?? null, optionalString(body.assignedTo,'assignedTo') ?? null, optionalString(body.relatedInspectionId,'relatedInspectionId') ?? null, ...location.values];
      const result = await client.query(`INSERT INTO safety_records (${columns.join(',')}) VALUES (${columns.map((_,i)=>`$${i+1}`).join(',')}) RETURNING *`, values);
      await appendAudit(client,{actor:actor(context),action:'create',entityType:'safety_record',entityId:recordId,entityLabel:code,updatedValue:result.rows[0],mineIds:[mineId],requestId:context.requestId});
      return result.rows[0];
    });
    return serializeSafety(await safetyRow(context, created.id));
  });

  app.patch('/api/v1/safety/observations/:id', async (req) => {
    const context = auth(req); context.require('safety.edit');
    const recordId = (req.params as { id: string }).id; const existing = await safetyRow(context, recordId);
    const body = req.body as Record<string, unknown>; const params: unknown[] = []; const updates: string[] = [];
    for (const [field,column] of [['title','title'],['description','description'],['severity','severity'],['assignedTo','assigned_to'],['locationDescription','location_description'],['relatedInspectionId','related_inspection_id']] as const) {
      if (!(field in body)) continue; params.push(body[field] === '' ? null : body[field]); updates.push(`${column}=$${params.length}`);
    }
    if (body.lat !== undefined || body.lng !== undefined) {
      if (body.lat === undefined || body.lng === undefined) badRequest('Both lat and lng are required.');
      for (const [column,value] of [['latitude',Number(body.lat)],['longitude',Number(body.lng)],['geo_source','device_gps'],['geo_accuracy_m',body.accuracyM === undefined ? null : Number(body.accuracyM)],['geo_captured_at',new Date()]]) { params.push(value); updates.push(`${column}=$${params.length}`); }
    }
    if (!updates.length) return serializeSafety(existing);
    params.push(recordId);
    const updated = await db.transaction(async (client) => {
      const result = await client.query(`UPDATE safety_records SET ${updates.join(',')}, updated_at=now() WHERE id=$${params.length} RETURNING *`, params);
      await appendAudit(client,{actor:actor(context),action:'update',entityType:'safety_record',entityId:recordId,entityLabel:existing.code,previousValue:existing,updatedValue:result.rows[0],mineIds:[existing.mine_id],requestId:context.requestId});
      return result.rows[0];
    });
    return serializeSafety(await safetyRow(context, updated.id));
  });

  app.post('/api/v1/safety/observations/:id/transition', async (req) => {
    const context = auth(req); const recordId = (req.params as { id: string }).id; const existing = await safetyRow(context, recordId);
    if (existing.status === 'closed') context.require('safety.close'); else context.require('safety.investigate');
    const body = req.body as Record<string, unknown>; const to = requireEnum(body.to, SAFETY_STATUSES, 'to');
    if (!(SAFETY_TRANSITIONS[existing.status] ?? []).includes(to)) conflict(`Cannot move a safety record from ${existing.status} to ${to}.`, 'invalid_transition');
    const comment = optionalString(body.comment, 'comment', 2000);
    const updated = await db.transaction(async (client) => {
      const result = await client.query(`UPDATE safety_records SET status=$2, updated_at=now(),
        investigation_opened_at=CASE WHEN $2='under_investigation' AND investigation_opened_at IS NULL THEN now() ELSE investigation_opened_at END,
        investigation_closed_at=CASE WHEN $2 IN ('resolved','closed') THEN now() ELSE investigation_closed_at END
        WHERE id=$1 RETURNING *`, [recordId,to]);
      await client.query('INSERT INTO safety_status_history (id,safety_record_id,from_status,to_status,actor_id,comment) VALUES ($1,$2,$3,$4,$5,$6)',[id('ssh'),recordId,existing.status,to,context.user.id,comment ?? null]);
      await appendAudit(client,{actor:actor(context),action:'status_change',entityType:'safety_record',entityId:recordId,entityLabel:existing.code,previousValue:{status:existing.status},updatedValue:{status:to},reason:comment ?? null,mineIds:[existing.mine_id],requestId:context.requestId});
      return result.rows[0];
    });
    return serializeSafety(await safetyRow(context, updated.id));
  });

  const incidentSelect = `SELECT i.*, m.name AS mine_name, au.name AS assignee_name,
    COALESCE((SELECT array_agg(d.document_id) FROM incident_documents d WHERE d.incident_id=i.id), '{}') AS evidence_document_ids,
    COALESCE((SELECT array_agg(a.corrective_action_id) FROM incident_corrective_actions a WHERE a.incident_id=i.id), '{}') AS corrective_action_ids
    FROM incidents i JOIN mines m ON m.id=i.mine_id LEFT JOIN users au ON au.id=i.assigned_to`;
  async function incidentRow(context: AuthContext, incidentId: string) {
    const row = await db.one(`${incidentSelect} WHERE i.id=$1`, [incidentId]); if (!row) notFound('Incident');
    if (!context.canAccessMine(row.mine_id)) forbidden('That incident is outside your assigned scope.');
    row.status_history = (await db.many('SELECT * FROM incident_status_history WHERE incident_id=$1 ORDER BY created_at',[incidentId])).map((entry:any)=>({id:entry.id,at:new Date(entry.created_at).toISOString(),actorId:entry.actor_id,actorName:entry.actor_name ?? '',fromStatus:entry.from_status,toStatus:entry.to_status,comment:entry.comment}));
    return row;
  }

  app.get('/api/v1/safety/incidents', async (req) => {
    const context = auth(req); context.require('safety.view');
    const options = listOptions(req.query as Query, 'occurred_at'); const params: unknown[] = []; const conditions: string[] = [addScope(context, params, 'i.mine_id', 'm.subsidiary_id')];
    const search = options.search ? `%${options.search}%` : null; if (search) { params.push(search); conditions.push(`(i.code ILIKE $${params.length} OR i.title ILIKE $${params.length} OR i.description ILIKE $${params.length})`); }
    for (const [field,column] of [['status','i.status'],['severity','i.severity'],['mineId','i.mine_id']] as const) { const value=queryValue(req.query as Query,field); if(value){params.push(value);conditions.push(`${column}=$${params.length}`);} }
    const where=`WHERE ${conditions.join(' AND ')}`;
    const total=await db.one<{total:number}>(`SELECT count(*)::int AS total FROM incidents i JOIN mines m ON m.id=i.mine_id ${where}`,params);
    const result=await db.query(`${incidentSelect} ${where} ORDER BY i.occurred_at ${options.sortDir} LIMIT $${params.length+1} OFFSET $${params.length+2}`,[...params,options.pageSize,options.offset]);
    return {items:result.rows.map(serializeIncident),meta:meta(total?.total??0,options)};
  });

  app.get('/api/v1/safety/incidents/:id', async (req) => { const context = auth(req); context.require('safety.view'); return serializeIncident(await incidentRow(context,(req.params as {id:string}).id)); });

  app.post('/api/v1/safety/incidents', async (req) => {
    const context=auth(req); context.require('safety.create');
    const body=req.body as Record<string,unknown>;
    const mineId=requireString(body.mineId,'mineId',80); await ensureMine(db,context,mineId);
    const title=requireString(body.title,'title',240); const description=requireString(body.description,'description',8000);
    const severity=requireEnum(body.severity,PRIORITIES,'severity');
    const occurredAt=optionalDate(body.occurredAt,'occurredAt'); if(!occurredAt) badRequest('occurredAt is required.');
    const injuries=Math.trunc(requireNumber(body.injuriesReported ?? 0,'injuriesReported',0));
    const location=locationColumns(body); const incidentId=id('inc');
    const created=await db.transaction(async(client)=>{
      const code=await nextCode(client,'incidents','code','INC');
      const columns=['id','code','mine_id','title','description','severity','occurred_at','reported_at','reported_by','status','injuries_reported','downtime_hours','assigned_to','related_inspection_id','location_description',...location.columns];
      const values=[incidentId,code,mineId,title,description,severity,occurredAt,new Date(),context.user.id,'open',injuries,body.downtimeHours===undefined?null:Number(body.downtimeHours),optionalString(body.assignedTo,'assignedTo')??null,optionalString(body.relatedInspectionId,'relatedInspectionId')??null,optionalString(body.locationDescription,'locationDescription')??null,...location.values];
      const result=await client.query(`INSERT INTO incidents (${columns.join(',')}) VALUES (${columns.map((_,i)=>`$${i+1}`).join(',')}) RETURNING *`,values);
      await appendAudit(client,{actor:actor(context),action:'create',entityType:'incident',entityId:incidentId,entityLabel:code,updatedValue:result.rows[0],mineIds:[mineId],requestId:context.requestId});
      return result.rows[0];
    });
    return serializeIncident(await incidentRow(context,created.id));
  });

  app.post('/api/v1/safety/incidents/:id/transition', async (req) => {
    const context=auth(req); const incidentId=(req.params as {id:string}).id; const existing=await incidentRow(context,incidentId);
    if(existing.status==='closed') context.require('safety.close'); else context.require('safety.investigate');
    const body=req.body as Record<string,unknown>; const to=requireEnum(body.to,SAFETY_STATUSES,'to');
    if(!(SAFETY_TRANSITIONS[existing.status]??[]).includes(to)) conflict(`Cannot move an incident from ${existing.status} to ${to}.`,'invalid_transition');
    const comment=optionalString(body.comment,'comment',2000);
    const updated=await db.transaction(async(client)=>{
      const result=await client.query('UPDATE incidents SET status=$2, updated_at=now(), investigation_summary=COALESCE($3, investigation_summary) WHERE id=$1 RETURNING *',[incidentId,to,comment??null]);
      await client.query('INSERT INTO incident_status_history (id,incident_id,from_status,to_status,actor_id,actor_name,comment) VALUES ($1,$2,$3,$4,$5,$6,$7)',[id('ich'),incidentId,existing.status,to,context.user.id,context.user.name,comment??null]);
      await appendAudit(client,{actor:actor(context),action:'status_change',entityType:'incident',entityId:incidentId,entityLabel:existing.code,previousValue:{status:existing.status},updatedValue:{status:to},reason:comment??null,mineIds:[existing.mine_id],requestId:context.requestId});
      return result.rows[0];
    });
    return serializeIncident(await incidentRow(context,updated.id));
  });

  app.get('/api/v1/safety/near-misses', async (req) => {
    const context=auth(req); context.require('safety.view'); const options=listOptions(req.query as Query,'reported_at');
    const params:unknown[]=[]; const conditions:string[]=[addScope(context,params,'n.mine_id','m.subsidiary_id')];
    const search=options.search?`%${options.search}%`:null; if(search){params.push(search);conditions.push(`(n.code ILIKE $${params.length} OR n.title ILIKE $${params.length} OR n.description ILIKE $${params.length})`);}
    const mineId=queryValue(req.query as Query,'mineId'); if(mineId){params.push(mineId);conditions.push(`n.mine_id=$${params.length}`);}
    const where=`WHERE ${conditions.join(' AND ')}`;
    const total=await db.one<{total:number}>(`SELECT count(*)::int AS total FROM near_misses n JOIN mines m ON m.id=n.mine_id ${where}`,params);
    const result=await db.query(`SELECT n.*,m.name AS mine_name,u.name AS reported_by_name FROM near_misses n JOIN mines m ON m.id=n.mine_id JOIN users u ON u.id=n.reported_by ${where} ORDER BY n.reported_at ${options.sortDir} LIMIT $${params.length+1} OFFSET $${params.length+2}`,[...params,options.pageSize,options.offset]);
    return {items:result.rows.map(serializeNearMiss),meta:meta(total?.total??0,options)};
  });

  /* ------------------------------------------------------------ environment */
  const measurementSelect=`SELECT e.*,m.name AS mine_name,COALESCE((SELECT array_agg(d.document_id) FROM environmental_measurement_documents d WHERE d.measurement_id=e.id),'{}') AS evidence_document_ids FROM environmental_measurements e JOIN mines m ON m.id=e.mine_id`;
  async function measurementRow(context:AuthContext,measurementId:string){const row=await db.one(`${measurementSelect} WHERE e.id=$1`,[measurementId]);if(!row)notFound('Measurement');if(!context.canAccessMine(row.mine_id))forbidden('That measurement is outside your assigned scope.');return row;}

  app.get('/api/v1/environment/indicators', async (req) => { auth(req).require('environment.view'); return [...INDICATORS]; });

  app.get('/api/v1/environment/measurements', async (req) => {
    const context=auth(req); context.require('environment.view'); const options=listOptions(req.query as Query,'measured_at');
    const params:unknown[]=[]; const conditions:string[]=[addScope(context,params,'e.mine_id','m.subsidiary_id')];
    const search=options.search?`%${options.search}%`:null; if(search){params.push(search);conditions.push(`(e.id ILIKE $${params.length} OR e.sample_id ILIKE $${params.length} OR e.location_description ILIKE $${params.length})`);}
    for(const [field,column] of [['indicator','e.indicator'],['status','e.status'],['mineId','e.mine_id'],['inspectionId','e.inspection_id']] as const){const value=queryValue(req.query as Query,field);if(value){params.push(value);conditions.push(`${column}=$${params.length}`);}}
    const stale=boolOrUndefined(queryValue(req.query as Query,'stale')); if(stale!==undefined){params.push(stale);conditions.push(`e.stale=$${params.length}`);}
    const from=queryValue(req.query as Query,'dateFrom'); if(from){params.push(from);conditions.push(`e.measured_at>=$${params.length}`);}
    const to=queryValue(req.query as Query,'dateTo'); if(to){params.push(to);conditions.push(`e.measured_at<=$${params.length}`);}
    const where=`WHERE ${conditions.join(' AND ')}`;
    const total=await db.one<{total:number}>(`SELECT count(*)::int AS total FROM environmental_measurements e JOIN mines m ON m.id=e.mine_id ${where}`,params);
    const result=await db.query(`${measurementSelect} ${where} ORDER BY ${sortColumn(options.sortBy,{measuredAt:'e.measured_at',value:'e.value',indicator:'e.indicator'},'e.measured_at')} ${options.sortDir} LIMIT $${params.length+1} OFFSET $${params.length+2}`,[...params,options.pageSize,options.offset]);
    return {items:result.rows.map(serializeMeasurement),meta:meta(total?.total??0,options)};
  });

  app.get('/api/v1/environment/measurements/:id', async (req) => { const context = auth(req); context.require('environment.view'); return serializeMeasurement(await measurementRow(context,(req.params as {id:string}).id)); });

  app.get('/api/v1/environment/thresholds', async (req) => {
    auth(req).require('environment.view');
    const result=await db.query('SELECT * FROM environmental_thresholds WHERE effective_to IS NULL ORDER BY indicator');
    const setting=await db.one<{value:any}>("SELECT value FROM system_settings WHERE key='environmental_threshold_provenance'");
    return {
      thresholds: result.rows.map((row:any)=>({indicator:row.indicator,unit:row.unit,limit:numberOrUndefined(row.limit_value),comparison:row.comparison,label:row.label,configuredBy:row.configured_by})),
      provenance: setting?.value?.provenance ?? 'Not recorded',
      ...(setting?.value?.lastConfiguredAt ? { lastConfiguredAt: setting.value.lastConfiguredAt } : {}),
    };
  });

  app.post('/api/v1/environment/measurements', async (req) => {
    const context=auth(req); context.require('environment.create');
    const body=req.body as Record<string,unknown>;
    const mineId=requireString(body.mineId,'mineId',80); await ensureMine(db,context,mineId);
    const indicator=requireEnum(body.indicator,INDICATORS,'indicator');
    const value=requireNumber(body.value,'value'); const unit=requireString(body.unit,'unit',40);
    const measuredAt=optionalDate(body.measuredAt,'measuredAt'); if(!measuredAt) badRequest('measuredAt is required.');
    const source=requireEnum(body.source,['sensor','manual','imported','sample','ai_estimate'] as const,'source');
    const thresholdId=optionalString(body.thresholdId,'thresholdId');
    const measurementId=id('env'); const location=locationColumns(body);
    const created=await db.transaction(async(client)=>{
      let threshold:any=null;
      if(thresholdId){threshold=(await client.query('SELECT * FROM environmental_thresholds WHERE id=$1',[thresholdId])).rows[0];if(!threshold)badRequest('thresholdId does not identify a threshold.');}
      else threshold=(await client.query('SELECT * FROM environmental_thresholds WHERE indicator=$1 AND effective_to IS NULL ORDER BY effective_from DESC NULLS LAST LIMIT 1',[indicator])).rows[0];
      let status='unknown';
      if(threshold?.limit_value!==null && threshold?.limit_value!==undefined){const limit=Number(threshold.limit_value);status=threshold.comparison==='above'?(value>limit?'exceeds_limit':'within_limit'):(value<limit?'exceeds_limit':'within_limit');}
      const columns=['id','mine_id','indicator','value','unit','measured_at','source','threshold_id','threshold_version','status','sample_id','inspection_id','location_description','created_by',...location.columns];
      const values=[measurementId,mineId,indicator,value,unit,measuredAt,source,threshold?.id??null,threshold?.version??null,status,optionalString(body.sampleId,'sampleId')??null,optionalString(body.inspectionId,'inspectionId')??null,optionalString(body.locationDescription,'locationDescription')??null,context.user.id,...location.values];
      const result=await client.query(`INSERT INTO environmental_measurements (${columns.join(',')}) VALUES (${columns.map((_,i)=>`$${i+1}`).join(',')}) RETURNING *`,values);
      if(status==='exceeds_limit'&&threshold){const ratio=threshold.comparison==='above'?value/Number(threshold.limit_value):Number(threshold.limit_value)/Math.max(value,0.0001);const severity=ratio>=1.5?'critical':ratio>=1.2?'high':'medium';await client.query('INSERT INTO environmental_alerts (id,measurement_id,mine_id,indicator,severity,detail) VALUES ($1,$2,$3,$4,$5,$6)',[id('alert'),measurementId,mineId,indicator,severity,`Reading ${value} ${unit} ${threshold.comparison} configured limit ${threshold.limit_value} ${unit}.`]);}
      await appendAudit(client,{actor:actor(context),action:'create',entityType:'environmental_measurement',entityId:measurementId,entityLabel:`${indicator} ${value} ${unit}`,updatedValue:result.rows[0],mineIds:[mineId],requestId:context.requestId});
      return result.rows[0];
    });
    return serializeMeasurement(await measurementRow(context,created.id));
  });

  /* ------------------------------------------------------------- production */
  const productionSelect=`SELECT p.*,m.name AS mine_name,COALESCE((SELECT array_agg(d.document_id) FROM production_record_documents d WHERE d.production_record_id=p.id),'{}') AS source_document_ids,COALESCE((SELECT array_agg(a.id) FROM production_anomalies a WHERE a.record_id=p.id),'{}') AS anomaly_ids FROM production_records p JOIN mines m ON m.id=p.mine_id`;
  async function productionRow(context:AuthContext,recordId:string){const row=await db.one(`${productionSelect} WHERE p.id=$1`,[recordId]);if(!row)notFound('Production record');if(!context.canAccessMine(row.mine_id))forbidden('That record is outside your assigned scope.');return row;}

  app.get('/api/v1/production/records', async (req) => {
    const context=auth(req); context.require('production.view'); const options=listOptions(req.query as Query,'date');
    const params:unknown[]=[]; const conditions:string[]=[addScope(context,params,'p.mine_id','m.subsidiary_id')];
    for(const [field,column] of [['mineId','p.mine_id'],['shift','p.shift'],['valueKind','p.value_kind']] as const){const value=queryValue(req.query as Query,field);if(value){params.push(value);conditions.push(`${column}=$${params.length}`);}}
    const from=queryValue(req.query as Query,'dateFrom');if(from){params.push(from);conditions.push(`p.date>=$${params.length}`);}
    const to=queryValue(req.query as Query,'dateTo');if(to){params.push(to);conditions.push(`p.date<=$${params.length}`);}
    const where=`WHERE ${conditions.join(' AND ')}`;
    const total=await db.one<{total:number}>(`SELECT count(*)::int AS total FROM production_records p JOIN mines m ON m.id=p.mine_id ${where}`,params);
    const result=await db.query(`${productionSelect} ${where} ORDER BY p.date ${options.sortDir}, p.shift LIMIT $${params.length+1} OFFSET $${params.length+2}`,[...params,options.pageSize,options.offset]);
    return {items:result.rows.map(serializeProduction),meta:meta(total?.total??0,options)};
  });

  app.get('/api/v1/production/records/:id', async (req)=>{ const context = auth(req); context.require('production.view'); return serializeProduction(await productionRow(context,(req.params as {id:string}).id)); });

  app.post('/api/v1/production/records', async (req) => {
    const context=auth(req); context.require('production.create');
    const body=req.body as Record<string,unknown>;
    const mineId=requireString(body.mineId,'mineId',80); await ensureMine(db,context,mineId);
    const date=optionalDate(body.date,'date'); if(!date)badRequest('date is required.');
    const shift=requireEnum(body.shift,SHIFTS,'shift');
    const productionTonnes=requireNumber(body.productionTonnes,'productionTonnes',0);
    const targetTonnes=body.targetTonnes===undefined?undefined:requireNumber(body.targetTonnes,'targetTonnes',0);
    const valueKind=requireEnum(body.valueKind,['reported','approved','estimated'] as const,'valueKind');
    const estimateReason=optionalString(body.estimateReason,'estimateReason',1000);
    if(valueKind==='estimated'&&!estimateReason)badRequest('estimateReason is required for estimated values.');
    const recordId=id('prod');
    try {
      const created=await db.transaction(async(client)=>{
        const result=await client.query(`INSERT INTO production_records (id,mine_id,date,shift,production_tonnes,target_tonnes,value_kind,estimate_reason,shift_supervisor_id,notes,created_by) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
          [recordId,mineId,date,shift,productionTonnes,targetTonnes??null,valueKind,estimateReason??null,optionalString(body.shiftSupervisorId,'shiftSupervisorId')??context.user.id,optionalString(body.notes,'notes')??null,context.user.id]);
        await detectAnomaly(client,result.rows[0]);
        await appendAudit(client,{actor:actor(context),action:'create',entityType:'production_record',entityId:recordId,entityLabel:`${date} ${shift}`,updatedValue:result.rows[0],mineIds:[mineId],requestId:context.requestId});
        return result.rows[0];
      });
      return serializeProduction(await productionRow(context,created.id));
    } catch(error){ if((error as {code?:string}).code==='23505')conflict('A production record already exists for that mine, date and shift.'); throw error; }
  });

  app.post('/api/v1/production/records/:id/approve', async (req) => {
    const context=auth(req); context.require('production.approve'); const recordId=(req.params as {id:string}).id; const existing=await productionRow(context,recordId);
    if(existing.value_kind==='approved') conflict('That record is already approved.','invalid_transition');
    // Separation of duties: creator/shift supervisor cannot approve own record
    if (existing.created_by === context.user.id || existing.shift_supervisor_id === context.user.id) {
      throw new AppError(403, 'forbidden', 'Separation of duties requires a different person to approve this production record.');
    }
    const updated=await db.transaction(async(client)=>{
      const result=await client.query("UPDATE production_records SET value_kind='approved',approved_by=$2,approved_at=now(),updated_at=now() WHERE id=$1 RETURNING *",[recordId,context.user.id]);
      await appendAudit(client,{actor:actor(context),action:'verify',entityType:'production_record',entityId:recordId,entityLabel:`${existing.date} ${existing.shift}`,previousValue:{valueKind:existing.value_kind},updatedValue:{valueKind:'approved'},mineIds:[existing.mine_id],requestId:context.requestId});
      return result.rows[0];
    });
    return serializeProduction(await productionRow(context,updated.id));
  });

  app.get('/api/v1/production/anomalies', async (req) => {
    const context=auth(req); context.require('production.view'); const options=listOptions(req.query as Query,'detected_at');
    const params:unknown[]=[]; const conditions:string[]=[addScope(context,params,'a.mine_id','m.subsidiary_id')];
    const mineId=queryValue(req.query as Query,'mineId');if(mineId){params.push(mineId);conditions.push(`a.mine_id=$${params.length}`);}
    const reviewStatus=queryValue(req.query as Query,'reviewStatus');if(reviewStatus){params.push(reviewStatus);conditions.push(`a.review_status=$${params.length}`);}
    const where=`WHERE ${conditions.join(' AND ')}`;
    const total=await db.one<{total:number}>(`SELECT count(*)::int AS total FROM production_anomalies a JOIN mines m ON m.id=a.mine_id ${where}`,params);
    const result=await db.query(`SELECT a.*,m.name AS mine_name FROM production_anomalies a JOIN mines m ON m.id=a.mine_id ${where} ORDER BY a.detected_at DESC LIMIT $${params.length+1} OFFSET $${params.length+2}`,[...params,options.pageSize,options.offset]);
    return {items:result.rows.map((row:any)=>({id:row.id,mineId:row.mine_id,mineName:row.mine_name,date:row.date,metric:row.metric,direction:row.direction,zScore:numberOrUndefined(row.z_score),severity:row.severity,explanation:row.explanation,detectedAt:new Date(row.detected_at).toISOString(),detector:row.detector,reviewStatus:row.review_status})),meta:meta(total?.total??0,options)};
  });

  app.get('/api/v1/production/completeness', async (req) => {
    const context=auth(req); context.require('production.view');
    const from=queryValue(req.query as Query,'dateFrom')??new Date(Date.now()-29*86400000).toISOString().slice(0,10);
    const to=queryValue(req.query as Query,'dateTo')??today();
    const params:unknown[]=[from,to]; const conditions=[addScope(context,params,'m.id','m.subsidiary_id')];
    const result=await db.query(`SELECT m.id AS mine_id, m.name AS mine_name,
      (($2::date - $1::date + 1) * 3)::int AS expected_records,
      count(p.id)::int AS reported_records,
      GREATEST((($2::date - $1::date + 1) * 3) - count(p.id),0)::int AS missing_shifts
      FROM mines m LEFT JOIN production_records p ON p.mine_id=m.id AND p.date BETWEEN $1 AND $2
      WHERE ${conditions.join(' AND ')}
      GROUP BY m.id,m.name ORDER BY m.name`,params);
    return result.rows.map((row:any)=>({mineId:row.mine_id,mineName:row.mine_name,expectedRecords:row.expected_records,reportedRecords:row.reported_records,missingShifts:row.missing_shifts,completenessPercent:row.expected_records?Math.round((row.reported_records/row.expected_records)*100):0}));
  });

  /* -------------------------------------------------------------- contractors */
  const contractorSelect=`SELECT c.*,
    COALESCE((SELECT array_agg(cm.mine_id) FROM contractor_mines cm WHERE cm.contractor_id=c.id),'{}') AS mine_ids,
    (SELECT string_agg(m.name, ', ') FROM contractor_mines cm JOIN mines m ON m.id=cm.mine_id WHERE cm.contractor_id=c.id) AS mine_names,
    COALESCE((SELECT array_agg(cd.document_id) FROM contractor_documents cd WHERE cd.contractor_id=c.id AND cd.required),'{}') AS required_document_ids,
    COALESCE((SELECT array_agg(cd.document_id) FROM contractor_documents cd WHERE cd.contractor_id=c.id AND cd.verified),'{}') AS verified_document_ids,
    COALESCE((SELECT array_agg(csr.safety_record_id) FROM contractor_safety_records csr WHERE csr.contractor_id=c.id),'{}') AS safety_record_ids,
    COALESCE((SELECT array_agg(ci.inspection_id) FROM contractor_inspections ci WHERE ci.contractor_id=c.id),'{}') AS inspection_ids,
    COALESCE((SELECT array_agg(cca.corrective_action_id) FROM contractor_corrective_actions cca WHERE cca.contractor_id=c.id),'{}') AS open_corrective_action_ids
    FROM contractors c`;
  async function contractorRow(context:AuthContext,contractorId:string){const row=await db.one(`${contractorSelect} WHERE c.id=$1`,[contractorId]);if(!row)notFound('Contractor');if((row.mine_ids??[]).length&&!row.mine_ids.some((mineId:string)=>context.canAccessMine(mineId)))forbidden('That contractor is outside your assigned scope.');return row;}

  app.get('/api/v1/contractors', async (req) => {
    const context=auth(req); context.require('contractor.view'); const options=listOptions(req.query as Query,'name');
    const params:unknown[]=[]; const conditions:string[]=[];
    const search=options.search?`%${options.search}%`:null;if(search){params.push(search);conditions.push(`(c.name ILIKE $${params.length} OR c.code ILIKE $${params.length} OR c.registered_address ILIKE $${params.length})`);}
    for(const [field,column] of [['type','c.type'],['complianceStatus','c.compliance_status']] as const){const value=queryValue(req.query as Query,field);if(value){params.push(value);conditions.push(`${column}=$${params.length}`);}}
    const mineId=queryValue(req.query as Query,'mineId');if(mineId){params.push(mineId);conditions.push(`EXISTS (SELECT 1 FROM contractor_mines x WHERE x.contractor_id=c.id AND x.mine_id=$${params.length})`);}
    const scope=addScope(context,params,'x.mine_id','mx.subsidiary_id');
    if(scope!=='TRUE')conditions.push(`EXISTS (SELECT 1 FROM contractor_mines x JOIN mines mx ON mx.id=x.mine_id WHERE x.contractor_id=c.id AND ${scope})`);
    const where=conditions.length?`WHERE ${conditions.join(' AND ')}`:'';
    const total=await db.one<{total:number}>(`SELECT count(*)::int AS total FROM contractors c ${where}`,params);
    const result=await db.query(`${contractorSelect} ${where} ORDER BY ${sortColumn(options.sortBy,{name:'c.name',complianceStatus:'c.compliance_status',registeredOn:'c.registered_on'},'c.name')} ${options.sortDir} LIMIT $${params.length+1} OFFSET $${params.length+2}`,[...params,options.pageSize,options.offset]);
    return {items:result.rows.map(serializeContractor),meta:meta(total?.total??0,options)};
  });

  app.get('/api/v1/contractors/:id', async (req)=>{ const context = auth(req); context.require('contractor.view'); return serializeContractor(await contractorRow(context,(req.params as {id:string}).id)); });

  app.post('/api/v1/contractors', async (req) => {
    const context=auth(req); context.require('contractor.create'); const body=req.body as Record<string,unknown>;
    const mineIds=requireArray(body.mineIds,'mineIds'); if(!mineIds.length)badRequest('At least one mine is required.');
    for(const mineId of mineIds)await ensureMine(db,context,mineId);
    const contractorId=id('con'); const name=requireString(body.name,'name',240);
    const created=await db.transaction(async(client)=>{
      const code=optionalString(body.code,'code',40)?.toUpperCase()??await nextCode(client,'contractors','code','CON');
      const result=await client.query(`INSERT INTO contractors (id,code,name,type,contact_person,contact_email,contact_phone,registered_address,compliance_status,registered_on,pan_number,gst_number) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'unassessed',$9,$10,$11) RETURNING *`,
        [contractorId,code,name,requireEnum(body.type,['drilling','blasting','hauling','maintenance','civil_works','security','transport'] as const,'type'),requireString(body.contactPerson,'contactPerson',160),requireString(body.contactEmail,'contactEmail',200),requireString(body.contactPhone,'contactPhone',40),requireString(body.registeredAddress,'registeredAddress',500),optionalDate(body.registeredOn,'registeredOn')??today(),optionalString(body.panNumber,'panNumber')??null,optionalString(body.gstNumber,'gstNumber')??null]);
      for(const mineId of mineIds)await client.query('INSERT INTO contractor_mines (contractor_id,mine_id) VALUES ($1,$2)',[contractorId,mineId]);
      await appendAudit(client,{actor:actor(context),action:'create',entityType:'contractor',entityId:contractorId,entityLabel:name,updatedValue:result.rows[0],mineIds,requestId:context.requestId});
      return result.rows[0];
    }).catch((error)=>{if((error as {code?:string}).code==='23505')conflict('A contractor with that code already exists.');throw error;});
    return serializeContractor(await contractorRow(context,created.id));
  });

  app.patch('/api/v1/contractors/:id', async (req) => {
    const context=auth(req); context.require('contractor.edit'); const contractorId=(req.params as {id:string}).id; const existing=await contractorRow(context,contractorId);
    const body=req.body as Record<string,unknown>; const params:unknown[]=[]; const updates:string[]=[];
    for(const [field,column] of [['name','name'],['type','type'],['contactPerson','contact_person'],['contactEmail','contact_email'],['contactPhone','contact_phone'],['registeredAddress','registered_address'],['registeredOn','registered_on'],['panNumber','pan_number'],['gstNumber','gst_number'],['complianceStatus','compliance_status']] as const){if(!(field in body))continue;params.push(body[field]===''?null:body[field]);updates.push(`${column}=$${params.length}`);}
    if(body.mineIds!==undefined){const mineIds=requireArray(body.mineIds,'mineIds');if(!mineIds.length)badRequest('At least one mine is required.');for(const mineId of mineIds)await ensureMine(db,context,mineId);}
    if(!updates.length&&body.mineIds===undefined)return serializeContractor(existing);
    params.push(contractorId);
    const updated=await db.transaction(async(client)=>{
      const result=updates.length?await client.query(`UPDATE contractors SET ${updates.join(',')},updated_at=now() WHERE id=$${params.length} RETURNING *`,params):{rows:[existing]};
      if(body.mineIds!==undefined){await client.query('DELETE FROM contractor_mines WHERE contractor_id=$1',[contractorId]);for(const mineId of requireArray(body.mineIds,'mineIds'))await client.query('INSERT INTO contractor_mines (contractor_id,mine_id) VALUES ($1,$2)',[contractorId,mineId]);}
      await appendAudit(client,{actor:actor(context),action:'update',entityType:'contractor',entityId:contractorId,entityLabel:existing.name,previousValue:existing,updatedValue:result.rows[0],mineIds:existing.mine_ids,requestId:context.requestId});
      return result.rows[0];
    });
    return serializeContractor(await contractorRow(context,updated.id));
  });

  app.post('/api/v1/contractors/:id/archive', async (req) => {
    const context=auth(req); context.require('contractor.archive'); const contractorId=(req.params as {id:string}).id; const existing=await contractorRow(context,contractorId);
    const reason=requireString((req.body as Record<string,unknown>).reason,'reason',1000);
    const updated=await db.transaction(async(client)=>{const result=await client.query("UPDATE contractors SET compliance_status='unassessed',archived_at=now(),archive_reason=$2,updated_at=now() WHERE id=$1 RETURNING *",[contractorId,reason]);await appendAudit(client,{actor:actor(context),action:'archive',entityType:'contractor',entityId:contractorId,entityLabel:existing.name,previousValue:existing,updatedValue:result.rows[0],reason,mineIds:existing.mine_ids,requestId:context.requestId});return result.rows[0];});
    return serializeContractor(await contractorRow(context,updated.id));
  });

  app.get('/api/v1/contracts', async (req) => {
    const context=auth(req); context.require('contractor.view'); const options=listOptions(req.query as Query,'end_date');
    const params:unknown[]=[];const conditions:string[]=[addScope(context,params,'k.mine_id','m.subsidiary_id')];
    for(const [field,column] of [['contractorId','k.contractor_id'],['mineId','k.mine_id'],['status','k.status']] as const){const value=queryValue(req.query as Query,field);if(value){params.push(value);conditions.push(`${column}=$${params.length}`);}}
    const search=options.search?`%${options.search}%`:null;if(search){params.push(search);conditions.push(`(k.code ILIKE $${params.length} OR k.title ILIKE $${params.length} OR c.name ILIKE $${params.length})`);}
    const where=`WHERE ${conditions.join(' AND ')}`;
    const total=await db.one<{total:number}>(`SELECT count(*)::int AS total FROM contracts k JOIN mines m ON m.id=k.mine_id JOIN contractors c ON c.id=k.contractor_id ${where}`,params);
    const result=await db.query(`SELECT k.*,c.name AS contractor_name,m.name AS mine_name,COALESCE((SELECT array_agg(cd.document_id) FROM contract_documents cd WHERE cd.contract_id=k.id),'{}') AS document_ids,(k.end_date-CURRENT_DATE) AS days_to_expiry FROM contracts k JOIN contractors c ON c.id=k.contractor_id JOIN mines m ON m.id=k.mine_id ${where} ORDER BY k.end_date LIMIT $${params.length+1} OFFSET $${params.length+2}`,[...params,options.pageSize,options.offset]);
    return {items:result.rows.map(serializeContract),meta:meta(total?.total??0,options)};
  });

  /* --------------------------------------------------------------- workforce */
  async function attendanceRow(context:AuthContext,attendanceId:string){const row=await db.one(`SELECT a.*,w.worker_ref,w.display_name,m.name AS mine_name,c.name AS contractor_name,COALESCE((SELECT array_agg(d.document_id) FROM attendance_documents d WHERE d.attendance_id=a.id),'{}') AS evidence_document_ids FROM attendance_records a JOIN workforce_members w ON w.id=a.worker_id JOIN mines m ON m.id=a.mine_id LEFT JOIN contractors c ON c.id=a.contractor_id WHERE a.id=$1`,[attendanceId]);if(!row)notFound('Attendance record');if(!context.canAccessMine(row.mine_id))forbidden('That attendance record is outside your assigned scope.');const corrections=await db.many('SELECT * FROM attendance_corrections WHERE attendance_id=$1 ORDER BY at DESC',[attendanceId]);row.corrections=corrections.map(serializeCorrection);return row;}

  app.get('/api/v1/workforce/attendance', async (req) => {
    const context=auth(req); context.require('workforce.view'); const options=listOptions(req.query as Query,'date');
    const params:unknown[]=[];const conditions:string[]=[addScope(context,params,'a.mine_id','m.subsidiary_id')];
    for(const [field,column] of [['mineId','a.mine_id'],['contractorId','a.contractor_id'],['shift','a.shift'],['status','a.status']] as const){const value=queryValue(req.query as Query,field);if(value){params.push(value);conditions.push(`${column}=$${params.length}`);}}
    const date=queryValue(req.query as Query,'date');if(date){params.push(date);conditions.push(`a.date=$${params.length}`);}
    const search=options.search?`%${options.search}%`:null;if(search){params.push(search);conditions.push(`(w.worker_ref ILIKE $${params.length} OR w.display_name ILIKE $${params.length})`);}
    const where=`WHERE ${conditions.join(' AND ')}`;
    const total=await db.one<{total:number}>(`SELECT count(*)::int AS total FROM attendance_records a JOIN workforce_members w ON w.id=a.worker_id JOIN mines m ON m.id=a.mine_id ${where}`,params);
    const result=await db.query(`SELECT a.*,w.worker_ref,w.display_name,m.name AS mine_name,c.name AS contractor_name,COALESCE((SELECT array_agg(d.document_id) FROM attendance_documents d WHERE d.attendance_id=a.id),'{}') AS evidence_document_ids FROM attendance_records a JOIN workforce_members w ON w.id=a.worker_id JOIN mines m ON m.id=a.mine_id LEFT JOIN contractors c ON c.id=a.contractor_id ${where} ORDER BY a.date DESC,a.shift LIMIT $${params.length+1} OFFSET $${params.length+2}`,[...params,options.pageSize,options.offset]);
    const items=[];for(const row of result.rows)items.push(serializeAttendance(await attendanceRow(context,row.id)));
    return {items,meta:meta(total?.total??0,options)};
  });

  app.post('/api/v1/workforce/attendance/:id/corrections', async (req) => {
    const context=auth(req); context.require('workforce.view');const attendanceId=(req.params as {id:string}).id;const existing=await attendanceRow(context,attendanceId);
    const body=req.body as Record<string,unknown>;const correctedStatus=requireEnum(body.correctedStatus,ATTENDANCE_STATUSES,'correctedStatus');
    if(correctedStatus===existing.status)badRequest('The corrected status must differ from the current status.');
    const reason=requireString(body.reason,'reason',1000);
    const pending=await db.one("SELECT id FROM attendance_corrections WHERE attendance_id=$1 AND status='pending'",[attendanceId]);if(pending)conflict('This attendance record already has a pending correction.');
    await db.transaction(async(client)=>{
      const correctionId=id('cor');
      await client.query("INSERT INTO attendance_corrections (id,attendance_id,original_status,corrected_status,reason,requested_by,status) VALUES ($1,$2,$3,$4,$5,$6,'pending')",[correctionId,attendanceId,existing.status,correctedStatus,reason,context.user.id]);
      await appendAudit(client,{actor:actor(context),action:'update',entityType:'attendance',entityId:attendanceId,entityLabel:existing.worker_ref,updatedValue:{correctionId,from:existing.status,to:correctedStatus},reason,mineIds:[existing.mine_id],requestId:context.requestId});
    });
    return serializeAttendance(await attendanceRow(context,attendanceId));
  });

  app.post('/api/v1/workforce/attendance/:id/corrections/:correctionId/decision', async (req) => {
    const context=auth(req);context.require('workforce.approve');const attendanceId=(req.params as {id:string}).id;const correctionId=(req.params as {correctionId:string}).correctionId;const existing=await attendanceRow(context,attendanceId);
    const body=req.body as Record<string,unknown>;const approve=body.approve===true;const reason=optionalString(body.reason,'reason',1000);
    const correction=await db.one("SELECT * FROM attendance_corrections WHERE id=$1 AND attendance_id=$2",[correctionId,attendanceId]);if(!correction)notFound('Correction');if(correction.status!=='pending')conflict('That correction has already been decided.');
    // Separation of duties
    if (correction.requested_by === context.user.id) {
      throw new AppError(403, 'forbidden', 'Separation of duties requires a different person to decide on this correction.');
    }
    await db.transaction(async(client)=>{
      await client.query("UPDATE attendance_corrections SET status=$2,approved_by=$3,approved_at=now(),decision_reason=$4 WHERE id=$1",[correctionId,approve?'approved':'rejected',context.user.id,reason??null]);
      if(approve)await client.query('UPDATE attendance_records SET status=$2 WHERE id=$1',[attendanceId,correction.corrected_status]);
      await appendAudit(client,{actor:actor(context),action:'verify',entityType:'attendance',entityId:attendanceId,entityLabel:existing.worker_ref,updatedValue:{correctionId,decision:approve?'approved':'rejected'},reason:reason??null,mineIds:[existing.mine_id],requestId:context.requestId});
    });
    return serializeAttendance(await attendanceRow(context,attendanceId));
  });

  /* ------------------------------------------------------- corrective actions */
  const actionSelect=`SELECT a.*,m.name AS mine_name,au.name AS assignee_name,
    (a.due_date-CURRENT_DATE) AS days_to_due,(a.due_date<CURRENT_DATE AND a.status NOT IN ('verified','closed')) AS is_overdue,
    COALESCE((SELECT array_agg(e.document_id) FROM corrective_action_evidence e WHERE e.corrective_action_id=a.id),'{}') AS evidence_document_ids,
    COALESCE((SELECT string_agg(src.code, ', ') FROM (
      SELECT i.code FROM inspections i WHERE a.source_type='inspection' AND i.id=a.source_id
      UNION ALL SELECT s.code FROM safety_records s WHERE a.source_type='observation' AND s.id=a.source_id
      UNION ALL SELECT i2.code FROM incidents i2 WHERE a.source_type='incident' AND i2.id=a.source_id
      UNION ALL SELECT v.code FROM violations v WHERE a.source_type='violation' AND v.id=a.source_id
    ) src),'—') AS source_code
    FROM corrective_actions a JOIN mines m ON m.id=a.mine_id LEFT JOIN users au ON au.id=a.assigned_to`;
  async function actionRow(context:AuthContext,actionId:string){const row=await db.one(`${actionSelect} WHERE a.id=$1`,[actionId]);if(!row)notFound('Corrective action');if(!context.canAccessMine(row.mine_id))forbidden('That action is outside your assigned scope.');const history=await db.many("SELECT * FROM audit_events WHERE entity_type='corrective_action' AND entity_id=$1 ORDER BY timestamp DESC",[actionId]);row.audit_history=history.map((entry:any)=>({id:entry.id,timestamp:new Date(entry.timestamp).toISOString(),actorId:entry.actor_id,actorName:entry.actor_name,actorRole:entry.actor_role,action:entry.action,reason:entry.reason??undefined,previousValue:entry.previous_value??undefined,updatedValue:entry.updated_value??undefined}));return row;}

  app.get('/api/v1/corrective-actions', async (req) => {
    const context=auth(req);context.require('corrective_action.view');const options=listOptions(req.query as Query,'due_date');
    const params:unknown[]=[];const conditions:string[]=[addScope(context,params,'a.mine_id','m.subsidiary_id')];
    for(const [field,column] of [['status','a.status'],['priority','a.priority'],['mineId','a.mine_id'],['assignedTo','a.assigned_to'],['sourceType','a.source_type']] as const){const value=queryValue(req.query as Query,field);if(value){params.push(value);conditions.push(`${column}=$${params.length}`);}}
    const search=options.search?`%${options.search}%`:null;if(search){params.push(search);conditions.push(`(a.code ILIKE $${params.length} OR a.description ILIKE $${params.length})`);}
    const where=`WHERE ${conditions.join(' AND ')}`;
    const total=await db.one<{total:number}>(`SELECT count(*)::int AS total FROM corrective_actions a JOIN mines m ON m.id=a.mine_id ${where}`,params);
    const result=await db.query(`${actionSelect} ${where} ORDER BY ${sortColumn(options.sortBy,{dueDate:'a.due_date',createdAt:'a.created_at',priority:"CASE a.priority WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END",status:'a.status'},'a.due_date')} ${options.sortDir} NULLS LAST LIMIT $${params.length+1} OFFSET $${params.length+2}`,[...params,options.pageSize,options.offset]);
    const items=[];for(const row of result.rows)items.push(serializeAction(await actionRow(context,row.id)));
    return {items,meta:meta(total?.total??0,options)};
  });

  app.get('/api/v1/corrective-actions/:id', async (req)=>{ const context = auth(req); context.require('corrective_action.view'); return serializeAction(await actionRow(context,(req.params as {id:string}).id)); });

  app.post('/api/v1/corrective-actions', async (req) => {
    const context=auth(req);context.require('corrective_action.create');const body=req.body as Record<string,unknown>;
    const mineId=requireString(body.mineId,'mineId',80);await ensureMine(db,context,mineId);
    const sourceType=requireEnum(body.sourceType,['inspection','incident','violation','observation'] as const,'sourceType');
    const sourceId=requireString(body.sourceId,'sourceId',80);
    const description=requireString(body.description,'description',8000);const priority=requireEnum(body.priority,PRIORITIES,'priority');
    const assignedTo=optionalString(body.assignedTo,'assignedTo');const dueDate=optionalDate(body.dueDate,'dueDate')??new Date(Date.now()+14*86400000).toISOString().slice(0,10);
    const actionId=id('ca');
    const created=await db.transaction(async(client)=>{
      const code=await nextCode(client,'corrective_actions','code','CA');
      const result=await client.query(`INSERT INTO corrective_actions (id,code,source_type,source_id,mine_id,description,assigned_to,priority,created_by,due_date,status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,[actionId,code,sourceType,sourceId,mineId,description,assignedTo??null,priority,context.user.id,dueDate,assignedTo?'assigned':'proposed']);
      const linkTable=sourceType==='inspection'?'inspection_corrective_actions':sourceType==='incident'?'incident_corrective_actions':sourceType==='violation'?'violation_corrective_actions':'safety_record_corrective_actions';
      const linkColumn=sourceType==='inspection'?'inspection_id':sourceType==='incident'?'incident_id':sourceType==='violation'?'violation_id':'safety_record_id';
      await client.query(`INSERT INTO ${linkTable} (${linkColumn},corrective_action_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`,[sourceId,actionId]);
      await appendAudit(client,{actor:actor(context),action:'create',entityType:'corrective_action',entityId:actionId,entityLabel:code,updatedValue:result.rows[0],mineIds:[mineId],requestId:context.requestId});
      return result.rows[0];
    });
    return serializeAction(await actionRow(context,created.id));
  });

  app.patch('/api/v1/corrective-actions/:id', async (req) => {
    const context=auth(req);context.require('corrective_action.edit');const actionId=(req.params as {id:string}).id;const existing=await actionRow(context,actionId);
    const body=req.body as Record<string,unknown>;const params:unknown[]=[];const updates:string[]=[];
    for(const [field,column] of [['description','description'],['assignedTo','assigned_to'],['priority','priority'],['dueDate','due_date'],['completionNotes','completion_notes']] as const){if(!(field in body))continue;params.push(body[field]===''?null:body[field]);updates.push(`${column}=$${params.length}`);}
    if(!updates.length)return serializeAction(existing);params.push(actionId);
    const updated=await db.transaction(async(client)=>{const result=await client.query(`UPDATE corrective_actions SET ${updates.join(',')},updated_at=now(),version=version+1 WHERE id=$${params.length} RETURNING *`,params);await appendAudit(client,{actor:actor(context),action:'update',entityType:'corrective_action',entityId:actionId,entityLabel:existing.code,previousValue:existing,updatedValue:result.rows[0],mineIds:[existing.mine_id],requestId:context.requestId});return result.rows[0];});
    return serializeAction(await actionRow(context,updated.id));
  });

  app.post('/api/v1/corrective-actions/:id/transition', async (req) => {
    const context=auth(req);const actionId=(req.params as {id:string}).id;const existing=await actionRow(context,actionId);const body=req.body as Record<string,unknown>;const to=requireEnum(body.to,ACTION_STATUSES,'to');
    if(to==='submitted_for_verification')context.require('corrective_action.complete');else if(to==='verified')context.require('corrective_action.verify');else context.require('corrective_action.edit');
    if(!(ACTION_TRANSITIONS[existing.status]??[]).includes(to))conflict(`Cannot move a corrective action from ${existing.status} to ${to}.`,'invalid_transition');
    // Evidence required on submit for verification
    if (to === 'submitted_for_verification') {
      const evidences = await db.many('SELECT document_id FROM corrective_action_evidence WHERE corrective_action_id=$1', [actionId]);
      if (evidences.length === 0) {
        throw new AppError(400, 'bad_request', 'Submission for verification requires supporting evidence of completion.');
      }
    }
    // Separation of duties: submitter cannot verify
    if (to === 'verified') {
      const submitActor = await db.one<{ actor_id: string }>(`SELECT actor_id FROM corrective_action_status_history WHERE corrective_action_id=$1 AND to_status='submitted_for_verification' ORDER BY created_at DESC LIMIT 1`, [actionId]);
      if (submitActor && submitActor.actor_id === context.user.id) {
        throw new AppError(403, 'forbidden', 'Separation of duties requires a different person to verify this corrective action.');
      }
      if (existing.assigned_to === context.user.id && existing.created_by === context.user.id) {
        throw new AppError(403, 'forbidden', 'Separation of duties requires a different person to verify this corrective action.');
      }
    }
    const comment=optionalString(body.comment,'comment',2000);
    const updated=await db.transaction(async(client)=>{
      const result=await client.query(`UPDATE corrective_actions SET status=$2,updated_at=now(),
        submitted_at=CASE WHEN $2='submitted_for_verification' THEN now() ELSE submitted_at END,
        verification_status=CASE WHEN $2='submitted_for_verification' THEN 'pending' WHEN $2='verified' THEN 'verified' WHEN $2='rejected' THEN 'rejected' ELSE verification_status END,
        verified_at=CASE WHEN $2='verified' THEN now() ELSE verified_at END,
        verified_by=CASE WHEN $2='verified' THEN $3 ELSE verified_by END,
        rejection_reason=CASE WHEN $2='rejected' THEN $4 ELSE rejection_reason END,
        closed_at=CASE WHEN $2='closed' THEN now() ELSE closed_at END
        WHERE id=$1 RETURNING *`,[actionId,to,context.user.id,comment??null]);
      await client.query('INSERT INTO corrective_action_status_history (id,corrective_action_id,from_status,to_status,actor_id,comment) VALUES ($1,$2,$3,$4,$5,$6)',[id('cah'),actionId,existing.status,to,context.user.id,comment??null]);
      await appendAudit(client,{actor:actor(context),action:to==='verified'?'verify':'status_change',entityType:'corrective_action',entityId:actionId,entityLabel:existing.code,previousValue:{status:existing.status},updatedValue:{status:to},reason:comment??null,mineIds:[existing.mine_id],requestId:context.requestId});
      return result.rows[0];
    });
    return serializeAction(await actionRow(context,updated.id));
  });

  app.post('/api/v1/corrective-actions/:id/evidence', async (req) => {
    const context=auth(req);context.require('corrective_action.edit');const actionId=(req.params as {id:string}).id;const existing=await actionRow(context,actionId);
    const documentId=requireString((req.body as Record<string,unknown>).documentId,'documentId',80);const document=await db.one('SELECT * FROM documents WHERE id=$1',[documentId]);if(!document)notFound('Document');
    await db.transaction(async(client)=>{await client.query('INSERT INTO corrective_action_evidence (corrective_action_id,document_id,attached_by) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',[actionId,documentId,context.user.id]);await appendAudit(client,{actor:actor(context),action:'update',entityType:'corrective_action',entityId:actionId,entityLabel:existing.code,updatedValue:{evidenceDocumentId:documentId},mineIds:[existing.mine_id],requestId:context.requestId});});
    return serializeAction(await actionRow(context,actionId));
  });

  /* --------------------------------------------------------------- documents */
  const documentSelect=`SELECT d.*,m.name AS mine_name,COALESCE((SELECT array_agg(l.compliance_id) FROM document_compliance_links l WHERE l.document_id=d.id),'{}') AS linked_compliance_ids FROM documents d LEFT JOIN mines m ON m.id=d.mine_id`;
  async function documentRow(context:AuthContext,documentId:string){const row=await db.one(`${documentSelect} WHERE d.id=$1`,[documentId]);if(!row)notFound('Document');if(row.mine_id&&!context.canAccessMine(row.mine_id))forbidden('That document is outside your assigned scope.');const fields=await db.many('SELECT * FROM document_fields WHERE document_id=$1 ORDER BY sort_order,label',[documentId]);row.extracted_fields=fields.map((field:any)=>({id:field.id,label:field.label,value:field.value,confidence:numberOrUndefined(field.confidence),pageNumber:field.page_number??undefined,confirmed:field.confirmed,correctedValue:field.corrected_value??undefined}));return row;}

  app.get('/api/v1/documents', async (req) => {
    const context=auth(req);context.require('document.view');const options=listOptions(req.query as Query,'uploaded_at');
    const params:unknown[]=[];const conditions:string[]=[addScope(context,params,'d.mine_id','m.subsidiary_id')];
    for(const [field,column] of [['status','d.status'],['type','d.type'],['mineId','d.mine_id']] as const){const value=queryValue(req.query as Query,field);if(value){params.push(value);conditions.push(`${column}=$${params.length}`);}}
    const search=options.search?`%${options.search}%`:null;if(search){params.push(search);conditions.push(`(d.name ILIKE $${params.length} OR d.extracted_text ILIKE $${params.length})`);}
    const where=`WHERE ${conditions.join(' AND ')}`;
    const total=await db.one<{total:number}>(`SELECT count(*)::int AS total FROM documents d LEFT JOIN mines m ON m.id=d.mine_id ${where}`,params);
    const result=await db.query(`${documentSelect} ${where} ORDER BY d.uploaded_at DESC LIMIT $${params.length+1} OFFSET $${params.length+2}`,[...params,options.pageSize,options.offset]);
    const items=[];for(const row of result.rows)items.push(serializeDocument(await documentRow(context,row.id)));
    return {items,meta:meta(total?.total??0,options)};
  });

  app.get('/api/v1/documents/:id',async(req)=>{ const context = auth(req); context.require('document.view'); return serializeDocument(await documentRow(context,(req.params as {id:string}).id)); });

  app.post('/api/v1/documents',async(req)=>{
    const context=auth(req);context.require('document.upload');const body=req.body as Record<string,unknown>;
    const name=requireString(body.name,'name',300);const mimeType=requireString(body.mimeType,'mimeType',120);
    if(!MIME_ALLOWLIST.has(mimeType))badRequest('That file type is not accepted.',{mimeType:['Use PDF, PNG, JPEG, text or CSV']});
    const type=requireEnum(body.type,DOCUMENT_TYPES,'type');const size=requireNumber(body.sizeBytes,'sizeBytes',0);const content=optionalString(body.content,'content',config.documentMaxBytes);
    const mineId=optionalString(body.mineId,'mineId');if(mineId)await ensureMine(db,context,mineId);
    if(size>config.documentMaxBytes)badRequest(`Documents may not exceed ${config.documentMaxBytes} bytes.`);
    if(content&&Buffer.byteLength(content,'utf8')>config.documentMaxBytes)badRequest('The supplied content exceeds the size limit.');
    const documentId=id('doc');const stored=content??null;let storageKey:string|null=null;let sha256:string|null=null;
    if(stored){await mkdir(config.storageDir,{recursive:true});storageKey=`${documentId}.bin`;await writeFile(path.join(config.storageDir,storageKey),stored,'utf8');sha256=createHash('sha256').update(stored).digest('hex');}
    const created=await db.transaction(async(client)=>{
      const result=await client.query(`INSERT INTO documents (id,name,type,mime_type,size_bytes,uploaded_by,status,mine_id,storage_key,sha256) VALUES ($1,$2,$3,$4,$5,$6,'queued',$7,$8,$9) RETURNING *`,[documentId,name,type,mimeType,size,context.user.id,mineId??null,storageKey,sha256]);
      await client.query(`INSERT INTO document_processing_jobs (id,document_id,status,driver,last_error) VALUES ($1,$2,'queued','none','No OCR provider is configured; the file was stored without text extraction.')`,[id('job-ocr'),documentId]);
      await client.query('INSERT INTO document_access_log (id,document_id,user_id,action,request_id) VALUES ($1,$2,$3,$4,$5)',[id('dal'),documentId,context.user.id,'upload',context.requestId]);
      await appendAudit(client,{actor:actor(context),action:'create',entityType:'document',entityId:documentId,entityLabel:name,updatedValue:result.rows[0],mineIds:mineId?[mineId]:[],requestId:context.requestId});
      return result.rows[0];
    });
    return serializeDocument(await documentRow(context,created.id));
  });

  app.post('/api/v1/documents/:id/ocr/retry',async(req)=>{
    const context=auth(req);context.require('document.upload');const documentId=(req.params as {id:string}).id;await documentRow(context,documentId);
    throw new AppError(503,'ocr_not_configured','No OCR provider is configured. The document was stored but no text extraction can be run. Configure OCR_DRIVER before retrying.');
  });

  app.patch('/api/v1/documents/:id',async(req)=>{
    const context=auth(req);context.require('document.review');const documentId=(req.params as {id:string}).id;const existing=await documentRow(context,documentId);
    const status=requireEnum((req.body as Record<string,unknown>).status,['uploaded','queued','processing','processed','needs_review','failed'] as const,'status');
    if(existing.status==='queued'&&status==='processing')conflict('A processing state can only be set by a configured OCR worker.','ocr_not_configured');
    const updated=await db.transaction(async(client)=>{const result=await client.query('UPDATE documents SET status=$2,updated_at=now() WHERE id=$1 RETURNING *',[documentId,status]);await appendAudit(client,{actor:actor(context),action:'status_change',entityType:'document',entityId:documentId,entityLabel:existing.name,previousValue:{status:existing.status},updatedValue:{status},mineIds:existing.mine_id?[existing.mine_id]:[],requestId:context.requestId});return result.rows[0];});
    return serializeDocument(await documentRow(context,updated.id));
  });

  app.post('/api/v1/documents/:id/fields/:fieldId',async(req)=>{
    const context=auth(req);context.require('document.review');const {id:documentId,fieldId}=req.params as {id:string;fieldId:string};const existing=await documentRow(context,documentId);
    const value=requireString((req.body as Record<string,unknown>).value,'value',5000);const field=await db.one('SELECT * FROM document_fields WHERE id=$1 AND document_id=$2',[fieldId,documentId]);if(!field)notFound('Document field');
    await db.transaction(async(client)=>{await client.query('UPDATE document_fields SET corrected_value=$2,confirmed=true WHERE id=$1',[fieldId,value]);await client.query("UPDATE documents SET status='needs_review',updated_at=now() WHERE id=$1 AND status='processed'",[documentId]);await client.query('INSERT INTO document_access_log (id,document_id,user_id,action,request_id) VALUES ($1,$2,$3,$4,$5)',[id('dal'),documentId,context.user.id,'field_confirm',context.requestId]);await appendAudit(client,{actor:actor(context),action:'verify',entityType:'document',entityId:documentId,entityLabel:existing.name,previousValue:{fieldId,value:field.value},updatedValue:{fieldId,value},mineIds:existing.mine_id?[existing.mine_id]:[],requestId:context.requestId});});
    return serializeDocument(await documentRow(context,documentId));
  });

  app.post('/api/v1/documents/:id/compliance',async(req)=>{
    const context=auth(req);context.require('document.upload');const documentId=(req.params as {id:string}).id;const existing=await documentRow(context,documentId);
    const complianceId=requireString((req.body as Record<string,unknown>).complianceId,'complianceId',80);const compliance=await db.one('SELECT id FROM compliance_requirements WHERE id=$1',[complianceId]);if(!compliance)notFound('Compliance requirement');
    await db.transaction(async(client)=>{await client.query('INSERT INTO document_compliance_links (document_id,compliance_id,linked_by) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',[documentId,complianceId,context.user.id]);await client.query('INSERT INTO compliance_evidence (compliance_id,document_id,attached_by) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',[complianceId,documentId,context.user.id]);await client.query('INSERT INTO document_access_log (id,document_id,user_id,action,request_id) VALUES ($1,$2,$3,$4,$5)',[id('dal'),documentId,context.user.id,'link',context.requestId]);await appendAudit(client,{actor:actor(context),action:'update',entityType:'document',entityId:documentId,entityLabel:existing.name,updatedValue:{complianceId},mineIds:existing.mine_id?[existing.mine_id]:[],requestId:context.requestId});});
    return serializeDocument(await documentRow(context,documentId));
  });

  /* --------------------------------------------------------------- OCR pipeline */

  /**
   * Upload a document file (multipart). Validates the actual file type from
   * content, stores it safely, queues extraction, and returns the document
   * record with a processing job.
   */
  app.post('/api/v1/documents/upload', async (req) => {
    const context = auth(req);
    context.require('document.upload');

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

    const name = requireString(fieldMap.name, 'name', 300);
    const type = requireEnum(fieldMap.type, ['compliance_evidence','inspection_report','contract','worker_record','environment_log','production_report','other'] as const, 'type');
    const mineId = optionalString(fieldMap.mineId, 'mineId');
    if (mineId) await ensureMine(db, context, mineId);

    const fileStream: any = file;
    const chunks: Buffer[] = [];
    for await (const chunk of fileStream) chunks.push(Buffer.from(chunk));
    const buffer = Buffer.concat(chunks);

    if (buffer.length === 0) badRequest('The uploaded file is empty.');
    if (buffer.length > config.documentMaxBytes) {
      badRequest(`File exceeds the ${config.documentMaxBytes} byte limit.`);
    }

    // Detect actual type from content, not client-supplied MIME
    const detected = await detectFileType(buffer, fileStream.mimetype);
    validateFileType(detected);

    // Prevent path traversal in the filename
    const safeName = path.basename(fileStream.filename).replace(/[^a-zA-Z0-9.\-_]/g, '_');

    const documentId = id('doc');
    const sha256 = computeSha256(buffer);
    const { storageKey } = await storeFile(buffer, documentId, config.storageDir);

    const created = await db.transaction(async (client) => {
      const result = await client.query(
        `INSERT INTO documents (id,name,type,mime_type,size_bytes,uploaded_by,status,mine_id,storage_key,sha256)
         VALUES ($1,$2,$3,$4,$5,$6,'queued',$7,$8,$9) RETURNING *`,
        [documentId, name, type, detected.mimeType, buffer.length, context.user.id, mineId ?? null, storageKey, sha256],
      );
      await client.query(
        `INSERT INTO document_processing_jobs (id,document_id,status,driver,last_error) VALUES ($1,$2,'queued','tesseract.js','Uploaded and queued for extraction.')`,
        [id('job-ocr'), documentId],
      );
      await client.query(
        `INSERT INTO document_access_log (id,document_id,user_id,action,request_id) VALUES ($1,$2,$3,$4,$5)`,
        [id('dal'), documentId, context.user.id, 'upload', context.requestId],
      );
      await appendAudit(client, {
        actor: actor(context), action: 'create', entityType: 'document', entityId: documentId,
        entityLabel: name, updatedValue: result.rows[0], mineIds: mineId ? [mineId] : [],
        requestId: context.requestId,
      });
      return result.rows[0];
    });

    // Fire-and-forget extraction (background processing)
    void processDocumentAsync(documentId, buffer, detected.mimeType, name, context);

    return serializeDocument(await documentRow(context, created.id));
  });

  /**
   * Get detailed extraction results for a document (pages, tables, candidate fields).
   */
  app.get('/api/v1/documents/:id/extraction', async (req) => {
    const context = auth(req);
    context.require('document.view');
    const documentId = (req.params as { id: string }).id;
    const row = await db.one(
      `SELECT d.*, m.name AS mine_name FROM documents d LEFT JOIN mines m ON m.id=d.mine_id WHERE d.id=$1`,
      [documentId],
    );
    if (!row) notFound('Document');
    if (row.mine_id && !context.canAccessMine(row.mine_id)) forbidden('That document is outside your assigned scope.');

    const fields = await db.many(
      'SELECT * FROM document_fields WHERE document_id=$1 ORDER BY sort_order,label',
      [documentId],
    );

    return {
      documentId: row.id,
      name: row.name,
      mimeType: row.mime_type,
      status: row.status,
      method: row.ocr_engine ? (row.ocr_engine.includes('tesseract') ? 'ocr' : 'native') : 'none',
      pages: [], // Stored as extracted_text; page-level detail not persisted in v1
      tables: [],
      fullText: row.extracted_text ?? '',
      detectedLanguage: row.detected_language,
      totalPages: 1,
      candidateFields: fields.map((f: any) => ({
        id: f.id,
        label: f.label,
        value: f.corrected_value ?? f.value,
        confidence: Number(f.confidence) ?? undefined,
        pageNumber: f.page_number ?? undefined,
        confirmed: f.confirmed,
        correctedValue: f.corrected_value ?? undefined,
        method: 'heuristic' as const,
      })),
      warnings: row.ocr_error ? [`Engine reported: ${row.ocr_error}`] : [],
      errors: row.status === 'failed' && row.ocr_error ? [row.ocr_error] : [],
      processedAt: row.ocr_processed_at ?? undefined,
    };
  });

  /**
   * Trigger (re-)processing of a document through the OCR pipeline.
   */
  app.post('/api/v1/documents/:id/process', async (req) => {
    const context = auth(req);
    context.require('document.upload');
    const documentId = (req.params as { id: string }).id;
    const row = await db.one('SELECT * FROM documents WHERE id=$1', [documentId]);
    if (!row) notFound('Document');
    if (row.mine_id && !context.canAccessMine(row.mine_id)) forbidden('That document is outside your assigned scope.');

    const stored = await readStoredFile(row.storage_key, config.storageDir);
    await db.query(
      `UPDATE documents SET status='queued', ocr_error=NULL, updated_at=now() WHERE id=$1`,
      [documentId],
    );
    await db.query(
      `UPDATE document_processing_jobs SET status='queued', attempts=attempts+1, last_error=NULL, updated_at=now() WHERE document_id=$1`,
      [documentId],
    );

    void processDocumentAsync(documentId, stored, row.mime_type, row.name, context);

    return { documentId, status: 'queued' };
  });

  /**
   * OCR engine health and supported formats.
   */
  app.get('/api/v1/ocr/status', async () => {
    return {
      engine: 'tesseract.js',
      version: '7.0.0',
      status: 'not_initialised',
      languages: OCR_CONFIG.languages,
      maxBytes: OCR_CONFIG.maxBytes,
      maxPages: OCR_CONFIG.maxPages,
    };
  });

  app.get('/api/v1/ocr/supported-formats', async () => {
    return {
      images: ['image/png', 'image/jpeg', 'image/tiff', 'image/bmp', 'image/webp'],
      pdf: ['application/pdf'],
      office: [
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ],
      text: ['text/plain', 'text/csv', 'text/markdown', 'text/html', 'application/json', 'text/xml', 'application/xml'],
      notes: [
        'PDF: native text extraction for text-based PDFs; image-only PDFs report a warning.',
        'GIF: only the first frame is processed.',
        'PPT/PPTX: not yet supported for native extraction.',
        'DOC (legacy binary): not yet supported for native extraction.',
        'File type is detected from content (magic bytes), not just extension.',
      ],
    };
  });

  /**
   * Background document processing. Runs extraction and updates the database.
   * Errors are captured but never thrown (fire-and-forget).
   */
  async function processDocumentAsync(
    documentId: string,
    buffer: Buffer,
    mimeType: string,
    fileName: string,
    reqContext: AuthContext,
  ): Promise<void> {
    try {
      await db.query(`UPDATE documents SET status='processing', updated_at=now() WHERE id=$1`, [documentId]);
      await db.query(`UPDATE document_processing_jobs SET status='processing', updated_at=now() WHERE document_id=$1`, [documentId]);

      const result = await extractDocument(buffer, fileName, mimeType);

      const fullText = result.fullText || null;
      const status = result.errors.length > 0 ? 'failed' : (fullText && fullText.trim().length > 0 ? 'needs_review' : 'queued');

      await db.query(
        `UPDATE documents SET status=$1, extracted_text=$2, detected_language=$3, ocr_engine=$4,
           ocr_confidence=$5, ocr_processed_at=now(), ocr_error=$6, updated_at=now() WHERE id=$7`,
        [
          status,
          fullText,
          result.detectedLanguage ?? null,
          result.method === 'none' ? null : (result.method === 'ocr' ? 'tesseract.js' : 'native'),
          result.pages.length > 0 ? result.pages[0]?.confidence ?? null : null,
          result.errors.length > 0 ? result.errors.join('; ') : null,
          documentId,
        ],
      );

      // Insert candidate fields as unconfirmed extracted fields
      let sortOrder = 0;
      for (const field of result.candidateFields) {
        await db.query(
          `INSERT INTO document_fields (id,document_id,label,value,confidence,page_number,confirmed,sort_order)
           VALUES ($1,$2,$3,$4,$5,$6,false,$7)`,
          [id('fld'), documentId, field.label, field.value, field.confidence ?? null,
           field.pageNumber ?? null, sortOrder],
        );
        sortOrder += 1;
      }

      await db.query(
        `UPDATE document_processing_jobs SET status=$1, updated_at=now() WHERE document_id=$2`,
        [status === 'failed' ? 'failed' : 'processed', documentId],
      );

      await db.transaction(async (client) => {
        await appendAudit(client, {
          actor: actor(reqContext), action: status === 'failed' ? 'update' : 'verify',
          entityType: 'document', entityId: documentId, entityLabel: fileName,
          updatedValue: { status, method: result.method, fields: result.candidateFields.length },
          mineIds: [], requestId: reqContext.requestId,
        });
      });
    } catch (error) {
      await db.query(
        `UPDATE documents SET status='failed', ocr_error=$1, updated_at=now() WHERE id=$2`,
        [error instanceof Error ? error.message : 'Extraction failed.', documentId],
      );
      await db.query(
        `UPDATE document_processing_jobs SET status='failed', last_error=$1, updated_at=now() WHERE document_id=$2`,
        [error instanceof Error ? error.message : 'Extraction failed.', documentId],
      );
    }
  }

  /* --------------------------------------------------------------- attendance & geofencing */

  app.get('/api/v1/attendance/geofences', async (req) => {
    const context = auth(req);
    context.require('workforce.view');
    const mineId = queryValue(req.query as Query, 'mineId');
    const params: unknown[] = [];
    const conditions: string[] = [];
    if (mineId) { params.push(mineId); conditions.push(`mine_id = $${params.length}`); }
    conditions.push(`is_active = true`);
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await db.query(
      `SELECT * FROM attendance_geofences ${where} ORDER BY name`,
      params
    );
    return result.rows;
  });

  app.post('/api/v1/attendance/geofences', async (req) => {
    const context = auth(req);
    context.require('mine.edit');
    const body = req.body as Record<string, unknown>;
    const mineId = requireString(body.mineId, 'mineId', 80);
    await ensureMine(db, context, mineId);
    const gfId = `gf-${id('gf')}`;
    const gfName = requireString(body.name, 'name', 200);
    await db.query(
      `INSERT INTO attendance_geofences (
        id, mine_id, name, description, boundary_wkt, center_lat, center_lng,
        radius_m, boundary_tolerance_m, effective_from, effective_to, created_by, updated_by
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      RETURNING *`,
      [
        gfId, mineId, gfName,
        optionalString(body.description, 'description', 500),
        optionalString(body.boundaryWkt, 'boundaryWkt', 2000),
        numberOrUndefined(body.centerLat),
        numberOrUndefined(body.centerLng),
        numberOrUndefined(body.radiusM),
        numberOrUndefined(body.boundaryToleranceM),
        optionalDate(body.effectiveFrom, 'effectiveFrom') ?? new Date().toISOString().slice(0, 10),
        optionalDate(body.effectiveTo, 'effectiveTo'),
        context.user.id, context.user.id
      ]
    );
    await appendAudit(db as any, {
      actor: actor(context), action: 'create', entityType: 'attendance_geofence', entityId: gfId,
      entityLabel: gfName, mineIds: [mineId], requestId: context.requestId
    });
    return { id: gfId, name: gfName, mineId };;
  });

  app.get('/api/v1/attendance/records', async (req) => {
    const context = auth(req);
    context.require('workforce.view');
    const options = listOptions(req.query as Query, 'recorded_at');
    const params: unknown[] = [];
    const conditions: string[] = [addScope(context, params, 'ar.mine_id', 'm.subsidiary_id')];
    const workerId = queryValue(req.query as Query, 'workerId');
    if (workerId) { params.push(workerId); conditions.push(`ar.worker_id = $${params.length}`); }
    const dateFrom = queryValue(req.query as Query, 'dateFrom');
    if (dateFrom) { params.push(dateFrom); conditions.push(`ar.date >= $${params.length}`); }
    const dateTo = queryValue(req.query as Query, 'dateTo');
    if (dateTo) { params.push(dateTo); conditions.push(`ar.date <= $${params.length}`); }
    const status = queryValue(req.query as Query, 'status');
    if (status) { params.push(status); conditions.push(`ar.status = $${params.length}`); }
    const where = `WHERE ${conditions.join(' AND ')}`;
    const total = await db.one<{ total: number }>(
      `SELECT count(*)::int AS total FROM attendance_records ar JOIN workforce_members wm ON wm.id=ar.worker_id JOIN mines m ON m.id=ar.mine_id ${where}`,
      params
    );
    const result = await db.query(
      `SELECT ar.*, wm.worker_ref, wm.display_name FROM attendance_records ar JOIN workforce_members wm ON wm.id=ar.worker_id ${where} ORDER BY ar.recorded_at DESC LIMIT $${params.length+1} OFFSET $${params.length+2}`,
      [...params, options.pageSize, options.offset]
    );
    return { items: result.rows, meta: meta(total?.total ?? 0, options) };
  });

  app.post('/api/v1/attendance/records', async (req) => {
    const context = auth(req);
    context.require('workforce.edit');
    const body = req.body as Record<string, unknown>;
    const workerId = requireString(body.workerId, 'workerId', 80);
    const mineId = requireString(body.mineId, 'mineId', 80);
    await ensureMine(db, context, mineId);
    const date = requireString(body.date, 'date', 10);
    const shift = requireEnum(body.shift, ['day','swing','night'] as const, 'shift');
    const status = requireEnum(body.status, ['present','absent','leave','half_day','not_recorded'] as const, 'status');
    const attId = `att-${id('att')}`;
    await db.query(
      `INSERT INTO attendance_records (
        id, worker_id, mine_id, contractor_id, date, shift, status,
        check_in_lat, check_in_lng, check_in_accuracy_m, check_in_geofence_id,
        check_in_geofence_valid, check_in_method, check_in_device_info, check_in_ip_hash,
        recorded_by
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
      RETURNING *`,
      [
        attId, workerId, mineId,
        optionalString(body.contractorId, 'contractorId'),
        date, shift, status,
        numberOrUndefined(body.checkInLat),
        numberOrUndefined(body.checkInLng),
        numberOrUndefined(body.checkInAccuracyM),
        optionalString(body.checkInGeofenceId, 'checkInGeofenceId'),
        body.checkInGeofenceValid === true,
        optionalString(body.checkInMethod, 'checkInMethod'),
        typeof body.checkInDeviceInfo === 'object' ? body.checkInDeviceInfo : {},
        context.ipHash,
        context.user.id
      ]
    );
    await appendAudit(db as any, {
      actor: actor(context), action: 'create', entityType: 'attendance_record', entityId: attId,
      entityLabel: `${workerId} - ${date} ${shift}`, mineIds: [mineId], requestId: context.requestId
    });
    return { id: attId, workerId, mineId, date, shift, status };
  });

  app.get('/api/v1/attendance/records/:id', async (req) => {
    const context = auth(req);
    context.require('workforce.view');
    const attendanceId = (req.params as { id: string }).id;
    const row = await db.one(
      `SELECT ar.*, wm.worker_ref, wm.display_name, m.name AS mine_name FROM attendance_records ar JOIN workforce_members wm ON wm.id=ar.worker_id JOIN mines m ON m.id=ar.mine_id WHERE ar.id=$1`,
      [attendanceId]
    );
    if (!row) notFound('Attendance record');
    if (!context.canAccessMine(row.mine_id)) forbidden('That attendance record is outside your assigned scope.');
    return row;
  });

  app.patch('/api/v1/attendance/records/:id/correction', async (req) => {
    const context = auth(req);
    context.require('workforce.edit');
    const attendanceId = (req.params as { id: string }).id;
    const body = req.body as Record<string, unknown>;
    const correctedStatus = requireEnum(body.correctedStatus, ['present','absent','leave','half_day','not_recorded'] as const, 'correctedStatus');
    const reason = requireString(body.reason, 'reason', 500);
    const acId = `ac-${id('ac')}`;
    await db.query(
      `INSERT INTO attendance_corrections (
        id, attendance_id, original_status, corrected_status, reason, requested_by, status
      ) VALUES ($1,$2,$3,$4,$5,$6,'pending')
      RETURNING *`,
      [acId, attendanceId, body.originalStatus, correctedStatus, reason, context.user.id]
    );
    await appendAudit(db as any, {
      actor: actor(context), action: 'create', entityType: 'attendance_correction', entityId: acId,
      entityLabel: attendanceId, mineIds: [], requestId: context.requestId
    });
    return { id: acId, attendanceId, correctedStatus, status: 'pending' };
  });
}

async function detectAnomaly(client:any,record:any):Promise<void>{
  const history=await client.query(`SELECT production_tonnes FROM production_records WHERE mine_id=$1 AND shift=$2 AND id<>$3 ORDER BY date DESC LIMIT 30`,[record.mine_id,record.shift,record.id]);
  if(history.rows.length<14)return;
  const values=history.rows.map((row:any)=>Number(row.production_tonnes));const mean=values.reduce((a:number,b:number)=>a+b,0)/values.length;const variance=values.reduce((a:number,b:number)=>a+(b-mean)**2,0)/values.length;const sd=Math.sqrt(variance);if(sd===0)return;
  const current=Number(record.production_tonnes);const z=(current-mean)/sd;if(Math.abs(z)<2.5)return;
  const severity=Math.abs(z)>=3?'high':'medium';
  await client.query(`INSERT INTO production_anomalies (id,mine_id,record_id,date,metric,direction,z_score,severity,explanation,detector) VALUES ($1,$2,$3,$4,'production_tonnes',$5,$6,$7,$8,'rolling-zscore-v1') ON CONFLICT (record_id,metric) DO NOTHING`,
    [id('anom'),record.mine_id,record.id,record.date,z>=0?'above':'below',z.toFixed(3),severity,`Recorded ${current.toFixed(2)} t is ${Math.abs(z).toFixed(1)} standard deviations ${z>=0?'above':'below'} the mean of ${mean.toFixed(2)} t across ${values.length} prior ${record.shift} shifts.`]);
}
