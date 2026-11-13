/**
 * CoalGuard.AI — Predictive Risk Engine
 *
 * Provides calibrated risk estimates for defined future events using
 * historical outcomes and current mine conditions. All predictions are
 * explicitly labeled with data sufficiency, model version, and known
 * limitations. Uncalibrated scores are never represented as validated
 * probabilities.
 */

import type { Database } from './db';
import type { AuthContext } from './auth';
import {
  AppError, badRequest, forbidden, notFound, numberOrUndefined, optionalString, queryValue, requireEnum,
} from './http';

export type RiskBand = 'low' | 'moderate' | 'high' | 'critical';

export interface PredictionTarget {
  id: string;
  target_name: string;
  description?: string;
  event_category: string;
  prediction_horizon_days: number;
  eligible_population: any;
  label_definition: string;
  required_features: string[];
  enabled: boolean;
}

export interface PredictionRecord {
  id: string;
  target_id: string;
  mine_id: string;
  predicted_at: string;
  horizon_start: string;
  horizon_end: string;
  estimated_probability?: number;
  probability_calibrated: boolean;
  risk_band: RiskBand;
  model_id?: string;
  model_version: string;
  input_data_freshness?: string;
  data_completeness?: number;
  contributing_factors: any[];
  explanation?: string;
  limitations?: string;
  insufficient_evidence: boolean;
  linked_investigation_id?: string;
}

export interface ModelVersion {
  id: string;
  model_id: string;
  version: string;
  model_type: string;
  deployment_status: string;
}

export interface RiskAssessment {
  investigation_id: string;
  mine_id: string;
  event_category: string;
  prediction_horizon_days?: number;
  estimated_probability?: number;
  probability_calibrated: boolean;
  operational_risk_band: RiskBand;
  deterministic_findings: any[];
  historical_references: any[];
  external_evidence_references: any[];
  matched_factors: any[];
  partial_matched_factors: any[];
  unmatched_factors: any[];
  missing_evidence: string[];
  contradictory_evidence: string[];
  model_version?: string;
  policy_version?: string;
  explanation?: string;
  recommended_next_steps: string[];
  required_approval: boolean;
  notification_status?: string;
  investigation_status: string;
}

/**
 * Computes an operational risk band from probability, severity, and exposure.
 * Keeps probability separate from severity.
 */
export class RiskBandCalculator {
  /**
   * Deterministic risk band calculation.
   * probability: 0-1 estimated event probability
   * severity: 'low'|'medium'|'high'|'critical' operational severity
   * exposure: 'low'|'medium'|'high' exposure factor
   */
  static calculate(
    probability: number | null,
    severity: 'low' | 'medium' | 'high' | 'critical',
    exposure: 'low' | 'medium' | 'high',
  ): RiskBand {
    const sevScore = { low: 1, medium: 2, high: 3, critical: 4 }[severity] ?? 1;
    const expScore = { low: 1, medium: 2, high: 3 }[exposure] ?? 1;
    const probScore = probability === null ? 0 : probability >= 0.7 ? 4 : probability >= 0.4 ? 3 : probability >= 0.15 ? 2 : 1;
    const combined = probScore + sevScore + expScore;

    if (combined >= 9) return 'critical';
    if (combined >= 7) return 'high';
    if (combined >= 5) return 'moderate';
    return 'low';
  }
}

/**
 * Persists and retrieves prediction records with mine-scope enforcement.
 */
export class PredictionStore {
  constructor(private db: Database) {}

  async createPrediction(
    ctx: AuthContext,
    input: {
      targetId: string;
      mineId: string;
      horizonStart: string;
      horizonEnd: string;
      estimatedProbability?: number;
      probabilityCalibrated?: boolean;
      riskBand: RiskBand;
      modelId?: string;
      modelVersion: string;
      inputDataFreshness?: string;
      dataCompleteness?: number;
      contributingFactors?: any[];
      explanation?: string;
      limitations?: string;
      insufficientEvidence?: boolean;
      linkedInvestigationId?: string;
    },
  ): Promise<PredictionRecord> {
    if (input.mineId && !ctx.canAccessMine(input.mineId)) {
      throw forbidden('That mine is outside your assigned scope.');
    }

    const id = `pred-${crypto.randomUUID().slice(0, 12)}`;
    await this.db.query(
      `INSERT INTO prediction_records (
        id, target_id, mine_id, horizon_start, horizon_end,
        estimated_probability, probability_calibrated, risk_band,
        model_id, model_version, input_data_freshness, data_completeness,
        contributing_factors, explanation, limitations, insufficient_evidence,
        linked_investigation_id
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
      RETURNING *`,
      [
        id, input.targetId, input.mineId, input.horizonStart, input.horizonEnd,
        input.estimatedProbability ?? null,
        input.probabilityCalibrated ?? false,
        input.riskBand,
        input.modelId ?? null,
        input.modelVersion,
        input.inputDataFreshness ?? null,
        input.dataCompleteness ?? null,
        JSON.stringify(input.contributingFactors ?? []),
        input.explanation ?? null,
        input.limitations ?? null,
        input.insufficientEvidence ?? false,
        input.linkedInvestigationId ?? null,
      ],
    );
    return this.getPrediction(ctx, id);
  }

  async getPrediction(ctx: AuthContext, id: string): Promise<PredictionRecord> {
    const row = await this.db.one<PredictionRecord & { mine_id: string }>(
      'SELECT * FROM prediction_records WHERE id=$1',
      [id],
    );
    if (!row) notFound('Prediction record');
    if (!ctx.canAccessMine(row.mine_id)) forbidden('That prediction is outside your assigned scope.');
    return this.mapRow(row);
  }

  async listForMine(
    ctx: AuthContext,
    mineId: string,
    filters?: { targetId?: string; riskBand?: RiskBand; modelVersion?: string },
  ): Promise<PredictionRecord[]> {
    if (!ctx.canAccessMine(mineId)) forbidden('That mine is outside your assigned scope.');
    const params: unknown[] = [mineId];
    const conditions: string[] = ['mine_id = $1'];
    let p = 1;
    if (filters?.targetId) { p += 1; params.push(filters.targetId); conditions.push(`target_id = $${p}`); }
    if (filters?.riskBand) { p += 1; params.push(filters.riskBand); conditions.push(`risk_band = $${p}`); }
    if (filters?.modelVersion) { p += 1; params.push(filters.modelVersion); conditions.push(`model_version = $${p}`); }
    const rows = await this.db.many<PredictionRecord & { mine_id: string }>(
      `SELECT * FROM prediction_records WHERE ${conditions.join(' AND ')} ORDER BY predicted_at DESC`,
      params,
    );
    return rows.map((r) => this.mapRow(r));
  }

  async linkOutcome(
    ctx: AuthContext,
    predictionId: string,
    outcome: {
      targetId: string;
      mineId: string;
      occurred: boolean;
      occurredAt?: string;
      actualEventCategory?: string;
      recordedBy?: string;
      source: 'system' | 'manual' | 'inspection' | 'incident' | 'compliance';
    },
  ): Promise<void> {
    const prediction = await this.getPrediction(ctx, predictionId);
    if (prediction.mine_id !== outcome.mineId) {
      throw badRequest('Outcome mine does not match prediction mine.');
    }

    const id = `pred-out-${crypto.randomUUID().slice(0, 12)}`;
    await this.db.query(
      `INSERT INTO prediction_outcomes (
        id, prediction_id, target_id, mine_id, occurred, occurred_at,
        actual_event_category, recorded_by, source
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        id, predictionId, outcome.targetId, outcome.mineId, outcome.occurred,
        outcome.occurredAt ?? null, outcome.actualEventCategory ?? null,
        outcome.recordedBy ?? null, outcome.source,
      ],
    );
  }

  async getOutcome(ctx: AuthContext, predictionId: string): Promise<any | null> {
    const prediction = await this.getPrediction(ctx, predictionId);
    const row = await this.db.one(
      'SELECT * FROM prediction_outcomes WHERE prediction_id=$1',
      [predictionId],
    );
    if (!row) return null;
    return row;
  }

  async recordModelEvaluation(
    ctx: AuthContext,
    input: {
      modelId: string;
      versionId: string;
      windowStart: string;
      windowEnd: string;
      precision?: number;
      recall?: number;
      f1Score?: number;
      prAuc?: number;
      rocAuc?: number;
      brierScore?: number;
      falsePositiveRate?: number;
      falseNegativeRate?: number;
      calibrationError?: number;
      mineGroup?: any[];
      notes?: string;
    },
  ): Promise<void> {
    const id = `pred-eval-${crypto.randomUUID().slice(0, 12)}`;
    await this.db.query(
      `INSERT INTO model_evaluation_metrics (
        id, model_id, version_id, evaluation_window_start, evaluation_window_end,
        precision, recall, f1_score, pr_auc, roc_auc, brier_score,
        false_positive_rate, false_negative_rate, calibration_error,
        mine_group, notes
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
      [
        id, input.modelId, input.versionId, input.windowStart, input.windowEnd,
        input.precision ?? null, input.recall ?? null, input.f1Score ?? null,
        input.prAuc ?? null, input.rocAuc ?? null, input.brierScore ?? null,
        input.falsePositiveRate ?? null, input.falseNegativeRate ?? null,
        input.calibrationError ?? null,
        JSON.stringify(input.mineGroup ?? []), input.notes ?? null,
      ],
    );
  }

  private mapRow(row: any): PredictionRecord {
    return {
      id: row.id,
      target_id: row.target_id,
      mine_id: row.mine_id,
      predicted_at: row.predicted_at,
      horizon_start: row.horizon_start,
      horizon_end: row.horizon_end,
      estimated_probability: row.estimated_probability ? Number(row.estimated_probability) : undefined,
      probability_calibrated: row.probability_calibrated,
      risk_band: row.risk_band,
      model_id: row.model_id,
      model_version: row.model_version,
      input_data_freshness: row.input_data_freshness,
      data_completeness: row.data_completeness ? Number(row.data_completeness) : undefined,
      contributing_factors: row.contributing_factors ?? [],
      explanation: row.explanation,
      limitations: row.limitations,
      insufficient_evidence: row.insufficient_evidence,
      linked_investigation_id: row.linked_investigation_id,
    };
  }
}

export { RiskBandCalculator as RiskCalculator };
