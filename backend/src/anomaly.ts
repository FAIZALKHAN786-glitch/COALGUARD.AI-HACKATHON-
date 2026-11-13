/**
 * CoalGuard.AI — Anomaly Detection Engine
 *
 * Implements rule-based and statistical anomaly detection for mining
 * governance data. All detection is deterministic, auditable, and
 * mine-scope aware. No fabricated results are ever produced.
 */

import type { Database } from './db';
import type { AuthContext } from './auth';
import {
  AppError, badRequest, forbidden, notFound, numberOrUndefined, optionalString, queryValue, requireEnum,
} from './http';

export type AnomalyCategory =
  | 'mine_safety' | 'environment' | 'production' | 'labour' | 'contractor' | 'compliance' | 'equipment';

export type AnomalySeverity = 'low' | 'medium' | 'high' | 'critical';

export type DetectionMethod = 'rule' | 'statistical' | 'ml' | 'hybrid';

export type InvestigationStatus = 'open' | 'under_investigation' | 'resolved' | 'dismissed' | 'false_positive';

export interface AnomalyRule {
  id: string;
  rule_code: string;
  name: string;
  description?: string;
  category: AnomalyCategory;
  severity: AnomalySeverity;
  rule_expression: any;
  enabled: boolean;
  applies_to_mine_ids: string[];
  version: number;
}

export interface AnomalyFinding {
  id: string;
  mine_id: string;
  category: AnomalyCategory;
  severity: AnomalySeverity;
  detection_method: DetectionMethod;
  rule_id?: string;
  detected_at: string;
  observation_period_start?: string;
  observation_period_end?: string;
  observed_values: any;
  expected_baseline: any;
  deviation_magnitude?: number;
  confidence?: number;
  supporting_evidence: any[];
  data_quality_warnings: string[];
  investigation_status: InvestigationStatus;
  linked_investigation_id?: string;
}

export interface RuleEvaluationResult {
  triggered: boolean;
  severity?: AnomalySeverity;
  observed_values?: any;
  expected_baseline?: any;
  deviation_magnitude?: number;
  evidence?: any[];
  warnings?: string[];
}

/**
 * Rule-based anomaly detection. Evaluates deterministic rules against
 * mine data. Rules are versioned and auditable.
 */
export class AnomalyRuleEngine {
  private rules: AnomalyRule[] = [];

  constructor(rules: AnomalyRule[] = []) {
    this.rules = rules.filter((r) => r.enabled);
  }

  addRule(rule: AnomalyRule): void {
    this.rules.push(rule);
  }

  evaluateAll(
    mineId: string,
    data: Record<string, any>,
  ): RuleEvaluationResult[] {
    const results: RuleEvaluationResult[] = [];
    for (const rule of this.rules) {
      if (rule.applies_to_mine_ids.length > 0 && !rule.applies_to_mine_ids.includes(mineId)) continue;
      const result = this.evaluateRule(rule, data);
      if (result.triggered) {
        results.push(result);
      }
    }
    return results;
  }

  private evaluateRule(rule: AnomalyRule, data: Record<string, any>): RuleEvaluationResult {
    const expr = rule.rule_expression;
    if (!expr || typeof expr !== 'object') return { triggered: false };

    // Simple rule DSL: { field, operator, threshold, severity, ... }
    const field = expr.field;
    const operator = expr.operator;
    const threshold = expr.threshold;
    const value = data[field];

    if (value === undefined || value === null) return { triggered: false };

    let triggered = false;
    let deviation: number | undefined;
    switch (operator) {
      case 'gt': triggered = Number(value) > Number(threshold); break;
      case 'gte': triggered = Number(value) >= Number(threshold); break;
      case 'lt': triggered = Number(value) < Number(threshold); break;
      case 'lte': triggered = Number(value) <= Number(threshold); break;
      case 'eq': triggered = String(value) === String(threshold); break;
      case 'neq': triggered = String(value) !== String(threshold); break;
      case 'is_null': triggered = value === null || value === undefined; break;
      case 'is_not_null': triggered = value !== null && value !== undefined; break;
      case 'overdue_days_gt': {
        const dueDate = new Date(value);
        const now = new Date();
        const overdueDays = Math.floor((now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
        triggered = overdueDays > Number(threshold);
        deviation = overdueDays;
        break;
      }
      default: triggered = false;
    }

    if (!triggered) return { triggered: false };

    return {
      triggered: true,
      severity: rule.severity,
      observed_values: { [field]: value },
      expected_baseline: { [field]: threshold },
      deviation_magnitude: deviation,
      evidence: [{ rule: rule.rule_code, field, operator, threshold, value }],
      warnings: [],
    };
  }
}

/**
 * Statistical anomaly detection using robust z-scores and IQR.
 */
export class StatisticalAnomalyDetector {
  /**
   * Robust z-score using median and MAD (median absolute deviation).
   * Returns null when insufficient data.
   */
  static robustZScore(values: number[]): number | null {
    if (values.length < 3) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = sorted.length / 2;
    const median = sorted.length % 2 === 0
      ? (sorted[mid - 1]! as number + sorted[mid]! as number) / 2
      : (sorted[Math.floor(mid)]! as number);
    const deviations = sorted.map((v) => Math.abs(v - median));
    const sortedDev = [...deviations].sort((a, b) => a - b);
    const madMid = sortedDev.length / 2;
    const mad = sortedDev.length % 2 === 0
      ? (sortedDev[madMid - 1]! as number + sortedDev[madMid]! as number) / 2
      : (sortedDev[Math.floor(madMid)]! as number);
    if (mad === 0) return null;
    return ((values[values.length - 1] as number) - median) / (1.4826 * mad);
  }

  /**
   * IQR-based outlier detection for the most recent value.
   */
  static iqrOutlier(values: number[]): { isOutlier: boolean; lowerBound: number; upperBound: number } | null {
    if (values.length < 4) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const q1 = sorted[Math.floor(sorted.length * 0.25)] as number;
    const q3 = sorted[Math.ceil(sorted.length * 0.75)] as number;
    const iqr = q3 - q1;
    const lowerBound = q1 - 1.5 * iqr;
    const upperBound = q3 + 1.5 * iqr;
    const latest = values[values.length - 1] as number;
    return { isOutlier: latest < lowerBound || latest > upperBound, lowerBound, upperBound };
  }
}

/**
 * Persists anomaly findings to the database with mine-scope enforcement.
 */
export class AnomalyStore {
  constructor(private db: Database) {}

  async createFinding(
    ctx: AuthContext,
    input: {
      mineId: string;
      category: AnomalyCategory;
      severity: AnomalySeverity;
      detectionMethod: DetectionMethod;
      ruleId?: string;
      observationPeriodStart?: string;
      observationPeriodEnd?: string;
      observedValues: any;
      expectedBaseline: any;
      deviationMagnitude?: number;
      confidence?: number;
      supportingEvidence?: any[];
      dataQualityWarnings?: string[];
    },
  ): Promise<AnomalyFinding> {
    if (input.mineId && !ctx.canAccessMine(input.mineId)) {
      throw forbidden('That mine is outside your assigned scope.');
    }

    const id = `anom-${crypto.randomUUID().slice(0, 12)}`;
    await this.db.query(
      `INSERT INTO anomaly_findings (
        id, mine_id, category, severity, detection_method, rule_id,
        observation_period_start, observation_period_end, observed_values,
        expected_baseline, deviation_magnitude, confidence,
        supporting_evidence, data_quality_warnings, investigation_status
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'open')
      RETURNING *`,
      [
        id, input.mineId, input.category, input.severity, input.detectionMethod,
        input.ruleId ?? null,
        input.observationPeriodStart ?? null, input.observationPeriodEnd ?? null,
        JSON.stringify(input.observedValues),
        JSON.stringify(input.expectedBaseline),
        input.deviationMagnitude ?? null,
        input.confidence ?? null,
        JSON.stringify(input.supportingEvidence ?? []),
        JSON.stringify(input.dataQualityWarnings ?? []),
      ],
    );
    return this.getFinding(ctx, id);
  }

  async getFinding(ctx: AuthContext, id: string): Promise<AnomalyFinding> {
    const row = await this.db.one<AnomalyFinding & { mine_id: string }>(
      'SELECT * FROM anomaly_findings WHERE id=$1',
      [id],
    );
    if (!row) notFound('Anomaly finding');
    if (!ctx.canAccessMine(row.mine_id)) forbidden('That anomaly is outside your assigned scope.');
    return this.mapRow(row);
  }

  async listForMine(
    ctx: AuthContext,
    mineId: string,
    filters?: { category?: AnomalyCategory; severity?: AnomalySeverity; status?: InvestigationStatus },
  ): Promise<AnomalyFinding[]> {
    if (!ctx.canAccessMine(mineId)) forbidden('That mine is outside your assigned scope.');
    const params: unknown[] = [mineId];
    const conditions: string[] = ['mine_id = $1'];
    let p = 1;
    if (filters?.category) { p += 1; params.push(filters.category); conditions.push(`category = $${p}`); }
    if (filters?.severity) { p += 1; params.push(filters.severity); conditions.push(`severity = $${p}`); }
    if (filters?.status) { p += 1; params.push(filters.status); conditions.push(`investigation_status = $${p}`); }
    const rows = await this.db.many<AnomalyFinding & { mine_id: string }>(
      `SELECT * FROM anomaly_findings WHERE ${conditions.join(' AND ')} ORDER BY detected_at DESC`,
      params,
    );
    for (const row of rows) {
      if (!ctx.canAccessMine(row.mine_id)) continue;
    }
    return rows.map((r) => this.mapRow(r));
  }

  async updateStatus(
    ctx: AuthContext,
    id: string,
    status: InvestigationStatus,
    resolvedBy?: string,
  ): Promise<AnomalyFinding> {
    const finding = await this.getFinding(ctx, id);
    const resolvedAt = status === 'resolved' || status === 'dismissed' || status === 'false_positive' ? new Date().toISOString() : null;
    const row = await this.db.one<AnomalyFinding & { mine_id: string }>(
      `UPDATE anomaly_findings
       SET investigation_status=$1, resolved_at=$2, resolved_by=$3, updated_at=now()
       WHERE id=$4 RETURNING *`,
      [status, resolvedAt, resolvedBy ?? null, id],
    );
    return this.mapRow(row);
  }

  private mapRow(row: any): AnomalyFinding {
    return {
      id: row.id,
      mine_id: row.mine_id,
      category: row.category,
      severity: row.severity,
      detection_method: row.detection_method,
      rule_id: row.rule_id,
      detected_at: row.detected_at,
      observation_period_start: row.observation_period_start,
      observation_period_end: row.observation_period_end,
      observed_values: row.observed_values,
      expected_baseline: row.expected_baseline,
      deviation_magnitude: row.deviation_magnitude ? Number(row.deviation_magnitude) : undefined,
      confidence: row.confidence ? Number(row.confidence) : undefined,
      supporting_evidence: row.supporting_evidence ?? [],
      data_quality_warnings: row.data_quality_warnings ?? [],
      investigation_status: row.investigation_status,
      linked_investigation_id: row.linked_investigation_id,
    };
  }
}

export { AnomalyRuleEngine as RuleEngine, StatisticalAnomalyDetector as StatDetector };
