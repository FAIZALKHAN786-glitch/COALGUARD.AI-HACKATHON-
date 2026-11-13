/**
 * Core domain model for CoalGuard.AI.
 *
 * These types describe the entities exchanged with the CoalGuard backend.
 * Where the backend is not yet available, the development adapter in
 * `src/services/dev` produces records that conform exactly to these shapes.
 */

export type ISODateString = string;
export type ISODateTimeString = string;

/* -------------------------------------------------------------------------- */
/* Identity & access                                                          */
/* -------------------------------------------------------------------------- */

export const ROLES = [
  'mine_admin',
  'mine_manager',
  'safety_officer',
  'environmental_officer',
  'compliance_officer',
  'field_inspector',
  'contractor_manager',
  'corporate_management',
  'regulatory_user',
  'system_admin',
] as const;

export type Role = (typeof ROLES)[number];

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  title: string;
  /** Mines this user is scoped to. Empty array = organisation-wide scope. */
  mineIds: string[];
  /** Subsidiaries this user is scoped to. Empty array = organisation-wide scope. */
  subsidiaryIds: string[];
  /** True when the identity comes from the development adapter (not real auth). */
  developmentIdentity: boolean;
  lastLoginAt?: ISODateTimeString;
}

export interface Session {
  user: User;
  issuedAt: ISODateTimeString;
  expiresAt: ISODateTimeString;
  /** True when produced by the clearly-labelled development identity adapter. */
  development: boolean;
  /**
   * Opaque bearer token issued by the backend. Present on sign-in and omitted
   * from subsequent session responses so it is not re-exposed unnecessarily.
   */
  accessToken?: string;
}

/* -------------------------------------------------------------------------- */
/* Organisation                                                                */
/* -------------------------------------------------------------------------- */

export const OPERATIONAL_STATUSES = ['operational', 'partial', 'suspended', 'decommissioned'] as const;
export type OperationalStatus = (typeof OPERATIONAL_STATUSES)[number];

export interface Subsidiary {
  id: string;
  code: string;
  name: string;
  region: string;
  /** Headquarters location, optional. */
  headquarters?: string;
}

export interface Mine {
  id: string;
  code: string;
  name: string;
  subsidiaryId: string;
  region: string;
  district: string;
  state: string;
  location?: GeoPoint;
  operationalStatus: OperationalStatus;
  /** Approved annual capacity in tonnes per annum, where configured. */
  approvedCapacityTPA?: number;
  commissionedOn?: ISODateString;
  mineManagerId?: string;
  safetyOfficerId?: string;
  complianceOfficerId?: string;
  environmentalOfficerId?: string;
  contactPhone?: string;
  /** Free-text operational note. */
  note?: string;
}

export interface GeoPoint {
  /** Latitude in decimal degrees (WGS84). */
  lat: number;
  /** Longitude in decimal degrees (WGS84). */
  lng: number;
  /** Horizontal accuracy radius in metres, when the source provides it. */
  accuracyM?: number;
  /** How the coordinate was obtained. Never infer this silently. */
  source: GeoSource;
  /** ISO timestamp of capture. */
  capturedAt?: ISODateTimeString;
}

export const GEO_SOURCES = ['device_gps', 'manual_entry', 'mine_registry', 'sensor'] as const;
export type GeoSource = (typeof GEO_SOURCES)[number];

/* -------------------------------------------------------------------------- */
/* Compliance                                                                  */
/* -------------------------------------------------------------------------- */

export const COMPLIANCE_CATEGORIES = [
  'mine_safety',
  'environment',
  'production',
  'labour',
  'contractor',
  'other',
] as const;
export type ComplianceCategory = (typeof COMPLIANCE_CATEGORIES)[number];

export const COMPLIANCE_STATUSES = [
  'draft',
  'pending_submission',
  'submitted',
  'under_review',
  'compliant',
  'non_compliant',
  'overdue',
  'awaiting_verification',
] as const;
export type ComplianceStatus = (typeof COMPLIANCE_STATUSES)[number];

export interface ComplianceRecord {
  id: string;
  code: string;
  title: string;
  description: string;
  category: ComplianceCategory;
  applicableMineIds: string[];
  responsibleOfficerId?: string;
  /** Legal / circular reference. Sourced from the configured register - never invented. */
  sourceReference?: string;
  effectiveFrom?: ISODateString;
  dueDate?: ISODateString;
  status: ComplianceStatus;
  priority: Priority;
  submissionFrequency?: 'once' | 'monthly' | 'quarterly' | 'annual' | 'event_based';
  lastSubmittedAt?: ISODateTimeString;
  lastVerifiedAt?: ISODateTimeString;
  verificationStatus?: VerificationStatus;
  evidenceDocumentIds: string[];
  linkedViolationIds: string[];
  linkedCorrectiveActionIds: string[];
  notes?: string;
  updatedAt: ISODateTimeString;
  updatedBy?: string;
}

export const PRIORITIES = ['low', 'medium', 'high', 'critical'] as const;
export type Priority = (typeof PRIORITIES)[number];

export const VERIFICATION_STATUSES = ['not_required', 'pending', 'verified', 'rejected'] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

/* -------------------------------------------------------------------------- */
/* Inspections                                                                 */
/* -------------------------------------------------------------------------- */

export const INSPECTION_TYPES = [
  'statutory_safety',
  'environment',
  'production',
  'labour',
  'contractor',
  'ad_hoc',
] as const;
export type InspectionType = (typeof INSPECTION_TYPES)[number];

export const INSPECTION_STATUSES = [
  'scheduled',
  'in_progress',
  'submitted',
  'under_review',
  'completed',
  'cancelled',
] as const;
export type InspectionStatus = (typeof INSPECTION_STATUSES)[number];

export interface InspectionFinding {
  id: string;
  description: string;
  category: ComplianceCategory;
  severity: Priority;
  isViolation: boolean;
  complianceRecordIds: string[];
  raisedAt: ISODateTimeString;
  recordedBy?: string;
}

export interface Inspection {
  id: string;
  code: string;
  mineId: string;
  type: InspectionType;
  inspectorId: string;
  scheduledDate: ISODateString;
  actualDate?: ISODateString;
  startedAt?: ISODateTimeString;
  submittedAt?: ISODateTimeString;
  completedAt?: ISODateTimeString;
  status: InspectionStatus;
  scope?: string;
  findings: InspectionFinding[];
  evidenceDocumentIds: string[];
  complianceRecordIds: string[];
  correctiveActionIds: string[];
  reviewerId?: string;
  reviewHistory: ReviewEvent[];
  location?: GeoPoint;
  createdAt: ISODateTimeString;
  createdBy: string;
}

export interface ReviewEvent {
  id: string;
  at: ISODateTimeString;
  actorId: string;
  actorName: string;
  fromStatus: string;
  toStatus: string;
  comment?: string;
}

/* -------------------------------------------------------------------------- */
/* Violations                                                                  */
/* -------------------------------------------------------------------------- */

export const VIOLATION_STATUSES = ['open', 'under_remediation', 'awaiting_verification', 'closed'] as const;
export type ViolationStatus = (typeof VIOLATION_STATUSES)[number];

export interface Violation {
  id: string;
  code: string;
  mineId: string;
  /** Where the violation was recorded. */
  sourceType: 'inspection' | 'compliance';
  sourceId: string;
  sourceCode: string;
  description: string;
  severity: Priority;
  category: ComplianceCategory;
  raisedAt: ISODateTimeString;
  raisedBy: string;
  /** Response window recorded when the violation was raised. */
  dueDate?: ISODateString;
  status: ViolationStatus;
  correctiveActionIds: string[];
  verifiedAt?: ISODateTimeString;
  verifiedBy?: string;
}

/* -------------------------------------------------------------------------- */
/* Safety, incidents & observations                                            */
/* -------------------------------------------------------------------------- */

export const SAFETY_RECORD_TYPES = ['observation', 'hazard', 'near_miss', 'incident'] as const;
export type SafetyRecordType = (typeof SAFETY_RECORD_TYPES)[number];

export const SAFETY_RECORD_STATUSES = [
  'open',
  'under_investigation',
  'action_assigned',
  'resolved',
  'closed',
] as const;
export type SafetyRecordStatus = (typeof SAFETY_RECORD_STATUSES)[number];

export interface SafetyRecord {
  id: string;
  code: string;
  type: SafetyRecordType;
  mineId: string;
  title: string;
  description: string;
  severity: Priority;
  status: SafetyRecordStatus;
  reportedBy: string;
  reportedAt: ISODateTimeString;
  location?: GeoPoint;
  locationDescription?: string;
  assignedTo?: string;
  investigationOpenedAt?: ISODateTimeString;
  investigationClosedAt?: ISODateTimeString;
  correctiveActionIds: string[];
  evidenceDocumentIds: string[];
  relatedInspectionId?: string;
}

export interface NearMiss {
  id: string;
  code: string;
  mineId: string;
  title: string;
  description: string;
  reportedBy: string;
  reportedAt: ISODateTimeString;
  location?: GeoPoint;
  preventiveActions: string[];
}

export interface Incident {
  id: string;
  code: string;
  mineId: string;
  title: string;
  description: string;
  severity: Priority;
  occurredAt: ISODateTimeString;
  reportedAt: ISODateTimeString;
  reportedBy: string;
  status: SafetyRecordStatus;
  location?: GeoPoint;
  locationDescription?: string;
  injuriesReported: number;
  downtimeHours?: number;
  assignedTo?: string;
  correctiveActionIds: string[];
  evidenceDocumentIds: string[];
  relatedInspectionId?: string;
  investigationSummary?: string;
}

/* -------------------------------------------------------------------------- */
/* Environment                                                                 */
/* -------------------------------------------------------------------------- */

export const ENVIRONMENTAL_INDICATORS = [
  'air_quality_pm10',
  'air_quality_pm25',
  'dust_deposition',
  'water_quality_ph',
  'water_quality_tds',
  'noise_level',
  'stack_emission',
  'waste_generation',
] as const;
export type EnvironmentalIndicator = (typeof ENVIRONMENTAL_INDICATORS)[number];

export const MEASUREMENT_SOURCES = ['sensor', 'manual', 'imported', 'sample', 'ai_estimate'] as const;
export type MeasurementSource = (typeof MEASUREMENT_SOURCES)[number];

export interface EnvironmentalThreshold {
  indicator: EnvironmentalIndicator;
  unit: string;
  /** Configured limit - sourced from configuration, never invented by the UI. */
  limit?: number;
  comparison: 'above' | 'below';
  label: string;
  configuredBy?: string;
}

export interface EnvironmentalMeasurement {
  id: string;
  mineId: string;
  indicator: EnvironmentalIndicator;
  value: number;
  unit: string;
  measuredAt: ISODateTimeString;
  location?: GeoPoint;
  locationDescription?: string;
  source: MeasurementSource;
  /** Link to the configured threshold record this reading was evaluated against. */
  thresholdId?: string;
  status: 'within_limit' | 'exceeds_limit' | 'unknown';
  sampleId?: string;
  inspectionId?: string;
  evidenceDocumentIds: string[];
  /** True when the reading has not been refreshed within its expected cadence. */
  stale: boolean;
}

export interface EnvironmentalThresholdRegister {
  thresholds: EnvironmentalThreshold[];
  /** Notes describing where threshold configuration came from. */
  provenance: string;
  lastConfiguredAt?: ISODateTimeString;
}

/* -------------------------------------------------------------------------- */
/* Production                                                                  */
/* -------------------------------------------------------------------------- */

export const SHIFTS = ['day', 'swing', 'night'] as const;
export type Shift = (typeof SHIFTS)[number];

export const PRODUCTION_VALUE_KINDS = ['reported', 'approved', 'estimated'] as const;
export type ProductionValueKind = (typeof PRODUCTION_VALUE_KINDS)[number];

export interface ProductionRecord {
  id: string;
  mineId: string;
  date: ISODateString;
  shift: Shift;
  /** Coal dispatched / produced for the period, in tonnes. */
  productionTonnes: number;
  /** Approved target for the period, where a target is configured. */
  targetTonnes?: number;
  valueKind: ProductionValueKind;
  /** Reason the value is an estimate rather than a reported/approved figure. */
  estimateReason?: string;
  shiftSupervisorId?: string;
  sourceDocumentIds: string[];
  anomalyIds: string[];
  notes?: string;
}

export interface ProductionAnomaly {
  id: string;
  mineId: string;
  recordId: string;
  date: ISODateString;
  metric: string;
  direction: 'above' | 'below';
  /** Magnitude of deviation expressed in standard deviations, when computed. */
  zScore?: number;
  severity: Priority;
  explanation: string;
  detectedAt: ISODateTimeString;
  /** Source of the detection - 'rule' or a named statistical/model pipeline. */
  detector: string;
  reviewStatus: 'unreviewed' | 'acknowledged' | 'dismissed' | 'confirmed';
}

/* -------------------------------------------------------------------------- */
/* Contractors                                                                 */
/* -------------------------------------------------------------------------- */

export const CONTRACTOR_TYPES = [
  'drilling',
  'blasting',
  'hauling',
  'maintenance',
  'civil_works',
  'security',
  'transport',
] as const;
export type ContractorType = (typeof CONTRACTOR_TYPES)[number];

export interface Contractor {
  id: string;
  code: string;
  name: string;
  type: ContractorType;
  contactPerson: string;
  contactEmail: string;
  contactPhone: string;
  registeredAddress: string;
  mineIds: string[];
  complianceStatus: 'compliant' | 'non_compliant' | 'under_review' | 'unassessed';
  requiredDocumentIds: string[];
  verifiedDocumentIds: string[];
  safetyRecordIds: string[];
  inspectionIds: string[];
  openCorrectiveActionIds: string[];
  registeredOn: ISODateString;
  panNumber?: string;
  gstNumber?: string;
}

export interface Contract {
  id: string;
  code: string;
  contractorId: string;
  mineId: string;
  title: string;
  scope: string;
  startDate: ISODateString;
  endDate: ISODateString;
  valueInrLakhs?: number;
  status: 'draft' | 'active' | 'expiring' | 'expired' | 'terminated';
  approvedBy?: string;
  documentIds: string[];
}

/* -------------------------------------------------------------------------- */
/* Workforce & labour                                                          */
/* -------------------------------------------------------------------------- */

export const ATTENDANCE_STATUSES = ['present', 'absent', 'leave', 'half_day', 'not_recorded'] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export interface AttendanceCorrection {
  id: string;
  at: ISODateTimeString;
  originalStatus: AttendanceStatus;
  correctedStatus: AttendanceStatus;
  reason: string;
  requestedBy: string;
  approvedBy?: string;
  approvedAt?: ISODateTimeString;
  status: 'pending' | 'approved' | 'rejected';
}

export interface AttendanceRecord {
  id: string;
  /** Pseudonymous worker reference. Personal identifiers are not exposed here. */
  workerRef: string;
  workerDisplayName: string;
  mineId: string;
  contractorId?: string;
  date: ISODateString;
  shift: Shift;
  status: AttendanceStatus;
  recordedAt: ISODateTimeString;
  evidenceDocumentIds: string[];
  corrections: AttendanceCorrection[];
}

/* -------------------------------------------------------------------------- */
/* Corrective actions                                                          */
/* -------------------------------------------------------------------------- */

export const CORRECTIVE_ACTION_STATUSES = [
  'proposed',
  'assigned',
  'in_progress',
  'submitted_for_verification',
  'verified',
  'rejected',
  'closed',
] as const;
export type CorrectiveActionStatus = (typeof CORRECTIVE_ACTION_STATUSES)[number];

export const CORRECTIVE_ACTION_SOURCES = ['inspection', 'incident', 'violation', 'observation'] as const;
export type CorrectiveActionSource = (typeof CORRECTIVE_ACTION_SOURCES)[number];

export interface CorrectiveAction {
  id: string;
  code: string;
  sourceType: CorrectiveActionSource;
  sourceId: string;
  mineId: string;
  description: string;
  assignedTo?: string;
  priority: Priority;
  createdAt: ISODateTimeString;
  createdBy: string;
  dueDate?: ISODateString;
  status: CorrectiveActionStatus;
  evidenceDocumentIds: string[];
  completionNotes?: string;
  submittedAt?: ISODateTimeString;
  verificationStatus: VerificationStatus;
  verifiedAt?: ISODateTimeString;
  verifiedBy?: string;
  rejectionReason?: string;
  closedAt?: ISODateTimeString;
  auditHistory: AuditEvent[];
}

/* -------------------------------------------------------------------------- */
/* Documents & OCR                                                             */
/* -------------------------------------------------------------------------- */

export const DOCUMENT_STATUSES = [
  'uploaded',
  'queued',
  'processing',
  'processed',
  'needs_review',
  'failed',
] as const;
export type DocumentStatus = (typeof DOCUMENT_STATUSES)[number];

export const DOCUMENT_TYPES = [
  'compliance_evidence',
  'inspection_report',
  'contract',
  'worker_record',
  'environment_log',
  'production_report',
  'other',
] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export interface ExtractedField {
  id: string;
  label: string;
  value: string;
  confidence?: number;
  pageNumber?: number;
  /** True when a human has confirmed or amended the extracted value. */
  confirmed: boolean;
  correctedValue?: string;
}

export interface DocumentRecord {
  id: string;
  name: string;
  type: DocumentType;
  mimeType: string;
  sizeBytes: number;
  uploadedBy: string;
  uploadedAt: ISODateTimeString;
  status: DocumentStatus;
  mineId?: string;
  linkedComplianceIds: string[];
  /** Name of the OCR engine that produced the extraction, when one ran. */
  ocrEngine?: string;
  ocrConfidence?: number;
  ocrProcessedAt?: ISODateTimeString;
  ocrError?: string;
  extractedFields: ExtractedField[];
  extractedText?: string;
  /** Language detected by the OCR engine. */
  detectedLanguage?: string;
  /** Populated only when a real blockchain audit service supplies it. */
  ledgerProof?: { network: string; transactionId: string; verifiedAt: ISODateTimeString };
}

/* -------------------------------------------------------------------------- */
/* AI risk analytics                                                           */
/* -------------------------------------------------------------------------- */

export const RISK_LEVELS = ['low', 'moderate', 'elevated', 'high', 'critical'] as const;
export type RiskLevel = (typeof RISK_LEVELS)[number];

export const INSIGHT_CATEGORIES = [
  'compliance_risk',
  'recurring_violations',
  'safety_repeat_offences',
  'environmental_anomaly',
  'production_anomaly',
  'contractor_risk',
  'overdue_pattern',
] as const;
export type InsightCategory = (typeof INSIGHT_CATEGORIES)[number];

export const INSIGHT_REVIEW_STATUSES = ['unreviewed', 'acknowledged', 'investigating', 'dismissed', 'escalated'] as const;
export type InsightReviewStatus = (typeof INSIGHT_REVIEW_STATUSES)[number];

export interface InsightEvidence {
  label: string;
  detail: string;
  /** Observed facts, statistical indicators, predictions, recommendations. */
  kind: 'observed_fact' | 'statistical_indicator' | 'prediction' | 'recommendation';
  weight?: number;
}

export interface AiInsight {
  id: string;
  code: string;
  title: string;
  category: InsightCategory;
  mineId?: string;
  subsidiaryId?: string;
  riskLevel: RiskLevel;
  /** Model/rule identifier from the analytics pipeline, when supplied. */
  modelSource: string;
  generatedAt: ISODateTimeString;
  /** Age of the underlying data at generation time. */
  dataFreshnessHours?: number;
  confidence?: number;
  evidence: InsightEvidence[];
  explanation: string;
  recommendation?: string;
  reviewStatus: InsightReviewStatus;
  reviewedBy?: string;
  reviewedAt?: ISODateTimeString;
  reviewNote?: string;
  relatedEntityIds: string[];
  /** Always true for this module - insights are predictions, never confirmed violations. */
  isPrediction: boolean;
  limitations?: string[];
}

/* -------------------------------------------------------------------------- */
/* Notifications & workflows                                                   */
/* -------------------------------------------------------------------------- */

export const NOTIFICATION_TYPES = [
  'compliance_deadline',
  'compliance_overdue',
  'inspection_assigned',
  'review_request',
  'corrective_action_reminder',
  'contract_expiring',
  'environmental_alert',
  'safety_observation',
  'approval_request',
  'escalation',
  'system',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const NOTIFICATION_SEVERITIES = ['info', 'success', 'warning', 'critical'] as const;
export type NotificationSeverity = (typeof NOTIFICATION_SEVERITIES)[number];

export interface DeliveryState {
  channel: 'in_app' | 'email' | 'sms' | 'whatsapp' | 'push';
  status: 'queued' | 'sent' | 'delivered' | 'failed' | 'not_configured';
  at?: ISODateTimeString;
  error?: string;
}

export interface AppNotification {
  id: string;
  type: NotificationType;
  severity: NotificationSeverity;
  title: string;
  message: string;
  createdAt: ISODateTimeString;
  read: boolean;
  recipientId: string;
  relatedEntity?: { type: string; id: string; label: string; href: string };
  deliveries: DeliveryState[];
  actionLabel?: string;
  actionHref?: string;
}

export interface EscalationStage {
  id: string;
  order: number;
  label: string;
  role: Role;
  /** Hours after the trigger before this stage escalates. */
  afterHours: number;
  notifyChannels: DeliveryState['channel'][];
}

export interface WorkflowRule {
  id: string;
  name: string;
  description: string;
  trigger: string;
  enabled: boolean;
  stages: EscalationStage[];
  updatedAt: ISODateTimeString;
  updatedBy: string;
}

/* -------------------------------------------------------------------------- */
/* Audit                                                                       */
/* -------------------------------------------------------------------------- */

export const AUDIT_ACTIONS = [
  'create',
  'update',
  'status_change',
  'assign',
  'verify',
  'submit',
  'archive',
  'delete',
  'export',
  'login',
  'logout',
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export interface AuditEvent {
  id: string;
  timestamp: ISODateTimeString;
  actorId: string;
  actorName: string;
  actorRole: Role | 'system';
  action: AuditAction;
  entityType: string;
  entityId: string;
  entityLabel?: string;
  previousValue?: unknown;
  updatedValue?: unknown;
  reason?: string;
  workflow?: string;
  verification?: { method: string; verifiedAt: ISODateTimeString };
  /** 'platform_log' is the ordinary application audit table. */
  source: 'platform_log' | 'blockchain_ledger';
  /** Present only when source === 'blockchain_ledger' and a real service supplied it. */
  ledgerProof?: { network: string; transactionId: string };
}

/* -------------------------------------------------------------------------- */
/* Reports                                                                     */
/* -------------------------------------------------------------------------- */

export const REPORT_CATEGORIES = [
  'statutory_compliance',
  'inspection_summary',
  'safety_observations',
  'incidents',
  'corrective_actions',
  'environmental_monitoring',
  'production',
  'contractor_compliance',
  'workforce',
  'audit_history',
] as const;
export type ReportCategory = (typeof REPORT_CATEGORIES)[number];

export interface ReportRequest {
  category: ReportCategory;
  title: string;
  mineIds: string[];
  subsidiaryIds: string[];
  dateFrom: ISODateString;
  dateTo: ISODateString;
  statusFilters: string[];
  format: 'csv' | 'pdf' | 'xlsx';
  groupBy?: 'mine' | 'subsidiary' | 'category' | 'month' | 'none';
}

/**
 * Catalogue entry describing a report the platform can produce: which fields
 * are included, the supported formats and the available groupings. These are
 * metadata only - the UI must not assume a report format exists until the
 * backend advertises it here.
 */
export interface ReportDefinition {
  category: ReportCategory;
  name: string;
  description: string;
  formats: ReportRequest['format'][];
  groupBy: NonNullable<ReportRequest['groupBy']>[];
  /** Fields included in the export, in column order. */
  columns: { key: string; label: string }[];
}

export interface ReportJob {
  id: string;
  request: ReportRequest;
  status: 'queued' | 'processing' | 'ready' | 'failed';
  createdAt: ISODateTimeString;
  completedAt?: ISODateTimeString;
  /** Present when the report has been generated and can be downloaded. */
  downloadUrl?: string;
  fileName?: string;
  rowCount?: number;
  error?: string;
}

/* -------------------------------------------------------------------------- */
/* Dashboard                                                                   */
/* -------------------------------------------------------------------------- */

export interface DashboardFilters {
  subsidiaryId?: string;
  mineId?: string;
  region?: string;
  dateFrom?: ISODateString;
  dateTo?: ISODateString;
  complianceCategory?: ComplianceCategory;
  operationalStatus?: OperationalStatus;
}

export interface DashboardSummary {
  totalMines: number;
  totalSubsidiaries: number;
  complianceCompliant: number;
  complianceNonCompliant: number;
  complianceAwaitingVerification: number;
  pendingComplianceRequirements: number;
  overdueComplianceObligations: number;
  openViolations: number;
  overdueViolations: number;
  violationsAwaitingVerification: number;
  totalViolations: number;
  openCorrectiveActions: number;
  overdueCorrectiveActions: number;
  correctiveActionsCompleted: number;
  highPrioritySafetyObservations: number;
  inspectionsCompleted: number;
  inspectionsScheduled: number;
  inspectionsInProgress: number;
  environmentalAlerts: number;
  contractorsTotal: number;
  contractorsNonCompliant: number;
  outstandingReports: number;
  productionTonnesMonth: number;
  productionTargetMonth?: number;
  dataFreshness: { generatedAt: ISODateTimeString; source: DataSource };
}

export type DataSource = 'live' | 'cached' | 'stale' | 'development';

export interface ApiMeta {
  source: DataSource;
  generatedAt: ISODateTimeString;
  /** Number of records returned before pagination. */
  total: number;
  page: number;
  pageSize: number;
}

/* -------------------------------------------------------------------------- */
/* Generic API envelope                                                        */
/* -------------------------------------------------------------------------- */

export interface Paginated<T> {
  items: T[];
  meta: ApiMeta;
}

export interface ApiErrorShape {
  status: number;
  code: string;
  message: string;
  details?: Record<string, string[]>;
  requestId?: string;
}
