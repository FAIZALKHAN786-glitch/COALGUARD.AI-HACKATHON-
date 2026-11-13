/**
 * CoalGuard.AI — Investigation Workflow Service
 *
 * Manages durable, stateful investigation workflows triggered by anomalies,
 * predictions, or compliance events. All state transitions are validated and
 * audited. No concurrent orchestration systems are used.
 */

import type { Database } from './db';
import type { AuthContext } from './auth';
import {
  AppError, badRequest, forbidden, notFound, optionalString, requireEnum,
} from './http';

export type InvestigationStage =
  | 'received' | 'validating' | 'context_gathering' | 'historical_analysis'
  | 'predictive_assessment' | 'external_research' | 'factor_correlation'
  | 'risk_evaluation' | 'human_review_required' | 'action_pending'
  | 'notification_pending' | 'monitoring' | 'completed' | 'failed' | 'cancelled';

export interface InvestigationRecord {
  id: string;
  mine_id: string;
  anomaly_id?: string;
  prediction_id?: string;
  trigger_event_type: string;
  trigger_event_id?: string;
  correlation_id: string;
  current_stage: InvestigationStage;
  started_at: string;
  completed_at?: string;
  risk_assessment: any;
  model_version?: string;
  policy_version?: string;
  data_quality_status?: string;
  outstanding_questions: string[];
  recommended_actions: string[];
  executed_action_references: string[];
  human_review_required: boolean;
  human_review_completed: boolean;
  human_reviewed_by?: string;
  human_reviewed_at?: string;
  retry_count: number;
  final_outcome?: string;
}

export interface InvestigationDecision {
  id: string;
  investigation_id: string;
  stage: InvestigationStage;
  decision: string;
  rationale?: string;
  policy_applied?: string;
  made_by: string;
  made_at: string;
  requires_human_approval: boolean;
  approved_by?: string;
  approved_at?: string;
}

export interface InvestigationEvidenceLink {
  id: string;
  investigation_id: string;
  evidence_type: 'historical_incident' | 'internal_record' | 'external_source'
    | 'prediction_output' | 'rule_finding' | 'measurement' | 'document';
  evidence_id: string;
  evidence_code?: string;
  relevance?: string;
  source_provenance: any;
}

/**
 * Valid stage transitions for the investigation state machine.
 */
const VALID_TRANSITIONS: Record<InvestigationStage, InvestigationStage[]> = {
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

/**
 * Persists and manages investigation records with mine-scope enforcement.
 */
export class InvestigationStore {
  constructor(private db: Database) {}

  async createInvestigation(
    ctx: AuthContext,
    input: {
      mineId: string;
      anomalyId?: string;
      predictionId?: string;
      triggerEventType: string;
      triggerEventId?: string;
      correlationId: string;
      riskAssessment?: any;
      modelVersion?: string;
      policyVersion?: string;
      dataQualityStatus?: string;
    },
  ): Promise<InvestigationRecord> {
    if (input.mineId && !ctx.canAccessMine(input.mineId)) {
      throw forbidden('That mine is outside your assigned scope.');
    }

    const id = `inv-${crypto.randomUUID().slice(0, 12)}`;
    await this.db.query(
      `INSERT INTO investigation_records (
        id, mine_id, anomaly_id, prediction_id, trigger_event_type,
        trigger_event_id, correlation_id, current_stage, risk_assessment,
        model_version, policy_version, data_quality_status
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
      RETURNING *`,
      [
        id, input.mineId, input.anomalyId ?? null, input.predictionId ?? null,
        input.triggerEventType, input.triggerEventId ?? null, input.correlationId,
        'received', JSON.stringify(input.riskAssessment ?? {}),
        input.modelVersion ?? null, input.policyVersion ?? null, input.dataQualityStatus ?? null,
      ],
    );
    return this.getInvestigation(ctx, id);
  }

  async getInvestigation(ctx: AuthContext, id: string): Promise<InvestigationRecord> {
    const row = await this.db.one<InvestigationRecord & { mine_id: string }>(
      'SELECT * FROM investigation_records WHERE id=$1',
      [id],
    );
    if (!row) notFound('Investigation record');
    if (!ctx.canAccessMine(row.mine_id)) forbidden('That investigation is outside your assigned scope.');
    return this.mapRow(row);
  }

  async listForMine(
    ctx: AuthContext,
    mineId: string,
    filters?: { stage?: InvestigationStage },
  ): Promise<InvestigationRecord[]> {
    if (!ctx.canAccessMine(mineId)) forbidden('That mine is outside your assigned scope.');
    const params: unknown[] = [mineId];
    const conditions: string[] = ['mine_id = $1'];
    let p = 1;
    if (filters?.stage) { p += 1; params.push(filters.stage); conditions.push(`current_stage = $${p}`); }
    const rows = await this.db.many<InvestigationRecord & { mine_id: string }>(
      `SELECT * FROM investigation_records WHERE ${conditions.join(' AND ')} ORDER BY started_at DESC`,
      params,
    );
    return rows.map((r) => this.mapRow(r));
  }

  async transitionStage(
    ctx: AuthContext,
    id: string,
    nextStage: InvestigationStage,
    decision?: { decision: string; rationale?: string; policyApplied?: string; requiresHumanApproval?: boolean; approvedBy?: string },
  ): Promise<InvestigationRecord> {
    const investigation = await this.getInvestigation(ctx, id);
    const allowed = VALID_TRANSITIONS[investigation.current_stage];
    if (!allowed || !allowed.includes(nextStage)) {
      throw badRequest(
        `Cannot transition investigation from ${investigation.current_stage} to ${nextStage}.`,
        { transition: ['invalid_stage_transition'] },
      );
    }

    const updates: string[] = ['current_stage=$1', 'updated_at=now()'];
    const params: unknown[] = [nextStage];
    let p = 1;

    if (nextStage === 'completed') {
      p += 1; params.push(new Date().toISOString());
      updates.push(`completed_at=$${p}`);
    }
    if (decision) {
      p += 1; params.push(decision.decision);
      updates.push(`risk_assessment = risk_assessment || jsonb_build_object('last_decision', $${p})`);
      p += 1; params.push(decision.rationale ?? null);
      updates.push(`policy_version = COALESCE($${p}, policy_version)`);
      if (decision.requiresHumanApproval) {
        p += 1; params.push(true);
        updates.push(`human_review_required = $${p}`);
      }
      if (decision.approvedBy) {
        p += 1; params.push(decision.approvedBy);
        updates.push(`human_reviewed_by = $${p}, human_reviewed_at = now()`);
        p += 1; params.push(true);
        updates.push(`human_review_completed = $${p}`);
      }
    }

    params.push(id);
    updates.push(`id = $${params.length}`); // no-op, ensures id in params
    const row = await this.db.one<InvestigationRecord & { mine_id: string }>(
      `UPDATE investigation_records SET ${updates.join(', ')} WHERE id=$${params.length} RETURNING *`,
      params,
    );

    // Record the decision
    if (decision) {
      await this.db.query(
        `INSERT INTO investigation_decisions (
          id, investigation_id, stage, decision, rationale, policy_applied,
          made_by, requires_human_approval, approved_by, approved_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          `inv-dec-${crypto.randomUUID().slice(0, 8)}`, id, investigation.current_stage,
          decision.decision, decision.rationale ?? null, decision.policyApplied ?? null,
          ctx.user.id, decision.requiresHumanApproval ?? false,
          decision.approvedBy ?? null, decision.approvedBy ? new Date().toISOString() : null,
        ],
      );
    }

    return this.mapRow(row);
  }

  async addEvidenceLink(
    ctx: AuthContext,
    investigationId: string,
    link: {
      evidenceType: InvestigationEvidenceLink['evidence_type'];
      evidenceId: string;
      evidenceCode?: string;
      relevance?: string;
      sourceProvenance?: any;
    },
  ): Promise<void> {
    await this.getInvestigation(ctx, investigationId); // enforces scope
    const id = `inv-evid-${crypto.randomUUID().slice(0, 12)}`;
    await this.db.query(
      `INSERT INTO investigation_evidence_links (
        id, investigation_id, evidence_type, evidence_id, evidence_code,
        relevance, source_provenance
      ) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [
        id, investigationId, link.evidenceType, link.evidenceId,
        link.evidenceCode ?? null, link.relevance ?? null,
        JSON.stringify(link.sourceProvenance ?? {}),
      ],
    );
  }

  async updateRiskAssessment(
    ctx: AuthContext,
    id: string,
    assessment: any,
  ): Promise<void> {
    await this.getInvestigation(ctx, id); // enforces scope
    await this.db.query(
      `UPDATE investigation_records SET risk_assessment=$1, updated_at=now() WHERE id=$2`,
      [JSON.stringify(assessment), id],
    );
  }

  async incrementRetry(ctx: AuthContext, id: string): Promise<void> {
    await this.getInvestigation(ctx, id); // enforces scope
    await this.db.query(
      `UPDATE investigation_records SET retry_count = retry_count + 1, updated_at=now() WHERE id=$1`,
      [id],
    );
  }

  private mapRow(row: any): InvestigationRecord {
    return {
      id: row.id,
      mine_id: row.mine_id,
      anomaly_id: row.anomaly_id,
      prediction_id: row.prediction_id,
      trigger_event_type: row.trigger_event_type,
      trigger_event_id: row.trigger_event_id,
      correlation_id: row.correlation_id,
      current_stage: row.current_stage,
      started_at: row.started_at,
      completed_at: row.completed_at,
      risk_assessment: row.risk_assessment ?? {},
      model_version: row.model_version,
      policy_version: row.policy_version,
      data_quality_status: row.data_quality_status,
      outstanding_questions: row.outstanding_questions ?? [],
      recommended_actions: row.recommended_actions ?? [],
      executed_action_references: row.executed_action_references ?? [],
      human_review_required: row.human_review_required,
      human_review_completed: row.human_review_completed,
      human_reviewed_by: row.human_reviewed_by,
      human_reviewed_at: row.human_reviewed_at,
      retry_count: row.retry_count,
      final_outcome: row.final_outcome,
    };
  }
}
