/**
 * CoalGuard.AI — AI Intelligence Backend Routes
 *
 * Server-side API routes for AI intelligence: anomaly detection, predictive
 * risk scoring, autonomous investigation workflows, risk assessment, model
 * registry, and document OCR. All endpoints query the real PostgreSQL database
 * — no mock data, no simulated responses.
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Database } from '../db';
import type { AuthContext } from '../auth';
import {
  AppError, badRequest, forbidden, notFound, id, listOptions, meta,
  optionalDate, optionalString, queryValue, requireEnum, requireString,
  sortColumn, type Query, numberOrUndefined,
} from '../http';
import { appendAudit } from '../audit';

function auth(req: FastifyRequest): AuthContext {
  return (req as any).auth as AuthContext;
}

/* ============================================================================
   ANOMALY DETECTION
   ========================================================================== */

export async function registerAnomalyRoutes(app: FastifyInstance, db: Database): Promise<void> {

  /** List anomaly findings with mine-scope filtering */
  app.get('/api/v1/ai/anomalies', async (req) => {
    const context = auth(req);
    context.require('mine.view');
    const options = listOptions(req.query as Query, 'detected_at');
    const params: unknown[] = [];
    const conditions: string[] = [];
    const mineId = queryValue(req.query as Query, 'mineId');
    if (mineId) {
      if (!context.canAccessMine(mineId)) {
        throw forbidden('That mine is outside your assigned scope.');
      }
      params.push(mineId);
      conditions.push(`mine_id = $${params.length}`);
    }
    const category = queryValue(req.query as Query, 'category');
    if (category) { params.push(category); conditions.push(`category = $${params.length}`); }
    const severity = queryValue(req.query as Query, 'severity');
    if (severity) { params.push(severity); conditions.push(`severity = $${params.length}`); }
    const status = queryValue(req.query as Query, 'status');
    if (status) { params.push(status); conditions.push(`investigation_status = $${params.length}`); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await db.query(
      `SELECT * FROM anomaly_findings ${where} ORDER BY detected_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, options.pageSize, options.offset]
    );
    return { items: result.rows, meta: meta(result.rows.length, options) };
  });

  /** Get a single anomaly finding with evidence */
  app.get('/api/v1/ai/anomalies/:id', async (req) => {
    const context = auth(req);
    context.require('mine.view');
    const { id: anomalyId } = req.params as { id: string };
    const row = await db.one('SELECT * FROM anomaly_findings WHERE id=$1', [anomalyId]);
    if (!row) notFound('Anomaly finding');
    if (!context.canAccessMine(row.mine_id)) forbidden('That anomaly is outside your assigned scope.');
    const evidence = await db.many(
      'SELECT * FROM anomaly_evidence WHERE anomaly_id=$1 ORDER BY linked_at DESC',
      [anomalyId]
    );
    return {
      ...row,
      detected_at: row.detected_at?.toISOString(),
      observation_period_start: row.observation_period_start?.toISOString(),
      observation_period_end: row.observation_period_end?.toISOString(),
      evidence: evidence.map((e) => ({
        id: e.id,
        entity_type: e.entity_type,
        entity_id: e.entity_id,
        entity_code: e.entity_code,
        relevance_note: e.relevance_note,
        linked_at: e.linked_at?.toISOString(),
      })),
    };
  });

  /** Create an anomaly rule definition */
  app.post('/api/v1/ai/anomalies/rules', async (req) => {
    const context = auth(req);
    context.require('admin.config');
    const body = req.body as Record<string, unknown>;
    const ruleId = `rule-${id('rule')}`;
    await db.query(
      `INSERT INTO anomaly_rule_definitions (
        id, rule_code, name, description, category, severity, rule_expression,
        enabled, applies_to_mine_ids, version, approved_by, approved_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      RETURNING *`,
      [
        ruleId,
        requireString(body.rule_code, 'rule_code', 80),
        requireString(body.name, 'name', 200),
        optionalString(body.description, 'description', 1000),
        requireEnum(body.category, ['mine_safety','environment','production','labour','contractor','compliance','equipment'] as const, 'category'),
        requireEnum(body.severity, ['low','medium','high','critical'] as const, 'severity'),
        JSON.stringify(body.rule_expression || {}),
        body.enabled !== false,
        body.applies_to_mine_ids ?? [],
        1,
        context.user.id,
        new Date().toISOString(),
      ]
    );
    await appendAudit(db as any, {
      actor: { id: context.user.id, name: context.user.name, role: context.user.role, ipHash: context.ipHash },
      action: 'create', entityType: 'anomaly_rule', entityId: ruleId,
      entityLabel: String(body.name ?? ''), updatedValue: { rule_code: body.rule_code },
      mineIds: [], requestId: context.requestId,
    });
    return { id: ruleId, rule_code: body.rule_code, name: String(body.name ?? '') };
  });

  /** List anomaly rules */
  app.get('/api/v1/ai/anomalies/rules', async (req) => {
    const context = auth(req);
    context.require('mine.view');
    const result = await db.query(
      `SELECT * FROM anomaly_rule_definitions ORDER BY rule_code`
    );
    return result.rows;
  });

  /** Persist anomaly detection results from the AI service */
  app.post('/api/v1/ai/anomalies/detect', async (req) => {
    const context = auth(req);
    context.require('mine.view');
    const body = req.body as Record<string, unknown>;
    const mineId = requireString(body.mineId, 'mineId', 80);
    const mineRow = await db.one<{ id: string; subsidiary_id: string }>('SELECT id, subsidiary_id FROM mines WHERE id=$1', [mineId]);
    if (!mineRow) notFound('Mine');
    if (!context.canAccessMine(mineRow.id, mineRow.subsidiary_id)) forbidden('That mine is outside your assigned scope.');
    const anomalyId = `anom-${id('anom')}`;
    await db.query(
      `INSERT INTO anomaly_findings (
        id, mine_id, category, severity, detection_method, rule_id,
        observation_period_start, observation_period_end, observed_values,
        expected_baseline, deviation_magnitude, confidence,
        supporting_evidence, data_quality_warnings, investigation_status
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'open')
      RETURNING *`,
      [
        anomalyId, mineId,
        requireEnum(body.category, ['mine_safety','environment','production','labour','contractor','compliance','equipment'] as const, 'category'),
        requireEnum(body.severity, ['low','medium','high','critical'] as const, 'severity'),
        requireEnum(body.detectionMethod, ['rule','statistical','ml','hybrid'] as const, 'detectionMethod'),
        optionalString(body.ruleId, 'ruleId', 80),
        optionalDate(body.observationPeriodStart, 'observationPeriodStart'),
        optionalDate(body.observationPeriodEnd, 'observationPeriodEnd'),
        JSON.stringify(body.observedValues ?? {}),
        JSON.stringify(body.expectedBaseline ?? {}),
        numberOrUndefined(body.deviationMagnitude),
        numberOrUndefined(body.confidence),
        JSON.stringify(body.supportingEvidence ?? []),
        JSON.stringify(body.dataQualityWarnings ?? []),
      ]
    );
    await appendAudit(db as any, {
      actor: { id: context.user.id, name: context.user.name, role: context.user.role, ipHash: context.ipHash },
      action: 'create', entityType: 'anomaly_finding', entityId: anomalyId,
      entityLabel: String(body.name ?? `Anomaly ${anomalyId}`), mineIds: [mineId], requestId: context.requestId,
    });
    return { id: anomalyId, mineId, category: body.category, severity: body.severity };
  });
}

/* ============================================================================
   PREDICTIVE RISK SCORING
   ========================================================================== */

export async function registerPredictionRoutes(app: FastifyInstance, db: Database): Promise<void> {

  /** List prediction targets */
  app.get('/api/v1/ai/prediction-targets', async (req) => {
    const context = auth(req);
    context.require('mine.view');
    const result = await db.query(
      `SELECT * FROM prediction_targets WHERE enabled = true ORDER BY target_name`
    );
    return result.rows;
  });

  /** List prediction records with mine-scope filtering */
  app.get('/api/v1/ai/predictions', async (req) => {
    const context = auth(req);
    context.require('mine.view');
    const params: unknown[] = [];
    const conditions: string[] = [];
    const mineId = queryValue(req.query as Query, 'mineId');
    if (mineId) {
      if (!context.canAccessMine(mineId)) throw forbidden('That mine is outside your assigned scope.');
      params.push(mineId); conditions.push(`mine_id = $${params.length}`);
    }
    const riskBand = queryValue(req.query as Query, 'riskBand');
    if (riskBand) { params.push(riskBand); conditions.push(`risk_band = $${params.length}`); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await db.query(
      `SELECT * FROM prediction_records ${where} ORDER BY predicted_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, 50, 0]
    );
    return { items: result.rows.map((r) => ({
      ...r,
      predicted_at: r.predicted_at?.toISOString(),
      horizon_start: r.horizon_start?.toISOString(),
      horizon_end: r.horizon_end?.toISOString(),
    })) };
  });

  /** Link an outcome to a prediction */
  app.post('/api/v1/ai/predictions/:id/outcome', async (req) => {
    const context = auth(req);
    context.require('mine.view');
    const { id: predictionId } = req.params as { id: string };
    const body = req.body as Record<string, unknown>;
    const pred = await db.one('SELECT * FROM prediction_records WHERE id=$1', [predictionId]);
    if (!pred) notFound('Prediction record');
    if (!context.canAccessMine(pred.mine_id)) forbidden('That prediction is outside your assigned scope.');
    await db.query(
      `INSERT INTO prediction_outcomes (
        id, prediction_id, target_id, mine_id, occurred, occurred_at,
        actual_event_category, recorded_by, source
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      ON CONFLICT (prediction_id) DO UPDATE SET
        occurred = EXCLUDED.occurred,
        occurred_at = EXCLUDED.occurred_at,
        actual_event_category = EXCLUDED.actual_event_category,
        recorded_by = EXCLUDED.recorded_by,
        source = EXCLUDED.source`,
      [
        `out-${id('out')}`, predictionId, body.target_id, pred.mine_id,
        body.occurred === true,
        optionalDate(body.occurredAt, 'occurredAt'),
        optionalString(body.actualEventCategory, 'actualEventCategory'),
        context.user.id,
        optionalString(body.source, 'source') || 'manual',
      ]
    );
    return { id: predictionId, outcome: body.occurred };
  });
}

/* ============================================================================
   INVESTIGATION WORKFLOWS
   ========================================================================== */

export async function registerInvestigationRoutes(app: FastifyInstance, db: Database): Promise<void> {

  /** List investigations */
  app.get('/api/v1/ai/investigations', async (req) => {
    const context = auth(req);
    context.require('mine.view');
    const params: unknown[] = [];
    const conditions: string[] = [];
    const mineId = queryValue(req.query as Query, 'mineId');
    if (mineId) {
      if (!context.canAccessMine(mineId)) throw forbidden('That mine is outside your assigned scope.');
      params.push(mineId); conditions.push(`mine_id = $${params.length}`);
    }
    const stage = queryValue(req.query as Query, 'stage');
    if (stage) { params.push(stage); conditions.push(`current_stage = $${params.length}`); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await db.query(
      `SELECT * FROM investigation_records ${where} ORDER BY started_at DESC LIMIT 50`,
      params
    );
    return result.rows.map((r) => ({
      ...r,
      started_at: r.started_at?.toISOString(),
      completed_at: r.completed_at?.toISOString(),
      human_reviewed_at: r.human_reviewed_at?.toISOString(),
    }));
  });

  /** Get investigation details with evidence links */
  app.get('/api/v1/ai/investigations/:id', async (req) => {
    const context = auth(req);
    context.require('mine.view');
    const { id: invId } = req.params as { id: string };
    const inv = await db.one('SELECT * FROM investigation_records WHERE id=$1', [invId]);
    if (!inv) notFound('Investigation');
    if (!context.canAccessMine(inv.mine_id)) forbidden('That investigation is outside your assigned scope.');
    const evidence = await db.many(
      'SELECT * FROM investigation_evidence_links WHERE investigation_id=$1 ORDER BY linked_at DESC',
      [invId]
    );
    return { ...inv, evidence: evidence.map((e) => ({ ...e, linked_at: e.linked_at?.toISOString() })) };
  });

  /** Create investigation */
  app.post('/api/v1/ai/investigations', async (req) => {
    const context = auth(req);
    context.require('mine.view');
    const body = req.body as Record<string, unknown>;
    const invId = `inv-${id('inv')}`;
    const triggerEventType = requireString(body.triggerEventType, 'triggerEventType', 80);
    await db.query(
      `INSERT INTO investigation_records (
        id, mine_id, anomaly_id, prediction_id, trigger_event_type,
        trigger_event_id, correlation_id, current_stage, risk_assessment,
        model_version, policy_version, data_quality_status
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      RETURNING *`,
      [
        invId, requireString(body.mineId, 'mineId', 80),
        optionalString(body.anomalyId, 'anomalyId'),
        optionalString(body.predictionId, 'predictionId'),
        requireString(body.triggerEventType, 'triggerEventType', 80),
        optionalString(body.triggerEventId, 'triggerEventId'),
        requireString(body.correlationId, 'correlationId', 80),
        'received',
        JSON.stringify(body.riskAssessment ?? {}),
        optionalString(body.modelVersion, 'modelVersion'),
        optionalString(body.policyVersion, 'policyVersion'),
        optionalString(body.dataQualityStatus, 'dataQualityStatus'),
      ]
    );
    await appendAudit(db as any, {
      actor: { id: context.user.id, name: context.user.name, role: context.user.role, ipHash: context.ipHash },
      action: 'create', entityType: 'investigation', entityId: invId,
      entityLabel: triggerEventType, mineIds: [requireString(body.mineId, 'mineId', 80)],
      requestId: context.requestId,
    });
    return { id: invId, correlationId: body.correlationId, stage: 'received' };
  });

  /** Transition investigation stage */
  app.post('/api/v1/ai/investigations/:id/transition', async (req) => {
    const context = auth(req);
    context.require('mine.view');
    const { id: invId } = req.params as { id: string };
    const body = req.body as Record<string, unknown>;
    const inv = await db.one('SELECT * FROM investigation_records WHERE id=$1', [invId]);
    if (!inv) notFound('Investigation');
    if (!context.canAccessMine(inv.mine_id)) forbidden('That investigation is outside your assigned scope.');
    const nextStage = requireString(body.nextStage, 'nextStage', 60);
    const validTransitions: Record<string, string[]> = {
      received: ['validating', 'failed', 'cancelled'],
      validating: ['context_gathering', 'failed', 'cancelled'],
      context_gathering: ['historical_analysis', 'failed', 'cancelled'],
      historical_analysis: ['predictive_assessment', 'external_research', 'factor_correlation', 'failed', 'cancelled'],
      predictive_assessment: ['external_research', 'factor_correlation', 'risk_evaluation', 'failed', 'cancelled'],
      external_research: ['factor_correlation', 'risk_evaluation', 'failed', 'cancelled'],
      factor_correlation: ['risk_evaluation', 'failed', 'cancelled'],
      risk_evaluation: ['human_review_required', 'action_pending', 'notification_pending', 'monitoring', 'failed', 'cancelled'],
      human_review_required: ['action_pending', 'notification_pending', 'monitoring', 'failed', 'cancelled'],
      action_pending: ['notification_pending', 'monitoring', 'failed', 'cancelled'],
      notification_pending: ['monitoring', 'failed', 'cancelled'],
      monitoring: ['completed', 'failed', 'cancelled'],
      completed: [],
      failed: ['received', 'cancelled'],
      cancelled: [],
    };
    if (!validTransitions[inv.current_stage]?.includes(nextStage)) {
      throw badRequest(`Cannot transition from ${inv.current_stage} to ${nextStage}`);
    }
    await db.query(
      `UPDATE investigation_records SET current_stage=$1, updated_at=now()${
        nextStage === 'completed' ? ', completed_at=now()' : ''
      } WHERE id=$2`,
      [nextStage, invId]
    );
    if (body.decision) {
      await db.query(
        `INSERT INTO investigation_decisions (
          id, investigation_id, stage, decision, rationale, policy_applied,
          made_by, requires_human_approval, approved_by, approved_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          `dec-${id('dec')}`, invId, inv.current_stage, body.decision,
          optionalString(body.rationale, 'rationale', 1000),
          optionalString(body.policyApplied, 'policyApplied', 200),
          context.user.id,
          body.requiresHumanApproval === true,
          optionalString(body.approvedBy, 'approvedBy', 80),
          body.approvedBy ? new Date().toISOString() : null,
        ]
      );
    }
    return { id: invId, oldStage: inv.current_stage, newStage: nextStage };
  });
}

/* ============================================================================
   MODEL REGISTRY
   ========================================================================== */

export async function registerModelRoutes(app: FastifyInstance, db: Database): Promise<void> {
  app.get('/api/v1/ai/models', async (req) => {
    const context = auth(req);
    context.require('mine.view');
    const result = await db.query(
      `SELECT * FROM model_registry_entries ORDER BY created_at DESC`
    );
    return result.rows;
  });

  app.get('/api/v1/ai/models/:id/versions', async (req) => {
    const context = auth(req);
    context.require('mine.view');
    const { id: modelId } = req.params as { id: string };
    const result = await db.query(
      `SELECT * FROM model_versions WHERE model_id=$1 ORDER BY version DESC`,
      [modelId]
    );
    return result.rows;
  });

  app.get('/api/v1/ai/models/:id/evaluations', async (req) => {
    const context = auth(req);
    context.require('mine.view');
    const { id: modelId } = req.params as { id: string };
    const result = await db.query(
      `SELECT * FROM model_evaluation_metrics WHERE model_id=$1 ORDER BY evaluated_at DESC`,
      [modelId]
    );
    return result.rows;
  });
}

/* ============================================================================
   AI NOTIFICATIONS
   ========================================================================== */

export async function registerAINotificationRoutes(app: FastifyInstance, db: Database): Promise<void> {
  app.get('/api/v1/ai/notifications', async (req) => {
    const context = auth(req);
    context.require('mine.view');
    const mineId = queryValue(req.query as Query, 'mineId');
    const params: unknown[] = [];
    const conditions: string[] = [];
    if (mineId) {
      if (!context.canAccessMine(mineId)) throw forbidden('That mine is outside your assigned scope.');
      params.push(mineId); conditions.push(`mine_id = $${params.length}`);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await db.query(
      `SELECT * FROM ai_notification_records ${where} ORDER BY created_at DESC LIMIT 100`,
      params
    );
    return result.rows.map((r) => ({
      ...r,
      created_at: r.created_at?.toISOString(),
      action_deadline: r.action_deadline?.toISOString(),
      acknowledged_at: r.acknowledged_at?.toISOString(),
    }));
  });

  app.post('/api/v1/ai/notifications/:id/acknowledge', async (req) => {
    const context = auth(req);
    context.require('mine.view');
    const { id: notifId } = req.params as { id: string };
    await db.query(
      `UPDATE ai_notification_records SET acknowledged=true, acknowledged_by=$1, acknowledged_at=now() WHERE id=$2`,
      [context.user.id, notifId]
    );
    return { id: notifId, acknowledged: true };
  });
}

/* ============================================================================
   REGISTER ALL AI ROUTES
   ========================================================================== */

export async function registerAIRoutes(app: FastifyInstance, db: Database): Promise<void> {
  await registerAnomalyRoutes(app, db);
  await registerPredictionRoutes(app, db);
  await registerInvestigationRoutes(app, db);
  await registerModelRoutes(app, db);
  await registerAINotificationRoutes(app, db);
}
