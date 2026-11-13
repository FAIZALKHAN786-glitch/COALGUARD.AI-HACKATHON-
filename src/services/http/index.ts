/**
 * HTTP adapter — talks to the CoalGuard REST backend.
 *
 * The endpoint contract implemented here is documented in
 * `docs/API_CONTRACT.md`. When `NEXT_PUBLIC_DATA_SOURCE=api` is configured the
 * application uses this adapter exclusively; a failing request surfaces the
 * error and is NEVER replaced with fabricated data.
 */

import { HttpClient } from '@/lib/api/client';
import type {
  AiInsight,
  AppNotification,
  AuditEvent,
  ComplianceRecord,
  ComplianceStatus,
  Contract,
  Contractor,
  CorrectiveAction,
  CorrectiveActionStatus,
  DashboardFilters,
  DocumentRecord,
  DocumentStatus,
  EnvironmentalMeasurement,
  EnvironmentalThresholdRegister,
  Incident,
  Inspection,
  Mine,
  ProductionAnomaly,
  ProductionRecord,
  ReportJob,
  ReportRequest,
  SafetyRecord,
  Session,
  User,
  WorkflowRule,
} from '@/types';
import type {
  AdminService,
  AnalyticsService,
  AssistantAnswer,
  AssistantService,
  AuditService,
  AuthService,
  ComplianceService,
  ContractorService,
  CorrectiveActionService,
  DashboardService,
  DocumentService,
  EnvironmentService,
  InspectionService,
  ListQuery,
  ListResult,
  MapService,
  MapViolation,
  MapCorrectiveAction,
  MapRiskSummary,
  MineMapMarker,
  MineSummary,
  MineService,
  NotificationService,
  PlatformServices,
  ProductionService,
  ReportService,
  SafetyService,
  SearchResults,
  SearchService,
  WorkforceService,
  AIService,
  AnomalyRule,
  AnomalyFinding,
  PredictionTarget,
  PredictionRecord,
  InvestigationRecord,
} from '../types';

export interface HttpServicesOptions {
  baseUrl: string;
  getToken?: () => string | null | Promise<string | null>;
}

function queryOf(query?: ListQuery): Record<string, string | number | string[] | undefined> {
  if (!query) return {};
  const params: Record<string, string | number | string[] | undefined> = {};
  if (query.page !== undefined) params.page = query.page;
  if (query.pageSize !== undefined) params.pageSize = query.pageSize;
  if (query.search) params.search = query.search;
  if (query.sortBy) params.sortBy = query.sortBy;
  if (query.sortDir) params.sortDir = query.sortDir;
  for (const [key, value] of Object.entries(query.filters ?? {})) {
    if (value === undefined) continue;
    params[key] = value;
  }
  return params;
}

export function createHttpServices(options: HttpServicesOptions): PlatformServices {
  const client = new HttpClient({
    baseUrl: options.baseUrl,
    getToken: options.getToken,
  });

  const auth: AuthService = {
    getSession: () => client.get<Session>('/auth/session'),
    signIn: (email, password) =>
      client.post<Session>('/auth/sign-in', { email, password }),
    signOut: () => client.post<void>('/auth/sign-out'),
    listIdentities: () => client.get<User[]>('/auth/identities'),
    updateProfile: (input) => client.patch<User>('/auth/profile', input),
  };

  const mines: MineService = {
    list: (query) => client.get<ListResult<Mine>>('/mines', { query: queryOf(query) }),
    get: (id) => client.get<Mine>(`/mines/${encodeURIComponent(id)}`),
    create: (input) => client.post<Mine>('/mines', input),
    update: (id, input) => client.patch<Mine>(`/mines/${encodeURIComponent(id)}`, input),
    archive: (id, reason) =>
      client.post<Mine>(`/mines/${encodeURIComponent(id)}/archive`, { reason }),
    subsidiaries: () => client.get<import('@/types').Subsidiary[]>('/subsidiaries'),
    users: (query) => client.get<ListResult<User>>('/users', { query: queryOf(query) }),
  };

  const compliance: ComplianceService = {
    list: (query) => client.get<ListResult<ComplianceRecord>>('/compliance', { query: queryOf(query) }),
    get: (id) => client.get<ComplianceRecord>(`/compliance/${encodeURIComponent(id)}`),
    create: (input) => client.post<ComplianceRecord>('/compliance', input),
    update: (id, input) => client.patch<ComplianceRecord>(`/compliance/${encodeURIComponent(id)}`, input),
    transition: (id, to: ComplianceStatus, comment) =>
      client.post<ComplianceRecord>(`/compliance/${encodeURIComponent(id)}/transition`, { to, comment }),
    attachEvidence: (id, documentId) =>
      client.post<ComplianceRecord>(`/compliance/${encodeURIComponent(id)}/evidence`, { documentId }),
    calendar: (query) => client.get<ListResult<ComplianceRecord>>('/compliance/calendar', { query: queryOf(query) }),
  };

  const inspections: InspectionService = {
    list: (query) => client.get<ListResult<Inspection>>('/inspections', { query: queryOf(query) }),
    get: (id) => client.get<Inspection>(`/inspections/${encodeURIComponent(id)}`),
    create: (input) => client.post<Inspection>('/inspections', input),
    update: (id, input) => client.patch<Inspection>(`/inspections/${encodeURIComponent(id)}`, input),
    addFinding: (id, input) => client.post<Inspection>(`/inspections/${encodeURIComponent(id)}/findings`, input),
    transition: (id, to, comment, attestation) =>
      client.post<Inspection>(`/inspections/${encodeURIComponent(id)}/transition`, { to, comment, attestation }),
    assignInspector: (id, inspectorId) =>
      client.post<Inspection>(`/inspections/${encodeURIComponent(id)}/assign`, { inspectorId }),
  };

  const safety: SafetyService = {
    observations: (query) => client.get<ListResult<SafetyRecord>>('/safety/observations', { query: queryOf(query) }),
    getObservation: (id) => client.get<SafetyRecord>(`/safety/observations/${encodeURIComponent(id)}`),
    createObservation: (input) => client.post<SafetyRecord>('/safety/observations', input),
    updateObservation: (id, input) => client.patch<SafetyRecord>(`/safety/observations/${encodeURIComponent(id)}`, input),
    transitionObservation: (id, to, comment) =>
      client.post<SafetyRecord>(`/safety/observations/${encodeURIComponent(id)}/transition`, { to, comment }),
    incidents: (query) => client.get<ListResult<Incident>>('/safety/incidents', { query: queryOf(query) }),
    getIncident: (id) => client.get<Incident>(`/safety/incidents/${encodeURIComponent(id)}`),
    createIncident: (input) => client.post<Incident>('/safety/incidents', input),
    transitionIncident: (id, to, comment) =>
      client.post<Incident>(`/safety/incidents/${encodeURIComponent(id)}/transition`, { to, comment }),
    nearMisses: (query) => client.get<ListResult<import('@/types').NearMiss>>('/safety/near-misses', { query: queryOf(query) }),
  };

  const environment: EnvironmentService = {
    measurements: (query) => client.get<ListResult<EnvironmentalMeasurement>>('/environment/measurements', { query: queryOf(query) }),
    getMeasurement: (id) => client.get<EnvironmentalMeasurement>(`/environment/measurements/${encodeURIComponent(id)}`),
    createMeasurement: (input) => client.post<EnvironmentalMeasurement>('/environment/measurements', input),
    thresholds: () => client.get<EnvironmentalThresholdRegister>('/environment/thresholds'),
    indicators: () => client.get<import('@/types').EnvironmentalIndicator[]>('/environment/indicators'),
  };

  const production: ProductionService = {
    list: (query) => client.get<ListResult<ProductionRecord>>('/production/records', { query: queryOf(query) }),
    get: (id) => client.get<ProductionRecord>(`/production/records/${encodeURIComponent(id)}`),
    create: (input) => client.post<ProductionRecord>('/production/records', input),
    approve: (id) => client.post<ProductionRecord>(`/production/records/${encodeURIComponent(id)}/approve`),
    anomalies: (query) => client.get<ListResult<ProductionAnomaly>>('/production/anomalies', { query: queryOf(query) }),
    completeness: (query) =>
      client.get<Awaited<ReturnType<ProductionService['completeness']>>>('/production/completeness', {
        query: queryOf(query),
      }),
  };

  const contractors: ContractorService = {
    list: (query) => client.get<ListResult<Contractor>>('/contractors', { query: queryOf(query) }),
    get: (id) => client.get<Contractor>(`/contractors/${encodeURIComponent(id)}`),
    create: (input) => client.post<Contractor>('/contractors', input),
    update: (id, input) => client.patch<Contractor>(`/contractors/${encodeURIComponent(id)}`, input),
    archive: (id, reason) => client.post<Contractor>(`/contractors/${encodeURIComponent(id)}/archive`, { reason }),
    contracts: (query) => client.get<ListResult<Contract>>('/contracts', { query: queryOf(query) }),
  };

  const workforce: WorkforceService = {
    attendance: (query) => client.get<ListResult<import('@/types').AttendanceRecord>>('/workforce/attendance', { query: queryOf(query) }),
    requestCorrection: (id, input) =>
      client.post<import('@/types').AttendanceRecord>(`/workforce/attendance/${encodeURIComponent(id)}/corrections`, input),
    approveCorrection: (id, correctionId, approve, reason) =>
      client.post<import('@/types').AttendanceRecord>(
        `/workforce/attendance/${encodeURIComponent(id)}/corrections/${encodeURIComponent(correctionId)}/decision`,
        { approve, reason },
      ),
  };

  const correctiveActions: CorrectiveActionService = {
    list: (query) => client.get<ListResult<CorrectiveAction>>('/corrective-actions', { query: queryOf(query) }),
    get: (id) => client.get<CorrectiveAction>(`/corrective-actions/${encodeURIComponent(id)}`),
    create: (input) => client.post<CorrectiveAction>('/corrective-actions', input),
    update: (id, input) => client.patch<CorrectiveAction>(`/corrective-actions/${encodeURIComponent(id)}`, input),
    transition: (id, to: CorrectiveActionStatus, comment) =>
      client.post<CorrectiveAction>(`/corrective-actions/${encodeURIComponent(id)}/transition`, { to, comment }),
    attachEvidence: (id, documentId) =>
      client.post<CorrectiveAction>(`/corrective-actions/${encodeURIComponent(id)}/evidence`, { documentId }),
  };

  const documents: DocumentService = {
    list: (query) => client.get<ListResult<DocumentRecord>>('/documents', { query: queryOf(query) }),
    get: (id) => client.get<DocumentRecord>(`/documents/${encodeURIComponent(id)}`),
    upload: (input) => client.post<DocumentRecord>('/documents', input),
    retryOcr: (id) => client.post<DocumentRecord>(`/documents/${encodeURIComponent(id)}/ocr/retry`),
    updateStatus: (id, status: DocumentStatus) =>
      client.patch<DocumentRecord>(`/documents/${encodeURIComponent(id)}`, { status }),
    confirmField: (id, fieldId, value) =>
      client.post<DocumentRecord>(`/documents/${encodeURIComponent(id)}/fields/${encodeURIComponent(fieldId)}`, {
        value,
      }),
    attachToCompliance: (documentId, complianceId) =>
      client.post<DocumentRecord>(`/documents/${encodeURIComponent(documentId)}/compliance`, { complianceId }),
  };

  const analytics: AnalyticsService = {
    insights: (query) => client.get<ListResult<AiInsight>>('/analytics/insights', { query: queryOf(query) }),
    get: (id) => client.get<AiInsight>(`/analytics/insights/${encodeURIComponent(id)}`),
    review: (id, status, note) =>
      client.post<AiInsight>(`/analytics/insights/${encodeURIComponent(id)}/review`, { status, note }),
    riskDistribution: () =>
      client.get<Awaited<ReturnType<AnalyticsService['riskDistribution']>>>('/analytics/risk-distribution'),
  };

  const notifications: NotificationService = {
    list: (query) => client.get<ListResult<AppNotification>>('/notifications', { query: queryOf(query) }),
    markRead: (id, read) => client.patch<AppNotification>(`/notifications/${encodeURIComponent(id)}`, { read }),
    markAllRead: () => client.post<void>('/notifications/read-all'),
    unreadCount: () => client.get<number>('/notifications/unread-count'),
    workflowRules: () => client.get<WorkflowRule[]>('/workflows/rules'),
    updateWorkflowRule: (id, input) =>
      client.patch<WorkflowRule>(`/workflows/rules/${encodeURIComponent(id)}`, input),
  };

  const reports: ReportService = {
    catalogue: () => client.get<import('../types').ReportDefinition[]>('/reports/catalogue'),
    list: (query) => client.get<ListResult<ReportJob>>('/reports', { query: queryOf(query) }),
    generate: (request) => client.post<ReportJob>('/reports', request),
    get: (id) => client.get<ReportJob>(`/reports/${encodeURIComponent(id)}`),
    csv: (id) => client.get<string>(`/reports/${encodeURIComponent(id)}/content.csv`, { headers: { Accept: 'text/csv' } }),
  };

  const audit: AuditService = {
    list: (query) => client.get<ListResult<AuditEvent>>('/audit', { query: queryOf(query) }),
    ledgerConnected: () => client.get<boolean>('/audit/ledger-status'),
  };

  const dashboard: DashboardService = {
    summary: (filters: DashboardFilters) => client.get<import('@/types').DashboardSummary>('/dashboard/summary', { query: filters as never }),
    complianceTrend: (filters) =>
      client.get<import('../types').TrendPoint[]>('/dashboard/trends/compliance', { query: filters as never }),
    productionTrend: (filters) =>
      client.get<import('../types').TrendPoint[]>('/dashboard/trends/production', { query: filters as never }),
    mineStatusComparison: (filters) =>
      client.get<import('../types').MineComparison[]>('/dashboard/mine-comparison', { query: filters as never }),
    riskByMine: (filters) =>
      client.get<import('../types').RiskDistribution>('/dashboard/risk-distribution', { query: filters as never }),
  };

  const search: SearchService = {
    search: (query, types) =>
      client.get<SearchResults>('/search', { query: { q: query, types: types?.join(',') } }),
  };

  const assistant: AssistantService = {
    ask: (input) => client.post<AssistantAnswer>('/assistant/query', input),
  };

  const map: MapService = {
    mines: (query) =>
      client.get<ListResult<MineMapMarker>>('/map/mines', { query: queryOf(query) }),
    getMineSummary: (id) =>
      client.get<MineSummary>(`/map/mines/${encodeURIComponent(id)}/summary`),
    violations: (query) =>
      client.get<ListResult<MapViolation>>('/map/violations', { query: queryOf(query) }),
    correctiveActions: (query) =>
      client.get<ListResult<MapCorrectiveAction>>('/map/corrective-actions', { query: queryOf(query) }),
    riskSummary: () => client.get<MapRiskSummary[]>('/map/risk-summary'),
  };

  const admin: AdminService = {
    users: (query) => client.get<ListResult<User>>('/admin/users', { query: queryOf(query) }),
    updateUserRole: (id, role) => client.patch<User>(`/admin/users/${encodeURIComponent(id)}/role`, { role }),
    deactivateUser: (id) => client.post<User>(`/admin/users/${encodeURIComponent(id)}/deactivate`),
    referenceData: () => client.get<import('../types').ReferenceData>('/admin/reference-data'),
    integrationStatus: () => client.get<import('../types').IntegrationStatus[]>('/admin/integrations'),
  };

  const ai: AIService = {
    anomalies: (query) =>
      client.get<ListResult<AnomalyFinding>>('/api/v1/ai/anomalies', { query: queryOf(query) }),
    getAnomaly: (id) =>
      client.get<AnomalyFinding>(`/api/v1/ai/anomalies/${encodeURIComponent(id)}`),
    createAnomalyRule: (input) =>
      client.post<{ id: string; rule_code: string; name: string }>(
        '/api/v1/ai/anomalies/rules', input
      ),
    listAnomalyRules: () =>
      client.get<AnomalyRule[]>('/api/v1/ai/anomalies/rules'),
    predictionTargets: () =>
      client.get<PredictionTarget[]>('/api/v1/ai/prediction-targets'),
    predictions: (query) =>
      client.get<ListResult<PredictionRecord>>('/api/v1/ai/predictions', { query: queryOf(query) }),
    getPrediction: (id) =>
      client.get<PredictionRecord>(`/api/v1/ai/predictions/${encodeURIComponent(id)}`),
    linkOutcome: (predictionId, input) =>
      client.post<void>(`/api/v1/ai/predictions/${encodeURIComponent(predictionId)}/outcome`, input),
    investigations: (query) =>
      client.get<ListResult<InvestigationRecord>>('/api/v1/ai/investigations', { query: queryOf(query) }),
    getInvestigation: (id) =>
      client.get<InvestigationRecord>(`/api/v1/ai/investigations/${encodeURIComponent(id)}`),
    createInvestigation: (input) =>
      client.post<{ id: string; correlation_id: string; stage: string }>(
        '/api/v1/ai/investigations', input
      ),
    transitionInvestigation: (id, input) =>
      client.post<{ id: string; oldStage: string; newStage: string }>(
        `/api/v1/ai/investigations/${encodeURIComponent(id)}/transition`, input
      ),
  };

  return {
    auth,
    mines,
    compliance,
    inspections,
    safety,
    environment,
    production,
    contractors,
    workforce,
    correctiveActions,
    documents,
    analytics,
    notifications,
    reports,
    audit,
    dashboard,
    admin,
    search,
    assistant,
    map,
    ai,
    mode: 'api',
  };
}
