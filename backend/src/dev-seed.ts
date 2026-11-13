import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { PoolClient } from 'pg';

import { appendAudit } from './audit';
import { config } from './config';
import type { Database } from './db';

/**
 * Deterministic development fixture loader.
 *
 * The JSON fixture is exported from the frontend's development adapter
 * (`npm run seed:export`) so offline and API modes present identical records.
 * Every record is demonstration data and the API labels the dataset
 * `development`; it is never suitable for production use.
 */

type AnyRecord = Record<string, any>;

interface SeedDatabase {
  generatedAt: string;
  subsidiaries: AnyRecord[];
  mines: AnyRecord[];
  users: AnyRecord[];
  compliance: AnyRecord[];
  inspections: AnyRecord[];
  safetyRecords: AnyRecord[];
  incidents: AnyRecord[];
  nearMisses: AnyRecord[];
  violations: AnyRecord[];
  environmental: AnyRecord[];
  production: AnyRecord[];
  productionAnomalies: AnyRecord[];
  contractors: AnyRecord[];
  contracts: AnyRecord[];
  attendance: AnyRecord[];
  correctiveActions: AnyRecord[];
  documents: AnyRecord[];
  insights: AnyRecord[];
  notifications: AnyRecord[];
  audit: AnyRecord[];
  workflows: AnyRecord[];
  reports: AnyRecord[];
  environmentalThresholds: {
    provenance: string;
    lastConfiguredAt: string;
    thresholds: AnyRecord[];
  };
  documentContent: Record<string, string>;
}

const TABLES = [
  'notification_escalations', 'notification_deliveries', 'notifications',
  'notification_preferences', 'workflow_stages', 'workflows',
  'report_artifacts', 'report_job_status_filters', 'report_job_subsidiaries',
  'report_job_mines', 'report_jobs', 'report_definition_columns', 'report_definitions',
  'workflow_exceptions', 'anomaly_signals', 'record_revisions',
  'inspection_item_evidence', 'inspection_item_results',
  'inspection_checklist_items', 'inspection_checklists', 'evidence_requirements',
  'ai_insight_reviews', 'ai_insight_related_entities', 'ai_insight_evidence', 'ai_insights',
  'attendance_corrections', 'attendance_documents', 'attendance_records', 'workforce_members',
  'contractor_corrective_actions', 'contractor_inspections', 'contractor_safety_records',
  'contract_documents', 'contracts', 'contractor_documents', 'contractor_mines', 'contractors',
  'production_anomalies', 'production_record_documents', 'production_records',
  'environmental_alerts', 'environmental_measurement_documents', 'environmental_measurements',
  'environmental_thresholds',
  'incident_status_history', 'incident_corrective_actions', 'incident_documents', 'incidents',
  'safety_status_history', 'safety_record_corrective_actions', 'safety_record_documents',
  'safety_records',
  'near_miss_documents', 'near_miss_corrective_actions', 'near_misses',
  'violation_corrective_actions', 'violations',
  'corrective_action_comments', 'corrective_action_status_history',
  'corrective_action_evidence', 'corrective_actions',
  'compliance_violations', 'compliance_corrective_actions',
  'inspection_corrective_actions', 'inspection_status_history',
  'inspection_compliance_links', 'inspection_evidence',
  'inspection_finding_compliance_links', 'inspection_findings', 'inspections',
  'compliance_status_history', 'compliance_evidence', 'compliance_requirement_mines',
  'compliance_requirements',
  'document_access_log', 'document_processing_jobs', 'document_compliance_links',
  'document_fields', 'documents',
  'idempotency_keys', 'user_sessions',
  'user_subsidiary_scopes', 'user_mine_scopes', 'mines', 'users', 'subsidiaries',
  'organizations', 'statutory_sources',
  'audit_event_mines', 'audit_events', 'integration_connections', 'system_settings',
  'outbox_events', 'job_runs', 'data_quality_issues',
];

async function insertRow(
  client: PoolClient,
  table: string,
  row: Record<string, unknown>,
): Promise<void> {
  const columns = Object.keys(row);
  const placeholders = columns.map((_, index) => `$${index + 1}`);
  const values = columns.map((column) => {
    const value = row[column];
    return value === undefined ? null : value;
  });
  await client.query(
    `INSERT INTO ${table} (${columns.map((column) => `"${column}"`).join(', ')}) VALUES (${placeholders.join(', ')})`,
    values,
  );
}

function relatedHref(id: string | undefined): string | null {
  if (!id) return null;
  if (id.startsWith('cmp-')) return `/compliance/${id}`;
  if (id.startsWith('insp-')) return `/inspections/${id}`;
  if (id.startsWith('saf-') || id.startsWith('nm-')) return `/safety/${id}`;
  if (id.startsWith('inc-')) return `/safety/incidents/${id}`;
  if (id.startsWith('ca-')) return `/corrective-actions/${id}`;
  if (id.startsWith('doc-')) return `/documents/${id}`;
  if (id.startsWith('env-')) return '/environment';
  if (id.startsWith('con-')) return `/contractors/${id}`;
  if (id.startsWith('mine-')) return `/mines/${id}`;
  return null;
}

async function writeSeedDocuments(seed: SeedDatabase): Promise<Record<string, string | null>> {
  await mkdir(config.storageDir, { recursive: true });
  const keys: Record<string, string | null> = {};
  for (const document of seed.documents) {
    const content = seed.documentContent[document.id];
    if (typeof content !== 'string' || content.length === 0) {
      keys[document.id] = null;
      continue;
    }
    const key = `${document.id}.txt`;
    await writeFile(path.join(config.storageDir, key), content, 'utf8');
    keys[document.id] = key;
  }
  return keys;
}

export async function seedDevelopmentData(db: Database): Promise<{ counts: Record<string, number> }> {
  if (!config.allowDevSeed) {
    throw new Error('Refusing to seed: ALLOW_DEV_SEED is false.');
  }
  if (config.isProduction) {
    throw new Error('Refusing to seed demonstration data in production.');
  }

  const raw = await readFile(path.resolve(process.cwd(), 'seed/dev-seed.json'), 'utf8');
  const seed = JSON.parse(raw) as SeedDatabase;
  const storageKeys = await writeSeedDocuments(seed);

  const counts: Record<string, number> = {
    subsidiaries: seed.subsidiaries.length,
    mines: seed.mines.length,
    users: seed.users.length,
    compliance: seed.compliance.length,
    inspections: seed.inspections.length,
    safetyRecords: seed.safetyRecords.length,
    incidents: seed.incidents.length,
    nearMisses: seed.nearMisses.length,
    violations: seed.violations.length,
    environmental: seed.environmental.length,
    production: seed.production.length,
    contractors: seed.contractors.length,
    contracts: seed.contracts.length,
    attendance: seed.attendance.length,
    correctiveActions: seed.correctiveActions.length,
    documents: seed.documents.length,
    insights: seed.insights.length,
    notifications: seed.notifications.length,
    audit: seed.audit.length,
    workflows: seed.workflows.length,
    reports: seed.reports.length,
  };

  await db.transaction(async (client) => {
    await client.query('SET session_replication_role = replica');
    try {
      await client.query(`TRUNCATE TABLE ${TABLES.join(', ')} RESTART IDENTITY CASCADE`);
    } finally {
      await client.query('SET session_replication_role = DEFAULT');
    }

    await insertRow(client, 'organizations', {
      id: 'org-01',
      code: 'CG-DEV',
      name: 'CoalGuard.AI Development Organisation',
    });

    for (const subsidy of seed.subsidiaries) {
      await insertRow(client, 'subsidiaries', {
        id: subsidy.id,
        organization_id: 'org-01',
        code: subsidy.code,
        name: subsidy.name,
        region: subsidy.region,
        headquarters: subsidy.headquarters ?? null,
      });
    }

    for (const user of seed.users) {
      await insertRow(client, 'users', {
        id: user.id,
        name: user.name,
        email: String(user.email).toLowerCase(),
        role: user.role,
        title: user.title ?? '',
        development_identity: user.developmentIdentity ?? true,
        last_login_at: user.lastLoginAt ?? null,
      });
    }

    for (const mine of seed.mines) {
      const location = mine.location ?? {};
      await insertRow(client, 'mines', {
        id: mine.id,
        subsidiary_id: mine.subsidiaryId,
        code: mine.code,
        name: mine.name,
        region: mine.region,
        district: mine.district,
        state: mine.state,
        operational_status: mine.operationalStatus,
        approved_capacity_tpa: mine.approvedCapacityTPA ?? null,
        commissioned_on: mine.commissionedOn ?? null,
        mine_manager_id: mine.mineManagerId ?? null,
        safety_officer_id: mine.safetyOfficerId ?? null,
        compliance_officer_id: mine.complianceOfficerId ?? null,
        environmental_officer_id: mine.environmentalOfficerId ?? null,
        contact_phone: mine.contactPhone ?? null,
        note: mine.note ?? null,
        latitude: location.lat ?? null,
        longitude: location.lng ?? null,
        geo_source: location.source ?? null,
        geo_accuracy_m: location.accuracyM ?? null,
        geo_captured_at: location.capturedAt ?? null,
      });
    }

    for (const user of seed.users) {
      for (const mineId of user.mineIds ?? []) {
        await parentInsert(client, 'user_mine_scopes', { user_id: user.id, mine_id: mineId });
      }
      for (const subsidiaryId of user.subsidiaryIds ?? []) {
        await parentInsert(client, 'user_subsidiary_scopes', {
          user_id: user.id,
          subsidiary_id: subsidiaryId,
        });
      }
    }

    for (const document of seed.documents) {
      await insertRow(client, 'documents', {
        id: document.id,
        name: document.name,
        type: document.type,
        mime_type: document.mimeType,
        size_bytes: document.sizeBytes,
        uploaded_by: document.uploadedBy,
        uploaded_at: document.uploadedAt,
        status: document.status,
        mine_id: document.mineId ?? null,
        storage_key: storageKeys[document.id] ?? null,
        ocr_engine: document.ocrEngine ?? null,
        ocr_confidence: document.ocrConfidence ?? null,
        ocr_processed_at: document.ocrProcessedAt ?? null,
        ocr_error: document.ocrError ?? null,
        extracted_text: document.extractedText ?? null,
        detected_language: document.detectedLanguage ?? null,
      });
      for (const field of document.extractedFields ?? []) {
        await insertRow(client, 'document_fields', {
          id: field.id,
          document_id: document.id,
          label: field.label,
          value: field.value,
          confidence: field.confidence ?? null,
          page_number: field.pageNumber ?? null,
          confirmed: field.confirmed ?? false,
          corrected_value: field.correctedValue ?? null,
          sort_order: 0,
        });
      }
      const processingStatus =
        document.status === 'processed' || document.status === 'needs_review'
          ? 'processed'
          : document.status === 'failed'
            ? 'failed'
            : document.status === 'processing'
              ? 'processing'
              : 'queued';
      await insertRow(client, 'document_processing_jobs', {
        id: `job-ocr-${document.id}`,
        document_id: document.id,
        status: processingStatus,
        attempts: processingStatus === 'queued' ? 0 : 1,
        driver: 'development-seed-fixture',
        last_error: document.ocrError ?? null,
        created_at: document.uploadedAt,
        updated_at: document.ocrProcessedAt ?? document.uploadedAt,
      });
    }

    for (const threshold of seed.environmentalThresholds.thresholds) {
      await insertRow(client, 'environmental_thresholds', {
        id: threshold.indicator,
        indicator: threshold.indicator,
        unit: threshold.unit,
        limit_value: threshold.limit,
        comparison: threshold.comparison,
        label: threshold.label,
        configured_by: threshold.configuredBy,
        provenance: seed.environmentalThresholds.provenance,
        effective_from: seed.environmentalThresholds.lastConfiguredAt.slice(0, 10),
      });
    }

    for (const compliance of seed.compliance) {
      await insertRow(client, 'compliance_requirements', {
        id: compliance.id,
        code: compliance.code,
        title: compliance.title,
        description: compliance.description,
        category: compliance.category,
        responsible_officer_id: compliance.responsibleOfficerId ?? null,
        source_reference: compliance.sourceReference ?? null,
        effective_from: compliance.effectiveFrom ?? null,
        due_date: compliance.dueDate ?? null,
        status: compliance.status,
        priority: compliance.priority,
        submission_frequency: compliance.submissionFrequency ?? null,
        last_submitted_at: compliance.lastSubmittedAt ?? null,
        last_verified_at: compliance.lastVerifiedAt ?? null,
        verification_status: compliance.verificationStatus ?? null,
        notes: null,
        updated_at: compliance.updatedAt ?? new Date().toISOString(),
        updated_by: compliance.updatedBy ?? null,
      });
      for (const mineId of compliance.applicableMineIds ?? []) {
        await parentInsert(client, 'compliance_requirement_mines', {
          compliance_id: compliance.id,
          mine_id: mineId,
        });
      }
    }

    for (const inspection of seed.inspections) {
      const location = inspection.location ?? {};
      await insertRow(client, 'inspections', {        id: inspection.id,
        code: inspection.code,
        mine_id: inspection.mineId,
        type: inspection.type,
        inspector_id: inspection.inspectorId,
        scheduled_date: inspection.scheduledDate,
        actual_date: inspection.actualDate ?? null,
        started_at: inspection.startedAt ?? null,
        submitted_at: inspection.submittedAt ?? null,
        completed_at: inspection.completedAt ?? null,
        status: inspection.status,
        scope: inspection.scope ?? null,
        reviewer_id: inspection.reviewerId ?? null,
        latitude: location.lat ?? null,
        longitude: location.lng ?? null,
        geo_source: location.source ?? null,
        geo_accuracy_m: location.accuracyM ?? null,
        geo_captured_at: location.capturedAt ?? null,
        created_at: inspection.createdAt ?? new Date().toISOString(),
        created_by: inspection.createdBy,
      });
      for (const finding of inspection.findings ?? []) {
        await insertRow(client, 'inspection_findings', {
          id: finding.id,
          inspection_id: inspection.id,
          description: finding.description,
          category: finding.category,
          severity: finding.severity,
          is_violation: finding.isViolation ?? false,
          raised_at: finding.raisedAt ?? inspection.createdAt ?? new Date().toISOString(),
          recorded_by: finding.recordedBy ?? inspection.createdBy,
        });
        for (const complianceId of finding.complianceRecordIds ?? []) {
          await parentInsert(client, 'inspection_finding_compliance_links', {
            finding_id: finding.id,
            compliance_id: complianceId,
          });
        }
      }
      for (const review of inspection.reviewHistory ?? []) {
        await insertRow(client, 'inspection_status_history', {
          id: review.id,
          inspection_id: inspection.id,
          from_status: review.fromStatus ?? null,
          to_status: review.toStatus,
          actor_id: review.actorId ?? null,
          actor_name: review.actorName ?? 'Unknown',
          comment: review.comment ?? null,
          created_at: review.at,
        });
      }
    }

    // Default checklist templates. These make submission evidence-based:
    // every required item needs a recorded outcome, exceptions need a
    // justification, and safety-critical items require supporting evidence.
    const defaultChecklists: { type: string; name: string; items: { question: string; category: string; risk: string; evidence: boolean }[] }[] = [
      {
        type: 'statutory_safety',
        name: 'Statutory safety inspection checklist',
        items: [
          { question: 'Emergency egress routes are clear and illuminated', category: 'mine_safety', risk: 'critical', evidence: true },
          { question: 'Ventilation readings are within configured limits', category: 'mine_safety', risk: 'critical', evidence: true },
          { question: 'Roof and ground support condition verified', category: 'mine_safety', risk: 'high', evidence: true },
          { question: 'Explosives storage and handling comply with procedure', category: 'mine_safety', risk: 'critical', evidence: true },
          { question: 'Personal protective equipment is in use', category: 'mine_safety', risk: 'medium', evidence: false },
          { question: 'Emergency response equipment is serviceable', category: 'mine_safety', risk: 'high', evidence: false },
        ],
      },
      {
        type: 'environment',
        name: 'Environmental monitoring inspection checklist',
        items: [
          { question: 'Dust suppression systems are operating', category: 'environment', risk: 'high', evidence: true },
          { question: 'Water discharge sampling completed', category: 'environment', risk: 'critical', evidence: true },
          { question: 'Waste segregation and storage compliant', category: 'environment', risk: 'medium', evidence: false },
          { question: 'Noise controls in place at identified receptors', category: 'environment', risk: 'medium', evidence: false },
        ],
      },
      {
        type: 'production',
        name: 'Production assurance checklist',
        items: [
          { question: 'Production readings reconciled to weighbridge records', category: 'production', risk: 'high', evidence: true },
          { question: 'Shift handover records complete', category: 'production', risk: 'medium', evidence: false },
          { question: 'Equipment availability log updated', category: 'production', risk: 'low', evidence: false },
        ],
      },
      {
        type: 'labour',
        name: 'Labour compliance checklist',
        items: [
          { question: 'Working hours records match attendance', category: 'labour', risk: 'high', evidence: true },
          { question: 'Statutory registers are current', category: 'labour', risk: 'medium', evidence: true },
          { question: 'Welfare facilities are serviceable', category: 'labour', risk: 'low', evidence: false },
        ],
      },
      {
        type: 'contractor',
        name: 'Contractor compliance checklist',
        items: [
          { question: 'Contractor inductions are current for all on-site staff', category: 'contractor', risk: 'high', evidence: true },
          { question: 'Contractor licences and insurance are valid', category: 'contractor', risk: 'high', evidence: true },
          { question: 'Contractor plant inspections are up to date', category: 'contractor', risk: 'medium', evidence: false },
        ],
      },
      {
        type: 'ad_hoc',
        name: 'Ad hoc inspection checklist',
        items: [
          { question: 'Observed condition recorded with location', category: 'other', risk: 'medium', evidence: false },
          { question: 'Immediate risk controls confirmed', category: 'mine_safety', risk: 'high', evidence: false },
        ],
      },
    ];
    for (const template of defaultChecklists) {
      const checklistId = `chl-${template.type}`;
      await insertRow(client, 'inspection_checklists', {
        id: checklistId,
        inspection_type: template.type,
        name: template.name,
        enabled: true,
      });
      let order = 0;
      for (const item of template.items) {
        await insertRow(client, 'inspection_checklist_items', {
          id: `cli-${template.type}-${order + 1}`,
          checklist_id: checklistId,
          sort_order: order,
          question: item.question,
          category: item.category,
          risk_level: item.risk,
          required: true,
          evidence_required: item.evidence,
          evidence_types: ['compliance_evidence', 'inspection_report'],
          allow_na: true,
          allow_not_inspected: true,
        });
        order += 1;
      }
    }

    for (const action of seed.correctiveActions) {
      await insertRow(client, 'corrective_actions', {
        id: action.id,
        code: action.code,
        source_type: action.sourceType,
        source_id: action.sourceId,
        mine_id: action.mineId,
        description: action.description,
        assigned_to: action.assignedTo ?? null,
        priority: action.priority,
        created_at: action.createdAt,
        created_by: action.createdBy,
        due_date: action.dueDate ?? null,
        status: action.status,
        completion_notes: action.completionNotes ?? null,
        submitted_at: action.submittedAt ?? null,
        verification_status: action.verificationStatus ?? 'not_required',
        verified_at: action.verifiedAt ?? null,
        verified_by: action.verifiedBy ?? null,
        rejection_reason: action.rejectionReason ?? null,
        closed_at: action.closedAt ?? null,
        updated_at: action.createdAt,
      });
    }

    for (const safety of seed.safetyRecords) {
      const location = safety.location ?? {};
      await insertRow(client, 'safety_records', {
        id: safety.id,
        code: safety.code,
        type: safety.type,
        mine_id: safety.mineId,
        title: safety.title,
        description: safety.description,
        severity: safety.severity,
        status: safety.status,
        reported_by: safety.reportedBy,
        reported_at: safety.reportedAt,
        latitude: location.lat ?? null,
        longitude: location.lng ?? null,
        geo_source: location.source ?? null,
        geo_accuracy_m: location.accuracyM ?? null,
        geo_captured_at: location.capturedAt ?? null,
        location_description: safety.locationDescription ?? null,
        assigned_to: safety.assignedTo ?? null,
        investigation_opened_at: safety.investigationOpenedAt ?? null,
        investigation_closed_at: safety.investigationClosedAt ?? null,
        related_inspection_id: safety.relatedInspectionId ?? null,
        preventive_actions: safety.preventiveActions ?? [],
      });
    }

    for (const incident of seed.incidents) {
      const location = incident.location ?? {};
      await insertRow(client, 'incidents', {
        id: incident.id,
        code: incident.code,
        mine_id: incident.mineId,
        title: incident.title,
        description: incident.description,
        severity: incident.severity,
        occurred_at: incident.occurredAt,
        reported_at: incident.reportedAt,
        reported_by: incident.reportedBy,
        status: incident.status,
        latitude: location.lat ?? null,
        longitude: location.lng ?? null,
        geo_source: location.source ?? null,
        geo_accuracy_m: location.accuracyM ?? null,
        geo_captured_at: location.capturedAt ?? null,
        location_description: incident.locationDescription ?? null,
        injuries_reported: incident.injuriesReported ?? 0,
        downtime_hours: incident.downtimeHours ?? null,
        assigned_to: incident.assignedTo ?? null,
        related_inspection_id: incident.relatedInspectionId ?? null,
        investigation_summary: incident.investigationSummary ?? null,
      });
    }

    for (const nearMiss of seed.nearMisses) {
      const location = nearMiss.location ?? {};
      await insertRow(client, 'near_misses', {
        id: nearMiss.id,
        code: nearMiss.code,
        mine_id: nearMiss.mineId,
        title: nearMiss.title,
        description: nearMiss.description,
        reported_by: nearMiss.reportedBy,
        reported_at: nearMiss.reportedAt,
        latitude: location.lat ?? null,
        longitude: location.lng ?? null,
        geo_source: location.source ?? null,
        geo_accuracy_m: location.accuracyM ?? null,
        geo_captured_at: location.capturedAt ?? null,
        location_description: nearMiss.locationDescription ?? null,
        preventive_actions: nearMiss.preventiveActions ?? [],
      });
    }

    for (const violation of seed.violations) {
      await insertRow(client, 'violations', {
        id: violation.id,
        code: violation.code,
        mine_id: violation.mineId,
        source_type: violation.sourceType,
        source_id: violation.sourceId,
        source_code: violation.sourceCode,
        description: violation.description,
        severity: violation.severity,
        category: violation.category,
        raised_at: violation.raisedAt,
        raised_by: violation.raisedBy,
        due_date: violation.dueDate ?? null,
        status: violation.status,
        verified_at: violation.verifiedAt ?? null,
        verified_by: violation.verifiedBy ?? null,
      });
    }

    for (const measurement of seed.environmental) {
      const location = measurement.location ?? {};
      await insertRow(client, 'environmental_measurements', {
        id: measurement.id,
        mine_id: measurement.mineId,
        indicator: measurement.indicator,
        value: measurement.value,
        unit: measurement.unit,
        measured_at: measurement.measuredAt,
        latitude: location.lat ?? null,
        longitude: location.lng ?? null,
        geo_source: location.source ?? null,
        geo_accuracy_m: location.accuracyM ?? null,
        geo_captured_at: location.capturedAt ?? null,
        location_description: measurement.locationDescription ?? null,
        source: measurement.source,
        threshold_id: measurement.thresholdId ?? null,
        threshold_version: measurement.thresholdId ? 1 : null,
        status: measurement.status,
        sample_id: measurement.sampleId ?? null,
        inspection_id: measurement.inspectionId ?? null,
        stale: measurement.stale ?? false,
      });
    }

    for (const record of seed.production) {
      await insertRow(client, 'production_records', {
        id: record.id,
        mine_id: record.mineId,
        date: record.date,
        shift: record.shift,
        production_tonnes: record.productionTonnes,
        target_tonnes: record.targetTonnes ?? null,
        value_kind: record.valueKind,
        estimate_reason: record.estimateReason ?? null,
        shift_supervisor_id: record.shiftSupervisorId ?? null,
        created_by: record.shiftSupervisorId ?? null,
      });
    }

    for (const contractor of seed.contractors) {
      await insertRow(client, 'contractors', {
        id: contractor.id,
        code: contractor.code,
        name: contractor.name,
        type: contractor.type,
        contact_person: contractor.contactPerson,
        contact_email: contractor.contactEmail,
        contact_phone: contractor.contactPhone,
        registered_address: contractor.registeredAddress,
        compliance_status: contractor.complianceStatus,
        registered_on: contractor.registeredOn,
        pan_number: contractor.panNumber ?? null,
        gst_number: contractor.gstNumber ?? null,
      });
      for (const mineId of contractor.mineIds ?? []) {
        await parentInsert(client, 'contractor_mines', {
          contractor_id: contractor.id,
          mine_id: mineId,
        });
      }
    }

    for (const contract of seed.contracts) {
      await insertRow(client, 'contracts', {
        id: contract.id,
        code: contract.code,
        contractor_id: contract.contractorId,
        mine_id: contract.mineId,
        title: contract.title,
        scope: contract.scope,
        start_date: contract.startDate,
        end_date: contract.endDate,
        value_inr_lakhs: contract.valueInrLakhs ?? null,
        status: contract.status,
        approved_by: contract.approvedBy ?? null,
      });
    }

    for (const attendance of seed.attendance) {
      const workerId = `wkr-${attendance.workerRef.toLowerCase()}`;
      await parentInsert(client, 'workforce_members', {
        id: workerId,
        worker_ref: attendance.workerRef,
        display_name: attendance.workerDisplayName,
        mine_id: attendance.mineId,
        contractor_id: attendance.contractorId ?? null,
      });
      await insertRow(client, 'attendance_records', {
        id: attendance.id,
        worker_id: workerId,
        mine_id: attendance.mineId,
        contractor_id: attendance.contractorId ?? null,
        date: attendance.date,
        shift: attendance.shift,
        status: attendance.status,
        recorded_at: attendance.recordedAt,
        recorded_by: null,
      });
      for (const correction of attendance.corrections ?? []) {
        await insertRow(client, 'attendance_corrections', {
          id: correction.id,
          attendance_id: attendance.id,
          at: correction.at,
          original_status: correction.originalStatus,
          corrected_status: correction.correctedStatus,
          reason: correction.reason,
          requested_by: correction.requestedBy,
          approved_by: correction.approvedBy ?? null,
          approved_at: correction.approvedAt ?? null,
          status: correction.status,
        });
      }
    }

    // --- Association links -------------------------------------------------
    const documentCompliance = new Map<string, { documentId: string; complianceId: string; userId: string }>();
    for (const compliance of seed.compliance) {
      for (const documentId of compliance.evidenceDocumentIds ?? []) {
        const document = seed.documents.find((entry) => entry.id === documentId);
        if (!document) continue;
        documentCompliance.set(`${documentId}|${compliance.id}`, {
          documentId,
          complianceId: compliance.id,
          userId: compliance.updatedBy ?? document.uploadedBy,
        });
      }
      for (const violationId of compliance.linkedViolationIds ?? []) {
        await parentInsert(client, 'compliance_violations', {
          compliance_id: compliance.id,
          violation_id: violationId,
        });
      }
      for (const actionId of compliance.linkedCorrectiveActionIds ?? []) {
        await parentInsert(client, 'compliance_corrective_actions', {
          compliance_id: compliance.id,
          corrective_action_id: actionId,
        });
      }
    }
    for (const document of seed.documents) {
      for (const complianceId of document.linkedComplianceIds ?? []) {
        documentCompliance.set(`${document.id}|${complianceId}`, {
          documentId: document.id,
          complianceId,
          userId: document.uploadedBy,
        });
      }
    }
    for (const link of documentCompliance.values()) {
      await parentInsert(client, 'document_compliance_links', {
        document_id: link.documentId,
        compliance_id: link.complianceId,
        linked_by: link.userId,
      });
      await parentInsert(client, 'compliance_evidence', {
        compliance_id: link.complianceId,
        document_id: link.documentId,
        attached_by: link.userId,
      });
    }

    for (const inspection of seed.inspections) {
      for (const documentId of inspection.evidenceDocumentIds ?? []) {
        await parentInsert(client, 'inspection_evidence', {
          inspection_id: inspection.id,
          document_id: documentId,
        });
      }
      for (const complianceId of inspection.complianceRecordIds ?? []) {
        await parentInsert(client, 'inspection_compliance_links', {
          inspection_id: inspection.id,
          compliance_id: complianceId,
        });
      }
      for (const actionId of inspection.correctiveActionIds ?? []) {
        await parentInsert(client, 'inspection_corrective_actions', {
          inspection_id: inspection.id,
          corrective_action_id: actionId,
        });
      }
    }

    for (const safety of seed.safetyRecords) {
      for (const documentId of safety.evidenceDocumentIds ?? []) {
        await parentInsert(client, 'safety_record_documents', {
          safety_record_id: safety.id,
          document_id: documentId,
        });
      }
      for (const actionId of safety.correctiveActionIds ?? []) {
        await parentInsert(client, 'safety_record_corrective_actions', {
          safety_record_id: safety.id,
          corrective_action_id: actionId,
        });
      }
    }

    for (const incident of seed.incidents) {
      for (const documentId of incident.evidenceDocumentIds ?? []) {
        await parentInsert(client, 'incident_documents', {
          incident_id: incident.id,
          document_id: documentId,
        });
      }
      for (const actionId of incident.correctiveActionIds ?? []) {
        await parentInsert(client, 'incident_corrective_actions', {
          incident_id: incident.id,
          corrective_action_id: actionId,
        });
      }
    }

    for (const violation of seed.violations) {
      for (const actionId of violation.correctiveActionIds ?? []) {
        await parentInsert(client, 'violation_corrective_actions', {
          violation_id: violation.id,
          corrective_action_id: actionId,
        });
      }
    }

    for (const action of seed.correctiveActions) {
      for (const documentId of action.evidenceDocumentIds ?? []) {
        await parentInsert(client, 'corrective_action_evidence', {
          corrective_action_id: action.id,
          document_id: documentId,
          attached_by: action.createdBy,
        });
      }
      // Keep association tables consistent with the polymorphic source.
      if (action.sourceType === 'inspection') {
        await parentInsert(client, 'inspection_corrective_actions', {
          inspection_id: action.sourceId,
          corrective_action_id: action.id,
        });
      }
      if (action.sourceType === 'incident') {
        await parentInsert(client, 'incident_corrective_actions', {
          incident_id: action.sourceId,
          corrective_action_id: action.id,
        });
      }
      if (action.sourceType === 'violation') {
        await parentInsert(client, 'violation_corrective_actions', {
          violation_id: action.sourceId,
          corrective_action_id: action.id,
        });
      }
      if (action.sourceType === 'observation') {
        await parentInsert(client, 'safety_record_corrective_actions', {
          safety_record_id: action.sourceId,
          corrective_action_id: action.id,
        });
      }
    }

    for (const measurement of seed.environmental) {
      for (const documentId of measurement.evidenceDocumentIds ?? []) {
        await parentInsert(client, 'environmental_measurement_documents', {
          measurement_id: measurement.id,
          document_id: documentId,
        });
      }
    }

    for (const record of seed.production) {
      for (const documentId of record.sourceDocumentIds ?? []) {
        await parentInsert(client, 'production_record_documents', {
          production_record_id: record.id,
          document_id: documentId,
        });
      }
    }

    for (const contractor of seed.contractors) {
      for (const documentId of contractor.requiredDocumentIds ?? []) {
        await parentInsert(client, 'contractor_documents', {
          contractor_id: contractor.id,
          document_id: documentId,
          required: true,
          verified: (contractor.verifiedDocumentIds ?? []).includes(documentId),
          verified_by: (contractor.verifiedDocumentIds ?? []).includes(documentId) ? 'usr-06' : null,
          verified_at: (contractor.verifiedDocumentIds ?? []).includes(documentId)
            ? new Date().toISOString()
            : null,
        });
      }
      for (const documentId of contractor.verifiedDocumentIds ?? []) {
        await parentInsert(client, 'contractor_documents', {
          contractor_id: contractor.id,
          document_id: documentId,
          required: (contractor.requiredDocumentIds ?? []).includes(documentId),
          verified: true,
          verified_by: 'usr-06',
          verified_at: new Date().toISOString(),
        });
      }
      for (const safetyRecordId of contractor.safetyRecordIds ?? []) {
        await parentInsert(client, 'contractor_safety_records', {
          contractor_id: contractor.id,
          safety_record_id: safetyRecordId,
        });
      }
      for (const inspectionId of contractor.inspectionIds ?? []) {
        await parentInsert(client, 'contractor_inspections', {
          contractor_id: contractor.id,
          inspection_id: inspectionId,
        });
      }
      for (const actionId of contractor.openCorrectiveActionIds ?? []) {
        await parentInsert(client, 'contractor_corrective_actions', {
          contractor_id: contractor.id,
          corrective_action_id: actionId,
        });
      }
    }

    for (const contract of seed.contracts) {
      for (const documentId of contract.documentIds ?? []) {
        await parentInsert(client, 'contract_documents', {
          contract_id: contract.id,
          document_id: documentId,
        });
      }
    }

    for (const attendance of seed.attendance) {
      for (const documentId of attendance.evidenceDocumentIds ?? []) {
        await parentInsert(client, 'attendance_documents', {
          attendance_id: attendance.id,
          document_id: documentId,
        });
      }
    }

    for (const workflow of seed.workflows) {
      await insertRow(client, 'workflows', {
        id: workflow.id,
        name: workflow.name,
        description: workflow.description,
        trigger: workflow.trigger,
        enabled: workflow.enabled,
        updated_at: workflow.updatedAt,
        updated_by: workflow.updatedBy,
      });
      for (const stage of workflow.stages ?? []) {
        await insertRow(client, 'workflow_stages', {
          id: stage.id,
          workflow_id: workflow.id,
          stage_order: stage.order,
          label: stage.label,
          role: stage.role,
          after_hours: stage.afterHours,
          notify_channels: stage.notifyChannels,
        });
      }
    }

    for (const insight of seed.insights) {
      await insertRow(client, 'ai_insights', {
        id: insight.id,
        code: insight.code,
        title: insight.title,
        category: insight.category,
        mine_id: insight.mineId ?? null,
        subsidiary_id: insight.subsidiaryId ?? null,
        risk_level: insight.riskLevel,
        model_source: insight.modelSource,
        generated_at: insight.generatedAt,
        data_freshness_hours: insight.dataFreshnessHours ?? null,
        confidence: insight.confidence ?? null,
        explanation: insight.explanation,
        recommendation: insight.recommendation ?? null,
        review_status: insight.reviewStatus,
        reviewed_by: insight.reviewedBy ?? null,
        reviewed_at: insight.reviewedAt ?? null,
        limitations: insight.limitations ?? [],
      });
      let order = 0;
      for (const evidence of insight.evidence ?? []) {
        await insertRow(client, 'ai_insight_evidence', {
          insight_id: insight.id,
          label: evidence.label,
          detail: evidence.detail,
          kind: evidence.kind,
          weight: evidence.weight ?? null,
          sort_order: order++,
        });
      }
      for (const entityId of insight.relatedEntityIds ?? []) {
        await parentInsert(client, 'ai_insight_related_entities', {
          insight_id: insight.id,
          entity_id: entityId,
        });
      }
    }

    for (const notification of seed.notifications) {
      const relatedId = notification.relatedEntity?.id;
      const href = relatedHref(relatedId);
      await insertRow(client, 'notifications', {
        id: notification.id,
        type: notification.type,
        severity: notification.severity,
        title: notification.title,
        message: notification.message,
        created_at: notification.createdAt,
        read: notification.read,
        recipient_id: notification.recipientId,
        related_type: notification.relatedEntity?.type ?? null,
        related_id: relatedId ?? null,
        related_label: notification.relatedEntity?.label ?? null,
        related_href: href,
        action_label: href ? (notification.actionLabel ?? 'Open record') : null,
        action_href: href,
      });
      for (const delivery of notification.deliveries ?? []) {
        await parentInsert(client, 'notification_deliveries', {
          id: `del-${notification.id}-${delivery.channel}`,
          notification_id: notification.id,
          channel: delivery.channel,
          status: delivery.status,
          at: delivery.at ?? null,
        });
      }
    }

    for (const report of seed.reports) {
      await insertRow(client, 'report_definitions', {
        category: report.category,
        name: report.name,
        description: report.description,
        formats: report.formats,
        group_by: report.groupBy,
      });
      let order = 0;
      for (const column of report.columns ?? []) {
        await insertRow(client, 'report_definition_columns', {
          category: report.category,
          column_key: column.key,
          label: column.label,
          sort_order: order++,
        });
      }
    }

    const usersById = new Map(seed.users.map((user) => [user.id, user]));
    const orderedAudit = [...seed.audit].sort(
      (left, right) => new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime(),
    );
    for (const event of orderedAudit) {
      const actor = usersById.get(event.actorId);
      if (!actor) continue;
      await appendAudit(client, {
        id: event.id,
        timestamp: event.timestamp,
        actor: { id: actor.id, name: actor.name, role: actor.role },
        action: event.action,
        entityType: event.entityType,
        entityId: event.entityId,
        entityLabel: event.entityLabel ?? null,
        previousValue: event.previousValue,
        updatedValue: event.updatedValue,
        reason: event.reason ?? null,
        workflow: event.workflow ?? null,
        verificationMethod: event.verification?.method ?? null,
        verifiedAt: event.verification?.verifiedAt ?? null,
        source: event.source ?? 'platform_log',
        ledgerNetwork: event.ledgerProof?.network ?? null,
        ledgerTransactionId: event.ledgerProof?.transactionId ?? null,
      });
    }

    // Read-side audit scoping. The fixture's historical events predate the
    // association table, so derive their mine scope from the referenced record.
    // Unknown or organisation-wide events intentionally have no mine link and
    // are visible only to organisation-wide roles.
    await client.query(`
      INSERT INTO audit_event_mines (audit_id, mine_id)
      SELECT a.id, m.id FROM audit_events a JOIN mines m ON m.id = a.entity_id
      WHERE a.entity_type = 'mine'
      ON CONFLICT DO NOTHING
    `);
    await client.query(`
      INSERT INTO audit_event_mines (audit_id, mine_id)
      SELECT a.id, i.mine_id FROM audit_events a JOIN inspections i ON i.id = a.entity_id
      WHERE a.entity_type = 'inspection'
      ON CONFLICT DO NOTHING
    `);
    await client.query(`
      INSERT INTO audit_event_mines (audit_id, mine_id)
      SELECT a.id, s.mine_id FROM audit_events a JOIN safety_records s ON s.id = a.entity_id
      WHERE a.entity_type = 'safety_record'
      ON CONFLICT DO NOTHING
    `);
    await client.query(`
      INSERT INTO audit_event_mines (audit_id, mine_id)
      SELECT a.id, c.mine_id FROM audit_events a JOIN corrective_actions c ON c.id = a.entity_id
      WHERE a.entity_type = 'corrective_action'
      ON CONFLICT DO NOTHING
    `);
    await client.query(`
      INSERT INTO audit_event_mines (audit_id, mine_id)
      SELECT a.id, d.mine_id FROM audit_events a JOIN documents d ON d.id = a.entity_id
      WHERE a.entity_type = 'document' AND d.mine_id IS NOT NULL
      ON CONFLICT DO NOTHING
    `);
    await client.query(`
      INSERT INTO audit_event_mines (audit_id, mine_id)
      SELECT a.id, cm.mine_id FROM audit_events a JOIN compliance_requirement_mines cm ON cm.compliance_id = a.entity_id
      WHERE a.entity_type = 'compliance'
      ON CONFLICT DO NOTHING
    `);

    await insertRow(client, 'system_settings', {
      key: 'data_provenance',
      value: JSON.stringify({ mode: 'development', note: 'Frontend development fixture; not production records.' }),
      updated_by: 'usr-10',
    });
    await insertRow(client, 'system_settings', {
      key: 'environmental_threshold_provenance',
      value: JSON.stringify({
        provenance: seed.environmentalThresholds.provenance,
        lastConfiguredAt: seed.environmentalThresholds.lastConfiguredAt,
        configuredBy: 'usr-05',
      }),
      updated_by: 'usr-05',
    });
    await insertRow(client, 'system_settings', {
      key: 'ocr_configuration',
      value: JSON.stringify({
        driver: 'none',
        note: 'No OCR provider is configured. Uploaded documents are stored and queued; OCR is not simulated as a success.',
      }),
      updated_by: 'usr-10',
    });
    await insertRow(client, 'system_settings', {
      key: 'audit_ledger',
      value: JSON.stringify({
        configured: false,
        note: 'Application audit is an append-only hash chain. No external ledger is connected.',
      }),
      updated_by: 'usr-10',
    });

    const integrations = [
      ['int-identity', 'Identity provider', 'identity', 'healthy', 'Development identity adapter. No external identity provider is configured; tokens are local opaque sessions.', false],
      ['int-ocr', 'OCR/document intelligence', 'ocr', 'unavailable', 'No OCR provider is configured. Seed OCR fields are labelled development output; new uploads remain queued unless a driver is enabled.', false],
      ['int-map', 'Map tiles', 'map', 'unknown', 'Map rendering is client-side. The API stores validated WGS84 coordinates and makes no map provider claim.', false],
      ['int-analytics', 'Analytics rule engine', 'analytics', 'healthy', 'Deterministic rule engine runs locally. No trained model or external analytics service is connected.', true],
      ['int-messaging', 'Email/SMS/WhatsApp delivery', 'messaging', 'unavailable', 'No messaging provider is configured. Only in-app notifications are delivered.', false],
      ['int-ledger', 'External audit ledger', 'ledger', 'unavailable', 'No blockchain or external ledger is connected. Audit hashes are local.', false],
      ['int-api', 'CoalGuard API', 'api', 'healthy', 'This API and its PostgreSQL 16 connection are reachable.', true],
    ] as const;
    for (const [id, name, category, status, detail, verified] of integrations) {
      await insertRow(client, 'integration_connections', {
        id,
        name,
        category,
        status,
        detail,
        verified,
      });
    }

    await appendAudit(client, {
      actor: { id: 'usr-10', name: 'Rohit Saxena', role: 'system_admin' },
      action: 'create',
      entityType: 'system',
      entityId: 'development-seed',
      entityLabel: 'Development fixture loaded',
      updatedValue: { generatedAt: seed.generatedAt, source: 'frontend-development-adapter' },
      reason: 'Deterministic demonstration data loaded by npm run db:seed.',
      source: 'platform_log',
    });
  });

  return { counts };
}

async function parentInsert(
  client: PoolClient,
  table: string,
  row: Record<string, unknown>,
): Promise<void> {
  const columns = Object.keys(row);
  const placeholders = columns.map((_, index) => `$${index + 1}`);
  await client.query(
    `INSERT INTO ${table} (${columns.map((column) => `"${column}"`).join(', ')}) VALUES (${placeholders.join(', ')}) ON CONFLICT DO NOTHING`,
    columns.map((column) => (row[column] === undefined ? null : row[column])),
  );
}
