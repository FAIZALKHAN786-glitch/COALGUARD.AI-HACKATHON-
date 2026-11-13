/**
 * Typed service contracts for the CoalGuard backend.
 *
 * The frontend never talks to a database or a raw endpoint directly. Every
 * module goes through these interfaces, which are implemented by:
 *  - `HttpServices`  -> the production CoalGuard REST API.
 *  - `DevServices`   -> the deterministic development adapter (demo data).
 */

import type {
  AiInsight,
  AppNotification,
  AuditAction,
  AuditEvent,
  AttendanceRecord,
  ComplianceCategory,
  ComplianceRecord,
  ComplianceStatus,
  Contract,
  Contractor,
  CorrectiveAction,
  CorrectiveActionStatus,
  DashboardFilters,
  DashboardSummary,
  DocumentRecord,
  DocumentStatus,
  DocumentType,
  EnvironmentalIndicator,
  EnvironmentalMeasurement,
  EnvironmentalThresholdRegister,
  GeoPoint,
  Incident,
  Inspection,
  InspectionStatus,
  InspectionType,
  Mine,
  NearMiss,
  Paginated,
  Priority,
  ProductionAnomaly,
  ProductionRecord,
  ReportCategory,
  ReportJob,
  ReportRequest,
  ReportDefinition,
  SafetyRecord,
  Session,
  Subsidiary,
  User,
  WorkflowRule,
} from '@/types';

/**
 * Re-exported so adapter implementations can import every service-layer type
 * from a single module.
 */
export type { ReportDefinition } from '@/types';

export interface ListQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
  filters?: Record<string, string | string[] | undefined>;
}

export interface ListResult<T> extends Paginated<T> {}

/* -------------------------------------------------------------------------- */
/* Auth                                                                        */
/* -------------------------------------------------------------------------- */

export interface AuthService {
  /** Returns the current session, or null when signed out. */
  getSession(): Promise<Session | null>;
  signIn(email: string, password?: string): Promise<Session>;
  signOut(): Promise<void>;
  /** Lists the identities available in the current auth mode. */
  listIdentities(): Promise<User[]>;
  /** Updates the signed-in user's own editable profile fields. */
  updateProfile(input: UpdateProfileInput): Promise<User>;
}

export interface UpdateProfileInput {
  name: string;
  title: string;
}

/* -------------------------------------------------------------------------- */
/* Organisation                                                                */
/* -------------------------------------------------------------------------- */

export interface MineService {
  list(query?: ListQuery): Promise<ListResult<Mine>>;
  get(id: string): Promise<Mine>;
  create(input: CreateMineInput): Promise<Mine>;
  update(id: string, input: UpdateMineInput): Promise<Mine>;
  archive(id: string, reason: string): Promise<Mine>;
  subsidiaries(): Promise<Subsidiary[]>;
  users(query?: ListQuery): Promise<ListResult<User>>;
}

export interface CreateMineInput {
  code: string;
  name: string;
  subsidiaryId: string;
  region: string;
  district: string;
  state: string;
  operationalStatus: Mine['operationalStatus'];
  approvedCapacityTPA?: number;
  commissionedOn?: string;
  mineManagerId?: string;
  safetyOfficerId?: string;
  complianceOfficerId?: string;
  environmentalOfficerId?: string;
  contactPhone?: string;
  note?: string;
  lat?: number;
  lng?: number;
}

export type UpdateMineInput = Partial<CreateMineInput>;

/* -------------------------------------------------------------------------- */
/* Compliance                                                                  */
/* -------------------------------------------------------------------------- */

export interface ComplianceService {
  list(query?: ListQuery): Promise<ListResult<ComplianceRecord>>;
  get(id: string): Promise<ComplianceRecord>;
  create(input: CreateComplianceInput): Promise<ComplianceRecord>;
  update(id: string, input: UpdateComplianceInput): Promise<ComplianceRecord>;
  transition(id: string, to: ComplianceStatus, comment?: string): Promise<ComplianceRecord>;
  attachEvidence(id: string, documentId: string): Promise<ComplianceRecord>;
  calendar(query?: ListQuery): Promise<ListResult<ComplianceRecord>>;
}

export interface CreateComplianceInput {
  code: string;
  title: string;
  description: string;
  category: ComplianceCategory;
  applicableMineIds: string[];
  responsibleOfficerId?: string;
  sourceReference?: string;
  effectiveFrom?: string;
  dueDate?: string;
  priority: ComplianceRecord['priority'];
  submissionFrequency?: ComplianceRecord['submissionFrequency'];
  notes?: string;
}

export type UpdateComplianceInput = Partial<CreateComplianceInput>;

/* -------------------------------------------------------------------------- */
/* Inspections                                                                 */
/* -------------------------------------------------------------------------- */

export interface InspectionService {
  list(query?: ListQuery): Promise<ListResult<Inspection>>;
  get(id: string): Promise<Inspection>;
  create(input: CreateInspectionInput): Promise<Inspection>;
  update(id: string, input: UpdateInspectionInput): Promise<Inspection>;
  addFinding(id: string, input: CreateFindingInput): Promise<Inspection>;
  transition(id: string, to: Inspection['status'], comment?: string, attestation?: string): Promise<Inspection>;
  assignInspector(id: string, inspectorId: string): Promise<Inspection>;
}

export interface CreateInspectionInput {
  mineId: string;
  type: InspectionType;
  inspectorId: string;
  scheduledDate: string;
  scope?: string;
  complianceRecordIds?: string[];
}

export type UpdateInspectionInput = Partial<CreateInspectionInput>;

export interface CreateFindingInput {
  description: string;
  category: ComplianceCategory;
  severity: ComplianceRecord['priority'];
  isViolation: boolean;
  complianceRecordIds?: string[];
}

/* -------------------------------------------------------------------------- */
/* Safety                                                                      */
/* -------------------------------------------------------------------------- */

export interface SafetyService {
  observations(query?: ListQuery): Promise<ListResult<SafetyRecord>>;
  getObservation(id: string): Promise<SafetyRecord>;
  createObservation(input: CreateSafetyRecordInput): Promise<SafetyRecord>;
  updateObservation(id: string, input: Partial<CreateSafetyRecordInput>): Promise<SafetyRecord>;
  transitionObservation(id: string, to: SafetyRecord['status'], comment?: string): Promise<SafetyRecord>;
  incidents(query?: ListQuery): Promise<ListResult<Incident>>;
  getIncident(id: string): Promise<Incident>;
  createIncident(input: CreateIncidentInput): Promise<Incident>;
  /** Moves an incident through the investigation workflow. */
  transitionIncident(id: string, to: Incident['status'], comment?: string): Promise<Incident>;
  nearMisses(query?: ListQuery): Promise<ListResult<NearMiss>>;
}

export interface CreateSafetyRecordInput {
  type: SafetyRecord['type'];
  mineId: string;
  title: string;
  description: string;
  severity: SafetyRecord['severity'];
  locationDescription?: string;
  lat?: number;
  lng?: number;
  accuracyM?: number;
  assignedTo?: string;
  relatedInspectionId?: string;
}

export interface CreateIncidentInput {
  mineId: string;
  title: string;
  description: string;
  severity: Incident['severity'];
  occurredAt: string;
  injuriesReported: number;
  downtimeHours?: number;
  locationDescription?: string;
  lat?: number;
  lng?: number;
  accuracyM?: number;
  assignedTo?: string;
  relatedInspectionId?: string;
}

/* -------------------------------------------------------------------------- */
/* Environment                                                                 */
/* -------------------------------------------------------------------------- */

export interface EnvironmentService {
  measurements(query?: ListQuery): Promise<ListResult<EnvironmentalMeasurement>>;
  getMeasurement(id: string): Promise<EnvironmentalMeasurement>;
  createMeasurement(input: CreateMeasurementInput): Promise<EnvironmentalMeasurement>;
  thresholds(): Promise<EnvironmentalThresholdRegister>;
  indicators(): Promise<EnvironmentalIndicator[]>;
}

export interface CreateMeasurementInput {
  mineId: string;
  indicator: EnvironmentalIndicator;
  value: number;
  unit: string;
  measuredAt: string;
  source: EnvironmentalMeasurement['source'];
  thresholdId?: string;
  locationDescription?: string;
  lat?: number;
  lng?: number;
  accuracyM?: number;
  sampleId?: string;
  inspectionId?: string;
}

/* -------------------------------------------------------------------------- */
/* Production                                                                  */
/* -------------------------------------------------------------------------- */

export interface ProductionService {
  list(query?: ListQuery): Promise<ListResult<ProductionRecord>>;
  get(id: string): Promise<ProductionRecord>;
  create(input: CreateProductionInput): Promise<ProductionRecord>;
  approve(id: string): Promise<ProductionRecord>;
  anomalies(query?: ListQuery): Promise<ListResult<ProductionAnomaly>>;
  /** Completeness of the reporting grid, e.g. missing shifts per mine. */
  completeness(query?: ListQuery): Promise<ProductionCompletenessRow[]>;
}

export interface CreateProductionInput {
  mineId: string;
  date: string;
  shift: ProductionRecord['shift'];
  productionTonnes: number;
  targetTonnes?: number;
  valueKind: ProductionRecord['valueKind'];
  estimateReason?: string;
  shiftSupervisorId?: string;
  notes?: string;
}

export interface ProductionCompleteness {
  mineId: string;
  expectedRecords: number;
  reportedRecords: number;
  missingShifts: number;
  completenessPercent: number;
}

/** One completeness row per mine, as returned by the reporting grid. */
export type ProductionCompletenessRow = ProductionCompleteness;

/* -------------------------------------------------------------------------- */
/* Contractors                                                                 */
/* -------------------------------------------------------------------------- */

export interface ContractorService {
  list(query?: ListQuery): Promise<ListResult<Contractor>>;
  get(id: string): Promise<Contractor>;
  create(input: CreateContractorInput): Promise<Contractor>;
  update(id: string, input: Partial<CreateContractorInput>): Promise<Contractor>;
  archive(id: string, reason: string): Promise<Contractor>;
  contracts(query?: ListQuery): Promise<ListResult<Contract>>;
}

export interface CreateContractorInput {
  /** Optional reference code; the server assigns one when omitted. */
  code?: string;
  name: string;
  type: Contractor['type'];
  contactPerson: string;
  contactEmail: string;
  contactPhone: string;
  registeredAddress: string;
  mineIds: string[];
  registeredOn: string;
  panNumber?: string;
  gstNumber?: string;
}

/* -------------------------------------------------------------------------- */
/* Workforce                                                                   */
/* -------------------------------------------------------------------------- */

export interface WorkforceService {
  attendance(query?: ListQuery): Promise<ListResult<AttendanceRecord>>;
  requestCorrection(id: string, input: CorrectionRequest): Promise<AttendanceRecord>;
  approveCorrection(id: string, correctionId: string, approve: boolean, reason?: string): Promise<AttendanceRecord>;
}

export interface CorrectionRequest {
  correctedStatus: AttendanceRecord['status'];
  reason: string;
}

/* -------------------------------------------------------------------------- */
/* Corrective actions                                                          */
/* -------------------------------------------------------------------------- */

export interface CorrectiveActionService {
  list(query?: ListQuery): Promise<ListResult<CorrectiveAction>>;
  get(id: string): Promise<CorrectiveAction>;
  create(input: CreateCorrectiveActionInput): Promise<CorrectiveAction>;
  update(id: string, input: Partial<CreateCorrectiveActionInput>): Promise<CorrectiveAction>;
  transition(id: string, to: CorrectiveActionStatus, comment?: string): Promise<CorrectiveAction>;
  attachEvidence(id: string, documentId: string): Promise<CorrectiveAction>;
}

export interface CreateCorrectiveActionInput {
  sourceType: CorrectiveAction['sourceType'];
  sourceId: string;
  mineId: string;
  description: string;
  assignedTo?: string;
  priority: CorrectiveAction['priority'];
  dueDate?: string;
}

/* -------------------------------------------------------------------------- */
/* Documents                                                                   */
/* -------------------------------------------------------------------------- */

export interface DocumentService {
  list(query?: ListQuery): Promise<ListResult<DocumentRecord>>;
  get(id: string): Promise<DocumentRecord>;
  upload(input: DocumentUploadInput): Promise<DocumentRecord>;
  retryOcr(id: string): Promise<DocumentRecord>;
  updateStatus(id: string, status: DocumentStatus): Promise<DocumentRecord>;
  confirmField(id: string, fieldId: string, value: string): Promise<DocumentRecord>;
  attachToCompliance(documentId: string, complianceId: string): Promise<DocumentRecord>;
}

export interface DocumentUploadInput {
  name: string;
  mimeType: string;
  sizeBytes: number;
  type: DocumentType;
  mineId?: string;
  content?: string;
}

/* -------------------------------------------------------------------------- */
/* Analytics                                                                   */
/* -------------------------------------------------------------------------- */

export interface AnalyticsService {
  insights(query?: ListQuery): Promise<ListResult<AiInsight>>;
  get(id: string): Promise<AiInsight>;
  review(id: string, status: AiInsight['reviewStatus'], note?: string): Promise<AiInsight>;
  riskDistribution(): Promise<RiskDistribution>;
}

export interface RiskDistribution {
  levels: Record<string, number>;
  byMine: { mineId: string; mineName: string; score: number; level: string }[];
  generatedAt: string;
}

/* -------------------------------------------------------------------------- */
/* Notifications & workflows                                                   */
/* -------------------------------------------------------------------------- */

export interface NotificationService {
  list(query?: ListQuery): Promise<ListResult<AppNotification>>;
  markRead(id: string, read: boolean): Promise<AppNotification>;
  markAllRead(): Promise<void>;
  unreadCount(): Promise<number>;
  workflowRules(): Promise<WorkflowRule[]>;
  updateWorkflowRule(id: string, input: Partial<WorkflowRule>): Promise<WorkflowRule>;
}

/* -------------------------------------------------------------------------- */
/* Reports                                                                     */
/* -------------------------------------------------------------------------- */

export interface ReportService {
  catalogue(): Promise<ReportDefinition[]>;
  list(query?: ListQuery): Promise<ListResult<ReportJob>>;
  generate(request: ReportRequest): Promise<ReportJob>;
  get(id: string): Promise<ReportJob>;
  /** Returns the CSV payload for a frontend-generated export. */
  csv(id: string): Promise<string>;
}

/* -------------------------------------------------------------------------- */
/* Audit                                                                       */
/* -------------------------------------------------------------------------- */

export interface AuditService {
  list(query?: ListQuery): Promise<ListResult<AuditEvent>>;
  /** True only when a real blockchain ledger is connected and supplying proofs. */
  ledgerConnected(): Promise<boolean>;
}

/* -------------------------------------------------------------------------- */
/* Dashboard & search                                                          */
/* -------------------------------------------------------------------------- */

export interface DashboardService {
  summary(filters: DashboardFilters): Promise<DashboardSummary>;
  complianceTrend(filters: DashboardFilters): Promise<TrendPoint[]>;
  productionTrend(filters: DashboardFilters): Promise<TrendPoint[]>;
  mineStatusComparison(filters: DashboardFilters): Promise<MineComparison[]>;
  riskByMine(filters: DashboardFilters): Promise<RiskDistribution>;
}

export interface TrendPoint {
  label: string;
  value: number;
  secondary?: number;
}

export interface MineComparison {
  mineId: string;
  mineName: string;
  subsidiaryName: string;
  complianceScore: number;
  openActions: number;
  openObservations: number;
  level: string;
}

export interface SearchService {
  search(query: string, types?: string[]): Promise<SearchResults>;
}

export interface SearchResults {
  query: string;
  tookMs: number;
  groups: {
    type: string;
    label: string;
    items: { id: string; title: string; subtitle: string; href: string }[];
  }[];
}

/* -------------------------------------------------------------------------- */
/* Assistant                                                                   */
/* -------------------------------------------------------------------------- */

export interface AssistantService {
  /**
   * Answers a question using only the records the signed-in user may see.
   *
   * The service never invents an answer: when it cannot ground a response in
   * stored records it says so and returns no citations.
   */
  ask(input: AssistantQueryInput): Promise<AssistantAnswer>;
}

export interface AssistantQueryInput {
  query: string;
  /** Restricts the answer to the given mines. Empty = everything in scope. */
  mineIds?: string[];
}

export interface AssistantAnswer {
  answer: string;
  citations: AssistantCitation[];
  /**
   * True when the answer was assembled by retrieving stored records rather than
   * generated by a language model. The UI labels this distinction.
   */
  retrievalBased: boolean;
  /** Set when the assistant could not ground the question in stored records. */
  limitation?: string;
  generatedAt: string;
}

export interface AssistantCitation {
  entityType: string;
  entityId: string;
  label: string;
  href?: string;
  detail?: string;
}

/* -------------------------------------------------------------------------- */
/* Map / GIS                                                                  */
/* -------------------------------------------------------------------------- */

export interface MineMapMarker {
  id: string;
  code: string;
  name: string;
  subsidiaryId: string;
  subsidiaryName?: string;
  region: string;
  district: string;
  state: string;
  operationalStatus: Mine['operationalStatus'];
  location?: GeoPoint;
}

export interface MineSummary {
  id: string;
  code: string;
  name: string;
  subsidiaryId: string;
  subsidiaryName?: string;
  region: string;
  district: string;
  state: string;
  operationalStatus: Mine['operationalStatus'];
  approvedCapacityTPA?: number;
  commissionedOn?: string;
  location?: GeoPoint;
  openViolations: MineViolationSummary[];
  openCorrectiveActions: MineCorrectiveActionSummary[];
  latestIncidents: MineIncidentSummary[];
  latestInspections: MineInspectionSummary[];
}

export interface MineViolationSummary {
  id: string;
  code: string;
  severity: Priority;
  category: ComplianceCategory;
  status: string;
  dueDate?: string;
  sourceCode?: string;
}

export interface MineCorrectiveActionSummary {
  id: string;
  code: string;
  priority: Priority;
  status: string;
  dueDate?: string;
  sourceCode?: string;
}

export interface MineIncidentSummary {
  id: string;
  code: string;
  title: string;
  severity: Priority;
  status: string;
  occurredAt?: string;
}

export interface MineInspectionSummary {
  id: string;
  code: string;
  type: InspectionType;
  status: InspectionStatus;
  scheduledDate?: string;
}

export interface MapViolation {
  id: string;
  code: string;
  mineId: string;
  mineName: string;
  mineCode: string;
  severity: Priority;
  category: ComplianceCategory;
  status: string;
  dueDate?: string;
  raisedAt?: string;
  sourceCode?: string;
  location?: GeoPoint;
}

export interface MapCorrectiveAction {
  id: string;
  code: string;
  mineId: string;
  mineName: string;
  mineCode: string;
  priority: Priority;
  status: string;
  dueDate?: string;
  description: string;
  sourceCode?: string;
  location?: GeoPoint;
}

export interface MapRiskSummary {
  id: string;
  code: string;
  name: string;
  region: string;
  location?: GeoPoint;
  openViolations: number;
  openActions: number;
  criticalIncidents: number;
  riskScore: number;
}

export interface MapService {
  mines(query?: ListQuery): Promise<ListResult<MineMapMarker>>;
  getMineSummary(id: string): Promise<MineSummary>;
  violations(query?: ListQuery): Promise<ListResult<MapViolation>>;
  correctiveActions(query?: ListQuery): Promise<ListResult<MapCorrectiveAction>>;
  riskSummary(): Promise<MapRiskSummary[]>;
}

/* -------------------------------------------------------------------------- */
/* AI / ML                                                                     */
/* -------------------------------------------------------------------------- */

export interface AnomalyRule {
  id: string;
  rule_code: string;
  name: string;
  description?: string;
  category: string;
  severity: string;
  rule_expression: any;
  enabled: boolean;
  applies_to_mine_ids: string[];
  version: number;
}

export interface AnomalyFinding {
  id: string;
  mine_id: string;
  category: string;
  severity: string;
  detection_method: string;
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
  investigation_status: string;
  linked_investigation_id?: string;
}

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
  risk_band: string;
  model_version: string;
  input_data_freshness?: string;
  data_completeness?: number;
  contributing_factors: any[];
  explanation?: string;
  limitations?: string;
  insufficient_evidence: boolean;
  linked_investigation_id?: string;
}

export interface InvestigationRecord {
  id: string;
  mine_id: string;
  anomaly_id?: string;
  prediction_id?: string;
  trigger_event_type: string;
  trigger_event_id?: string;
  correlation_id: string;
  current_stage: string;
  started_at: string;
  completed_at?: string;
  risk_assessment: any;
  model_version?: string;
  policy_version?: string;
  data_quality_status?: string;
  outstanding_questions: any[];
  recommended_actions: any[];
  executed_action_references: any[];
  human_review_required: boolean;
  human_review_completed: boolean;
  human_reviewed_by?: string;
  human_reviewed_at?: string;
  retry_count: number;
  final_outcome?: string;
}

export interface AIService {
  anomalies(query?: ListQuery): Promise<ListResult<AnomalyFinding>>;
  getAnomaly(id: string): Promise<AnomalyFinding>;
  createAnomalyRule(input: {
    rule_code: string;
    name: string;
    description?: string;
    category: string;
    severity: string;
    rule_expression: any;
    applies_to_mine_ids?: string[];
  }): Promise<{ id: string; rule_code: string; name: string }>;
  listAnomalyRules(): Promise<AnomalyRule[]>;
  predictionTargets(): Promise<PredictionTarget[]>;
  predictions(query?: ListQuery): Promise<ListResult<PredictionRecord>>;
  getPrediction(id: string): Promise<PredictionRecord>;
  linkOutcome(predictionId: string, body: {
    target_id: string;
    mine_id: string;
    occurred: boolean;
    occurred_at?: string;
    actual_event_category?: string;
    recorded_by?: string;
    source?: string;
  }): Promise<void>;
  investigations(query?: ListQuery): Promise<ListResult<InvestigationRecord>>;
  getInvestigation(id: string): Promise<InvestigationRecord>;
  createInvestigation(input: {
    mine_id: string;
    anomaly_id?: string;
    prediction_id?: string;
    trigger_event_type: string;
    trigger_event_id?: string;
    correlation_id: string;
    risk_assessment?: any;
    model_version?: string;
    policy_version?: string;
    data_quality_status?: string;
  }): Promise<{ id: string; correlation_id: string; stage: string }>;
  transitionInvestigation(id: string, body: {
    nextStage: string;
    decision?: string;
    rationale?: string;
    policy_applied?: string;
    requiresHumanApproval?: boolean;
    approved_by?: string;
  }): Promise<{ id: string; oldStage: string; newStage: string }>;
}


/* -------------------------------------------------------------------------- */
/* Administration                                                              */
/* -------------------------------------------------------------------------- */

export interface AdminService {
  users(query?: ListQuery): Promise<ListResult<User>>;
  updateUserRole(id: string, role: User['role']): Promise<User>;
  deactivateUser(id: string): Promise<User>;
  referenceData(): Promise<ReferenceData>;
  integrationStatus(): Promise<IntegrationStatus[]>;
}

export interface ReferenceData {
  complianceCategories: { value: string; label: string; description: string }[];
  inspectionTypes: { value: string; label: string; description: string }[];
  documentTypes: { value: string; label: string; description: string }[];
  regions: string[];
  units: string[];
}

export interface IntegrationStatus {
  id: string;
  name: string;
  category: 'identity' | 'ocr' | 'map' | 'analytics' | 'messaging' | 'ledger' | 'api';
  status: 'healthy' | 'degraded' | 'unavailable' | 'unknown';
  detail: string;
  lastCheckedAt: string;
  /** True only when the status came from a real service probe. */
  verified: boolean;
}

/* -------------------------------------------------------------------------- */
/* Aggregate                                                                   */
/* -------------------------------------------------------------------------- */

export interface PlatformServices {
  auth: AuthService;
  mines: MineService;
  compliance: ComplianceService;
  inspections: InspectionService;
  safety: SafetyService;
  environment: EnvironmentService;
  production: ProductionService;
  contractors: ContractorService;
  workforce: WorkforceService;
  correctiveActions: CorrectiveActionService;
  documents: DocumentService;
  analytics: AnalyticsService;
  notifications: NotificationService;
  reports: ReportService;
  audit: AuditService;
  dashboard: DashboardService;
  admin: AdminService;
  search: SearchService;
  assistant: AssistantService;
  map: MapService;
  ai: AIService;
  mode: 'api' | 'development';
}
