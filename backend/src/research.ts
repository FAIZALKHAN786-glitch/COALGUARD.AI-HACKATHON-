/**
 * CoalGuard.AI — External Research & Factor Comparison Service
 *
 * Provides controlled web research capability for investigation workflows.
 * All external content is treated as untrusted. Source provenance is preserved.
 * No external content can modify system behavior or override permissions.
 */

import type { Database } from './db';
import type { AuthContext } from './auth';
import {
  AppError, badRequest, forbidden, notFound, numberOrUndefined, optionalString, queryValue, requireEnum,
} from './http';

export type SourceCategory =
  | 'regulatory' | 'safety_advisory' | 'incident_report' | 'technical_report' | 'equipment_failure' | 'environmental';

export type SourceType = 'government' | 'regulatory' | 'scientific' | 'technical' | 'industry';

export type ResearchStatus = 'pending' | 'completed' | 'failed' | 'no_results' | 'provider_unavailable';

export type Reliability = 'high' | 'medium' | 'low' | 'unverified';

export type Relevance = 'direct' | 'partial' | 'indirect' | 'not_applicable';

export type ComparisonResult =
  | 'match' | 'partial_match' | 'no_match' | 'unknown' | 'conflicting_evidence' | 'not_applicable';

export interface ExternalSource {
  id: string;
  source_name: string;
  publisher?: string;
  source_type: SourceType;
  base_url?: string;
  jurisdiction?: string;
  credibility_score?: number;
  requires_credentials: boolean;
  active: boolean;
  notes?: string;
}

export interface ResearchQuery {
  id: string;
  investigation_id?: string;
  query_text: string;
  source_category: SourceCategory;
  provider: string;
  status: ResearchStatus;
  results_count: number;
  created_at: string;
  completed_at?: string;
  error_message?: string;
}

export interface ExternalEvidence {
  id: string;
  research_query_id: string;
  source_id?: string;
  source_title: string;
  source_url?: string;
  publisher?: string;
  publication_date?: string;
  retrieval_timestamp: string;
  relevant_passage?: string;
  reliability: Reliability;
  relevance: Relevance;
  limitation?: string;
  stored_content_hash?: string;
}

export interface FactorComparison {
  id: string;
  investigation_id: string;
  external_evidence_id?: string;
  factor_name: string;
  factor_category: string;
  comparison_result: ComparisonResult;
  internal_field?: string;
  internal_value?: string;
  external_value?: string;
  match_reasoning?: string;
  data_available: boolean;
  current_within_limits?: boolean;
  limitation?: string;
  compared_at: string;
}

/**
 * External source registry - approved sources only.
 */
export class ExternalSourceRegistry {
  constructor(private db: Database) {}

  async registerSource(
    ctx: AuthContext,
    input: {
      source_name: string;
      publisher?: string;
      source_type: SourceType;
      base_url?: string;
      jurisdiction?: string;
      credibility_score?: number;
      requires_credentials?: boolean;
      active?: boolean;
      notes?: string;
    },
  ): Promise<ExternalSource> {
    ctx.require('admin.config');
    const id = `src-${crypto.randomUUID().slice(0, 12)}`;
    await this.db.query(
      `INSERT INTO external_source_registry (
        id, source_name, publisher, source_type, base_url, jurisdiction,
        credibility_score, requires_credentials, active, notes
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [
        id, input.source_name, input.publisher ?? null, input.source_type,
        input.base_url ?? null, input.jurisdiction ?? null,
        input.credibility_score ?? null,
        input.requires_credentials ?? false,
        input.active ?? true, input.notes ?? null,
      ],
    );
    return this.getSource(id);
  }

  async getSource(id: string): Promise<ExternalSource> {
    const row = await this.db.one<ExternalSource>(
      'SELECT * FROM external_source_registry WHERE id=$1',
      [id],
    );
    if (!row) notFound('External source');
    return row;
  }

  async listActive(): Promise<ExternalSource[]> {
    return this.db.many<ExternalSource>(
      'SELECT * FROM external_source_registry WHERE active = true ORDER BY source_name',
    );
  }
}

/**
 * Research query management - tracks searches and results.
 */
export class ResearchQueryStore {
  constructor(private db: Database) {}

  async createQuery(
    ctx: AuthContext,
    input: {
      investigationId?: string;
      queryText: string;
      sourceCategory: SourceCategory;
      provider: string;
    },
  ): Promise<ResearchQuery> {
    if (input.investigationId) {
      // Verify investigation access
      const inv = await this.db.one('SELECT mine_id FROM investigation_records WHERE id=$1', [input.investigationId]);
      if (!inv || !ctx.canAccessMine(inv.mine_id)) {
        throw forbidden('That investigation is outside your assigned scope.');
      }
    }

    const id = `rq-${crypto.randomUUID().slice(0, 12)}`;
    await this.db.query(
      `INSERT INTO research_queries (
        id, investigation_id, query_text, source_category, provider, status
      ) VALUES ($1,$2,$3,$4,$5,'pending') RETURNING *`,
      [id, input.investigationId ?? null, input.queryText, input.sourceCategory, input.provider],
    );
    return this.getQuery(id);
  }

  async getQuery(id: string): Promise<ResearchQuery> {
    const row = await this.db.one<ResearchQuery>(
      'SELECT * FROM research_queries WHERE id=$1',
      [id],
    );
    if (!row) notFound('Research query');
    return row;
  }

  async updateStatus(
    id: string,
    status: 'completed' | 'failed' | 'no_results' | 'provider_unavailable',
    resultsCount: number = 0,
    errorMessage?: string,
  ): Promise<void> {
    await this.db.query(
      `UPDATE research_queries SET status=$1, results_count=$2, completed_at=now(), error_message=$3 WHERE id=$4`,
      [status, resultsCount, errorMessage ?? null, id],
    );
  }
}

/**
 * External evidence storage with provenance tracking.
 */
export class ExternalEvidenceStore {
  constructor(private db: Database) {}

  async addEvidence(
    ctx: AuthContext,
    input: {
      researchQueryId: string;
      sourceId?: string;
      sourceTitle: string;
      sourceUrl?: string;
      publisher?: string;
      publicationDate?: string;
      relevantPassage?: string;
      reliability: 'high' | 'medium' | 'low' | 'unverified';
      relevance: 'direct' | 'partial' | 'indirect' | 'not_applicable';
      limitation?: string;
      storedContentHash?: string;
    },
  ): Promise<ExternalEvidence> {
    // Verify research query exists
    await this.db.one('SELECT 1 FROM research_queries WHERE id=$1', [input.researchQueryId]);

    const id = `ext-evid-${crypto.randomUUID().slice(0, 12)}`;
    await this.db.query(
      `INSERT INTO external_evidence_records (
        id, research_query_id, source_id, source_title, source_url,
        publisher, publication_date, retrieval_timestamp,
        relevant_passage, reliability, relevance, limitation, stored_content_hash
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [
        id, input.researchQueryId, input.sourceId ?? null, input.sourceTitle,
        input.sourceUrl ?? null, input.publisher ?? null,
        input.publicationDate ?? null, new Date().toISOString(),
        input.relevantPassage ?? null, input.reliability, input.relevance,
        input.limitation ?? null, input.storedContentHash ?? null,
      ],
    );
    return this.getEvidence(input.researchQueryId, id);
  }

  async getEvidence(queryId: string, id: string): Promise<ExternalEvidence> {
    const row = await this.db.one<ExternalEvidence>(
      'SELECT * FROM external_evidence_records WHERE id=$1 AND research_query_id=$2',
      [id, queryId],
    );
    if (!row) notFound('External evidence');
    return row;
  }

  async listForQuery(queryId: string): Promise<ExternalEvidence[]> {
    return this.db.many<ExternalEvidence>(
      'SELECT * FROM external_evidence_records WHERE research_query_id=$1 ORDER BY retrieval_timestamp DESC',
      [queryId],
    );
  }
}

/**
 * Factor comparison engine - compares external findings with mine records.
 */
export class FactorComparisonEngine {
  constructor(private db: Database) {}

  /**
   * Compares an external factor against current mine records.
   * Returns structured comparison with evidence.
   */
  async compareFactor(
    ctx: AuthContext,
    input: {
      investigationId: string;
      externalEvidenceId?: string;
      factorName: string;
      factorCategory: string;
      internalField: string;
      externalValue: string;
      internalValue?: string;
      currentLimit?: number;
    },
  ): Promise<{
    id: string;
    factor_name: string;
    factor_category: string;
    comparison_result: 'match' | 'partial_match' | 'no_match' | 'unknown' | 'conflicting_evidence' | 'not_applicable';
    internal_field: string;
    internal_value?: string;
    external_value: string;
    match_reasoning: string;
    data_available: boolean;
    current_within_limits?: boolean;
    limitation?: string;
    compared_at: string;
  }> {
    const investigation = await this.db.one(
      'SELECT mine_id FROM investigation_records WHERE id=$1',
      [input.investigationId],
    );
    if (!investigation || !ctx.canAccessMine(investigation.mine_id)) {
      throw forbidden('That investigation is outside your assigned scope.');
    }

    let internalValue: string | undefined = input.internalValue;
    let dataAvailable = false;
    let currentWithinLimits: boolean | undefined;
    let comparisonResult: ComparisonResult = 'unknown';
    let reasoning = '';
    let limitation: string | undefined;

    // If internal field is provided, try to fetch current mine data
    if (input.internalField) {
      // Try common tables for the field
      const tables = ['mines', 'inspections', 'corrective_actions', 'violations', 'environmental_measurements', 'safety_records'];
      for (const table of tables) {
        const cols = await this.db.many(
          `SELECT column_name FROM information_schema.columns WHERE table_name=$1 AND column_name=$2`,
          [table, input.internalField],
        );
        if (cols.length > 0) {
          const row = await this.db.one(
            `SELECT ${input.internalField} FROM ${table} WHERE mine_id=$1 ORDER BY created_at DESC LIMIT 1`,
            [investigation.mine_id],
          );
          if (row && row[input.internalField] !== null && row[input.internalField] !== undefined) {
            internalValue = String(row[input.internalField]);
            dataAvailable = true;
            break;
          }
        }
      }
    } else if (input.internalValue !== undefined) {
      dataAvailable = true;
    }

    // Perform comparison
    if (!dataAvailable) {
      comparisonResult = 'no_match';
      reasoning = 'No corresponding internal data found for this factor.';
      limitation = 'Internal data unavailable for comparison.';
    } else {
      // Simple comparison logic - can be extended
      const internal = internalValue ? internalValue.trim().toLowerCase() : '';
      const external = input.externalValue.trim().toLowerCase();

      if (internal === external) {
        comparisonResult = 'match';
        reasoning = 'Internal value matches external finding exactly.';
      } else if (internal.includes(external) || external.includes(internal)) {
        comparisonResult = 'partial_match';
        reasoning = 'Internal and external values share significant overlap but differ in detail.';
      } else {
        // Check if both are numeric and within tolerance
        const internalNum = parseFloat(internal);
        const externalNum = parseFloat(external);
        if (!isNaN(internalNum) && !isNaN(externalNum)) {
          const diff = Math.abs(internalNum - externalNum);
          const avg = (Math.abs(internalNum) + Math.abs(externalNum)) / 2;
          if (avg > 0 && diff / avg <= 0.15) {
            comparisonResult = 'partial_match';
            reasoning = 'Numerical values are within 15% tolerance.';
          } else {
            comparisonResult = 'no_match';
            reasoning = `Numerical values differ by ${((diff / avg) * 100).toFixed(1)}%.`;
          }
        } else {
          comparisonResult = 'no_match';
          reasoning = 'Values do not match.';
        }
      }

      // Check against configured limit if provided
      if (input.currentLimit !== undefined && !isNaN(parseFloat(input.internalValue ?? ''))) {
        currentWithinLimits = parseFloat(input.internalValue!) <= input.currentLimit;
        if (!currentWithinLimits) {
          limitation = `Current value exceeds configured limit of ${input.currentLimit}.`;
        }
      }
    }

    const id = `fc-${crypto.randomUUID().slice(0, 12)}`;
    await this.db.query(
      `INSERT INTO factor_comparison_results (
        id, investigation_id, external_evidence_id, factor_name, factor_category,
        comparison_result, internal_field, internal_value, external_value,
        match_reasoning, data_available, current_within_limits, limitation
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [
        id, input.investigationId, input.externalEvidenceId ?? null,
        input.factorName, 'general',
        'no_match', // will be updated below
        input.internalField, internalValue ?? null, input.externalValue,
        reasoning, dataAvailable, null, null,
      ],
    );

    // Update with actual comparison result
    await this.db.query(
      `UPDATE factor_comparison_results SET comparison_result=$1, match_reasoning=$2, data_available=$3,
       current_within_limits=$4, limitation=$5 WHERE id=$6`,
      [comparisonResult, reasoning, dataAvailable, currentWithinLimits ?? null, limitation ?? null, id],
    );

    return this.getComparison(id);
  }

  async getComparison(id: string): Promise<any> {
    const row = await this.db.one(
      'SELECT * FROM factor_comparison_results WHERE id=$1',
      [id],
    );
    if (!row) return null;
    return row;
  }

  async listForInvestigation(investigationId: string): Promise<any[]> {
    return this.db.many(
      'SELECT * FROM factor_comparison_results WHERE investigation_id=$1 ORDER BY compared_at DESC',
      [investigationId],
    );
  }
}

/**
 * AI Notification records
 */
export class AINotificationStore {
  constructor(private db: Database) {}

  async createNotification(
    ctx: AuthContext,
    input: {
      investigationId?: string;
      anomalyId?: string;
      predictionId?: string;
      mineId: string;
      notificationType: 'anomaly_alert' | 'risk_prediction' | 'investigation_update' | 'corrective_action_recommendation' | 'escalation' | 'model_health_warning';
      riskClassification: 'low' | 'moderate' | 'high' | 'critical';
      title: string;
      explanation: string;
      evidenceReferences?: any[];
      recommendedNextStep?: string;
      actionDeadline?: string;
      recipientIds?: string[];
    },
  ): Promise<any> {
    if (!ctx.canAccessMine(input.mineId)) {
      throw forbidden('That mine is outside your assigned scope.');
    }

    const id = `ai-notif-${crypto.randomUUID().slice(0, 12)}`;
    await this.db.query(
      `INSERT INTO ai_notification_records (
        id, investigation_id, anomaly_id, prediction_id, mine_id,
        notification_type, risk_classification, title, explanation,
        evidence_references, recommended_next_step, action_deadline,
        recipient_ids
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [
        id, input.investigationId ?? null, input.anomalyId ?? null, input.predictionId ?? null, input.mineId,
        input.notificationType, input.riskClassification, input.title, input.explanation,
        JSON.stringify(input.evidenceReferences ?? []),
        input.recommendedNextStep ?? null, input.actionDeadline ?? null,
        input.recipientIds ?? [],
      ],
    );
    return this.getNotification(id);
  }

  async getNotification(id: string): Promise<any> {
    const row = await this.db.one('SELECT * FROM ai_notification_records WHERE id=$1', [id]);
    if (!row) notFound('AI notification');
    return row;
  }

  async listForMine(
    ctx: AuthContext,
    mineId: string,
    filters?: { status?: string },
  ): Promise<any[]> {
    if (!ctx.canAccessMine(mineId)) forbidden('That mine is outside your assigned scope.');
    const params: unknown[] = [mineId];
    const conditions: string[] = ['mine_id = $1'];
    let p = 1;
    if (filters?.status) { p += 1; params.push(filters.status); conditions.push(`delivery_status = $${p}`); }
    return this.db.many(
      `SELECT * FROM ai_notification_records WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC`,
      params,
    );
  }
}