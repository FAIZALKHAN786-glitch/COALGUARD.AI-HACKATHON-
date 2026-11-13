import { compact, dateOnly, locationOf, numberOrUndefined } from './http';

function iso(value: Date | string | null | undefined): string | undefined {
  if (!value) return undefined;
  return new Date(value).toISOString();
}

export function serializeUser(row: Record<string, any>) {
  return compact({
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    title: row.title ?? '',
    mineIds: row.mine_ids ?? row.mineIds ?? [],
    subsidiaryIds: row.subsidiary_ids ?? row.subsidiaryIds ?? [],
    developmentIdentity: Boolean(row.development_identity),
    lastLoginAt: iso(row.last_login_at),
    ...(row.mine_names ? { mineNames: row.mine_names } : {}),
  });
}

export function serializeSubsidiary(row: Record<string, any>) {
  return compact({
    id: row.id,
    code: row.code,
    name: row.name,
    region: row.region,
    headquarters: row.headquarters ?? undefined,
  });
}

export function serializeMine(row: Record<string, any>) {
  return compact({
    id: row.id,
    code: row.code,
    name: row.name,
    subsidiaryId: row.subsidiary_id,
    subsidiaryName: row.subsidiary_name ?? undefined,
    region: row.region,
    district: row.district,
    state: row.state,
    operationalStatus: row.operational_status,
    approvedCapacityTPA: numberOrUndefined(row.approved_capacity_tpa),
    commissionedOn: dateOnly(row.commissioned_on),
    mineManagerId: row.mine_manager_id ?? undefined,
    safetyOfficerId: row.safety_officer_id ?? undefined,
    complianceOfficerId: row.compliance_officer_id ?? undefined,
    environmentalOfficerId: row.environmental_officer_id ?? undefined,
    contactPhone: row.contact_phone ?? undefined,
    note: row.note ?? undefined,
    location: locationOf(row),
    archivedAt: iso(row.archived_at),
    archiveReason: row.archive_reason ?? undefined,
  });
}

export function serializeCompliance(row: Record<string, any>) {
  return compact({
    id: row.id,
    code: row.code,
    title: row.title,
    description: row.description,
    category: row.category,
    applicableMineIds: row.applicable_mine_ids ?? [],
    responsibleOfficerId: row.responsible_officer_id,
    sourceReference: row.source_reference ?? undefined,
    effectiveFrom: dateOnly(row.effective_from),
    dueDate: dateOnly(row.due_date),
    status: row.status,
    priority: row.priority,
    submissionFrequency: row.submission_frequency ?? undefined,
    lastSubmittedAt: iso(row.last_submitted_at),
    lastVerifiedAt: iso(row.last_verified_at),
    verificationStatus: row.verification_status ?? undefined,
    evidenceDocumentIds: row.evidence_document_ids ?? [],
    linkedViolationIds: row.linked_violation_ids ?? [],
    linkedCorrectiveActionIds: row.linked_corrective_action_ids ?? [],
    updatedAt: iso(row.updated_at),
    updatedBy: row.updated_by,
    mineName: row.mine_name ?? undefined,
    subsidiaryName: row.subsidiary_name ?? undefined,
    isOverdue: row.is_overdue ?? undefined,
    daysToDue: numberOrUndefined(row.days_to_due),
  });
}

export function serializeFinding(row: Record<string, any>) {
  return compact({
    id: row.id,
    description: row.description,
    category: row.category,
    severity: row.severity,
    isViolation: row.is_violation,
    complianceRecordIds: row.compliance_record_ids ?? [],
    raisedAt: iso(row.raised_at),
    recordedBy: row.recorded_by ?? undefined,
  });
}

export function serializeReview(row: Record<string, any>) {
  return compact({
    id: row.id,
    at: iso(row.created_at),
    actorId: row.actor_id,
    actorName: row.actor_name,
    fromStatus: row.from_status ?? undefined,
    toStatus: row.to_status,
    comment: row.comment ?? undefined,
  });
}

export function serializeInspection(row: Record<string, any>) {
  return compact({
    id: row.id,
    code: row.code,
    mineId: row.mine_id,
    mineName: row.mine_name ?? undefined,
    type: row.type,
    inspectorId: row.inspector_id,
    inspectorName: row.inspector_name ?? undefined,
    scheduledDate: dateOnly(row.scheduled_date),
    actualDate: dateOnly(row.actual_date),
    startedAt: iso(row.started_at),
    submittedAt: iso(row.submitted_at),
    completedAt: iso(row.completed_at),
    status: row.status,
    scope: row.scope ?? undefined,
    findings: row.findings ?? [],
    evidenceDocumentIds: row.evidence_document_ids ?? [],
    complianceRecordIds: row.compliance_record_ids ?? [],
    correctiveActionIds: row.corrective_action_ids ?? [],
    reviewHistory: row.review_history ?? [],
    reviewerId: row.reviewer_id ?? undefined,
    attestedBy: row.attested_by ?? undefined,
    attestedAt: iso(row.attested_at),
    attestationText: row.attestation_text ?? undefined,
    location: locationOf(row),
    createdAt: iso(row.created_at),
    createdBy: row.created_by,
  });
}

export function serializeSafety(row: Record<string, any>) {
  return compact({
    id: row.id,
    code: row.code,
    type: row.type,
    mineId: row.mine_id,
    mineName: row.mine_name ?? undefined,
    title: row.title,
    description: row.description,
    severity: row.severity,
    status: row.status,
    reportedBy: row.reported_by,
    reportedByName: row.reported_by_name ?? undefined,
    reportedAt: iso(row.reported_at),
    location: locationOf(row),
    locationDescription: row.location_description ?? undefined,
    assignedTo: row.assigned_to ?? undefined,
    assigneeName: row.assignee_name ?? undefined,
    investigationOpenedAt: iso(row.investigation_opened_at),
    investigationClosedAt: iso(row.investigation_closed_at),
    relatedInspectionId: row.related_inspection_id ?? undefined,
    preventiveActions: row.preventive_actions ?? [],
    correctiveActionIds: row.corrective_action_ids ?? [],
    evidenceDocumentIds: row.evidence_document_ids ?? [],
  });
}

export function serializeIncident(row: Record<string, any>) {
  return compact({
    id: row.id,
    code: row.code,
    mineId: row.mine_id,
    mineName: row.mine_name ?? undefined,
    title: row.title,
    description: row.description,
    severity: row.severity,
    occurredAt: iso(row.occurred_at),
    reportedAt: iso(row.reported_at),
    reportedBy: row.reported_by,
    status: row.status,
    location: locationOf(row),
    locationDescription: row.location_description ?? undefined,
    injuriesReported: Number(row.injuries_reported ?? 0),
    downtimeHours: numberOrUndefined(row.downtime_hours),
    assignedTo: row.assigned_to ?? undefined,
    assigneeName: row.assignee_name ?? undefined,
    relatedInspectionId: row.related_inspection_id ?? undefined,
    investigationSummary: row.investigation_summary ?? undefined,
    correctiveActionIds: row.corrective_action_ids ?? [],
    evidenceDocumentIds: row.evidence_document_ids ?? [],
    statusHistory: row.status_history ?? [],
  });
}

export function serializeNearMiss(row: Record<string, any>) {
  return compact({
    id: row.id,
    code: row.code,
    mineId: row.mine_id,
    mineName: row.mine_name ?? undefined,
    title: row.title,
    description: row.description,
    reportedBy: row.reported_by,
    reportedByName: row.reported_by_name ?? undefined,
    reportedAt: iso(row.reported_at),
    location: locationOf(row),
    locationDescription: row.location_description ?? undefined,
    preventiveActions: row.preventive_actions ?? [],
    status: row.status,
  });
}

export function serializeMeasurement(row: Record<string, any>) {
  return compact({
    id: row.id,
    mineId: row.mine_id,
    mineName: row.mine_name ?? undefined,
    indicator: row.indicator,
    value: Number(row.value),
    unit: row.unit,
    measuredAt: iso(row.measured_at),
    location: locationOf(row),
    locationDescription: row.location_description ?? undefined,
    source: row.source,
    thresholdId: row.threshold_id ?? undefined,
    status: row.status,
    sampleId: row.sample_id ?? undefined,
    inspectionId: row.inspection_id ?? undefined,
    evidenceDocumentIds: row.evidence_document_ids ?? [],
    stale: row.stale,
  });
}

export function serializeProduction(row: Record<string, any>) {
  return compact({
    id: row.id,
    mineId: row.mine_id,
    mineName: row.mine_name ?? undefined,
    date: dateOnly(row.date),
    shift: row.shift,
    productionTonnes: Number(row.production_tonnes),
    targetTonnes: numberOrUndefined(row.target_tonnes),
    valueKind: row.value_kind,
    estimateReason: row.estimate_reason ?? undefined,
    shiftSupervisorId: row.shift_supervisor_id ?? undefined,
    notes: row.notes ?? undefined,
    approvedBy: row.approved_by ?? undefined,
    approvedAt: iso(row.approved_at),
    sourceDocumentIds: row.source_document_ids ?? [],
    anomalyIds: row.anomaly_ids ?? [],
  });
}

export function serializeContractor(row: Record<string, any>) {
  return compact({
    id: row.id,
    code: row.code,
    name: row.name,
    type: row.type,
    contactPerson: row.contact_person,
    contactEmail: row.contact_email,
    contactPhone: row.contact_phone,
    registeredAddress: row.registered_address,
    mineIds: row.mine_ids ?? [],
    mineNames: row.mine_names ?? undefined,
    complianceStatus: row.compliance_status,
    requiredDocumentIds: row.required_document_ids ?? [],
    verifiedDocumentIds: row.verified_document_ids ?? [],
    safetyRecordIds: row.safety_record_ids ?? [],
    inspectionIds: row.inspection_ids ?? [],
    openCorrectiveActionIds: row.open_corrective_action_ids ?? [],
    registeredOn: dateOnly(row.registered_on),
    panNumber: row.pan_number ?? undefined,
    gstNumber: row.gst_number ?? undefined,
  });
}

export function serializeContract(row: Record<string, any>) {
  return compact({
    id: row.id,
    code: row.code,
    contractorId: row.contractor_id,
    contractorName: row.contractor_name ?? undefined,
    mineId: row.mine_id,
    mineName: row.mine_name ?? undefined,
    title: row.title,
    scope: row.scope,
    startDate: dateOnly(row.start_date),
    endDate: dateOnly(row.end_date),
    valueInrLakhs: numberOrUndefined(row.value_inr_lakhs),
    status: row.status,
    documentIds: row.document_ids ?? [],
    approvedBy: row.approved_by ?? undefined,
    daysToExpiry: numberOrUndefined(row.days_to_expiry),
  });
}

export function serializeAttendance(row: Record<string, any>) {
  return compact({
    id: row.id,
    workerRef: row.worker_ref,
    workerDisplayName: row.display_name,
    mineId: row.mine_id,
    mineName: row.mine_name ?? undefined,
    contractorId: row.contractor_id ?? undefined,
    contractorName: row.contractor_name ?? undefined,
    date: dateOnly(row.date),
    shift: row.shift,
    status: row.status,
    recordedAt: iso(row.recorded_at),
    corrections: row.corrections ?? [],
    evidenceDocumentIds: row.evidence_document_ids ?? [],
  });
}

export function serializeCorrection(row: Record<string, any>) {
  return compact({
    id: row.id,
    at: iso(row.at),
    originalStatus: row.original_status,
    correctedStatus: row.corrected_status,
    reason: row.reason,
    requestedBy: row.requested_by,
    approvedBy: row.approved_by ?? undefined,
    approvedAt: iso(row.approved_at),
    status: row.status,
    decisionReason: row.decision_reason ?? undefined,
  });
}

export function serializeAction(row: Record<string, any>) {
  return compact({
    id: row.id,
    code: row.code,
    sourceType: row.source_type,
    sourceId: row.source_id,
    sourceCode: row.source_code ?? undefined,
    mineId: row.mine_id,
    mineName: row.mine_name ?? undefined,
    description: row.description,
    assignedTo: row.assigned_to ?? undefined,
    assigneeName: row.assignee_name ?? undefined,
    priority: row.priority,
    createdAt: iso(row.created_at),
    createdBy: row.created_by,
    dueDate: dateOnly(row.due_date),
    status: row.status,
    completionNotes: row.completion_notes ?? undefined,
    submittedAt: iso(row.submitted_at),
    verificationStatus: row.verification_status,
    verifiedAt: iso(row.verified_at),
    verifiedBy: row.verified_by ?? undefined,
    rejectionReason: row.rejection_reason ?? undefined,
    closedAt: iso(row.closed_at),
    evidenceDocumentIds: row.evidence_document_ids ?? [],
    auditHistory: row.audit_history ?? [],
    daysToDue: numberOrUndefined(row.days_to_due),
    isOverdue: row.is_overdue ?? undefined,
  });
}

export function serializeDocument(row: Record<string, any>) {
  return compact({
    id: row.id,
    name: row.name,
    type: row.type,
    mimeType: row.mime_type,
    sizeBytes: Number(row.size_bytes),
    uploadedBy: row.uploaded_by,
    uploadedAt: iso(row.uploaded_at),
    status: row.status,
    mineId: row.mine_id ?? undefined,
    mineName: row.mine_name ?? undefined,
    linkedComplianceIds: row.linked_compliance_ids ?? [],
    ocrEngine: row.ocr_engine ?? undefined,
    ocrConfidence: numberOrUndefined(row.ocr_confidence),
    ocrProcessedAt: iso(row.ocr_processed_at),
    ocrError: row.ocr_error ?? undefined,
    extractedText: row.extracted_text ?? undefined,
    detectedLanguage: row.detected_language ?? undefined,
    extractedFields: row.extracted_fields ?? [],
    ledgerProof: row.ledger_network
      ? { network: row.ledger_network, transactionId: row.ledger_transaction_id }
      : undefined,
  });
}

export function serializeInsight(row: Record<string, any>) {
  return compact({
    id: row.id,
    code: row.code,
    title: row.title,
    category: row.category,
    mineId: row.mine_id ?? undefined,
    mineName: row.mine_name ?? undefined,
    subsidiaryId: row.subsidiary_id ?? undefined,
    riskLevel: row.risk_level,
    modelSource: row.model_source,
    generatedAt: iso(row.generated_at),
    dataFreshnessHours: numberOrUndefined(row.data_freshness_hours),
    confidence: numberOrUndefined(row.confidence),
    evidence: row.evidence ?? [],
    explanation: row.explanation,
    recommendation: row.recommendation ?? undefined,
    relatedEntityIds: row.related_entity_ids ?? [],
    reviewStatus: row.review_status,
    reviewedBy: row.reviewed_by ?? undefined,
    reviewedAt: iso(row.reviewed_at),
    limitations: row.limitations ?? [],
  });
}

export function serializeNotification(row: Record<string, any>) {
  return compact({
    id: row.id,
    type: row.type,
    severity: row.severity,
    title: row.title,
    message: row.message,
    createdAt: iso(row.created_at),
    read: row.read,
    readAt: iso(row.read_at),
    recipientId: row.recipient_id,
    relatedEntity: row.related_id
      ? {
          type: row.related_type ?? 'record',
          id: row.related_id,
          label: row.related_label ?? '',
          href: safeHref(row.related_href) ?? hrefForId(row.related_id),
        }
      : undefined,
    actionLabel: row.action_label ?? undefined,
    actionHref: safeHref(row.action_href),
    deliveries: row.deliveries ?? [],
  });
}

export function serializeWorkflow(row: Record<string, any>) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    trigger: row.trigger,
    enabled: row.enabled,
    stages: row.stages ?? [],
    updatedAt: iso(row.updated_at),    updatedBy: row.updated_by,
  };
}

export function serializeReportJob(row: Record<string, any>, canDownload = false) {
  return compact({
    id: row.id,
    request: {
      category: row.category,
      title: row.title,
      mineIds: row.mine_ids ?? [],
      subsidiaryIds: row.subsidiary_ids ?? [],
      dateFrom: dateOnly(row.date_from),
      dateTo: dateOnly(row.date_to),
      statusFilters: row.status_filters ?? [],
      format: row.format,
      groupBy: row.group_by ?? undefined,
    },
    status: row.status,
    createdAt: iso(row.created_at),
    completedAt: iso(row.completed_at),
    downloadUrl: canDownload && row.status === 'ready' ? `/reports/${row.id}/content.csv` : undefined,
    fileName: row.file_name ?? undefined,
    rowCount: numberOrUndefined(row.row_count),
    error: row.error ?? undefined,
  });
}

export function serializeAudit(row: Record<string, any>) {
  return compact({
    id: row.id,
    timestamp: iso(row.timestamp),
    actorId: row.actor_id,
    actorName: row.actor_name,
    actorRole: row.actor_role,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    entityLabel: row.entity_label ?? undefined,
    previousValue: row.previous_value ?? undefined,
    updatedValue: row.updated_value ?? undefined,
    reason: row.reason ?? undefined,
    workflow: row.workflow ?? undefined,
    verification:
      row.verification_method && row.verified_at
        ? { method: row.verification_method, verifiedAt: iso(row.verified_at) }
        : undefined,
    source: row.source,
    ledgerProof: row.ledger_network
      ? { network: row.ledger_network, transactionId: row.ledger_transaction_id }
      : undefined,
    requestId: row.request_id ?? undefined,
  });
}

function safeHref(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const href = value.trim();
  if (!href.startsWith('/') || href.startsWith('//')) return undefined;
  return href;
}

function hrefForId(id: string): string {
  if (id.startsWith('cmp-')) return `/compliance/${id}`;
  if (id.startsWith('insp-')) return `/inspections/${id}`;
  if (id.startsWith('inc-')) return `/safety/incidents/${id}`;
  if (id.startsWith('saf-')) return `/safety/${id}`;
  if (id.startsWith('ca-')) return `/corrective-actions/${id}`;
  if (id.startsWith('env-')) return `/environment/${id}`;
  if (id.startsWith('prod-')) return `/production/${id}`;
  if (id.startsWith('con-')) return `/contractors/${id}`;
  if (id.startsWith('doc-')) return `/documents/${id}`;
  if (id.startsWith('mine-')) return `/mines/${id}`;
  if (id.startsWith('rpt-')) return `/reports/${id}`;
  return '/notifications';
}
