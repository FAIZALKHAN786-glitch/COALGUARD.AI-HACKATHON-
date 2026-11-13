import type { FastifyInstance, FastifyRequest } from 'fastify';

import { appendAudit } from '../audit';
import type { AuthContext } from '../auth';
import type { Database } from '../db';
import {
  AppError, badRequest, compact, conflict, forbidden, id, notFound, optionalString, requireEnum, requireString,
} from '../http';
import { serializeInspection } from '../serializers';

const ITEM_RESULTS = ['compliant', 'non_compliant', 'na', 'not_inspected'] as const;

function auth(req: FastifyRequest): AuthContext {
  return (req as any).auth as AuthContext;
}

function actor(context: AuthContext) {
  return { id: context.user.id, name: context.user.name, role: context.user.role, ipHash: context.ipHash };
}

interface ChecklistIssue {
  missingItems: string[];
  unjustifiedItems: string[];
  missingEvidenceItems: string[];
  criticalItemsWithoutEvidence: string[];
}

/**
 * Resolve the checklist template for an inspection. A mine-specific template
 * wins over a generic template for the same type/version.
 */
export async function checklistFor(db: Database, inspection: { type: string; mine_id: string }) {
  const checklist = await db.one(
    `SELECT * FROM inspection_checklists
     WHERE inspection_type=$1 AND enabled=true AND (mine_id=$2 OR mine_id IS NULL)
     ORDER BY (mine_id IS NOT NULL) DESC, version DESC LIMIT 1`,
    [inspection.type, inspection.mine_id],
  );
  if (!checklist) return { checklist: null, items: [] as any[] };
  const items = await db.many(
    'SELECT * FROM inspection_checklist_items WHERE checklist_id=$1 ORDER BY sort_order, question',
    [checklist.id],
  );
  return { checklist, items };
}

export async function itemResults(db: Database, inspectionId: string) {
  return db.many(
    `SELECT r.*, COALESCE((SELECT array_agg(e.document_id) FROM inspection_item_evidence e WHERE e.inspection_item_result_id=r.id), '{}') AS evidence_document_ids
     FROM inspection_item_results r WHERE r.inspection_id=$1`,
    [inspectionId],
  );
}

/**
 * Returns the list of blockers preventing submission. An inspection cannot be
 * marked complete merely by changing its status: required checklist items must
 * have recorded outcomes, exceptions need justification, and evidence-bearing
 * items must carry at least one document.
 */
export async function inspectionSubmissionIssues(db: Database, inspectionId: string, type: string, mineId: string): Promise<ChecklistIssue> {
  const { checklist, items } = await checklistFor(db, { type, mine_id: mineId });
  const results = await itemResults(db, inspectionId);
  const byItem = new Map(results.map((row: any) => [row.checklist_item_id, row]));
  const issues: ChecklistIssue = { missingItems: [], unjustifiedItems: [], missingEvidenceItems: [], criticalItemsWithoutEvidence: [] };
  if (!checklist) return issues;
  for (const item of items) {
    const result = byItem.get(item.id) as any;
    if (item.required && !result) {
      issues.missingItems.push(item.question);
      continue;
    }
    if (!result) continue;
    if (['non_compliant', 'na', 'not_inspected'].includes(result.result) && !String(result.observations ?? '').trim()) {
      issues.unjustifiedItems.push(item.question);
    }
    if (item.evidence_required && (result.evidence_document_ids ?? []).length === 0) {
      issues.missingEvidenceItems.push(item.question);
    }
    if (result.result === 'compliant' && item.risk_level === 'critical' && (result.evidence_document_ids ?? []).length === 0) {
      issues.criticalItemsWithoutEvidence.push(item.question);
    }
  }
  return issues;
}

export function hasSubmissionBlockers(issues: ChecklistIssue): boolean {
  return Object.values(issues).some((list) => list.length > 0);
}

/**
 * Record advisory anomaly signals for supervisory sampling. These never change
 * the workflow state and never assert misconduct.
 */
export async function detectInspectionAnomalies(db: Database, inspectionId: string): Promise<void> {
  const inspection = await db.one('SELECT * FROM inspections WHERE id=$1', [inspectionId]);
  if (!inspection) return;
  const results = await itemResults(db, inspectionId);
  const findings = await db.many('SELECT * FROM inspection_findings WHERE inspection_id=$1', [inspectionId]);
  const evidence = await db.many('SELECT document_id FROM inspection_evidence WHERE inspection_id=$1', [inspectionId]);
  const signals: { signal_type: string; severity: string; details: Record<string, unknown> }[] = [];

  if (inspection.started_at && inspection.submitted_at) {
    const minutes = (new Date(inspection.submitted_at).getTime() - new Date(inspection.started_at).getTime()) / 60000;
    if (minutes >= 0 && minutes < 5 && results.length >= 5) {
      signals.push({ signal_type: 'rapid_completion', severity: 'medium', details: { minutes: Math.round(minutes * 10) / 10, itemCount: results.length } });
    }
  }
  if (results.length >= 5) {
    const distinct = new Set(results.map((row: any) => row.result));
    if (distinct.size === 1) {
      signals.push({ signal_type: 'identical_responses', severity: 'low', details: { outcome: results[0]?.result, itemCount: results.length } });
    }
  }
  const violations = findings.filter((finding: any) => finding.is_violation);
  if (violations.length > 0 && evidence.length === 0) {
    signals.push({ signal_type: 'missing_evidence', severity: 'high', details: { violations: violations.length } });
  }
  if (results.length >= 10 && results.every((row: any) => row.result === 'compliant') && evidence.length === 0) {
    signals.push({ signal_type: 'perfect_pattern', severity: 'medium', details: { itemCount: results.length, evidenceCount: 0 } });
  }

  for (const signal of signals) {
    await db.query(
      `INSERT INTO anomaly_signals (id,signal_type,entity_type,entity_id,mine_id,severity,details)
       VALUES ($1,$2,'inspection',$3,$4,$5,$6)
       ON CONFLICT DO NOTHING`,
      [id('anom'), signal.signal_type, inspectionId, inspection.mine_id, signal.severity, JSON.stringify(signal.details)],
    );
  }
}

/**
 * Evidence-based assurance controls:
 *  - structured checklist results with per-item evidence
 *  - approved-record reopening with justification + revision snapshot
 *  - anomaly signals for supervisory review (never conclusive proof of misconduct)
 */
export async function registerAssuranceRoutes(app: FastifyInstance, db: Database): Promise<void> {
  async function inspectionFor(context: AuthContext, inspectionId: string) {
    const row = await db.one('SELECT * FROM inspections WHERE id=$1', [inspectionId]);
    if (!row) notFound('Inspection');
    if (!context.canAccessMine(row.mine_id)) forbidden('That inspection is outside your assigned scope.');
    return row;
  }

  app.get('/api/v1/inspections/:id/checklist', async (req) => {
    const context = auth(req);
    context.require('inspection.view');
    const inspection = await inspectionFor(context, (req.params as { id: string }).id);
    const { checklist, items } = await checklistFor(db, inspection as any);
    const results = await itemResults(db, inspection.id);
    const byItem = new Map<string, any>(results.map((row: any) => [row.checklist_item_id, row]));
    return {
      inspectionId: inspection.id,
      checklistId: checklist?.id ?? null,
      checklistName: checklist?.name ?? null,
      items: items.map((item: any) => {
        const result = byItem.get(item.id);
        return {
          id: item.id,
          question: item.question,
          category: item.category,
          riskLevel: item.risk_level,
          required: item.required,
          evidenceRequired: item.evidence_required,
          evidenceTypes: item.evidence_types ?? [],
          allowNa: item.allow_na,
          allowNotInspected: item.allow_not_inspected,
          guidance: item.guidance ?? undefined,
          regulationRef: item.regulation_ref ?? undefined,
          result: result
            ? compact({
                id: result.id,
                outcome: result.result,
                observations: result.observations ?? undefined,
                measurements: result.measurements ?? undefined,
                recordedBy: result.recorded_by ?? undefined,
                recordedAt: result.recorded_at,
                updatedAt: result.updated_at,
                evidenceDocumentIds: result.evidence_document_ids ?? [],
              })
            : null,
        };
      }),
    };
  });

  app.put('/api/v1/inspections/:id/items/:itemId', async (req) => {
    const context = auth(req);
    context.require('inspection.edit');
    const { id: inspectionId, itemId } = req.params as { id: string; itemId: string };
    const inspection = await inspectionFor(context, inspectionId);
    if (!['scheduled', 'in_progress'].includes(inspection.status)) {
      conflict('Checklist results can only be recorded while the inspection is in progress.', 'invalid_transition');
    }
    const body = req.body as Record<string, unknown>;
    const outcome = requireEnum(body.result, ITEM_RESULTS, 'result');
    const observations = optionalString(body.observations, 'observations', 8000);
    const item = await db.one('SELECT * FROM inspection_checklist_items WHERE id=$1', [itemId]);
    if (!item) notFound('Checklist item');
    if (outcome === 'na' && !item.allow_na) badRequest('This item cannot be marked not applicable.');
    if (outcome === 'not_inspected' && !item.allow_not_inspected) badRequest('This item cannot be marked not inspected.');
    if ((outcome === 'non_compliant' || outcome === 'na' || outcome === 'not_inspected') && !observations?.trim()) {
      badRequest('A justification is required for a non-compliant, not-applicable or not-inspected result.');
    }
    const documentIds = Array.isArray(body.evidenceDocumentIds) ? body.evidenceDocumentIds.map(String) : [];
    if (item.evidence_required && documentIds.length === 0) {
      badRequest('This item requires at least one evidence document.');
    }
    for (const documentId of documentIds) {
      const document = await db.one('SELECT id, mine_id FROM documents WHERE id=$1', [documentId]);
      if (!document) badRequest('One or more evidence documents do not exist.');
      if (document.mine_id && document.mine_id !== inspection.mine_id) {
        forbidden('Evidence must belong to the same mine as the inspection.');
      }
    }
    const measurements = body.measurements === undefined ? null : JSON.stringify(body.measurements);
    await db.transaction(async (client) => {
      await client.query(
        `INSERT INTO inspection_item_results (id,inspection_id,checklist_item_id,result,observations,measurements,recorded_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (inspection_id,checklist_item_id) DO UPDATE SET
           result=EXCLUDED.result, observations=EXCLUDED.observations, measurements=EXCLUDED.measurements,
           recorded_by=EXCLUDED.recorded_by, updated_at=now()`,
        [id('iir'), inspectionId, itemId, outcome, observations ?? null, measurements, context.user.id],
      );
      const saved = await client.query<{ id: string }>(
        'SELECT id FROM inspection_item_results WHERE inspection_id=$1 AND checklist_item_id=$2',
        [inspectionId, itemId],
      );
      const resultId = saved.rows[0]!.id;
      await client.query('DELETE FROM inspection_item_evidence WHERE inspection_item_result_id=$1', [resultId]);
      for (const documentId of documentIds) {
        await client.query(
          'INSERT INTO inspection_item_evidence (inspection_item_result_id,document_id,attached_by) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
          [resultId, documentId, context.user.id],
        );
      }
      await appendAudit(client, {
        actor: actor(context),
        action: 'update',
        entityType: 'inspection',
        entityId: inspectionId,
        entityLabel: inspection.code,
        previousValue: { checklistItemId: itemId },
        updatedValue: { checklistItemId: itemId, result: outcome, evidenceDocumentIds: documentIds },
        mineIds: [inspection.mine_id],
        requestId: context.requestId,
      });
    });
    const result = await db.one('SELECT * FROM inspection_item_results WHERE inspection_id=$1 AND checklist_item_id=$2', [inspectionId, itemId]);
    return compact({
      id: result!.id,
      inspectionId,
      checklistItemId: itemId,
      result: result!.result,
      observations: result!.observations ?? undefined,
      measurements: result!.measurements ?? undefined,
      recordedAt: result!.recorded_at,
      updatedAt: result!.updated_at,
    });
  });

  /** Server-side dry run of submission validation, useful for UI hints. */
  app.get('/api/v1/inspections/:id/submission-check', async (req) => {
    const context = auth(req);
    context.require('inspection.view');
    const inspection = await inspectionFor(context, (req.params as { id: string }).id);
    const issues = await inspectionSubmissionIssues(db, inspection.id, inspection.type, inspection.mine_id);
    return { ready: !hasSubmissionBlockers(issues), issues };
  });

  /**
   * Reopen a completed/cancelled inspection. Requires review authority, a
   * documented reason, and writes a revision snapshot before the state change.
   */
  app.post('/api/v1/inspections/:id/reopen', async (req) => {
    const context = auth(req);
    context.require('inspection.review');
    const inspectionId = (req.params as { id: string }).id;
    const inspection = await inspectionFor(context, inspectionId);
    if (!['completed', 'cancelled', 'under_review'].includes(inspection.status)) {
      conflict('Only a completed, cancelled or under-review inspection can be reopened.', 'invalid_transition');
    }
    const body = req.body as Record<string, unknown>;
    const reason = requireString(body.reason, 'reason', 2000);
    if (reason.trim().length < 10) badRequest('Provide a substantive reopening reason.');
    if (inspection.status === 'completed' && inspection.inspector_id === context.user.id) {
      throw new AppError(403, 'forbidden', 'The original inspector cannot reopen their own completed inspection.');
    }
    const [findings, results, evidence] = await Promise.all([
      db.many('SELECT * FROM inspection_findings WHERE inspection_id=$1', [inspectionId]),
      itemResults(db, inspectionId),
      db.many('SELECT document_id FROM inspection_evidence WHERE inspection_id=$1', [inspectionId]),
    ]);
    await db.transaction(async (client) => {
      const revision = await client.query<{ next: number }>(
        'SELECT COALESCE(max(revision_number),0)+1 AS next FROM record_revisions WHERE entity_type=$1 AND entity_id=$2',
        ['inspection', inspectionId],
      );
      await client.query(
        'INSERT INTO record_revisions (id,entity_type,entity_id,revision_number,reason,changed_by,snapshot) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [id('rev'), 'inspection', inspectionId, revision.rows[0]!.next, reason, context.user.id,
          JSON.stringify({ inspection, findings, itemResults: results, evidence })],
      );
      await client.query(`UPDATE inspections SET status='in_progress', completed_at=NULL, updated_at=now() WHERE id=$1`, [inspectionId]);
      await client.query(
        'INSERT INTO inspection_status_history (id,inspection_id,from_status,to_status,actor_id,actor_name,comment) VALUES ($1,$2,$3,$4,$5,$6,$7)',
        [id('ish'), inspectionId, inspection.status, 'in_progress', context.user.id, context.user.name, reason],
      );
      await appendAudit(client, {
        actor: actor(context),
        action: 'status_change',
        entityType: 'inspection',
        entityId: inspectionId,
        entityLabel: inspection.code,
        previousValue: { status: inspection.status },
        updatedValue: { status: 'in_progress', reason },
        reason,
        mineIds: [inspection.mine_id],
        requestId: context.requestId,
      });
    });
    const updated = await db.one('SELECT * FROM inspections WHERE id=$1', [inspectionId]);
    return serializeInspection(updated!);
  });

  /** Revisions of a record, newest first. */
  app.get('/api/v1/inspections/:id/revisions', async (req) => {
    const context = auth(req);
    context.require('inspection.view');
    const inspection = await inspectionFor(context, (req.params as { id: string }).id);
    const rows = await db.many(
      'SELECT id,revision_number,reason,changed_by,changed_at FROM record_revisions WHERE entity_type=$1 AND entity_id=$2 ORDER BY revision_number DESC',
      ['inspection', inspection.id],
    );
    return rows.map((row: any) => ({
      id: row.id,
      revisionNumber: row.revision_number,
      reason: row.reason,
      changedBy: row.changed_by,
      changedAt: row.changed_at,
    }));
  });

  /** Supervisory review signals. Indicators only — not proof of misconduct. */
  app.get('/api/v1/inspections/:id/anomalies', async (req) => {
    const context = auth(req);
    context.require('inspection.view');
    const inspection = await inspectionFor(context, (req.params as { id: string }).id);
    const rows = await db.many(
      'SELECT * FROM anomaly_signals WHERE entity_type=$1 AND entity_id=$2 ORDER BY detected_at DESC',
      ['inspection', inspection.id],
    );
    return rows.map((row: any) => ({
      id: row.id,
      signalType: row.signal_type,
      severity: row.severity,
      details: row.details,
      detectedAt: row.detected_at,
      reviewed: row.reviewed,
      reviewedBy: row.reviewed_by ?? undefined,
      reviewedAt: row.reviewed_at ?? undefined,
      reviewNote: row.review_note ?? undefined,
    }));
  });

  /** Record a supervisory review decision on an anomaly signal. */
  app.post('/api/v1/anomalies/:id/review', async (req) => {
    const context = auth(req);
    context.require('inspection.review');
    const signalId = (req.params as { id: string }).id;
    const body = req.body as Record<string, unknown>;
    const note = optionalString(body.note, 'note', 2000);
    const existing = await db.one('SELECT * FROM anomaly_signals WHERE id=$1', [signalId]);
    if (!existing) notFound('Anomaly signal');
    if (existing.mine_id && !context.canAccessMine(existing.mine_id)) forbidden('That signal is outside your assigned scope.');
    await db.transaction(async (client) => {
      await client.query('UPDATE anomaly_signals SET reviewed=true, reviewed_by=$2, reviewed_at=now(), review_note=$3 WHERE id=$1', [signalId, context.user.id, note ?? null]);
      await appendAudit(client, {
        actor: actor(context),
        action: 'verify',
        entityType: 'anomaly_signal',
        entityId: signalId,
        entityLabel: existing.signal_type,
        updatedValue: { reviewed: true, note: note ?? null },
        mineIds: existing.mine_id ? [existing.mine_id] : [],
        requestId: context.requestId,
      });
    });
    return { id: signalId, reviewed: true };
  });
}
