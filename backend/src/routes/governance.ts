import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { FastifyInstance, FastifyRequest } from 'fastify';

import { appendAudit, verifyAuditChain } from '../audit';
import { addScope, type AuthContext, type Role } from '../auth';
import { config } from '../config';
import type { Database } from '../db';
import {
  AppError, badRequest, compact, conflict, forbidden, id, listOptions, meta, notFound,
  numberOrUndefined, optionalString, queryValue, requireArray, requireEnum, requireString,
  sortColumn, today, type Query,
} from '../http';
import {
  serializeAudit, serializeInsight, serializeNotification, serializeReportJob,
  serializeUser, serializeWorkflow,
} from '../serializers';

const RISK_LEVELS = ['low','moderate','elevated','high','critical'] as const;
const REPORT_CATEGORIES = ['statutory_compliance','inspection_summary','safety_observations','incidents','corrective_actions','environmental_monitoring','production','contractor_compliance','workforce','audit_history'] as const;
const REVIEW_STATUSES = ['unreviewed','acknowledged','investigating','dismissed','escalated'] as const;

function auth(req: FastifyRequest): AuthContext { return (req as any).auth as AuthContext; }
function actor(context: AuthContext) { return { id: context.user.id, name: context.user.name, role: context.user.role, ipHash: context.ipHash }; }

export async function registerGovernanceRoutes(app: FastifyInstance, db: Database): Promise<void> {
  /* --------------------------------------------------------------- analytics */
  const insightSelect = `SELECT i.*,m.name AS mine_name,
    COALESCE((SELECT array_agg(e.entity_id) FROM ai_insight_related_entities e WHERE e.insight_id=i.id),'{}') AS related_entity_ids
    FROM ai_insights i LEFT JOIN mines m ON m.id=i.mine_id`;
  async function insightRow(context: AuthContext, insightId: string) {
    const row = await db.one(`${insightSelect} WHERE i.id=$1`, [insightId]);
    if (!row) notFound('AI insight');
    if (row.mine_id && !context.canAccessMine(row.mine_id)) forbidden('That insight is outside your assigned scope.');
    const evidence = await db.many('SELECT * FROM ai_insight_evidence WHERE insight_id=$1 ORDER BY sort_order', [insightId]);
    row.evidence = evidence.map((entry: any) => ({ label: entry.label, detail: entry.detail, kind: entry.kind, weight: numberOrUndefined(entry.weight) }));
    return row;
  }

  app.get('/api/v1/analytics/insights', async (req) => {
    const context = auth(req); context.require('analytics.view');
    const options = listOptions(req.query as Query, 'generated_at');
    const params: unknown[] = []; const conditions: string[] = [];
    const scope = addScope(context, params, 'i.mine_id', 'm.subsidiary_id');
    if (scope !== 'TRUE') conditions.push(`(${scope} OR i.mine_id IS NULL)`);
    for (const [field, column] of [['category','i.category'],['riskLevel','i.risk_level'],['reviewStatus','i.review_status'],['mineId','i.mine_id'],['subsidiaryId','i.subsidiary_id']] as const) {
      const value = queryValue(req.query as Query, field); if (value) { params.push(value); conditions.push(`${column}=$${params.length}`); }
    }
    if (options.search) { params.push(`%${options.search}%`); conditions.push(`(i.title ILIKE $${params.length} OR i.explanation ILIKE $${params.length})`); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const total = await db.one<{ total: number }>(`SELECT count(*)::int AS total FROM ai_insights i LEFT JOIN mines m ON m.id=i.mine_id ${where}`, params);
    const result = await db.query(`${insightSelect} ${where} ORDER BY ${sortColumn(options.sortBy,{generatedAt:'i.generated_at',riskLevel:"CASE i.risk_level WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'elevated' THEN 3 WHEN 'moderate' THEN 4 ELSE 5 END"},'i.generated_at')} ${options.sortDir} LIMIT $${params.length+1} OFFSET $${params.length+2}`, [...params, options.pageSize, options.offset]);
    const items = []; for (const row of result.rows) items.push(serializeInsight(await insightRow(context, row.id)));
    return { items, meta: meta(total?.total ?? 0, options) };
  });

  app.get('/api/v1/analytics/insights/:id', async (req) => { const context = auth(req); context.require('analytics.view'); return serializeInsight(await insightRow(context, (req.params as { id: string }).id)); });

  app.post('/api/v1/analytics/insights/:id/review', async (req) => {
    const context = auth(req); context.require('analytics.review');
    const insightId = (req.params as { id: string }).id; const existing = await insightRow(context, insightId);
    const body = req.body as Record<string, unknown>; const status = requireEnum(body.status, REVIEW_STATUSES, 'status');
    if (status === 'dismissed') context.require('analytics.dismiss');
    if (status === 'escalated') context.require('analytics.escalate');
    const note = optionalString(body.note, 'note', 2000);
    const updated = await db.transaction(async (client) => {
      const result = await client.query('UPDATE ai_insights SET review_status=$2,reviewed_by=$3,reviewed_at=now(),review_note=$4 WHERE id=$1 RETURNING *', [insightId,status,context.user.id,note ?? null]);
      await client.query('INSERT INTO ai_insight_reviews (id,insight_id,status,note,actor_id) VALUES ($1,$2,$3,$4,$5)', [id('rev'),insightId,status,note ?? null,context.user.id]);
      await appendAudit(client,{actor:actor(context),action:'status_change',entityType:'ai_insight',entityId:insightId,entityLabel:existing.code,previousValue:{reviewStatus:existing.review_status},updatedValue:{reviewStatus:status},reason:note ?? null,mineIds:existing.mine_id?[existing.mine_id]:[],requestId:context.requestId});
      return result.rows[0];
    });
    return serializeInsight(await insightRow(context, updated.id));
  });

  async function riskDistribution(context: AuthContext) {
    const params: unknown[] = []; const scope = addScope(context, params, 'i.mine_id', 'm.subsidiary_id');
    const conditions = scope === 'TRUE' ? '' : `WHERE (${scope} OR i.mine_id IS NULL)`;
    const levels = await db.query(`SELECT i.risk_level,count(*)::int AS count FROM ai_insights i LEFT JOIN mines m ON m.id=i.mine_id ${conditions} GROUP BY i.risk_level`, params);
    const byMine = await db.query(`SELECT m.id AS mine_id,m.name AS mine_name,COALESCE(avg(CASE i.risk_level WHEN 'critical' THEN 100 WHEN 'high' THEN 80 WHEN 'elevated' THEN 60 WHEN 'moderate' THEN 40 WHEN 'low' THEN 20 END),0)::int AS score
      FROM mines m LEFT JOIN ai_insights i ON i.mine_id=m.id ${scope === 'TRUE' ? '' : `WHERE ${addScope(context, [], 'm.id', 'm.subsidiary_id')}`} GROUP BY m.id,m.name ORDER BY score DESC`, scope === 'TRUE' ? [] : []);
    return {
      levels: Object.fromEntries(levels.rows.map((row: any) => [row.risk_level, row.count])),
      byMine: byMine.rows.map((row: any) => ({ mineId: row.mine_id, mineName: row.mine_name, score: row.score, level: row.score >= 80 ? 'critical' : row.score >= 60 ? 'high' : row.score >= 40 ? 'elevated' : row.score >= 20 ? 'moderate' : 'low' })),
      generatedAt: new Date().toISOString(),
    };
  }

  app.get('/api/v1/analytics/risk-distribution', async (req) => { auth(req).require('analytics.view'); return riskDistribution(auth(req)); });

  /* ------------------------------------------------------------ notifications */
  async function notificationRow(context: AuthContext, notificationId: string) {
    const row = await db.one('SELECT * FROM notifications WHERE id=$1 AND recipient_id=$2', [notificationId, context.user.id]);
    if (!row) notFound('Notification');
    const deliveries = await db.many('SELECT * FROM notification_deliveries WHERE notification_id=$1 ORDER BY channel', [notificationId]);
    row.deliveries = deliveries.map((delivery: any) => ({ channel: delivery.channel, status: delivery.status, at: delivery.at ? new Date(delivery.at).toISOString() : undefined }));
    return row;
  }

  app.get('/api/v1/notifications', async (req) => {
    const context = auth(req); context.require('notification.view');
    const options = listOptions(req.query as Query, 'created_at');
    const params: unknown[] = [context.user.id]; const conditions: string[] = ['n.recipient_id=$1'];
    const read = queryValue(req.query as Query, 'read');
    if (read === 'true' || read === 'false') { params.push(read === 'true'); conditions.push(`n.read=$${params.length}`); }
    for (const [field,column] of [['type','n.type'],['severity','n.severity']] as const) { const value=queryValue(req.query as Query,field); if(value){params.push(value);conditions.push(`${column}=$${params.length}`);} }
    const where = `WHERE ${conditions.join(' AND ')}`;
    const total = await db.one<{ total: number }>(`SELECT count(*)::int AS total FROM notifications n ${where}`, params);
    const result = await db.query(`SELECT n.* FROM notifications n ${where} ORDER BY n.created_at DESC LIMIT $${params.length+1} OFFSET $${params.length+2}`, [...params, options.pageSize, options.offset]);
    const items = []; for (const row of result.rows) items.push(serializeNotification(await notificationRow(context, row.id)));
    return { items, meta: meta(total?.total ?? 0, options) };
  });

  app.get('/api/v1/notifications/unread-count', async (req) => {
    const context = auth(req); context.require('notification.view');
    const row = await db.one<{ count: number }>('SELECT count(*)::int AS count FROM notifications WHERE recipient_id=$1 AND read=false', [context.user.id]);
    return row?.count ?? 0;
  });

  app.patch('/api/v1/notifications/:id', async (req) => {
    const context = auth(req); context.require('notification.view'); const notificationId=(req.params as {id:string}).id; await notificationRow(context,notificationId);
    const read = (req.body as Record<string, unknown>).read;
    if (typeof read !== 'boolean') badRequest('read must be a boolean.');
    await db.query('UPDATE notifications SET read=$2,read_at=CASE WHEN $2 THEN now() ELSE NULL END WHERE id=$1 AND recipient_id=$3',[notificationId,read,context.user.id]);
    return serializeNotification(await notificationRow(context,notificationId));
  });

  app.post('/api/v1/notifications/read-all', async (req) => {
    const context=auth(req);context.require('notification.view');await db.query('UPDATE notifications SET read=true,read_at=now() WHERE recipient_id=$1 AND read=false',[context.user.id]);
  });

  app.get('/api/v1/workflows/rules', async (req) => {
    auth(req).require('notification.view');
    const workflows=await db.many('SELECT * FROM workflows ORDER BY name');
    const items=[];
    for(const workflow of workflows){const stages=await db.many('SELECT * FROM workflow_stages WHERE workflow_id=$1 ORDER BY stage_order',[workflow.id]);workflow.stages=stages.map((stage:any)=>({id:stage.id,order:stage.stage_order,label:stage.label,role:stage.role,afterHours:stage.after_hours,notifyChannels:stage.notify_channels}));items.push(serializeWorkflow(workflow));}
    return items;
  });

  app.patch('/api/v1/workflows/rules/:id', async (req) => {
    const context=auth(req);context.require('admin.workflows');const workflowId=(req.params as {id:string}).id;const existing=await db.one('SELECT * FROM workflows WHERE id=$1',[workflowId]);if(!existing)notFound('Workflow');
    const body=req.body as Record<string,unknown>;const params:unknown[]=[];const updates:string[]=[];
    for(const [field,column] of [['name','name'],['description','description'],['trigger','trigger'],['enabled','enabled']] as const){if(!(field in body))continue;params.push(body[field]);updates.push(`${column}=$${params.length}`);}
    const updated=await db.transaction(async(client)=>{const idParam=`$${params.length+1}`;const byParam=`$${params.length+2}`;const result=updates.length?await client.query(`UPDATE workflows SET ${updates.join(',')},updated_at=now(),updated_by=${byParam},version=version+1 WHERE id=${idParam} RETURNING *`,[...params,workflowId,context.user.id]):{rows:[existing]};await appendAudit(client,{actor:actor(context),action:'update',entityType:'workflow',entityId:workflowId,entityLabel:existing.name,previousValue:existing,updatedValue:result.rows[0],requestId:context.requestId});return result.rows[0];});
    const stages=await db.many('SELECT * FROM workflow_stages WHERE workflow_id=$1 ORDER BY stage_order',[workflowId]);updated.stages=stages.map((stage:any)=>({id:stage.id,order:stage.stage_order,label:stage.label,role:stage.role,afterHours:stage.after_hours,notifyChannels:stage.notify_channels}));
    return serializeWorkflow(updated);
  });

  /* ---------------------------------------------------------------- reports */
  app.get('/api/v1/reports/catalogue', async (req) => {
    auth(req).require('report.view');
    const definitions=await db.many('SELECT * FROM report_definitions ORDER BY name');
    const items=[];
    for(const definition of definitions){
      const columns=await db.many('SELECT column_key,label FROM report_definition_columns WHERE category=$1 ORDER BY sort_order',[definition.category]);
      items.push({category:definition.category,name:definition.name,description:definition.description,
        // Only CSV is implemented. PDF/XLSX are deliberately not advertised.
        formats:['csv'],groupBy:definition.group_by,columns:columns.map((column:any)=>({key:column.column_key,label:column.label}))});
    }
    return items;
  });

  async function reportJobRow(context: AuthContext, jobId: string) {
    const row=await db.one('SELECT r.*,u.name AS requested_by_name FROM report_jobs r JOIN users u ON u.id=r.requested_by WHERE r.id=$1',[jobId]);
    if(!row)notFound('Report');
    // Scope check
    if(row.requested_by!==context.user.id){
      const user = context.user as any;
      if(user.orgWide) {
        // OK for org-wide
      } else {
        // Check if any report mine/subsidiary in scope
        const mines = (await db.many('SELECT mine_id FROM report_job_mines WHERE report_job_id=$1',[jobId])).map((e:any)=>e.mine_id);
        const subs = (await db.many('SELECT subsidiary_id FROM report_job_subsidiaries WHERE report_job_id=$1',[jobId])).map((e:any)=>e.subsidiary_id);
        const effective = user.effectiveMineIds || user.mineIds || [];
        const inScope = (mines.length===0 && subs.length===0) ? false : (mines.some((m:string)=>effective.includes(m)) || (subs.some((s:string)=>(user.subsidiaryIds||[]).includes(s))));
        if(!inScope && !(user.role === 'system_admin')) forbidden('That report is outside your assigned scope.');
      }
    }
    row.mine_ids=(await db.many('SELECT mine_id FROM report_job_mines WHERE report_job_id=$1',[jobId])).map((entry:any)=>entry.mine_id);
    row.subsidiary_ids=(await db.many('SELECT subsidiary_id FROM report_job_subsidiaries WHERE report_job_id=$1',[jobId])).map((entry:any)=>entry.subsidiary_id);
    row.status_filters=(await db.many('SELECT status FROM report_job_status_filters WHERE report_job_id=$1',[jobId])).map((entry:any)=>entry.status);
    row.can_download=row.requested_by===context.user.id||context.permissions.includes('report.download');
    return row;
  }

  app.get('/api/v1/reports', async (req) => {
    const context=auth(req);context.require('report.view');const options=listOptions(req.query as Query,'created_at');
    const user = context.user as any;
    const isOversight = user.orgWide || user.role === 'system_admin';
    const params:unknown[]=isOversight?[]:[context.user.id];
    const conditions:string[]=[isOversight?'TRUE':'r.requested_by=$1'];
    // Additional scope filter for oversight users - only show reports they can access
    if (isOversight && !user.orgWide) {
      // restricted oversight - filter by scope
      const effective = user.effectiveMineIds || user.mineIds || [];
      const subs = user.subsidiaryIds || [];
      if (effective.length > 0 || subs.length > 0) {
        conditions.push(`(EXISTS (SELECT 1 FROM report_job_mines rjm WHERE rjm.report_job_id=r.id AND rjm.mine_id = ANY($${params.length+1}::text[])) OR EXISTS (SELECT 1 FROM report_job_subsidiaries rjs WHERE rjs.report_job_id=r.id AND rjs.subsidiary_id = ANY($${params.length+2}::text[])) OR r.requested_by=$${params.length+3})`);
        params.push(effective, subs, context.user.id);
      }
    } else if (isOversight && user.orgWide) {
      // full access
    }
    for(const [field,column] of [['category','r.category'],['status','r.status'],['format','r.format']] as const){const value=queryValue(req.query as Query,field);if(value){params.push(value);conditions.push(`${column}=$${params.length}`);}}
    const where=`WHERE ${conditions.join(' AND ')}`;
    const totalParams = params.length ? params : undefined;
    const total=await db.one<{total:number}>(`SELECT count(*)::int AS total FROM report_jobs r ${where}`, totalParams as any);
    const dataParams = [...params, options.pageSize, options.offset];
    const result=await db.query(`SELECT r.*,u.name AS requested_by_name FROM report_jobs r JOIN users u ON u.id=r.requested_by ${where} ORDER BY r.created_at DESC LIMIT $${params.length+1} OFFSET $${params.length+2}`, dataParams);
    const items=[];for(const row of result.rows){try{const full=await reportJobRow(context,row.id);items.push(serializeReportJob(full,true));}catch(e){/* skip inaccessible */}}
    return {items,meta:meta(total?.total??0,options)};
  });

  app.get('/api/v1/reports/:id', async (req) => serializeReportJob(await reportJobRow(auth(req),(req.params as {id:string}).id),true));

  app.post('/api/v1/reports', async (req) => {
    const context=auth(req);context.require('report.generate');const body=req.body as Record<string,unknown>;
    const category=requireEnum(body.category,REPORT_CATEGORIES,'category');
    const title=requireString(body.title,'title',240);
    const mineIds=Array.isArray(body.mineIds)?requireArray(body.mineIds,'mineIds'):[];
    const subsidiaryIds=Array.isArray(body.subsidiaryIds)?requireArray(body.subsidiaryIds,'subsidiaryIds'):[];
    const statusFilters=Array.isArray(body.statusFilters)?requireArray(body.statusFilters,'statusFilters'):[];
    const dateFrom=requireString(body.dateFrom,'dateFrom',40);const dateTo=requireString(body.dateTo,'dateTo',40);
    const format=requireEnum(body.format,['csv','pdf','xlsx'] as const,'format');
    if(format!=='csv')throw new AppError(422,'format_unavailable',`${format.toUpperCase()} generation is not implemented. The catalogue advertises CSV only.`);
    const groupBy=body.groupBy?requireEnum(body.groupBy,['mine','subsidiary','category','month','none'] as const,'groupBy'):undefined;
    const user = context.user as any;
    for(const mineId of mineIds)await ensureReportMine(context,mineId);
    for(const subsidiaryId of subsidiaryIds){
      if(user.orgWide) continue;
      if(!(user.subsidiaryIds||[]).includes(subsidiaryId) && !(user.role === 'system_admin')) throw new AppError(403,'forbidden','A selected subsidiary is outside your assigned scope.');
    }
    const jobId=id('rpt');const fileName=`${category}-${dateFrom}-to-${dateTo}.csv`;
    const job=await db.transaction(async(client)=>{
      const result=await client.query(`INSERT INTO report_jobs (id,category,title,date_from,date_to,format,group_by,requested_by,status,file_name) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'processing',$9) RETURNING *`,[jobId,category,title,dateFrom,dateTo,format,groupBy??null,context.user.id,fileName]);
      for(const mineId of mineIds)await client.query('INSERT INTO report_job_mines (report_job_id,mine_id) VALUES ($1,$2)',[jobId,mineId]);
      for(const subsidiaryId of subsidiaryIds)await client.query('INSERT INTO report_job_subsidiaries (report_job_id,subsidiary_id) VALUES ($1,$2)',[jobId,subsidiaryId]);
      for(const status of statusFilters)await client.query('INSERT INTO report_job_status_filters (report_job_id,status) VALUES ($1,$2)',[jobId,status]);
      return result.rows[0];
    });
    try {
      const rows=await buildReportRows(db,context,category,{dateFrom,dateTo,mineIds,subsidiaryIds,statusFilters});
      const csv=csvHeader(rows)+rows.map((row)=>csvLine(row)).join('\r\n');
      await mkdir(config.reportDir,{recursive:true});
      const storageKey=`${jobId}.csv`;await writeFile(path.join(config.reportDir,storageKey),csv,'utf8');
      const hash=createHash('sha256').update(csv).digest('hex');
      await db.transaction(async(client)=>{
        await client.query("UPDATE report_jobs SET status='ready',completed_at=now(),row_count=$2 WHERE id=$1",[jobId,rows.length]);
        await client.query('INSERT INTO report_artifacts (id,report_job_id,storage_key,mime_type,sha256,byte_size,expires_at) VALUES ($1,$2,$3,$4,$5,$6,now()+interval \'7 days\')',[id('artifact'),jobId,storageKey,'text/csv',hash,Buffer.byteLength(csv,'utf8')]);
        await appendAudit(client,{actor:actor(context),action:'export',entityType:'report',entityId:jobId,entityLabel:title,updatedValue:{category,rowCount:rows.length,format:'csv'},mineIds,requestId:context.requestId});
      });
    } catch(error) {
      await db.query("UPDATE report_jobs SET status='failed',completed_at=now(),error=$2 WHERE id=$1",[jobId,(error as Error).message.slice(0,500)]).catch(()=>undefined);
      throw error;
    }
    return serializeReportJob(await reportJobRow(context,jobId),true);
  });

  app.get('/api/v1/reports/:id/content.csv', async (req, reply) => {
    const context=auth(req);context.require('report.download');const jobId=(req.params as {id:string}).id;const job=await reportJobRow(context,jobId);
    const artifact=await db.one('SELECT * FROM report_artifacts WHERE report_job_id=$1 ORDER BY created_at DESC LIMIT 1',[jobId]);
    if(!artifact)notFound('Report artifact');
    const file=await readFile(path.join(config.reportDir,artifact.storage_key),'utf8');
    await db.transaction(async(client)=>{await appendAudit(client,{actor:actor(context),action:'export',entityType:'report',entityId:jobId,entityLabel:job.title,updatedValue:{download:true},mineIds:job.mine_ids,requestId:context.requestId});});
    reply.header('Content-Type','text/csv; charset=utf-8').header('Content-Disposition',`attachment; filename="${job.file_name}"`).header('Cache-Control','no-store');
    return file;
  });

  /* ------------------------------------------------------------------ audit */
  app.get('/api/v1/audit', async (req) => {
    const context=auth(req);context.require('audit.view');const options=listOptions(req.query as Query,'timestamp');
    const params:unknown[]=[];const conditions:string[]=[];
    const scope=addScope(context,params,'aem.mine_id','m.subsidiary_id');
    if(scope!=='TRUE')conditions.push(`EXISTS (SELECT 1 FROM audit_event_mines aem JOIN mines m ON m.id=aem.mine_id WHERE aem.audit_id=a.id AND ${scope})`);
    for(const [field,column] of [['action','a.action'],['entityType','a.entity_type'],['actorId','a.actor_id'],['source','a.source']] as const){const value=queryValue(req.query as Query,field);if(value){params.push(value);conditions.push(`${column}=$${params.length}`);}}
    if(options.search){params.push(`%${options.search}%`);conditions.push(`(a.entity_label ILIKE $${params.length} OR a.actor_name ILIKE $${params.length} OR a.entity_id ILIKE $${params.length})`);}
    const where=conditions.length?`WHERE ${conditions.join(' AND ')}`:'';
    const total=await db.one<{total:number}>(`SELECT count(*)::int AS total FROM audit_events a ${where}`,params);
    const result=await db.query(`SELECT a.* FROM audit_events a ${where} ORDER BY a.timestamp DESC LIMIT $${params.length+1} OFFSET $${params.length+2}`,[...params,options.pageSize,options.offset]);
    return {items:result.rows.map(serializeAudit),meta:meta(total?.total??0,options)};
  });

  app.get('/api/v1/audit/ledger-status', async (req) => {
    auth(req).require('audit.view');
    const row=await db.one("SELECT status,verified FROM integration_connections WHERE category='ledger'");
    return Boolean(row&&row.status==='healthy'&&row.verified);
  });

  app.get('/api/v1/admin/audit/verify', async (req) => { auth(req).require('admin.access'); return verifyAuditChain(db.pool); });

  /* ---------------------------------------------------------------- dashboard */
  app.get('/api/v1/dashboard/summary', async (req) => {
    const context=auth(req);context.require('dashboard.view');
    const filters=req.query as Query;const mineId=queryValue(filters,'mineId');const subsidiaryId=queryValue(filters,'subsidiaryId');const region=queryValue(filters,'region');const operationalStatus=queryValue(filters,'operationalStatus');
    const params:unknown[]=[];const mineConditions:string[]=['TRUE'];
    if(mineId){params.push(mineId);mineConditions.push(`m.id=$${params.length}`);}
    if(subsidiaryId){params.push(subsidiaryId);mineConditions.push(`m.subsidiary_id=$${params.length}`);}
    if(region){params.push(region);mineConditions.push(`m.region=$${params.length}`);}
    if(operationalStatus){params.push(operationalStatus);mineConditions.push(`m.operational_status=$${params.length}`);}
    const scope=addScope(context,params,'m.id','m.subsidiary_id');mineConditions.push(scope);
    const mineWhere=`WHERE ${mineConditions.join(' AND ')}`;
    const mines=await db.query(`SELECT m.id,m.name,m.subsidiary_id,s.name AS subsidiary_name FROM mines m JOIN subsidiaries s ON s.id=m.subsidiary_id ${mineWhere}`, params.length ? params : undefined as any);
    const mineIds=mines.rows.map((row:any)=>row.id);
    if(!mineIds.length)return emptyDashboard(context);
    const idsParam='$1';const mineParams=[mineIds];
    const count=async(sql:string,extra:unknown[]=[])=>{const result=await db.one<{count:number}>(sql,[...mineParams,...extra]);return Number(result?.count??0);};
    const compliance=await db.query(`SELECT
      count(*) FILTER (WHERE c.status='compliant')::int AS compliant,
      count(*) FILTER (WHERE c.status='non_compliant')::int AS non_compliant,
      count(*) FILTER (WHERE c.status='awaiting_verification')::int AS awaiting,
      count(*) FILTER (WHERE c.status IN ('draft','pending_submission','submitted','under_review'))::int AS pending,
      count(*) FILTER (WHERE c.due_date<CURRENT_DATE AND c.status NOT IN ('compliant'))::int AS overdue
      FROM compliance_requirements c WHERE EXISTS (SELECT 1 FROM compliance_requirement_mines x WHERE x.compliance_id=c.id AND x.mine_id=ANY(${idsParam}::text[]))`,mineParams);
    const violations=await db.query(`SELECT count(*) FILTER (WHERE status IN ('open','under_remediation'))::int AS open,count(*) FILTER (WHERE due_date<CURRENT_DATE AND status<>'closed')::int AS overdue,count(*) FILTER (WHERE status='awaiting_verification')::int AS awaiting,count(*)::int AS total FROM violations WHERE mine_id=ANY(${idsParam}::text[])`,mineParams);
    const actions=await db.query(`SELECT count(*) FILTER (WHERE status NOT IN ('verified','closed'))::int AS open,count(*) FILTER (WHERE due_date<CURRENT_DATE AND status NOT IN ('verified','closed'))::int AS overdue,count(*) FILTER (WHERE status IN ('verified','closed'))::int AS completed FROM corrective_actions WHERE mine_id=ANY(${idsParam}::text[])`,mineParams);
    const safety=await count(`SELECT count(*)::int AS count FROM safety_records WHERE mine_id=ANY(${idsParam}::text[]) AND severity IN ('high','critical') AND status NOT IN ('resolved','closed')`);
    const inspections=await db.query(`SELECT count(*) FILTER (WHERE status='completed')::int AS completed,count(*) FILTER (WHERE status='scheduled')::int AS scheduled,count(*) FILTER (WHERE status='in_progress')::int AS in_progress FROM inspections WHERE mine_id=ANY(${idsParam}::text[])`,mineParams);
    const environmental=await count(`SELECT count(*)::int AS count FROM environmental_alerts WHERE mine_id=ANY(${idsParam}::text[]) AND reviewed_at IS NULL`);
    const contractors=await db.query(`SELECT count(DISTINCT c.id)::int AS total,count(DISTINCT c.id) FILTER (WHERE c.compliance_status='non_compliant')::int AS non_compliant FROM contractors c JOIN contractor_mines cm ON cm.contractor_id=c.id WHERE cm.mine_id=ANY(${idsParam}::text[])`,mineParams);
    // Outstanding reports scoped
    const user2 = context.user as any;
    let reports = 0;
    if (user2.orgWide) {
      const reportsRow=await db.one<{count:number}>("SELECT count(*)::int AS count FROM report_jobs WHERE status NOT IN ('ready','failed')");
      reports = Number(reportsRow?.count??0);
    } else {
      const reportsRow=await db.one<{count:number}>("SELECT count(*)::int AS count FROM report_jobs WHERE status NOT IN ('ready','failed') AND requested_by=$1",[context.user.id]);
      reports = Number(reportsRow?.count??0);
    }
    const production=await db.query(`SELECT COALESCE(sum(production_tonnes),0)::float AS actual,COALESCE(sum(target_tonnes),0)::float AS target FROM production_records WHERE mine_id=ANY(${idsParam}::text[]) AND date>=date_trunc('month',CURRENT_DATE)::date`,mineParams);
    return {
      totalMines:mines.rows.length,totalSubsidiaries:new Set(mines.rows.map((row:any)=>row.subsidiary_id)).size,
      complianceCompliant:compliance.rows[0]!.compliant,complianceNonCompliant:compliance.rows[0]!.non_compliant,complianceAwaitingVerification:compliance.rows[0]!.awaiting,pendingComplianceRequirements:compliance.rows[0]!.pending,overdueComplianceObligations:compliance.rows[0]!.overdue,
      openViolations:violations.rows[0]!.open,overdueViolations:violations.rows[0]!.overdue,violationsAwaitingVerification:violations.rows[0]!.awaiting,totalViolations:violations.rows[0]!.total,
      openCorrectiveActions:actions.rows[0]!.open,overdueCorrectiveActions:actions.rows[0]!.overdue,correctiveActionsCompleted:actions.rows[0]!.completed,
      highPrioritySafetyObservations:safety,
      inspectionsCompleted:inspections.rows[0]!.completed,inspectionsScheduled:inspections.rows[0]!.scheduled,inspectionsInProgress:inspections.rows[0]!.in_progress,
      environmentalAlerts:environmental,contractorsTotal:contractors.rows[0]!.total,contractorsNonCompliant:contractors.rows[0]!.non_compliant,outstandingReports:reports,
      productionTonnesMonth:Number(production.rows[0]!.actual),productionTargetMonth:production.rows[0]!.target?Number(production.rows[0]!.target):undefined,
      dataFreshness:{generatedAt:new Date().toISOString(),source:config.dataProvenance},
    };
  });

  app.get('/api/v1/dashboard/trends/compliance', async (req) => {
    const context=auth(req);context.require('dashboard.view');const params:unknown[]=[];const conditions=[addScope(context,params,'m.id','m.subsidiary_id')];
    const filters=req.query as Query;for(const [field,column] of [['mineId','m.id'],['subsidiaryId','m.subsidiary_id'],['region','m.region']] as const){const value=queryValue(filters,field);if(value){params.push(value);conditions.push(`${column}=$${params.length}`);}}
    const result=await db.query(`SELECT to_char(coalesce(c.last_verified_at,c.updated_at),'YYYY-MM') AS label,
      count(*) FILTER (WHERE c.status='compliant')::int AS compliant,count(*) FILTER (WHERE c.status='non_compliant')::int AS non_compliant
      FROM compliance_requirements c WHERE EXISTS (SELECT 1 FROM compliance_requirement_mines cm JOIN mines m ON m.id=cm.mine_id WHERE cm.compliance_id=c.id AND ${conditions.join(' AND ')})
      GROUP BY label ORDER BY label DESC LIMIT 8`,params);
    return result.rows.reverse().map((row:any)=>({label:row.label,value:row.compliant,secondary:row.non_compliant}));
  });

  app.get('/api/v1/dashboard/trends/production', async (req) => {
    const context=auth(req);context.require('dashboard.view');const params:unknown[]=[];const conditions=[addScope(context,params,'p.mine_id','m.subsidiary_id')];
    const filters=req.query as Query;for(const [field,column] of [['mineId','p.mine_id'],['subsidiaryId','m.subsidiary_id'],['region','m.region']] as const){const value=queryValue(filters,field);if(value){params.push(value);conditions.push(`${column}=$${params.length}`);}}
    const result=await db.query(`SELECT p.date::text AS label,sum(p.production_tonnes)::float AS actual,sum(coalesce(p.target_tonnes,0))::float AS target FROM production_records p JOIN mines m ON m.id=p.mine_id WHERE ${conditions.join(' AND ')} GROUP BY p.date ORDER BY p.date DESC LIMIT 14`,params);
    return result.rows.reverse().map((row:any)=>({label:row.label,value:Number(row.actual),secondary:Number(row.target)}));
  });

  app.get('/api/v1/dashboard/mine-comparison', async (req) => {
    const context=auth(req);context.require('dashboard.view');const params:unknown[]=[];const conditions=[addScope(context,params,'m.id','m.subsidiary_id')];
    const filters=req.query as Query;for(const [field,column] of [['mineId','m.id'],['subsidiaryId','m.subsidiary_id']] as const){const value=queryValue(filters,field);if(value){params.push(value);conditions.push(`${column}=$${params.length}`);}}
    const result=await db.query(`SELECT m.id AS mine_id,m.name AS mine_name,s.name AS subsidiary_name,
      (SELECT count(*)::int FROM compliance_requirements c JOIN compliance_requirement_mines cm ON cm.compliance_id=c.id WHERE cm.mine_id=m.id) AS compliance_total,
      (SELECT count(*)::int FROM compliance_requirements c JOIN compliance_requirement_mines cm ON cm.compliance_id=c.id WHERE cm.mine_id=m.id AND c.status='compliant') AS compliance_compliant,
      (SELECT count(*)::int FROM corrective_actions a WHERE a.mine_id=m.id AND a.status NOT IN ('verified','closed')) AS open_actions,
      (SELECT count(*)::int FROM safety_records r WHERE r.mine_id=m.id AND r.status NOT IN ('resolved','closed')) AS open_observations
      FROM mines m JOIN subsidiaries s ON s.id=m.subsidiary_id WHERE ${conditions.join(' AND ')} ORDER BY m.name`,params);
    return result.rows.map((row:any)=>{const score=row.compliance_total?Math.round((row.compliance_compliant/row.compliance_total)*100):0;return {mineId:row.mine_id,mineName:row.mine_name,subsidiaryName:row.subsidiary_name,complianceScore:score,openActions:row.open_actions,openObservations:row.open_observations,level:score>=80?'healthy':score>=60?'watch':'at_risk'};});
  });

  app.get('/api/v1/dashboard/risk-distribution', async (req) => { const context=auth(req);context.require('dashboard.view');return riskDistribution(context); });

  /* ---------------------------------------------------------------- search */
  app.get('/api/v1/search', async (req) => {
    const context=auth(req);const started=Date.now();const query=queryValue(req.query as Query,'q')?.trim();
    if(!query||query.length<2)badRequest('q must contain at least two characters.');
    const types=(queryValue(req.query as Query,'types')??'').split(',').filter(Boolean);
    const include=(type:string)=>!types.length||types.includes(type);
    const groups:any[]=[];const params:unknown[]=[];const mineScope=addScope(context,params,'m.id','m.subsidiary_id');
    const pattern=`%${query}%`;
    if(include('mines') && context.permissions.includes('mine.view')){
      params.push(pattern);const scopeAdd=addScope(context,params,'m.id','m.subsidiary_id');
      const rows=await db.many(`SELECT m.id,m.name,m.code,m.district FROM mines m WHERE (m.name ILIKE $${params.length} OR m.code ILIKE $${params.length} OR m.district ILIKE $${params.length}) AND ${scopeAdd} LIMIT 6`,params);
      groups.push({type:'mines',label:'Mines',items:rows.map((row:any)=>({id:row.id,title:row.name,subtitle:`${row.code} · ${row.district}`,href:`/mines/${row.id}`}))});
      params.pop();
    } else if(include('mines')) {
      // skip if no permission
    }
    if(include('compliance') && context.permissions.includes('compliance.view')){
      params.push(pattern);const rows=await db.many(`SELECT c.id,c.code,c.title,c.status FROM compliance_requirements c WHERE (c.title ILIKE $${params.length} OR c.code ILIKE $${params.length}) AND EXISTS (SELECT 1 FROM compliance_requirement_mines cm JOIN mines m ON m.id=cm.mine_id WHERE cm.compliance_id=c.id AND ${mineScope}) LIMIT 6`,params);
      groups.push({type:'compliance',label:'Compliance',items:rows.map((row:any)=>({id:row.id,title:row.title,subtitle:`${row.code} · ${row.status.replaceAll('_',' ')}`,href:`/compliance/${row.id}`}))});
      params.pop();
    }
    if(include('inspections') && context.permissions.includes('inspection.view')){
      params.push(pattern);const rows=await db.many(`SELECT i.id,i.code,i.status,i.scheduled_date,m.name AS mine_name FROM inspections i JOIN mines m ON m.id=i.mine_id WHERE (i.code ILIKE $${params.length} OR i.scope ILIKE $${params.length} OR m.name ILIKE $${params.length}) AND ${mineScope} LIMIT 6`,params);
      groups.push({type:'inspections',label:'Inspections',items:rows.map((row:any)=>({id:row.id,title:row.code,subtitle:`${row.mine_name} · ${row.status.replaceAll('_',' ')}`,href:`/inspections/${row.id}`}))});
      params.pop();
    }
    if(include('incidents') && context.permissions.includes('safety.view')){
      params.push(pattern);const rows=await db.many(`SELECT i.id,i.code,i.title,i.severity FROM incidents i JOIN mines m ON m.id=i.mine_id WHERE (i.title ILIKE $${params.length} OR i.code ILIKE $${params.length}) AND ${mineScope} LIMIT 6`,params);
      groups.push({type:'incidents',label:'Incidents',items:rows.map((row:any)=>({id:row.id,title:row.title,subtitle:`${row.code} · ${row.severity}`,href:`/safety/incidents/${row.id}`}))});
      params.pop();
    }
    if(include('observations') && context.permissions.includes('safety.view')){
      params.push(pattern);const rows=await db.many(`SELECT s.id,s.code,s.title,s.severity FROM safety_records s JOIN mines m ON m.id=s.mine_id WHERE (s.title ILIKE $${params.length} OR s.code ILIKE $${params.length}) AND ${mineScope} LIMIT 6`,params);
      groups.push({type:'observations',label:'Safety',items:rows.map((row:any)=>({id:row.id,title:row.title,subtitle:`${row.code} · ${row.severity}`,href:`/safety/${row.id}`}))});
      params.pop();
    }
    if(include('corrective_actions') && context.permissions.includes('corrective_action.view')){
      params.push(pattern);const rows=await db.many(`SELECT a.id,a.code,a.description,a.status FROM corrective_actions a JOIN mines m ON m.id=a.mine_id WHERE (a.description ILIKE $${params.length} OR a.code ILIKE $${params.length}) AND ${mineScope} LIMIT 6`,params);
      groups.push({type:'corrective_actions',label:'Corrective actions',items:rows.map((row:any)=>({id:row.id,title:row.description.slice(0,100),subtitle:`${row.code} · ${row.status.replaceAll('_',' ')}`,href:`/corrective-actions/${row.id}`}))});
      params.pop();
    }
    return {query,tookMs:Date.now()-started,groups:groups.filter((group)=>group.items.length)};
  });

  /* --------------------------------------------------------------- assistant */
  app.post('/api/v1/assistant/query', async (req) => {
    const context=auth(req);context.require('assistant.use');const body=req.body as Record<string,unknown>;
    const query=requireString(body.query,'query',1000);const requestedMines=Array.isArray(body.mineIds)?requireArray(body.mineIds,'mineIds'):[];
    const words=query.toLowerCase().match(/[a-z0-9_]+/g)?.filter((word)=>word.length>3&&!['what','which','show','list','about','with','from','that','this','have','were','there','their','overdue','open'].includes(word)).slice(0,5)??[];
    const params:unknown[]=[];const mineScope=addScope(context,params,'m.id','m.subsidiary_id');
    const conditions=[mineScope];if(requestedMines.length){params.push(requestedMines);conditions.push(`m.id=ANY($${params.length}::text[])`);}
    const citations:any[]=[];
    if(words.length){
      params.push(words.map((word)=>`%${word}%`));
      const wordParam=`$${params.length}`;
      const rows=await db.many(`SELECT c.id,c.code,c.title,c.status FROM compliance_requirements c WHERE EXISTS (SELECT 1 FROM compliance_requirement_mines cm JOIN mines m ON m.id=cm.mine_id WHERE cm.compliance_id=c.id AND ${conditions.join(' AND ')}) AND (c.title ILIKE ANY(${wordParam}::text[]) OR c.code ILIKE ANY(${wordParam}::text[])) LIMIT 5`,params);
      for(const row of rows)citations.push({entityType:'compliance',entityId:row.id,label:`${row.code} — ${row.title}`,href:`/compliance/${row.id}`,detail:`Status: ${row.status.replaceAll('_',' ')}`});
    }
    if(!citations.length&&words.length){
      const wordParam=`$${params.length}`;
      const rows=await db.many(`SELECT a.id,a.code,a.description,a.status FROM corrective_actions a JOIN mines m ON m.id=a.mine_id WHERE ${conditions.join(' AND ')} AND (a.description ILIKE ANY(${wordParam}::text[]) OR a.code ILIKE ANY(${wordParam}::text[])) LIMIT 5`,params);
      for(const row of rows)citations.push({entityType:'corrective_action',entityId:row.id,label:`${row.code} — ${row.description.slice(0,80)}`,href:`/corrective-actions/${row.id}`,detail:`Status: ${row.status.replaceAll('_',' ')}`});
    }
    return {
      answer:citations.length?`Found ${citations.length} stored record${citations.length===1?'':'s'} related to your question. This answer is retrieved from platform records, not generated by a language model.`:'No stored records in your assigned scope match that question. No answer has been generated.',
      citations,retrievalBased:true,...(citations.length?{}:{limitation:'The deterministic retrieval assistant found no grounding records.'}),generatedAt:new Date().toISOString(),
    };
  });

  /* ------------------------------------------------------------------- admin */
  app.get('/api/v1/admin/users', async (req) => {
    const context=auth(req);context.require('admin.users');const options=listOptions(req.query as Query,'name');
    const params:unknown[]=[];const conditions:string[]=[];
    if(options.search){params.push(`%${options.search}%`);conditions.push(`(u.name ILIKE $${params.length} OR u.email ILIKE $${params.length})`);}
    const where=conditions.length?`WHERE ${conditions.join(' AND ')}`:'';
    const total=await db.one<{total:number}>(`SELECT count(*)::int AS total FROM users u ${where}`,params);
    const result=await db.query(`SELECT u.*,COALESCE(array_agg(DISTINCT ms.mine_id) FILTER (WHERE ms.mine_id IS NOT NULL),'{}') AS mine_ids,COALESCE(array_agg(DISTINCT ss.subsidiary_id) FILTER (WHERE ss.subsidiary_id IS NOT NULL),'{}') AS subsidiary_ids,COALESCE(array_agg(DISTINCT m.name) FILTER (WHERE m.name IS NOT NULL),'{}') AS mine_names FROM users u LEFT JOIN user_mine_scopes ms ON ms.user_id=u.id LEFT JOIN user_subsidiary_scopes ss ON ss.user_id=u.id LEFT JOIN mines m ON m.id=ms.mine_id ${where} GROUP BY u.id ORDER BY u.name LIMIT $${params.length+1} OFFSET $${params.length+2}`,[...params,options.pageSize,options.offset]);
    return {items:result.rows.map(serializeUser),meta:meta(total?.total??0,options)};
  });

  app.patch('/api/v1/admin/users/:id/role', async (req) => {
    const context=auth(req);context.require('admin.users');
    if(context.user.role !== 'system_admin') throw new AppError(403,'forbidden','Only system administrators can change roles.');
    const userId=(req.params as {id:string}).id;
    const role=requireEnum((req.body as Record<string,unknown>).role,['mine_admin','mine_manager','safety_officer','environmental_officer','compliance_officer','field_inspector','contractor_manager','corporate_management','regulatory_user','system_admin'] as const,'role');
    const existing=await db.one('SELECT * FROM users WHERE id=$1',[userId]);if(!existing)notFound('User');
    if(userId===context.user.id && role!=='system_admin')conflict('You cannot remove your own administrator role.');
    // Prevent self-escalation edge cases already handled; ensure at least one admin remains
    if(existing.role==='system_admin' && role!=='system_admin'){
      const admins = await db.one<{count:number}>("SELECT count(*)::int AS count FROM users WHERE role='system_admin' AND deactivated_at IS NULL");
      if((admins?.count??0) <= 1) conflict('Cannot remove the last system administrator.');
    }
    const updated=await db.transaction(async(client)=>{const result=await client.query('UPDATE users SET role=$2,updated_at=now() WHERE id=$1 RETURNING *',[userId,role]);await appendAudit(client,{actor:actor(context),action:'update',entityType:'user',entityId:userId,entityLabel:existing.name,previousValue:{role:existing.role},updatedValue:{role},requestId:context.requestId});return result.rows[0];});
    return serializeUser(updated);
  });

  app.post('/api/v1/admin/users/:id/deactivate', async (req) => {
    const context=auth(req);context.require('admin.users');
    if(context.user.role !== 'system_admin') throw new AppError(403,'forbidden','Only system administrators can deactivate users.');
    const userId=(req.params as {id:string}).id;const existing=await db.one('SELECT * FROM users WHERE id=$1',[userId]);if(!existing)notFound('User');
    if(userId===context.user.id)conflict('You cannot deactivate your own account.');
    if(existing.role==='system_admin'){
      const admins = await db.one<{count:number}>("SELECT count(*)::int AS count FROM users WHERE role='system_admin' AND deactivated_at IS NULL");
      if((admins?.count??0) <= 1) conflict('Cannot deactivate the last system administrator.');
    }
    const updated=await db.transaction(async(client)=>{const result=await client.query('UPDATE users SET deactivated_at=now(),updated_at=now() WHERE id=$1 RETURNING *',[userId]);await client.query('UPDATE user_sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL',[userId]);await appendAudit(client,{actor:actor(context),action:'archive',entityType:'user',entityId:userId,entityLabel:existing.name,updatedValue:{deactivated:true},requestId:context.requestId});return result.rows[0];});
    return serializeUser(updated);
  });

  app.put('/api/v1/admin/users/:id/scopes', async (req) => {
    const context=auth(req);context.require('admin.users');
    if(context.user.role !== 'system_admin') throw new AppError(403,'forbidden','Only system administrators can manage scopes.');
    const userId=(req.params as {id:string}).id;
    if(userId===context.user.id) throw new AppError(403,'forbidden','You cannot modify your own scopes.');
    const body=req.body as Record<string,unknown>;
    const mineIds=Array.isArray(body.mineIds)?requireArray(body.mineIds,'mineIds'):[];
    const subsidiaryIds=Array.isArray(body.subsidiaryIds)?requireArray(body.subsidiaryIds,'subsidiaryIds'):[];
    const existing=await db.one('SELECT * FROM users WHERE id=$1',[userId]);if(!existing)notFound('User');
    // Validate mines/subsidiaries exist
    for(const id of mineIds){const m=await db.one('SELECT id FROM mines WHERE id=$1',[id]);if(!m)badRequest('Invalid mine scope.');}
    for(const id of subsidiaryIds){const s=await db.one('SELECT id FROM subsidiaries WHERE id=$1',[id]);if(!s)badRequest('Invalid subsidiary scope.');}
    await db.transaction(async(client)=>{
      await client.query('DELETE FROM user_mine_scopes WHERE user_id=$1',[userId]);
      await client.query('DELETE FROM user_subsidiary_scopes WHERE user_id=$1',[userId]);
      for(const id of mineIds) await client.query('INSERT INTO user_mine_scopes (user_id,mine_id) VALUES ($1,$2)',[userId,id]);
      for(const id of subsidiaryIds) await client.query('INSERT INTO user_subsidiary_scopes (user_id,subsidiary_id) VALUES ($1,$2)',[userId,id]);
      await appendAudit(client,{actor:actor(context),action:'update',entityType:'user',entityId:userId,entityLabel:existing.name,previousValue:{},updatedValue:{mineIds,subsidiaryIds},requestId:context.requestId});
    });
    // Reload
    const user = await (await import('../auth')).loadUser(db, userId);
    return serializeUser({ ...existing, ...user });
  });

  app.get('/api/v1/admin/reference-data', async (req) => {
    auth(req).require('admin.access');
    return {
      complianceCategories:[{value:'mine_safety',label:'Mine safety',description:'Statutory mine safety obligations'},{value:'environment',label:'Environment',description:'Environmental monitoring and consent conditions'},{value:'production',label:'Production',description:'Production reporting obligations'},{value:'labour',label:'Labour',description:'Labour and workforce obligations'},{value:'contractor',label:'Contractor',description:'Contractor compliance obligations'},{value:'other',label:'Other',description:'Other configured obligations'}],
      inspectionTypes:[{value:'statutory_safety',label:'Statutory safety',description:'Scheduled statutory safety inspection'},{value:'environment',label:'Environment',description:'Environmental inspection'},{value:'production',label:'Production',description:'Production audit'},{value:'labour',label:'Labour',description:'Labour compliance inspection'},{value:'contractor',label:'Contractor',description:'Contractor audit'},{value:'ad_hoc',label:'Ad hoc',description:'Ad hoc inspection'}],
      documentTypes:[{value:'compliance_evidence',label:'Compliance evidence',description:'Evidence supporting a compliance requirement'},{value:'inspection_report',label:'Inspection report',description:'Inspection report or evidence'},{value:'contract',label:'Contract',description:'Commercial or contractor contract'},{value:'worker_record',label:'Worker record',description:'Workforce record'},{value:'environment_log',label:'Environment log',description:'Environmental monitoring log'},{value:'production_report',label:'Production report',description:'Production report'},{value:'other',label:'Other',description:'Other controlled document'}],
      regions:[...new Set((await db.many('SELECT DISTINCT region FROM mines ORDER BY region')).map((row:any)=>row.region))],
      units:['µg/m³','mg/m³','dB(A)','pH','mg/L','t','%','count'],
    };
  });

  app.get('/api/v1/admin/integrations', async (req) => {
    auth(req).require('admin.integrations');
    const rows=await db.many('SELECT * FROM integration_connections ORDER BY category');
    return rows.map((row:any)=>({id:row.id,name:row.name,category:row.category,status:row.status,detail:row.detail,lastCheckedAt:new Date(row.last_checked_at).toISOString(),verified:row.verified}));
  });
}

function emptyDashboard(context:AuthContext){
  return {totalMines:0,totalSubsidiaries:0,complianceCompliant:0,complianceNonCompliant:0,complianceAwaitingVerification:0,pendingComplianceRequirements:0,overdueComplianceObligations:0,openViolations:0,overdueViolations:0,violationsAwaitingVerification:0,totalViolations:0,openCorrectiveActions:0,overdueCorrectiveActions:0,correctiveActionsCompleted:0,highPrioritySafetyObservations:0,inspectionsCompleted:0,inspectionsScheduled:0,inspectionsInProgress:0,environmentalAlerts:0,contractorsTotal:0,contractorsNonCompliant:0,outstandingReports:0,productionTonnesMonth:0,dataFreshness:{generatedAt:new Date().toISOString(),source:config.dataProvenance}};
}

async function ensureReportMine(context:AuthContext,mineId:string){if(!context.canAccessMine(mineId))forbidden('A selected mine is outside your assigned scope.');}

interface ReportFilters{dateFrom:string;dateTo:string;mineIds:string[];subsidiaryIds:string[];statusFilters:string[]}

async function buildReportRows(db:Database,context:AuthContext,category:string,filters:ReportFilters):Promise<Record<string,unknown>[]>{
  const params:unknown[]=[filters.dateFrom,filters.dateTo];
  const mineFilter=()=>{
    const conditions=['TRUE'];
    if(filters.mineIds.length){params.push(filters.mineIds);conditions.push(`m.id=ANY($${params.length}::text[])`);}
    if(filters.subsidiaryIds.length){params.push(filters.subsidiaryIds);conditions.push(`m.subsidiary_id=ANY($${params.length}::text[])`);}
    conditions.push(addScope(context,params,'m.id','m.subsidiary_id'));
    return conditions.join(' AND ');
  };
  const statusFilter=(column:string)=>filters.statusFilters.length?(()=>{params.push(filters.statusFilters);return `${column}=ANY($${params.length}::text[])`;})():'TRUE';
  let rows:any[]=[];
  switch(category){
    case 'statutory_compliance':
      rows=(await db.query(`SELECT c.code,c.title,string_agg(DISTINCT m.name,', ') AS mines,c.status,c.priority,c.due_date,c.source_reference,u.name AS officer FROM compliance_requirements c JOIN compliance_requirement_mines cm ON cm.compliance_id=c.id JOIN mines m ON m.id=cm.mine_id LEFT JOIN users u ON u.id=c.responsible_officer_id WHERE c.updated_at::date BETWEEN $1 AND $2 AND ${mineFilter()} AND ${statusFilter('c.status')} GROUP BY c.id,u.name ORDER BY c.due_date NULLS LAST`,params)).rows;
      return rows.map((row)=>({Code:row.code,Title:row.title,Mines:row.mines,Status:row.status,Priority:row.priority,DueDate:row.due_date,SourceReference:row.source_reference??'',ResponsibleOfficer:row.officer??''}));
    case 'inspection_summary':
      rows=(await db.query(`SELECT i.code,m.name AS mine,i.type,i.status,i.scheduled_date,i.actual_date,count(f.id)::int AS findings FROM inspections i JOIN mines m ON m.id=i.mine_id LEFT JOIN inspection_findings f ON f.inspection_id=i.id WHERE i.scheduled_date BETWEEN $1 AND $2 AND ${mineFilter()} AND ${statusFilter('i.status')} GROUP BY i.id,m.name ORDER BY i.scheduled_date`,params)).rows;
      return rows.map((row)=>({Code:row.code,Mine:row.mine,Type:row.type,Status:row.status,ScheduledDate:row.scheduled_date,ActualDate:row.actual_date??'',Findings:row.findings}));
    case 'safety_observations':
      rows=(await db.query(`SELECT s.code,m.name AS mine,s.type,s.severity,s.status,s.reported_at,u.name AS assignee FROM safety_records s JOIN mines m ON m.id=s.mine_id LEFT JOIN users u ON u.id=s.assigned_to WHERE s.reported_at::date BETWEEN $1 AND $2 AND ${mineFilter()} AND ${statusFilter('s.status')} ORDER BY s.reported_at`,params)).rows;
      return rows.map((row)=>({Code:row.code,Mine:row.mine,Type:row.type,Severity:row.severity,Status:row.status,ReportedAt:new Date(row.reported_at).toISOString(),Assignee:row.assignee??''}));
    case 'incidents':
      rows=(await db.query(`SELECT i.code,i.title,m.name AS mine,i.severity,i.status,i.occurred_at,i.injuries_reported,i.downtime_hours FROM incidents i JOIN mines m ON m.id=i.mine_id WHERE i.occurred_at::date BETWEEN $1 AND $2 AND ${mineFilter()} AND ${statusFilter('i.status')} ORDER BY i.occurred_at`,params)).rows;
      return rows.map((row)=>({Code:row.code,Title:row.title,Mine:row.mine,Severity:row.severity,Status:row.status,OccurredAt:new Date(row.occurred_at).toISOString(),Injuries:row.injuries_reported,DowntimeHours:row.downtime_hours??''}));
    case 'corrective_actions':
      rows=(await db.query(`SELECT a.code,a.description,m.name AS mine,a.priority,a.status,a.due_date,u.name AS assignee FROM corrective_actions a JOIN mines m ON m.id=a.mine_id LEFT JOIN users u ON u.id=a.assigned_to WHERE a.created_at::date BETWEEN $1 AND $2 AND ${mineFilter()} AND ${statusFilter('a.status')} ORDER BY a.due_date NULLS LAST`,params)).rows;
      return rows.map((row)=>({Code:row.code,Description:row.description,Mine:row.mine,Priority:row.priority,Status:row.status,DueDate:row.due_date??'',Assignee:row.assignee??''}));
    case 'environmental_monitoring':
      rows=(await db.query(`SELECT m.name AS mine,e.indicator,e.value,e.unit,e.status,e.measured_at,e.source,e.stale FROM environmental_measurements e JOIN mines m ON m.id=e.mine_id WHERE e.measured_at::date BETWEEN $1 AND $2 AND ${mineFilter()} AND ${statusFilter('e.status')} ORDER BY e.measured_at`,params)).rows;
      return rows.map((row)=>({Mine:row.mine,Indicator:row.indicator,Value:Number(row.value),Unit:row.unit,Status:row.status,MeasuredAt:new Date(row.measured_at).toISOString(),Source:row.source,Stale:String(row.stale)}));
    case 'production':
      rows=(await db.query(`SELECT m.name AS mine,p.date,p.shift,p.production_tonnes,p.target_tonnes,p.value_kind FROM production_records p JOIN mines m ON m.id=p.mine_id WHERE p.date BETWEEN $1 AND $2 AND ${mineFilter()} ORDER BY p.date,p.shift`,params)).rows;
      return rows.map((row)=>({Mine:row.mine,Date:row.date,Shift:row.shift,ProductionTonnes:Number(row.production_tonnes),TargetTonnes:row.target_tonnes===null?'':Number(row.target_tonnes),ValueKind:row.value_kind}));
    case 'contractor_compliance':
      rows=(await db.query(`SELECT c.code,c.name,c.type,c.compliance_status,string_agg(DISTINCT m.name,', ') AS mines FROM contractors c LEFT JOIN contractor_mines cm ON cm.contractor_id=c.id LEFT JOIN mines m ON m.id=cm.mine_id WHERE ${mineFilter()} AND ${statusFilter('c.compliance_status')} GROUP BY c.id ORDER BY c.name`,params)).rows;
      return rows.map((row)=>({Code:row.code,Name:row.name,Type:row.type,ComplianceStatus:row.compliance_status,Mines:row.mines??''}));
    case 'workforce':
      rows=(await db.query(`SELECT w.worker_ref,w.display_name,m.name AS mine,c.name AS contractor,a.date,a.shift,a.status FROM attendance_records a JOIN workforce_members w ON w.id=a.worker_id JOIN mines m ON m.id=a.mine_id LEFT JOIN contractors c ON c.id=a.contractor_id WHERE a.date BETWEEN $1 AND $2 AND ${mineFilter()} AND ${statusFilter('a.status')} ORDER BY a.date,w.worker_ref`,params)).rows;
      return rows.map((row)=>({WorkerRef:row.worker_ref,WorkerName:row.display_name,Mine:row.mine,Contractor:row.contractor??'',Date:row.date,Shift:row.shift,Status:row.status}));
    case 'audit_history': {
      const scope=addScope(context,params,'aem.mine_id','sm.subsidiary_id');
      const scopeClause=scope==='TRUE'?'TRUE':`EXISTS (SELECT 1 FROM audit_event_mines aem JOIN mines sm ON sm.id=aem.mine_id WHERE aem.audit_id=a.id AND ${scope})`;
      rows=(await db.query(`SELECT a.timestamp,a.actor_name,a.action,a.entity_type,a.entity_id,a.reason FROM audit_events a WHERE a.timestamp::date BETWEEN $1 AND $2 AND ${scopeClause} ORDER BY a.timestamp`,params)).rows;
      return rows.map((row)=>({Timestamp:new Date(row.timestamp).toISOString(),Actor:row.actor_name,Action:row.action,EntityType:row.entity_type,EntityId:row.entity_id,Reason:row.reason??''}));
    }
    default: badRequest('Unknown report category.');
  }
}

function csvHeader(rows:Record<string,unknown>[]):string{return rows.length?`${Object.keys(rows[0]!).map(csvEscape).join(',')}\r\n`:''}
function csvLine(row:Record<string,unknown>):string{return Object.values(row).map(csvEscape).join(',')}
function csvEscape(value:unknown):string{let text=value===null||value===undefined?'':String(value);if(/^[=+\-@\t\r]/.test(text))text=`'${text}`;if(/[",\r\n]/.test(text))text=`"${text.replaceAll('"','""')}"`;return text}
function mapUnique(error:unknown,message:string):never{if((error as {code?:string}).code==='23505')conflict(message);throw error;}
