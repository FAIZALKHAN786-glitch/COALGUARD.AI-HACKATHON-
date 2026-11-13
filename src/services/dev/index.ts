/**
 * Development adapter — a deterministic, clearly-labelled stand-in for the
 * CoalGuard backend.
 *
 * It implements the exact same service contracts as the HTTP adapter so the
 * UI code never branches on the data source. It is only ever selected when
 * `NEXT_PUBLIC_DATA_SOURCE` is `development` (the default) — a failing HTTP
 * request NEVER falls back to this data.
 */

import { applyQuery } from '@/lib/api/query';
import { daysUntil, isOverdue, toDateOnly } from '@/lib/formatting/dates';
import {
  AppError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '@/lib/errors/normalise';
import { computeDashboardSummary } from '@/lib/metrics/dashboard';
import { toCsv, type CsvColumn } from '@/lib/export/csv';
import { canTransition, COMPLIANCE_TRANSITIONS, CORRECTIVE_ACTION_TRANSITIONS, INSPECTION_TRANSITIONS } from '@/lib/auth/workflows';
import type {
  AiInsight,
  AppNotification,
  AttendanceRecord,
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
  DocumentType,
  EnvironmentalMeasurement,
  Incident,
  Inspection,
  Mine,
  Paginated,
  ProductionAnomaly,
  ProductionRecord,
  ReportJob,
  ReportRequest,
  RiskLevel,
  SafetyRecord,
  Session,
  User,
  Violation,
  WorkflowRule,
  AIService,
} from '@/types';
import type {
  AdminService,
  AnalyticsService,
  AssistantAnswer,
  AssistantCitation,
  AssistantQueryInput,
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
  MineService,
  NotificationService,
  PlatformServices,
  ProductionService,
  ReportDefinition,
  ReportService,
  SafetyService,
  SearchResults,
  SearchService,
  UpdateProfileInput,
  WorkforceService,
  MapService,
  MapViolation,
  MapCorrectiveAction,
  MapRiskSummary,
  MineMapMarker,
  MineSummary,
} from '../types';
import { getDevStore, resetDevStore } from './store';

const SESSION_KEY = 'coalguard.dev.session.v1';
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

function nowIso(): string {
  return new Date().toISOString();
}

function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

function delay(ms = 0): Promise<void> {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}

function meta(page: number, pageSize: number, total: number) {
  return {
    source: 'development' as const,
    generatedAt: nowIso(),
    total,
    page,
    pageSize,
  };
}

function paginate<T extends { id: string }>(items: T[], query?: ListQuery): ListResult<T> {
  const page = Math.max(1, query?.page ?? 1);
  const pageSize = Math.min(200, Math.max(1, query?.pageSize ?? 20));
  const start = (page - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize),
    meta: meta(page, pageSize, items.length),
  };
}

function requireRecord<T>(value: T | undefined, entity: string): T {
  if (!value) throw new NotFoundError(`${entity} could not be found.`);
  return value;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export interface DevServicesOptions {
  /** Simulated network latency, in milliseconds. */
  latencyMs?: number;
}

export function createDevServices(options: DevServicesOptions = {}): PlatformServices {
  const latency = options.latencyMs ?? 0;
  const store = getDevStore();

  const commit = async (): Promise<void> => {
    store.save();
    await delay(latency);
  };

  /* ---------------------------------------------------------------------- */
  /* Auth                                                                   */
  /* ---------------------------------------------------------------------- */
  const auth: AuthService = {
    async getSession(): Promise<Session | null> {
      if (!isBrowser()) return null;
      try {
        const raw = window.sessionStorage.getItem(SESSION_KEY) ?? window.localStorage.getItem(SESSION_KEY);
        if (!raw) return null;
        const session = JSON.parse(raw) as Session;
        if (new Date(session.expiresAt).getTime() <= Date.now()) {
          window.sessionStorage.removeItem(SESSION_KEY);
          window.localStorage.removeItem(SESSION_KEY);
          return null;
        }
        return session;
      } catch {
        return null;
      }
    },
    async signIn(email: string): Promise<Session> {
      await delay(latency);
      const user = store.data.users.find(
        (candidate) => candidate.email.toLowerCase() === email.trim().toLowerCase(),
      );
      if (!user) {
        throw new ValidationError('No development identity matches that email address.', {
          email: ['Select one of the listed development identities.'],
        });
      }
      const issuedAt = new Date();
      const session: Session = {
        user,
        issuedAt: issuedAt.toISOString(),
        expiresAt: new Date(issuedAt.getTime() + SESSION_TTL_MS).toISOString(),
        development: true,
      };
      if (isBrowser()) {
        window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
      }
      return session;
    },
    async signOut(): Promise<void> {
      if (isBrowser()) {
        window.sessionStorage.removeItem(SESSION_KEY);
        window.localStorage.removeItem(SESSION_KEY);
      }
    },
    async listIdentities(): Promise<User[]> {
      await delay(latency);
      return clone(store.data.users);
    },
    async updateProfile(input: UpdateProfileInput): Promise<User> {
      await delay(latency);
      if (!isBrowser()) {
        throw new AppError({
          status: 401,
          code: 'unauthenticated',
          message: 'Sign in to update your profile.',
        });
      }
      const raw =
        window.sessionStorage.getItem(SESSION_KEY) ?? window.localStorage.getItem(SESSION_KEY);
      if (!raw) {
        throw new AppError({
          status: 401,
          code: 'unauthenticated',
          message: 'Your session has expired. Sign in again to update your profile.',
        });
      }
      const session = JSON.parse(raw) as Session;
      const user = store.data.users.find((candidate) => candidate.id === session.user.id);
      if (!user) {
        throw new AppError({
          status: 404,
          code: 'not_found',
          message: 'The signed-in identity no longer exists.',
        });
      }
      const previous = { name: user.name, title: user.title };
      user.name = input.name.trim();
      user.title = input.title.trim();
      session.user = clone(user);
      window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
      store.data.audit.unshift({
        id: `aud-${Date.now().toString(36)}`,
        timestamp: nowIso(),
        actorId: user.id,
        actorName: user.name,
        actorRole: user.role,
        action: 'update',
        entityType: 'user',
        entityId: user.id,
        entityLabel: user.email,
        previousValue: previous,
        updatedValue: { name: user.name, title: user.title },
        reason: 'Profile updated by the signed-in user.',
        source: 'platform_log',
      });
      store.save();
      return clone(user);
    },
  };

  /* ---------------------------------------------------------------------- */
  /* Mines & subsidiaries                                                    */
  /* ---------------------------------------------------------------------- */
  const mines: MineService = {
    async list(query?: ListQuery): Promise<ListResult<Mine>> {
      await delay(latency);
      const rows = store.data.mines.map((mine) => ({
        ...mine,
        name: mine.name,
        code: mine.code,
        subsidiaryName: store.data.subsidiaries.find((s) => s.id === mine.subsidiaryId)?.name ?? '',
      }));
      return applyQuery(rows, query, 'development', nowIso());
    },
    async get(id: string): Promise<Mine> {
      await delay(latency);
      return clone(requireRecord(store.data.mines.find((mine) => mine.id === id), 'Mine'));
    },
    async create(input) {
      await delay(latency);
      if (!input.code?.trim()) throw new ValidationError('Mine code is required.', { code: ['Mine code is required.'] });
      if (store.data.mines.some((mine) => mine.code === input.code)) {
        throw new AppError({ status: 409, code: 'duplicate_code', message: 'A mine with that code already exists.' });
      }
      const mine: Mine = {
        id: `mine-${Date.now().toString(36)}`,
        code: input.code,
        name: input.name,
        subsidiaryId: input.subsidiaryId,
        region: input.region,
        district: input.district,
        state: input.state,
        operationalStatus: input.operationalStatus,
        approvedCapacityTPA: input.approvedCapacityTPA,
        commissionedOn: input.commissionedOn,
        mineManagerId: input.mineManagerId,
        safetyOfficerId: input.safetyOfficerId,
        complianceOfficerId: input.complianceOfficerId,
        environmentalOfficerId: input.environmentalOfficerId,
        contactPhone: input.contactPhone,
        note: input.note,
        location:
          typeof input.lat === 'number' && typeof input.lng === 'number'
            ? { lat: input.lat, lng: input.lng, source: 'manual_entry', capturedAt: nowIso() }
            : undefined,
      };
      store.data.mines.push(mine);
      await commit();
      return clone(mine);
    },
    async update(id, input) {
      await delay(latency);
      const mine = requireRecord(store.data.mines.find((m) => m.id === id), 'Mine');
      const updated: Mine = {
        ...mine,
        ...input,
        location:
          typeof input.lat === 'number' && typeof input.lng === 'number'
            ? { lat: input.lat, lng: input.lng, source: 'manual_entry', capturedAt: nowIso() }
            : mine.location,
      };
      store.data.mines = store.data.mines.map((m) => (m.id === id ? updated : m));
      await commit();
      return clone(updated);
    },
    async archive(id, reason) {
      await delay(latency);
      const mine = requireRecord(store.data.mines.find((m) => m.id === id), 'Mine');
      if (!reason?.trim()) {
        throw new ValidationError('A reason is required to archive a mine.', { reason: ['Provide a reason.'] });
      }
      const updated: Mine = { ...mine, operationalStatus: 'decommissioned', note: `${mine.note ?? ''} Archived: ${reason}`.trim() };
      store.data.mines = store.data.mines.map((m) => (m.id === id ? updated : m));
      store.data.audit.unshift({
        id: `aud-${Date.now().toString(36)}`,
        timestamp: nowIso(),
        actorId: 'dev-actor',
        actorName: 'Development adapter',
        actorRole: 'system',
        action: 'archive',
        entityType: 'mine',
        entityId: id,
        entityLabel: mine.code,
        previousValue: { operationalStatus: mine.operationalStatus },
        updatedValue: { operationalStatus: 'decommissioned' },
        reason,
        source: 'platform_log',
      });
      await commit();
      return clone(updated);
    },
    async subsidiaries() {
      await delay(latency);
      return clone(store.data.subsidiaries);
    },
    async users(query?: ListQuery) {
      await delay(latency);
      return applyQuery(store.data.users, query, 'development', nowIso());
    },
  };

  /* ---------------------------------------------------------------------- */
  /* Compliance                                                             */
  /* ---------------------------------------------------------------------- */
  const compliance: ComplianceService = {
    async list(query?: ListQuery): Promise<ListResult<ComplianceRecord>> {
      await delay(latency);
      const rows = store.data.compliance.map((record) => ({
        ...record,
        mineName:
          store.data.mines.find((mine) => record.applicableMineIds.includes(mine.id))?.name ?? 'Multiple mines',
        subsidiaryName:
          store.data.subsidiaries.find(
            (sub) => sub.id === store.data.mines.find((mine) => record.applicableMineIds.includes(mine.id))?.subsidiaryId,
          )?.name ?? '—',
      }));
      return applyQuery(rows, query, 'development', nowIso());
    },
    async get(id: string): Promise<ComplianceRecord> {
      await delay(latency);
      return clone(requireRecord(store.data.compliance.find((record) => record.id === id), 'Compliance requirement'));
    },
    async create(input) {
      await delay(latency);
      if (store.data.compliance.some((record) => record.code === input.code)) {
        throw new AppError({ status: 409, code: 'duplicate_code', message: 'A compliance requirement with that code already exists.' });
      }
      const record: ComplianceRecord = {
        id: `cmp-${Date.now().toString(36)}`,
        code: input.code,
        title: input.title,
        description: input.description,
        category: input.category,
        applicableMineIds: input.applicableMineIds,
        responsibleOfficerId: input.responsibleOfficerId,
        sourceReference: input.sourceReference,
        effectiveFrom: input.effectiveFrom,
        dueDate: input.dueDate,
        status: 'draft',
        priority: input.priority,
        submissionFrequency: input.submissionFrequency,
        evidenceDocumentIds: [],
        linkedViolationIds: [],
        linkedCorrectiveActionIds: [],
        notes: input.notes,
        updatedAt: nowIso(),
      };
      store.data.compliance.unshift(record);
      await commit();
      return clone(record);
    },
    async update(id, input) {
      await delay(latency);
      const record = requireRecord(store.data.compliance.find((item) => item.id === id), 'Compliance requirement');
      const updated: ComplianceRecord = { ...record, ...input, updatedAt: nowIso() };
      store.data.compliance = store.data.compliance.map((item) => (item.id === id ? updated : item));
      await commit();
      return clone(updated);
    },
    async transition(id, to: ComplianceStatus, comment?: string): Promise<ComplianceRecord> {
      await delay(latency);
      const record = requireRecord(store.data.compliance.find((item) => item.id === id), 'Compliance requirement');
      const result = canTransition(COMPLIANCE_TRANSITIONS, record.status, to);
      if (!result.allowed) {
        throw new AppError({
          status: 409,
          code: 'invalid_transition',
          message: result.reason ?? 'That status change is not permitted.',
        });
      }
      const updated: ComplianceRecord = {
        ...record,
        status: to,
        updatedAt: nowIso(),
        lastSubmittedAt: to === 'submitted' ? nowIso() : record.lastSubmittedAt,
        lastVerifiedAt: to === 'compliant' || to === 'non_compliant' ? nowIso() : record.lastVerifiedAt,
        verificationStatus:
          to === 'compliant' ? 'verified' : to === 'non_compliant' ? 'rejected' : to === 'awaiting_verification' ? 'pending' : record.verificationStatus,
      };
      store.data.compliance = store.data.compliance.map((item) => (item.id === id ? updated : item));
      store.data.audit.unshift({
        id: `aud-${Date.now().toString(36)}`,
        timestamp: nowIso(),
        actorId: 'dev-actor',
        actorName: 'Development adapter',
        actorRole: 'system',
        action: 'status_change',
        entityType: 'compliance',
        entityId: id,
        entityLabel: record.code,
        previousValue: { status: record.status },
        updatedValue: { status: to },
        reason: comment,
        workflow: 'compliance-submission',
        source: 'platform_log',
      });
      await commit();
      return clone(updated);
    },
    async attachEvidence(id, documentId) {
      await delay(latency);
      const record = requireRecord(store.data.compliance.find((item) => item.id === id), 'Compliance requirement');
      if (!record.evidenceDocumentIds.includes(documentId)) {
        record.evidenceDocumentIds.push(documentId);
        record.updatedAt = nowIso();
      }
      await commit();
      return clone(record);
    },
    async calendar(query?: ListQuery) {
      await delay(latency);
      const sorted = [...store.data.compliance].sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'));
      const rows = sorted.map((record) => ({
        ...record,
        mineName:
          store.data.mines.find((mine) => record.applicableMineIds.includes(mine.id))?.name ?? 'Multiple mines',
        subsidiaryName: '—',
      }));
      return applyQuery(rows, query, 'development', nowIso());
    },
  };

  /* ---------------------------------------------------------------------- */
  /* Inspections                                                            */
  /* ---------------------------------------------------------------------- */
  const inspections: InspectionService = {
    async list(query?: ListQuery): Promise<ListResult<Inspection>> {
      await delay(latency);
      const rows = store.data.inspections.map((inspection) => ({
        ...inspection,
        mineName: store.data.mines.find((mine) => mine.id === inspection.mineId)?.name ?? 'Unknown mine',
        inspectorName: store.data.users.find((user) => user.id === inspection.inspectorId)?.name ?? 'Unassigned',
        findingCount: inspection.findings.length,
        violationCount: inspection.findings.filter((finding) => finding.isViolation).length,
      }));
      return applyQuery(rows, query, 'development', nowIso());
    },
    async get(id: string): Promise<Inspection> {
      await delay(latency);
      return clone(requireRecord(store.data.inspections.find((item) => item.id === id), 'Inspection'));
    },
    async create(input) {
      await delay(latency);
      const mine = requireRecord(store.data.mines.find((m) => m.id === input.mineId), 'Mine');
      const counter = store.data.inspections.length + 1;
      const inspection: Inspection = {
        id: `insp-${Date.now().toString(36)}`,
        code: `INS-${new Date().getFullYear()}-${String(counter).padStart(4, '0')}`,
        mineId: input.mineId,
        type: input.type,
        inspectorId: input.inspectorId,
        scheduledDate: input.scheduledDate,
        status: 'scheduled',
        scope: input.scope,
        findings: [],
        evidenceDocumentIds: [],
        complianceRecordIds: input.complianceRecordIds ?? [],
        correctiveActionIds: [],
        reviewHistory: [],
        location: mine.location ? { ...mine.location } : undefined,
        createdAt: nowIso(),
        createdBy: 'dev-actor',
      };
      store.data.inspections.unshift(inspection);
      await commit();
      return clone(inspection);
    },
    async update(id, input) {
      await delay(latency);
      const inspection = requireRecord(store.data.inspections.find((item) => item.id === id), 'Inspection');
      const updated: Inspection = { ...inspection, ...input };
      store.data.inspections = store.data.inspections.map((item) => (item.id === id ? updated : item));
      await commit();
      return clone(updated);
    },
    async addFinding(id, input) {
      await delay(latency);
      const inspection = requireRecord(store.data.inspections.find((item) => item.id === id), 'Inspection');
      const finding = {
        id: `fnd-${Date.now().toString(36)}`,
        description: input.description,
        category: input.category,
        severity: input.severity,
        isViolation: input.isViolation,
        complianceRecordIds: input.complianceRecordIds ?? [],
        raisedAt: nowIso(),
        recordedBy: 'dev-actor',
      };
      inspection.findings.push(finding);

      if (finding.isViolation) {
        const violation: Violation = {
          id: `vio-${Date.now().toString(36)}`,
          code: `VIO-${new Date().getFullYear()}-${String(store.data.violations.length + 1).padStart(4, '0')}`,
          mineId: inspection.mineId,
          sourceType: 'inspection',
          sourceId: inspection.id,
          sourceCode: inspection.code,
          description: finding.description,
          severity: finding.severity,
          category: finding.category,
          raisedAt: finding.raisedAt,
          raisedBy: 'dev-actor',
          dueDate: toDateOnly(new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)) ?? undefined,
          status: 'open',
          correctiveActionIds: [],
        };
        store.data.violations.unshift(violation);
      }

      await commit();
      return clone(inspection);
    },
    async transition(id, to: Inspection['status'], comment?: string): Promise<Inspection> {
      await delay(latency);
      const inspection = requireRecord(store.data.inspections.find((item) => item.id === id), 'Inspection');
      const result = canTransition(INSPECTION_TRANSITIONS, inspection.status, to);
      if (!result.allowed) {
        throw new AppError({
          status: 409,
          code: 'invalid_transition',
          message: result.reason ?? 'That status change is not permitted.',
        });
      }
      const actor = store.data.users.find((user) => user.id === inspection.inspectorId);
      inspection.reviewHistory.push({
        id: `rev-${Date.now().toString(36)}`,
        at: nowIso(),
        actorId: inspection.inspectorId,
        actorName: actor?.name ?? 'Development adapter',
        fromStatus: inspection.status,
        toStatus: to,
        comment,
      });
      inspection.status = to;
      if (to === 'in_progress' && !inspection.startedAt) inspection.startedAt = nowIso();
      if (to === 'submitted') inspection.submittedAt = nowIso();
      if (to === 'completed') inspection.completedAt = nowIso();
      if (to === 'under_review' || to === 'completed') inspection.reviewerId = 'usr-01';
      await commit();
      return clone(inspection);
    },
    async assignInspector(id, inspectorId) {
      await delay(latency);
      const inspection = requireRecord(store.data.inspections.find((item) => item.id === id), 'Inspection');
      inspection.inspectorId = inspectorId;
      await commit();
      return clone(inspection);
    },
  };

  /* ---------------------------------------------------------------------- */
  /* Safety                                                                 */
  /* ---------------------------------------------------------------------- */
  const safety: SafetyService = {
    async observations(query?: ListQuery): Promise<ListResult<SafetyRecord>> {
      await delay(latency);
      const rows = store.data.safetyRecords.map((record) => ({
        ...record,
        mineName: store.data.mines.find((mine) => mine.id === record.mineId)?.name ?? 'Unknown mine',
        assigneeName: store.data.users.find((user) => user.id === record.assignedTo)?.name ?? 'Unassigned',
      }));
      return applyQuery(rows, query, 'development', nowIso());
    },
    async getObservation(id: string): Promise<SafetyRecord> {
      await delay(latency);
      return clone(requireRecord(store.data.safetyRecords.find((item) => item.id === id), 'Safety record'));
    },
    async createObservation(input) {
      await delay(latency);
      const counter = store.data.safetyRecords.length + 1;
      const record: SafetyRecord = {
        id: `saf-${Date.now().toString(36)}`,
        code: `OBS-${new Date().getFullYear()}-${String(counter).padStart(4, '0')}`,
        type: input.type,
        mineId: input.mineId,
        title: input.title,
        description: input.description,
        severity: input.severity,
        status: 'open',
        reportedBy: 'dev-actor',
        reportedAt: nowIso(),
        location:
          typeof input.lat === 'number' && typeof input.lng === 'number'
            ? {
                lat: input.lat,
                lng: input.lng,
                accuracyM: input.accuracyM,
                source: 'device_gps',
                capturedAt: nowIso(),
              }
            : undefined,
        locationDescription: input.locationDescription,
        assignedTo: input.assignedTo,
        correctiveActionIds: [],
        evidenceDocumentIds: [],
        relatedInspectionId: input.relatedInspectionId,
      };
      store.data.safetyRecords.unshift(record);
      await commit();
      return clone(record);
    },
    async updateObservation(id, input) {
      await delay(latency);
      const record = requireRecord(store.data.safetyRecords.find((item) => item.id === id), 'Safety record');
      const updated: SafetyRecord = {
        ...record,
        ...input,
        location:
          typeof input.lat === 'number' && typeof input.lng === 'number'
            ? { lat: input.lat, lng: input.lng, accuracyM: input.accuracyM, source: 'device_gps', capturedAt: nowIso() }
            : record.location,
      };
      store.data.safetyRecords = store.data.safetyRecords.map((item) => (item.id === id ? updated : item));
      await commit();
      return clone(updated);
    },
    async transitionObservation(id, to, comment?: string) {
      await delay(latency);
      const record = requireRecord(store.data.safetyRecords.find((item) => item.id === id), 'Safety record');
      const permitted = ['open', 'under_investigation', 'action_assigned', 'resolved', 'closed'];
      if (!permitted.includes(to)) {
        throw new AppError({ status: 422, code: 'invalid_status', message: 'Unknown safety record status.' });
      }
      const allowed: Record<string, string[]> = {
        open: ['under_investigation', 'action_assigned'],
        under_investigation: ['action_assigned', 'resolved'],
        action_assigned: ['resolved'],
        resolved: ['closed', 'action_assigned'],
        closed: [],
      };
      if (!(allowed[record.status] ?? []).includes(to)) {
        throw new AppError({
          status: 409,
          code: 'invalid_transition',
          message: `A record cannot move from "${record.status}" to "${to}".`,
        });
      }
      record.status = to as SafetyRecord['status'];
      if (to === 'under_investigation' && !record.investigationOpenedAt) record.investigationOpenedAt = nowIso();
      if (to === 'closed') record.investigationClosedAt = nowIso();
      if (comment) {
        store.data.audit.unshift({
          id: `aud-${Date.now().toString(36)}`,
          timestamp: nowIso(),
          actorId: 'dev-actor',
          actorName: 'Development adapter',
          actorRole: 'system',
          action: 'status_change',
          entityType: 'safety_record',
          entityId: id,
          entityLabel: record.code,
          previousValue: { status: record.status },
          updatedValue: { status: to },
          reason: comment,
          source: 'platform_log',
        });
      }
      await commit();
      return clone(record);
    },
    async incidents(query?: ListQuery): Promise<ListResult<Incident>> {
      await delay(latency);
      const rows = store.data.incidents.map((incident) => ({
        ...incident,
        mineName: store.data.mines.find((mine) => mine.id === incident.mineId)?.name ?? 'Unknown mine',
      }));
      return applyQuery(rows, query, 'development', nowIso());
    },
    async getIncident(id: string): Promise<Incident> {
      await delay(latency);
      return clone(requireRecord(store.data.incidents.find((item) => item.id === id), 'Incident'));
    },
    async createIncident(input) {
      await delay(latency);
      const incident: Incident = {
        id: `inc-${Date.now().toString(36)}`,
        code: `INC-${new Date().getFullYear()}-${String(store.data.incidents.length + 1).padStart(4, '0')}`,
        mineId: input.mineId,
        title: input.title,
        description: input.description,
        severity: input.severity,
        occurredAt: input.occurredAt,
        reportedAt: nowIso(),
        reportedBy: 'dev-actor',
        status: 'open',
        location:
          typeof input.lat === 'number' && typeof input.lng === 'number'
            ? { lat: input.lat, lng: input.lng, accuracyM: input.accuracyM, source: 'device_gps', capturedAt: nowIso() }
            : undefined,
        locationDescription: input.locationDescription,
        injuriesReported: input.injuriesReported,
        downtimeHours: input.downtimeHours,
        assignedTo: input.assignedTo,
        correctiveActionIds: [],
        evidenceDocumentIds: [],
        relatedInspectionId: input.relatedInspectionId,
      };
      store.data.incidents.unshift(incident);
      await commit();
      return clone(incident);
    },
    async transitionIncident(id, to, comment?: string) {
      await delay(latency);
      const incident = requireRecord(
        store.data.incidents.find((item) => item.id === id),
        'Incident',
      );
      const allowed: Record<string, string[]> = {
        open: ['under_investigation', 'action_assigned'],
        under_investigation: ['action_assigned', 'resolved'],
        action_assigned: ['resolved'],
        resolved: ['closed', 'action_assigned'],
        closed: [],
      };
      if (!(allowed[incident.status] ?? []).includes(to)) {
        throw new AppError({
          status: 409,
          code: 'invalid_transition',
          message: `An incident cannot move from "${incident.status}" to "${to}".`,
        });
      }
      const from = incident.status;
      incident.status = to;
      if (comment) incident.investigationSummary = comment;
      store.data.audit.unshift({
        id: `aud-${Date.now().toString(36)}`,
        timestamp: nowIso(),
        actorId: 'dev-actor',
        actorName: 'Development identity',
        actorRole: 'system',
        action: 'update',
        entityType: 'incident',
        entityId: incident.id,
        entityLabel: incident.code,
        reason: comment,
        workflow: `${from} → ${to}`,
        source: 'platform_log',
      });
      await commit();
      return clone(incident);
    },
    async nearMisses(query?: ListQuery) {
      await delay(latency);
      const rows = store.data.nearMisses.map((record) => ({
        ...record,
        mineName: store.data.mines.find((mine) => mine.id === record.mineId)?.name ?? 'Unknown mine',
      }));
      return applyQuery(rows, query, 'development', nowIso());
    },
  };

  /* ---------------------------------------------------------------------- */
  /* Environment                                                            */
  /* ---------------------------------------------------------------------- */
  const environment: EnvironmentService = {
    async measurements(query?: ListQuery): Promise<ListResult<EnvironmentalMeasurement>> {
      await delay(latency);
      const rows = store.data.environmental.map((record) => ({
        ...record,
        mineName: store.data.mines.find((mine) => mine.id === record.mineId)?.name ?? 'Unknown mine',
        indicatorLabel:
          store.data.environmental.length > 0
            ? (record.indicator as string).replace(/_/g, ' ')
            : record.indicator,
      }));
      return applyQuery(rows, query, 'development', nowIso());
    },
    async getMeasurement(id: string): Promise<EnvironmentalMeasurement> {
      await delay(latency);
      return clone(requireRecord(store.data.environmental.find((item) => item.id === id), 'Environmental measurement'));
    },
    async createMeasurement(input) {
      await delay(latency);
      const thresholds = await environment.thresholds();
      const threshold = thresholds.thresholds.find((entry) => entry.indicator === input.indicator);
      let status: EnvironmentalMeasurement['status'] = 'unknown';
      if (threshold?.limit !== undefined) {
        const exceeds = threshold.comparison === 'above' ? input.value > threshold.limit : input.value < threshold.limit;
        status = exceeds ? 'exceeds_limit' : 'within_limit';
      }
      const record: EnvironmentalMeasurement = {
        id: `env-${Date.now().toString(36)}`,
        mineId: input.mineId,
        indicator: input.indicator,
        value: input.value,
        unit: input.unit,
        measuredAt: input.measuredAt,
        location:
          typeof input.lat === 'number' && typeof input.lng === 'number'
            ? { lat: input.lat, lng: input.lng, accuracyM: input.accuracyM, source: 'device_gps', capturedAt: nowIso() }
            : undefined,
        locationDescription: input.locationDescription,
        source: input.source,
        thresholdId: threshold?.indicator,
        status,
        sampleId: input.sampleId,
        inspectionId: input.inspectionId,
        evidenceDocumentIds: [],
        stale: false,
      };
      store.data.environmental.unshift(record);
      await commit();
      return clone(record);
    },
    async thresholds() {
      await delay(latency);
      return clone(THRESHOLDS);
    },
    async indicators() {
      await delay(latency);
      return THRESHOLDS.thresholds.map((threshold) => threshold.indicator);
    },
  };

  /* ---------------------------------------------------------------------- */
  /* Production                                                             */
  /* ---------------------------------------------------------------------- */
  const production: ProductionService = {
    async list(query?: ListQuery): Promise<ListResult<ProductionRecord>> {
      await delay(latency);
      const rows = store.data.production.map((record) => ({
        ...record,
        mineName: store.data.mines.find((mine) => mine.id === record.mineId)?.name ?? 'Unknown mine',
        anomalyCount: record.anomalyIds.length,
      }));
      return applyQuery(rows, query, 'development', nowIso());
    },
    async get(id: string): Promise<ProductionRecord> {
      await delay(latency);
      return clone(requireRecord(store.data.production.find((item) => item.id === id), 'Production record'));
    },
    async create(input) {
      await delay(latency);
      const record: ProductionRecord = {
        id: `prd-${Date.now().toString(36)}`,
        mineId: input.mineId,
        date: input.date,
        shift: input.shift,
        productionTonnes: input.productionTonnes,
        targetTonnes: input.targetTonnes,
        valueKind: input.valueKind,
        estimateReason: input.estimateReason,
        shiftSupervisorId: input.shiftSupervisorId,
        sourceDocumentIds: [],
        anomalyIds: [],
        notes: input.notes,
      };
      store.data.production.unshift(record);
      await commit();
      return clone(record);
    },
    async approve(id) {
      await delay(latency);
      const record = requireRecord(store.data.production.find((item) => item.id === id), 'Production record');
      record.valueKind = 'approved';
      await commit();
      return clone(record);
    },
    async anomalies(query?: ListQuery): Promise<ListResult<ProductionAnomaly>> {
      await delay(latency);
      const rows = store.data.productionAnomalies.map((anomaly) => ({
        ...anomaly,
        mineName: store.data.mines.find((mine) => mine.id === anomaly.mineId)?.name ?? 'Unknown mine',
      }));
      return applyQuery(rows, query, 'development', nowIso());
    },
    async completeness(query?: ListQuery): Promise<ProductionCompletenessResult> {
      await delay(latency);
      const mineId = query?.filters?.mineId as string | undefined;
      const scoped = mineId ? store.data.mines.filter((mine) => mine.id === mineId) : store.data.mines;
      return scoped.map((mine) => {
        const expected = 21 * 3;
        const reported = store.data.production.filter((record) => record.mineId === mine.id).length;
        return {
          mineId: mine.id,
          expectedRecords: expected,
          reportedRecords: reported,
          missingShifts: Math.max(0, expected - reported),
          completenessPercent: expected === 0 ? 0 : Math.round((reported / expected) * 100),
        };
      }) as ProductionCompletenessResult;
    },
  };

  /* ---------------------------------------------------------------------- */
  /* Contractors                                                            */
  /* ---------------------------------------------------------------------- */
  const contractors: ContractorService = {
    async list(query?: ListQuery): Promise<ListResult<Contractor>> {
      await delay(latency);
      const rows = store.data.contractors.map((contractor) => {
        const contracts = store.data.contracts.filter((contract) => contract.contractorId === contractor.id);
        const nextExpiry = contracts
          .map((contract) => contract.endDate)
          .sort()
          .at(-1);
        return {
          ...contractor,
          mineNames: contractor.mineIds
            .map((id) => store.data.mines.find((mine) => mine.id === id)?.name)
            .filter(Boolean)
            .join(', '),
          contractCount: contracts.length,
          nextContractEnd: nextExpiry,
        };
      });
      return applyQuery(rows, query, 'development', nowIso());
    },
    async get(id: string): Promise<Contractor> {
      await delay(latency);
      return clone(requireRecord(store.data.contractors.find((item) => item.id === id), 'Contractor'));
    },
    async create(input) {
      await delay(latency);
      const contractor: Contractor = {
        id: `con-${Date.now().toString(36)}`,
        code: input.code ?? `CON-${String(store.data.contractors.length + 1).padStart(3, '0')}`,
        name: input.name,
        type: input.type,
        contactPerson: input.contactPerson,
        contactEmail: input.contactEmail,
        contactPhone: input.contactPhone,
        registeredAddress: input.registeredAddress,
        mineIds: input.mineIds,
        complianceStatus: 'unassessed',
        requiredDocumentIds: [],
        verifiedDocumentIds: [],
        safetyRecordIds: [],
        inspectionIds: [],
        openCorrectiveActionIds: [],
        registeredOn: nowIso().slice(0, 10),
        panNumber: input.panNumber,
        gstNumber: input.gstNumber,
      };
      store.data.contractors.unshift(contractor);
      await commit();
      return clone(contractor);
    },
    async update(id, input) {
      await delay(latency);
      const contractor = requireRecord(store.data.contractors.find((item) => item.id === id), 'Contractor');
      const updated: Contractor = { ...contractor, ...input };
      store.data.contractors = store.data.contractors.map((item) => (item.id === id ? updated : item));
      await commit();
      return clone(updated);
    },
    async archive(id, reason) {
      await delay(latency);
      const contractor = requireRecord(store.data.contractors.find((item) => item.id === id), 'Contractor');
      if (!reason?.trim()) {
        throw new ValidationError('A reason is required to archive a contractor.', { reason: ['Provide a reason.'] });
      }
      const updated: Contractor = { ...contractor, complianceStatus: 'unassessed' };
      store.data.contractors = store.data.contractors.map((item) => (item.id === id ? updated : item));
      store.data.audit.unshift({
        id: `aud-${Date.now().toString(36)}`,
        timestamp: nowIso(),
        actorId: 'dev-actor',
        actorName: 'Development adapter',
        actorRole: 'system',
        action: 'archive',
        entityType: 'contractor',
        entityId: id,
        entityLabel: contractor.code,
        previousValue: { complianceStatus: contractor.complianceStatus },
        updatedValue: { complianceStatus: 'unassessed' },
        reason,
        source: 'platform_log',
      });
      await commit();
      return clone(updated);
    },
    async contracts(query?: ListQuery): Promise<ListResult<Contract>> {
      await delay(latency);
      const rows = store.data.contracts.map((contract) => ({
        ...contract,
        contractorName: store.data.contractors.find((item) => item.id === contract.contractorId)?.name ?? 'Unknown contractor',
        mineName: store.data.mines.find((mine) => mine.id === contract.mineId)?.name ?? 'Unknown mine',
        daysToExpiry: daysUntil(contract.endDate),
      }));
      return applyQuery(rows, query, 'development', nowIso());
    },
  };

  /* ---------------------------------------------------------------------- */
  /* Workforce                                                              */
  /* ---------------------------------------------------------------------- */
  const workforce: WorkforceService = {
    async attendance(query?: ListQuery): Promise<ListResult<AttendanceRecord>> {
      await delay(latency);
      const rows = store.data.attendance.map((record) => ({
        ...record,
        mineName: store.data.mines.find((mine) => mine.id === record.mineId)?.name ?? 'Unknown mine',
        contractorName: store.data.contractors.find((item) => item.id === record.contractorId)?.name ?? '',
      }));
      return applyQuery(rows, query, 'development', nowIso());
    },
    async requestCorrection(id, input) {
      await delay(latency);
      const record = requireRecord(store.data.attendance.find((item) => item.id === id), 'Attendance record');
      record.corrections.push({
        id: `cor-${Date.now().toString(36)}`,
        at: nowIso(),
        originalStatus: record.status,
        correctedStatus: input.correctedStatus,
        reason: input.reason,
        requestedBy: 'dev-actor',
        status: 'pending',
      });
      await commit();
      return clone(record);
    },
    async approveCorrection(id, correctionId, approve, reason) {
      await delay(latency);
      const record = requireRecord(store.data.attendance.find((item) => item.id === id), 'Attendance record');
      const correction = record.corrections.find((item) => item.id === correctionId);
      if (!correction) throw new NotFoundError('That correction request could not be found.');
      correction.status = approve ? 'approved' : 'rejected';
      correction.approvedBy = 'dev-actor';
      correction.approvedAt = nowIso();
      if (approve) {
        record.status = correction.correctedStatus;
      } else if (reason) {
        correction.reason = `${correction.reason} — Rejected: ${reason}`;
      }
      await commit();
      return clone(record);
    },
  };

  /* ---------------------------------------------------------------------- */
  /* Corrective actions                                                     */
  /* ---------------------------------------------------------------------- */
  const correctiveActions: CorrectiveActionService = {
    async list(query?: ListQuery): Promise<ListResult<CorrectiveAction>> {
      await delay(latency);
      const rows = store.data.correctiveActions.map((action) => ({
        ...action,
        mineName: store.data.mines.find((mine) => mine.id === action.mineId)?.name ?? 'Unknown mine',
        assigneeName: store.data.users.find((user) => user.id === action.assignedTo)?.name ?? 'Unassigned',
        sourceCode:
          store.data.inspections.find((item) => item.id === action.sourceId)?.code ??
          store.data.safetyRecords.find((item) => item.id === action.sourceId)?.code ??
          store.data.incidents.find((item) => item.id === action.sourceId)?.code ??
          store.data.violations.find((item) => item.id === action.sourceId)?.code ??
          action.sourceId,
        daysToDue: daysUntil(action.dueDate),
        isOverdue: action.status !== 'closed' && isOverdue(action.dueDate),
      }));
      return applyQuery(rows, query, 'development', nowIso());
    },
    async get(id: string): Promise<CorrectiveAction> {
      await delay(latency);
      return clone(requireRecord(store.data.correctiveActions.find((item) => item.id === id), 'Corrective action'));
    },
    async create(input) {
      await delay(latency);
      const action: CorrectiveAction = {
        id: `ca-${Date.now().toString(36)}`,
        code: `CA-${new Date().getFullYear()}-${String(store.data.correctiveActions.length + 1).padStart(4, '0')}`,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        mineId: input.mineId,
        description: input.description,
        assignedTo: input.assignedTo,
        priority: input.priority,
        createdAt: nowIso(),
        createdBy: 'dev-actor',
        dueDate: input.dueDate,
        status: input.assignedTo ? 'assigned' : 'proposed',
        evidenceDocumentIds: [],
        verificationStatus: 'not_required',
        auditHistory: [],
      };
      store.data.correctiveActions.unshift(action);

      if (input.sourceType === 'violation') {
        const violation = store.data.violations.find((item) => item.id === input.sourceId);
        if (violation) {
          violation.correctiveActionIds.push(action.id);
          if (violation.status === 'open') violation.status = 'under_remediation';
        }
      }
      await commit();
      return clone(action);
    },
    async update(id, input) {
      await delay(latency);
      const action = requireRecord(store.data.correctiveActions.find((item) => item.id === id), 'Corrective action');
      const updated: CorrectiveAction = { ...action, ...input };
      store.data.correctiveActions = store.data.correctiveActions.map((item) => (item.id === id ? updated : item));
      await commit();
      return clone(updated);
    },
    async transition(id, to: CorrectiveActionStatus, comment?: string): Promise<CorrectiveAction> {
      await delay(latency);
      const action = requireRecord(store.data.correctiveActions.find((item) => item.id === id), 'Corrective action');
      const result = canTransition(CORRECTIVE_ACTION_TRANSITIONS, action.status, to);
      if (!result.allowed) {
        throw new AppError({
          status: 409,
          code: 'invalid_transition',
          message: result.reason ?? 'That status change is not permitted.',
        });
      }
      const previous = action.status;
      action.status = to;
      if (to === 'submitted_for_verification') {
        action.submittedAt = nowIso();
        action.completionNotes = comment ?? action.completionNotes;
      }
      if (to === 'verified') {
        action.verificationStatus = 'verified';
        action.verifiedAt = nowIso();
        action.verifiedBy = 'dev-actor';
      }
      if (to === 'rejected') {
        action.verificationStatus = 'rejected';
        action.rejectionReason = comment ?? 'Rejected without a reason.';
      }
      if (to === 'closed') {
        action.closedAt = nowIso();
      }
      action.auditHistory.push({
        id: `aud-${Date.now().toString(36)}`,
        timestamp: nowIso(),
        actorId: 'dev-actor',
        actorName: 'Development adapter',
        actorRole: 'system',
        action: 'status_change',
        entityType: 'corrective_action',
        entityId: id,
        entityLabel: action.code,
        previousValue: { status: previous },
        updatedValue: { status: to },
        reason: comment,
        source: 'platform_log',
      });
      await commit();
      return clone(action);
    },
    async attachEvidence(id, documentId) {
      await delay(latency);
      const action = requireRecord(store.data.correctiveActions.find((item) => item.id === id), 'Corrective action');
      if (!action.evidenceDocumentIds.includes(documentId)) action.evidenceDocumentIds.push(documentId);
      await commit();
      return clone(action);
    },
  };

  /* ---------------------------------------------------------------------- */
  /* Documents                                                              */
  /* ---------------------------------------------------------------------- */
  const documents: DocumentService = {
    async list(query?: ListQuery): Promise<ListResult<DocumentRecord>> {
      await delay(latency);
      advanceOcrPipeline(store);
      const rows = store.data.documents.map((document) => ({
        ...document,
        mineName: store.data.mines.find((mine) => mine.id === document.mineId)?.name ?? '—',
      }));
      return applyQuery(rows, query, 'development', nowIso());
    },
    async get(id: string): Promise<DocumentRecord> {
      await delay(latency);
      advanceOcrPipeline(store);
      return clone(requireRecord(store.data.documents.find((item) => item.id === id), 'Document'));
    },
    async upload(input) {
      await delay(latency);
      if (input.sizeBytes <= 0) {
        throw new ValidationError('The selected file is empty.', { file: ['The selected file is empty.'] });
      }
      const id = `doc-${Date.now().toString(36)}`;
      const document: DocumentRecord = {
        id,
        name: input.name,
        type: input.type,
        mimeType: input.mimeType,
        sizeBytes: input.sizeBytes,
        uploadedBy: 'dev-actor',
        uploadedAt: nowIso(),
        status: 'uploaded',
        mineId: input.mineId,
        linkedComplianceIds: [],
        extractedFields: [],
      };
      store.data.documents.unshift(document);
      store.data.documentContent[id] = input.content ?? 'Demonstration file content.';
      await commit();
      return clone(document);
    },
    async retryOcr(id) {
      await delay(latency);
      const document = requireRecord(store.data.documents.find((item) => item.id === id), 'Document');
      document.status = 'uploaded';
      document.uploadedAt = nowIso();
      document.ocrError = undefined;
      await commit();
      return clone(document);
    },
    async updateStatus(id, status: DocumentStatus) {
      await delay(latency);
      const document = requireRecord(store.data.documents.find((item) => item.id === id), 'Document');
      document.status = status;
      await commit();
      return clone(document);
    },
    async confirmField(id, fieldId, value) {
      await delay(latency);
      const document = requireRecord(store.data.documents.find((item) => item.id === id), 'Document');
      const field = document.extractedFields.find((item) => item.id === fieldId);
      if (!field) throw new NotFoundError('The extracted field could not be found.');
      field.correctedValue = value;
      field.confirmed = true;
      if (document.status === 'processed' || document.status === 'needs_review') {
        document.status = 'needs_review';
      }
      await commit();
      return clone(document);
    },
    async attachToCompliance(documentId, complianceId) {
      await delay(latency);
      const document = requireRecord(store.data.documents.find((item) => item.id === documentId), 'Document');
      if (!document.linkedComplianceIds.includes(complianceId)) document.linkedComplianceIds.push(complianceId);
      const record = store.data.compliance.find((item) => item.id === complianceId);
      if (record && !record.evidenceDocumentIds.includes(documentId)) record.evidenceDocumentIds.push(documentId);
      await commit();
      return clone(document);
    },
  };

  /* ---------------------------------------------------------------------- */
  /* Analytics                                                              */
  /* ---------------------------------------------------------------------- */
  const analytics: AnalyticsService = {
    async insights(query?: ListQuery): Promise<ListResult<AiInsight>> {
      await delay(latency);
      const rows = store.data.insights.map((insight) => ({
        ...insight,
        mineName: store.data.mines.find((mine) => mine.id === insight.mineId)?.name ?? 'Organisation-wide',
      }));
      return applyQuery(rows, query, 'development', nowIso());
    },
    async get(id: string): Promise<AiInsight> {
      await delay(latency);
      return clone(requireRecord(store.data.insights.find((item) => item.id === id), 'Insight'));
    },
    async review(id, status, note) {
      await delay(latency);
      const insight = requireRecord(store.data.insights.find((item) => item.id === id), 'Insight');
      insight.reviewStatus = status;
      insight.reviewedBy = 'dev-actor';
      insight.reviewedAt = nowIso();
      if (note) insight.reviewNote = note;
      await commit();
      return clone(insight);
    },
    async riskDistribution() {
      await delay(latency);
      const levels: Record<string, number> = { low: 0, moderate: 0, elevated: 0, high: 0, critical: 0 };
      for (const insight of store.data.insights) {
        levels[insight.riskLevel] = (levels[insight.riskLevel] ?? 0) + 1;
      }
      const byMine = store.data.mines
        .map((mine) => {
          const mineInsights = store.data.insights.filter((insight) => insight.mineId === mine.id);
          const score = mineInsights.length
            ? mineInsights.reduce((total, insight) => total + RISK_WEIGHT[insight.riskLevel], 0) / mineInsights.length
            : 0;
          return {
            mineId: mine.id,
            mineName: mine.name,
            score: Number(score.toFixed(2)),
            level: score >= 4 ? 'critical' : score >= 3 ? 'high' : score >= 2 ? 'elevated' : score >= 1 ? 'moderate' : 'low',
          };
        })
        .filter((entry) => entry.score > 0)
        .sort((a, b) => b.score - a.score);
      return { levels, byMine, generatedAt: nowIso() };
    },
  };

  /* ---------------------------------------------------------------------- */
  /* Notifications & workflows                                              */
  /* ---------------------------------------------------------------------- */
  const notifications: NotificationService = {
    async list(query?: ListQuery): Promise<ListResult<AppNotification>> {
      await delay(latency);
      const rows = store.data.notifications.map((notification) => ({
        ...notification,
        relatedName:
          store.data.mines.find((mine) => mine.id === notification.relatedEntity?.id)?.name ??
          notification.relatedEntity?.label ??
          '',
      }));
      return applyQuery(rows, query, 'development', nowIso());
    },
    async markRead(id, read) {
      await delay(latency);
      const notification = requireRecord(store.data.notifications.find((item) => item.id === id), 'Notification');
      notification.read = read;
      await commit();
      return clone(notification);
    },
    async markAllRead() {
      await delay(latency);
      for (const notification of store.data.notifications) notification.read = true;
      await commit();
    },
    async unreadCount() {
      await delay(latency);
      return store.data.notifications.filter((notification) => !notification.read).length;
    },
    async workflowRules() {
      await delay(latency);
      return clone(store.data.workflows);
    },
    async updateWorkflowRule(id, input) {
      await delay(latency);
      const rule = requireRecord(store.data.workflows.find((item) => item.id === id), 'Workflow rule');
      const updated: WorkflowRule = { ...rule, ...input, updatedAt: nowIso(), updatedBy: 'dev-actor' };
      store.data.workflows = store.data.workflows.map((item) => (item.id === id ? updated : item));
      await commit();
      return clone(updated);
    },
  };

  /* ---------------------------------------------------------------------- */
  /* Reports                                                                */
  /* ---------------------------------------------------------------------- */
  const reportJobs: ReportJob[] = [];

  const reports: ReportService = {
    async catalogue(): Promise<ReportDefinition[]> {
      await delay(latency);
      return clone(store.data.reports);
    },
    async list(query?: ListQuery): Promise<ListResult<ReportJob>> {
      await delay(latency);
      return applyQuery(reportJobs, query, 'development', nowIso());
    },
    async generate(request: ReportRequest): Promise<ReportJob> {
      await delay(latency);
      const job: ReportJob = {
        id: `rpt-${Date.now().toString(36)}`,
        request,
        status: 'ready',
        createdAt: nowIso(),
        completedAt: nowIso(),
        fileName: `${request.category}-${request.dateFrom}-to-${request.dateTo}.csv`,
        rowCount: 0,
      };
      reportJobs.unshift(job);
      store.data.audit.unshift({
        id: `aud-${Date.now().toString(36)}`,
        timestamp: nowIso(),
        actorId: 'dev-actor',
        actorName: 'Development adapter',
        actorRole: 'system',
        action: 'export',
        entityType: 'report',
        entityId: job.id,
        entityLabel: request.title,
        updatedValue: {
          category: request.category,
          format: request.format,
          dateFrom: request.dateFrom,
          dateTo: request.dateTo,
        },
        source: 'platform_log',
      });
      await commit();
      return clone(job);
    },
    async get(id: string): Promise<ReportJob> {
      await delay(latency);
      return clone(requireRecord(reportJobs.find((job) => job.id === id), 'Report job'));
    },
    async csv(id: string): Promise<string> {
      await delay(latency);
      const job = requireRecord(reportJobs.find((entry) => entry.id === id), 'Report job');
      const definition = store.data.reports.find((entry) => entry.category === job.request.category);
      if (!definition) throw new NotFoundError('That report definition could not be found.');
      const rows = buildReportRows(store.data, definition.category, job.request);
      const columns: CsvColumn<Record<string, unknown>>[] = definition.columns.map((column) => ({
        key: column.key,
        label: column.label,
        value: (row) => row[column.key],
      }));
      job.rowCount = rows.length;
      return toCsv(rows, columns);
    },
  };

  /* ---------------------------------------------------------------------- */
  /* Audit                                                                  */
  /* ---------------------------------------------------------------------- */
  const audit: AuditService = {
    async list(query?: ListQuery): Promise<ListResult<AuditEvent>> {
      await delay(latency);
      const rows = store.data.audit.map((event) => ({
        ...event,
        entityLabel: event.entityLabel ?? event.entityId,
      }));
      return applyQuery(rows, query, 'development', nowIso());
    },
    async ledgerConnected() {
      await delay(latency);
      return false;
    },
  };

  /* ---------------------------------------------------------------------- */
  /* Dashboard & search                                                     */
  /* ---------------------------------------------------------------------- */
  const dashboard: DashboardService = {
    async summary(filters: DashboardFilters) {
      await delay(latency);
      const scopedMines = store.data.mines.filter((mine) => {
        if (filters.mineId && mine.id !== filters.mineId) return false;
        if (filters.subsidiaryId && mine.subsidiaryId !== filters.subsidiaryId) return false;
        if (filters.region && mine.region !== filters.region) return false;
        if (filters.operationalStatus && mine.operationalStatus !== filters.operationalStatus) return false;
        return true;
      });
      const scopedIds = new Set(scopedMines.map((mine) => mine.id));
      const scopedContractors = store.data.contractors.filter((contractor) =>
        contractor.mineIds.some((id) => scopedIds.has(id)),
      );
      return computeDashboardSummary(
        {
          mines: store.data.mines,
          compliance: store.data.compliance,
          inspections: store.data.inspections,
          violations: store.data.violations,
          correctiveActions: store.data.correctiveActions,
          safetyRecords: store.data.safetyRecords,
          environmental: store.data.environmental,
          production: store.data.production,
          contractorTotal: scopedContractors.length,
          contractorNonCompliantCount: scopedContractors.filter((c) => c.complianceStatus === 'non_compliant').length,
          outstandingReports: reportJobs.filter((job) => job.status !== 'ready').length,
          source: 'development',
          generatedAt: nowIso(),
        },
        filters,
      );
    },
    async complianceTrend(filters: DashboardFilters) {
      await delay(latency);
      const scopedIds = new Set(
        store.data.mines
          .filter((mine) => !filters.mineId || mine.id === filters.mineId)
          .filter((mine) => !filters.subsidiaryId || mine.subsidiaryId === filters.subsidiaryId)
          .map((mine) => mine.id),
      );
      const buckets = new Map<string, { compliant: number; nonCompliant: number }>();
      for (const record of store.data.compliance) {
        if (!record.applicableMineIds.some((id) => scopedIds.has(id))) continue;
        const month = (record.lastVerifiedAt ?? record.updatedAt).slice(0, 7);
        const bucket = buckets.get(month) ?? { compliant: 0, nonCompliant: 0 };
        if (record.status === 'compliant') bucket.compliant += 1;
        if (record.status === 'non_compliant') bucket.nonCompliant += 1;
        buckets.set(month, bucket);
      }
      return Array.from(buckets.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .slice(-8)
        .map(([label, value]) => ({ label, value: value.compliant, secondary: value.nonCompliant }));
    },
    async productionTrend(filters: DashboardFilters) {
      await delay(latency);
      const scopedIds = new Set(
        store.data.mines
          .filter((mine) => !filters.mineId || mine.id === filters.mineId)
          .filter((mine) => !filters.subsidiaryId || mine.subsidiaryId === filters.subsidiaryId)
          .map((mine) => mine.id),
      );
      const buckets = new Map<string, { actual: number; target: number }>();
      for (const record of store.data.production) {
        if (!scopedIds.has(record.mineId)) continue;
        const day = record.date;
        const bucket = buckets.get(day) ?? { actual: 0, target: 0 };
        bucket.actual += record.productionTonnes;
        bucket.target += record.targetTonnes ?? 0;
        buckets.set(day, bucket);
      }
      return Array.from(buckets.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .slice(-14)
        .map(([label, value]) => ({ label, value: value.actual, secondary: value.target }));
    },
    async mineStatusComparison(filters: DashboardFilters) {
      await delay(latency);
      return store.data.mines
        .filter((mine) => !filters.subsidiaryId || mine.subsidiaryId === filters.subsidiaryId)
        .filter((mine) => !filters.mineId || mine.id === filters.mineId)
        .map((mine) => {
          const records = store.data.compliance.filter((record) => record.applicableMineIds.includes(mine.id));
          const compliant = records.filter((record) => record.status === 'compliant').length;
          const score = records.length ? Math.round((compliant / records.length) * 100) : 0;
          return {
            mineId: mine.id,
            mineName: mine.name,
            subsidiaryName:
              store.data.subsidiaries.find((sub) => sub.id === mine.subsidiaryId)?.name ?? '—',
            complianceScore: score,
            openActions: store.data.correctiveActions.filter(
              (action) => action.mineId === mine.id && action.status !== 'closed',
            ).length,
            openObservations: store.data.safetyRecords.filter(
              (record) => record.mineId === mine.id && record.status !== 'closed',
            ).length,
            level: score >= 80 ? 'healthy' : score >= 60 ? 'watch' : 'at_risk',
          };
        })
        .sort((a, b) => a.complianceScore - b.complianceScore);
    },
    async riskByMine(filters: DashboardFilters) {
      await delay(latency);
      const distribution = await analytics.riskDistribution();
      const scoped = filters.mineId
        ? distribution.byMine.filter((entry) => entry.mineId === filters.mineId)
        : distribution.byMine;
      return { ...distribution, byMine: scoped };
    },
  };

  /* ---------------------------------------------------------------------- */
  /* Assistant                                                                */
  /* ---------------------------------------------------------------------- */
  const assistant: AssistantService = {
    async ask(input: AssistantQueryInput): Promise<AssistantAnswer> {
      await delay(latency);
      const startedAt = Date.now();
      const query = input.query.trim();
      const normalised = query.toLowerCase();
      const scope = input.mineIds?.length ? new Set(input.mineIds) : null;
      const inScope = (mineId: string | undefined) =>
        !scope || (mineId !== undefined && scope.has(mineId));
      const today = toDateOnly(new Date()) ?? '';
      const mineNameById = new Map(store.data.mines.map((mine) => [mine.id, mine.name]));

      // Retrieval vocabulary. Stop words carry no record meaning, domain words
      // choose which record types to search, and intent words narrow by state.
      const STOPWORDS = new Set([
        'the', 'and', 'for', 'with', 'that', 'this', 'from', 'are', 'was', 'were', 'has', 'have',
        'had', 'what', 'which', 'who', 'when', 'where', 'why', 'how', 'all', 'any', 'can', 'could',
        'should', 'would', 'will', 'shall', 'may', 'might', 'must', 'please', 'show', 'list', 'give',
        'tell', 'about', 'into', 'their', 'there', 'they', 'them', 'its', 'our', 'your', 'each',
        'per', 'not', 'but', 'you', 'use', 'using', 'some', 'more', 'most', 'least', 'also', 'than',
        'then', 'now', 'still', 'only', 'just', 'very', 'much', 'many', 'does', 'did', 'done',
        'being', 'been', 'between', 'after', 'before', 'during', 'other', 'such', 'same', 'both',
        'few', 'own', 'out', 'off', 'on', 'in', 'at', 'by', 'to', 'of', 'is', 'it', 'as', 'be', 'or',
        'if', 'do', 'no', 'so', 'up', 'we', 'us', 'my', 'me', 'he', 'she', 'his', 'her', 'over',
        'under', 'record', 'records', 'item', 'items', 'data',
      ]);

      const DOMAIN_TERMS: Record<string, string> = {
        compliance: 'compliance',
        requirement: 'compliance',
        requirements: 'compliance',
        statutory: 'compliance',
        inspection: 'inspections',
        inspections: 'inspections',
        inspector: 'inspections',
        incident: 'incidents',
        incidents: 'incidents',
        accident: 'incidents',
        accidents: 'incidents',
        safety: 'observations',
        observation: 'observations',
        observations: 'observations',
        hazard: 'observations',
        hazards: 'observations',
        corrective: 'corrective_actions',
        action: 'corrective_actions',
        actions: 'corrective_actions',
        mine: 'mines',
        mines: 'mines',
        environment: 'measurements',
        environmental: 'measurements',
        measurement: 'measurements',
        measurements: 'measurements',
        reading: 'measurements',
        readings: 'measurements',
        emission: 'measurements',
        dust: 'measurements',
        noise: 'measurements',
        water: 'measurements',
        air: 'measurements',
      };

      const INTENT_TERMS = new Set([
        'overdue', 'due', 'open', 'unresolved', 'closed', 'pending', 'investigation',
        'investigating', 'investigated', 'priority', 'priorities', 'status', 'statuses',
        'summary', 'summarise', 'summarize', 'review', 'reviews', 'deadline', 'deadlines',
      ]);

      const tokens = Array.from(
        new Set(normalised.split(/[^a-z0-9]+/).filter((token) => token.length >= 2)),
      ).filter((token) => !STOPWORDS.has(token));

      if (query.length < 2 || tokens.length === 0) {
        return {
          answer:
            'Ask a question about the compliance, inspection, safety, corrective action or environmental records in your scope.',
          citations: [],
          retrievalBased: true,
          limitation: 'The question was too short to retrieve any stored record.',
          generatedAt: nowIso(),
        };
      }

      const domains = new Set<string>();
      for (const token of tokens) {
        const domain = DOMAIN_TERMS[token];
        if (domain) domains.add(domain);
      }
      const restrictDomains = domains.size > 0;
      const includeDomain = (domain: string) => !restrictDomains || domains.has(domain);

      const specificTokens = tokens.filter(
        (token) => !DOMAIN_TERMS[token] && !INTENT_TERMS.has(token),
      );
      const wantsOverdue = tokens.some(
        (token) => token === 'overdue' || token.startsWith('deadline'),
      );
      const wantsOpen = tokens.some((token) => ['open', 'unresolved', 'pending'].includes(token));
      const wantsInvestigation = tokens.some((token) => token.startsWith('investigat'));

      const humaniseStatus = (value: string) => value.replace(/_/g, ' ');
      const searchable = (...values: (string | number | undefined)[]) =>
        values.filter((value) => value !== undefined && value !== '').join(' ').toLowerCase();
      const tokenPatterns = specificTokens.map(
        (token) => new RegExp(`\\b${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`),
      );
      const scoreText = (text: string) => {
        // Treat underscores as separators so codes and indicators such as
        // `air_quality_pm10` still match a whole-word query for `pm10`.
        const haystack = text.toLowerCase().replace(/_/g, ' ');
        return tokenPatterns.reduce(
          (total, pattern) => (pattern.test(haystack) ? total + 1 : total),
          0,
        );
      };

      interface Candidate {
        domain: string;
        citation: AssistantCitation;
        score: number;
        status?: string;
        label: string;
      }

      const candidates: Candidate[] = [];

      const collect = <T,>(
        domain: string,
        records: T[],
        toItem: (record: T) => {
          citation: AssistantCitation;
          text: string;
          status?: string;
          label: string;
        },
        intentPass?: (record: T) => boolean,
      ) => {
        if (!includeDomain(domain)) return;
        for (const record of records) {
          const intentMatches = intentPass ? intentPass(record) : false;
          if (intentPass && !intentMatches) continue;
          const item = toItem(record);
          const score = specificTokens.length === 0 ? 1 : scoreText(item.text);
          if (specificTokens.length > 0 && score === 0) continue;
          candidates.push({
            domain,
            citation: item.citation,
            score: score + (intentMatches ? 1 : 0),
            status: item.status,
            label: item.label,
          });
        }
      };

      const scopedCompliance = store.data.compliance.filter((record) =>
        inScope(record.applicableMineIds[0]),
      );
      collect(
        'compliance',
        scopedCompliance,
        (record) => ({
          citation: {
            entityType: 'compliance',
            entityId: record.id,
            label: `${record.code} — ${record.title}`,
            href: `/compliance/${record.id}`,
            detail: `Status: ${humaniseStatus(record.status)}. Priority: ${record.priority}.${
              record.dueDate ? ` Due ${record.dueDate}.` : ''
            }`,
          },
          text: searchable(
            record.code,
            record.title,
            record.description,
            record.category,
            record.status,
            record.priority,
            record.applicableMineIds.map((id) => mineNameById.get(id)).join(' '),
          ),
          status: record.status,
          label: `${record.code} (${humaniseStatus(record.status)})`,
        }),
        wantsOverdue
          ? (record) =>
              record.status === 'overdue' ||
              (Boolean(record.dueDate) &&
                (record.dueDate as string) < today &&
                record.status !== 'compliant' &&
                record.status !== 'non_compliant')
          : wantsOpen
            ? (record) => !['compliant', 'non_compliant'].includes(record.status)
            : undefined,
      );

      const scopedInspections = store.data.inspections.filter((inspection) =>
        inScope(inspection.mineId),
      );
      collect(
        'inspections',
        scopedInspections,
        (inspection) => ({
          citation: {
            entityType: 'inspection',
            entityId: inspection.id,
            label: `${inspection.code} — ${humaniseStatus(inspection.type)}`,
            href: `/inspections/${inspection.id}`,
            detail: `Status: ${humaniseStatus(inspection.status)}. Scheduled ${inspection.scheduledDate}.`,
          },
          text: searchable(
            inspection.code,
            inspection.type,
            inspection.status,
            inspection.scope,
            mineNameById.get(inspection.mineId),
          ),
          status: inspection.status,
          label: inspection.code,
        }),
        wantsOpen
          ? (inspection) => !['completed', 'cancelled'].includes(inspection.status)
          : undefined,
      );

      const scopedObservations = store.data.safetyRecords.filter((record) =>
        inScope(record.mineId),
      );
      collect(
        'observations',
        scopedObservations,
        (record) => ({
          citation: {
            entityType: 'safety_observation',
            entityId: record.id,
            label: `${record.code} — ${record.title}`,
            href: `/safety/${record.id}`,
            detail: `Status: ${humaniseStatus(record.status)}. Severity: ${record.severity}.`,
          },
          text: searchable(
            record.code,
            record.title,
            record.description,
            record.type,
            record.status,
            record.severity,
            record.locationDescription,
            mineNameById.get(record.mineId),
          ),
          status: record.status,
          label: `${record.code} (${humaniseStatus(record.status)})`,
        }),
        wantsInvestigation
          ? (record) => record.status === 'under_investigation'
          : wantsOpen
            ? (record) => record.status === 'open'
            : undefined,
      );

      const scopedIncidents = store.data.incidents.filter((incident) =>
        inScope(incident.mineId),
      );
      collect(
        'incidents',
        scopedIncidents,
        (incident) => ({
          citation: {
            entityType: 'incident',
            entityId: incident.id,
            label: `${incident.code} — ${incident.title}`,
            href: `/safety/incidents/${incident.id}`,
            detail: `Status: ${humaniseStatus(incident.status)}. Severity: ${incident.severity}. ${
              incident.injuriesReported
            } injur${incident.injuriesReported === 1 ? 'y' : 'ies'} reported.`,
          },
          text: searchable(
            incident.code,
            incident.title,
            incident.description,
            incident.status,
            incident.severity,
            incident.locationDescription,
            mineNameById.get(incident.mineId),
          ),
          status: incident.status,
          label: `${incident.code} (${humaniseStatus(incident.status)})`,
        }),
        wantsOpen ? (incident) => incident.status !== 'closed' : undefined,
      );

      const scopedActions = store.data.correctiveActions.filter((action) =>
        inScope(action.mineId),
      );
      collect(
        'corrective_actions',
        scopedActions,
        (action) => ({
          citation: {
            entityType: 'corrective_action',
            entityId: action.id,
            label: `${action.code} — ${action.description.slice(0, 120)}`,
            href: `/corrective-actions/${action.id}`,
            detail: `Status: ${humaniseStatus(action.status)}. Priority: ${action.priority}.${
              action.dueDate ? ` Due ${action.dueDate}.` : ''
            }`,
          },
          text: searchable(
            action.code,
            action.description,
            action.status,
            action.priority,
            mineNameById.get(action.mineId),
          ),
          status: action.status,
          label: `${action.code} (${humaniseStatus(action.status)})`,
        }),
        wantsOverdue
          ? (action) =>
              Boolean(action.dueDate) &&
              (action.dueDate as string) < today &&
              !['verified', 'closed', 'rejected'].includes(action.status)
          : wantsOpen
            ? (action) => !['verified', 'closed'].includes(action.status)
            : undefined,
      );

      collect(
        'mines',
        store.data.mines.filter((mine) => inScope(mine.id)),
        (mine) => ({
          citation: {
            entityType: 'mine',
            entityId: mine.id,
            label: `${mine.code} — ${mine.name}`,
            href: `/mines/${mine.id}`,
            detail: `${mine.district}, ${mine.state}. Status: ${humaniseStatus(mine.operationalStatus)}.`,
          },
          text: searchable(
            mine.name,
            mine.code,
            mine.district,
            mine.state,
            mine.region,
            mine.operationalStatus,
          ),
          status: mine.operationalStatus,
          label: `${mine.code} (${humaniseStatus(mine.operationalStatus)})`,
        }),
      );

      collect(
        'measurements',
        store.data.environmental.filter((measurement) => inScope(measurement.mineId)),
        (measurement) => ({
          citation: {
            entityType: 'environmental_measurement',
            entityId: measurement.id,
            label: `${humaniseStatus(measurement.indicator)} — ${measurement.value} ${measurement.unit}`,
            detail: `Measured ${measurement.measuredAt.slice(0, 10)}. Status: ${humaniseStatus(measurement.status)}.`,
          },
          text: searchable(
            measurement.indicator,
            measurement.status,
            measurement.unit,
            measurement.source,
            measurement.locationDescription,
            mineNameById.get(measurement.mineId),
          ),
          status: measurement.status,
          label: `${humaniseStatus(measurement.indicator)} (${measurement.value} ${measurement.unit})`,
        }),
      );

      const legalQuestion =
        /\b(legal|law|laws|penalty|penalties|liable|liability|court|tribunal)\b/.test(normalised);

      if (candidates.length === 0) {
        return {
          answer: legalQuestion
            ? 'This assistant cannot interpret legislation or decide liability. It can retrieve the stored compliance, inspection and safety records that a responsible officer would review.'
            : 'No stored record in your scope matches that question. This assistant only answers from records already held by CoalGuard, so try naming a mine, a requirement code, a status or a recorded incident.',
          citations: [],
          retrievalBased: true,
          limitation: legalQuestion
            ? 'Legal interpretation is outside this assistant’s scope and no matching record was found. This is not legal advice.'
            : 'No matching record was found, so no answer could be grounded.',
          generatedAt: nowIso(),
        };
      }

      const DOMAIN_LABELS: Record<string, string> = {
        compliance: 'compliance requirement',
        inspections: 'inspection',
        observations: 'safety observation',
        incidents: 'incident',
        corrective_actions: 'corrective action',
        mines: 'mine',
        measurements: 'environmental measurement',
      };

      const byDomain = new Map<string, Candidate[]>();
      for (const candidate of candidates) {
        const list = byDomain.get(candidate.domain) ?? [];
        list.push(candidate);
        byDomain.set(candidate.domain, list);
      }

      const facts: string[] = [];
      for (const [domain, items] of byDomain) {
        const sorted = [...items].sort((left, right) => right.score - left.score);
        const statusCounts = new Map<string, number>();
        for (const item of items) {
          if (!item.status) continue;
          statusCounts.set(item.status, (statusCounts.get(item.status) ?? 0) + 1);
        }
        const counts = Array.from(statusCounts.entries())
          .sort((left, right) => right[1] - left[1])
          .map(([status, count]) => `${count} ${humaniseStatus(status)}`)
          .join(', ');
        const noun = DOMAIN_LABELS[domain] ?? domain;
        const plural = items.length === 1 ? noun : `${noun}s`;
        const examples = sorted
          .slice(0, 3)
          .map((item) => item.label)
          .join('; ');
        facts.push(
          `${items.length} ${plural} matched${counts ? ` (${counts})` : ''}. ${
            items.length === 1 ? 'Record' : 'Examples'
          }: ${examples}.`,
        );
      }

      const deduped = candidates.filter(
        (candidate, index) =>
          candidates.findIndex(
            (other) =>
              other.citation.entityType === candidate.citation.entityType &&
              other.citation.entityId === candidate.citation.entityId,
          ) === index,
      );
      deduped.sort((left, right) => right.score - left.score);

      return {
        answer: legalQuestion
          ? `This assistant cannot interpret legislation or decide liability. ${facts.join(
              ' ',
            )} Review the cited records with the responsible officer and obtain legal advice where required.`
          : facts.join(' '),
        citations: deduped.slice(0, 12).map((candidate) => candidate.citation),
        retrievalBased: true,
        limitation: legalQuestion
          ? `Legal interpretation is outside this assistant’s scope. Citations are keyword retrieval over stored records in ${
              Date.now() - startedAt
            }ms, not legal advice.`
          : `Assembled by keyword retrieval over stored records in ${
              Date.now() - startedAt
            }ms. It is not a legal interpretation and does not replace review by the responsible officer.`,
        generatedAt: nowIso(),
      };
    },
  };

  /* ---------------------------------------------------------------------- */
  /* Map / GIS                                                              */
  /* ---------------------------------------------------------------------- */
  const map: MapService = {
    async mines(query?: ListQuery): Promise<ListResult<MineMapMarker>> {
      await delay(latency);
      const subsidiaries = store.data.subsidiaries;
      const rows = store.data.mines.map((mine) => {
        const sub = subsidiaries.find((s) => s.id === mine.subsidiaryId);
        return {
          id: mine.id,
          code: mine.code,
          name: mine.name,
          subsidiaryId: mine.subsidiaryId,
          subsidiaryName: sub?.name,
          region: mine.region,
          district: mine.district,
          state: mine.state,
          operationalStatus: mine.operationalStatus,
          location: mine.location,
        };
      });
      return applyQuery(rows, query, 'development', nowIso());
    },
    async getMineSummary(id: string): Promise<MineSummary> {
      await delay(latency);
      const mine = store.data.mines.find((m) => m.id === id);
      if (!mine) throw new NotFoundError('Mine could not be found.');
      const sub = store.data.subsidiaries.find((s) => s.id === mine.subsidiaryId);
      const openViolations = store.data.violations
        .filter((v) => v.mineId === id && ['open', 'under_remediation', 'awaiting_verification'].includes(v.status))
        .sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? ''))
        .slice(0, 5)
        .map((v) => ({ id: v.id, code: v.code, severity: v.severity, category: v.category, status: v.status, dueDate: v.dueDate, sourceCode: v.sourceCode }));
      const openActions = store.data.correctiveActions
        .filter((a) => a.mineId === id && !['verified', 'closed'].includes(a.status))
        .sort((a, b) => (a.dueDate ?? '').localeCompare(b.dueDate ?? ''))
        .slice(0, 5)
        .map((a) => ({ id: a.id, code: a.code, priority: a.priority, status: a.status, dueDate: a.dueDate, sourceCode: a.sourceId }));
      const latestIncidents = store.data.incidents
        .filter((i) => i.mineId === id)
        .sort((a, b) => (b.occurredAt ?? '').localeCompare(a.occurredAt ?? ''))
        .slice(0, 3)
        .map((i) => ({ id: i.id, code: i.code, title: i.title, severity: i.severity, status: i.status, occurredAt: i.occurredAt }));
      const latestInspections = store.data.inspections
        .filter((i) => i.mineId === id)
        .sort((a, b) => (b.scheduledDate ?? '').localeCompare(a.scheduledDate ?? ''))
        .slice(0, 3)
        .map((i) => ({ id: i.id, code: i.code, type: i.type, status: i.status, scheduledDate: i.scheduledDate }));
      return {
        id: mine.id,
        code: mine.code,
        name: mine.name,
        subsidiaryId: mine.subsidiaryId,
        subsidiaryName: sub?.name,
        region: mine.region,
        district: mine.district,
        state: mine.state,
        operationalStatus: mine.operationalStatus,
        approvedCapacityTPA: mine.approvedCapacityTPA,
        commissionedOn: mine.commissionedOn,
        location: mine.location,
        openViolations,
        openCorrectiveActions: openActions,
        latestIncidents,
        latestInspections,
      };
    },
    async violations(query?: ListQuery): Promise<ListResult<MapViolation>> {
      await delay(latency);
      const subsidiaries = store.data.subsidiaries;
      const rows = store.data.violations.map((v) => {
        const mine = store.data.mines.find((m) => m.id === v.mineId);
        const sub = mine ? subsidiaries.find((s) => s.id === mine.subsidiaryId) : undefined;
        return {
          id: v.id,
          code: v.code,
          mineId: v.mineId,
          mineName: mine?.name ?? '',
          mineCode: mine?.code ?? '',
          severity: v.severity,
          category: v.category,
          status: v.status,
          dueDate: v.dueDate,
          raisedAt: v.raisedAt,
          sourceCode: v.sourceCode,
          location: mine?.location,
        };
      });
      return applyQuery(rows, query, 'development', nowIso());
    },
    async correctiveActions(query?: ListQuery): Promise<ListResult<MapCorrectiveAction>> {
      await delay(latency);
      const subsidiaries = store.data.subsidiaries;
      const rows = store.data.correctiveActions.map((a) => {
        const mine = store.data.mines.find((m) => m.id === a.mineId);
        const sub = mine ? subsidiaries.find((s) => s.id === mine.subsidiaryId) : undefined;
        return {
          id: a.id,
          code: a.code,
          mineId: a.mineId,
          mineName: mine?.name ?? '',
          mineCode: mine?.code ?? '',
          priority: a.priority,
          status: a.status,
          dueDate: a.dueDate,
          description: a.description,
          sourceCode: a.sourceId,
          location: mine?.location,
        };
      });
      return applyQuery(rows, query, 'development', nowIso());
    },
    async riskSummary(): Promise<MapRiskSummary[]> {
      await delay(latency);
      const rows = store.data.mines.map((mine) => {
        const openViolations = store.data.violations.filter((v) => v.mineId === mine.id && ['open', 'under_remediation', 'awaiting_verification'].includes(v.status)).length;
        const openActions = store.data.correctiveActions.filter((a) => a.mineId === mine.id && !['verified', 'closed'].includes(a.status)).length;
        const criticalIncidents = store.data.incidents.filter((i) => i.mineId === mine.id && i.severity === 'critical' && ['open', 'under_investigation', 'action_assigned'].includes(i.status)).length;
        const riskScore = openViolations * 3 + openActions * 2 + criticalIncidents * 5;
        return {
          id: mine.id,
          code: mine.code,
          name: mine.name,
          region: mine.region,
          location: mine.location,
          openViolations,
          openActions,
          criticalIncidents,
          riskScore,
        };
      });
      return rows.sort((a, b) => b.riskScore - a.riskScore);
    },
  };

  const ai: AIService = {
    async anomalies(query?: ListQuery) {
      await delay(latency);
      return { items: [], meta: { page: query?.page ?? 1, pageSize: query?.pageSize ?? 20, total: 0 } };
    },
    async getAnomaly(id: string) {
      await delay(latency);
      return null;
    },
    async createAnomalyRule(input: {
      rule_code: string;
      name: string;
      description?: string;
      category: string;
      severity: string;
      rule_expression: any;
      applies_to_mine_ids?: string[];
    }) {
      await delay(latency);
      return { id: `rule-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`, rule_code: input.rule_code, name: input.name };
    },
    async listAnomalyRules() {
      await delay(latency);
      return [];
    },
    async predictionTargets() {
      await delay(latency);
      return [];
    },
    async predictions(query?: ListQuery) {
      await delay(latency);
      return { items: [], meta: { page: query?.page ?? 1, pageSize: query?.pageSize ?? 20, total: 0 } };
    },
    async getPrediction(id: string) {
      await delay(latency);
      return null;
    },
    async linkOutcome(predictionId: string, input: {
      target_id: string;
      mine_id: string;
      occurred: boolean;
      occurred_at?: string;
      actual_event_category?: string;
      recorded_by?: string;
      source?: string;
    }) {
      await delay(latency);
      return undefined;
    },
    async investigations(query?: ListQuery) {
      await delay(latency);
      return { items: [], meta: { page: query?.page ?? 1, pageSize: query?.pageSize ?? 20, total: 0 } };
    },
    async getInvestigation(id: string) {
      await delay(latency);
      return null;
    },
    async createInvestigation(input: {
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
    }) {
      await delay(latency);
      return { id: `inv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`, correlation_id: input.correlation_id, stage: 'received' };
    },
    async transitionInvestigation(id: string, input: {
      nextStage: string;
      decision?: string;
      rationale?: string;
      policy_applied?: string;
      requiresHumanApproval?: boolean;
      approved_by?: string;
    }) {
      await delay(latency);
      return { id, oldStage: input.nextStage, newStage: input.nextStage };
    },
  };

  const search: SearchService = {
    async search(query: string): Promise<SearchResults> {
      await delay(latency);
      const started = Date.now();
      const needle = query.trim().toLowerCase();
      const groups: SearchResults['groups'] = [];

      if (needle.length >= 2) {
        const mineMatches = store.data.mines
          .filter((mine) => `${mine.name} ${mine.code} ${mine.district}`.toLowerCase().includes(needle))
          .slice(0, 5)
          .map((mine) => ({ id: mine.id, title: mine.name, subtitle: `${mine.code} · ${mine.district}`, href: `/mines/${mine.id}` }));
        if (mineMatches.length) groups.push({ type: 'mine', label: 'Mines', items: mineMatches });

        const inspectionMatches = store.data.inspections
          .filter((inspection) => inspection.code.toLowerCase().includes(needle))
          .slice(0, 5)
          .map((inspection) => ({
            id: inspection.id,
            title: inspection.code,
            subtitle: `${inspection.type.replace('_', ' ')} · ${inspection.status}`,
            href: `/inspections/${inspection.id}`,
          }));
        if (inspectionMatches.length) groups.push({ type: 'inspection', label: 'Inspections', items: inspectionMatches });

        const complianceMatches = store.data.compliance
          .filter((record) => `${record.code} ${record.title}`.toLowerCase().includes(needle))
          .slice(0, 5)
          .map((record) => ({
            id: record.id,
            title: record.title,
            subtitle: `${record.code} · ${record.status}`,
            href: `/compliance/${record.id}`,
          }));
        if (complianceMatches.length) groups.push({ type: 'compliance', label: 'Compliance', items: complianceMatches });

        const actionMatches = store.data.correctiveActions
          .filter((action) => `${action.code} ${action.description}`.toLowerCase().includes(needle))
          .slice(0, 5)
          .map((action) => ({
            id: action.id,
            title: action.code,
            subtitle: action.description.slice(0, 70),
            href: `/corrective-actions/${action.id}`,
          }));
        if (actionMatches.length) groups.push({ type: 'corrective_action', label: 'Corrective actions', items: actionMatches });

        const contractorMatches = store.data.contractors
          .filter((contractor) => `${contractor.name} ${contractor.code}`.toLowerCase().includes(needle))
          .slice(0, 5)
          .map((contractor) => ({
            id: contractor.id,
            title: contractor.name,
            subtitle: `${contractor.code} · ${contractor.type.replace('_', ' ')}`,
            href: `/contractors/${contractor.id}`,
          }));
        if (contractorMatches.length) groups.push({ type: 'contractor', label: 'Contractors', items: contractorMatches });

        const documentMatches = store.data.documents
          .filter((document) => document.name.toLowerCase().includes(needle))
          .slice(0, 5)
          .map((document) => ({
            id: document.id,
            title: document.name,
            subtitle: `${document.type.replace('_', ' ')} · ${document.status}`,
            href: `/documents/${document.id}`,
          }));
        if (documentMatches.length) groups.push({ type: 'document', label: 'Documents', items: documentMatches });

        const incidentMatches = store.data.incidents
          .filter((incident) => `${incident.code} ${incident.title}`.toLowerCase().includes(needle))
          .slice(0, 5)
          .map((incident) => ({
            id: incident.id,
            title: incident.title,
            subtitle: `${incident.code} · ${incident.severity}`,
            href: `/safety/incidents/${incident.id}`,
          }));
        if (incidentMatches.length) groups.push({ type: 'incident', label: 'Incidents', items: incidentMatches });
      }

      return { query, tookMs: Date.now() - started, groups };
    },
  };

  /* ---------------------------------------------------------------------- */
  /* Administration                                                         */
  /* ---------------------------------------------------------------------- */
  const admin: AdminService = {
    async users(query?: ListQuery) {
      await delay(latency);
      return applyQuery(store.data.users, query, 'development', nowIso());
    },
    async updateUserRole(id, role) {
      await delay(latency);
      const user = requireRecord(store.data.users.find((item) => item.id === id), 'User');
      if (!user) throw new NotFoundError('User could not be found.');
      const updated: User = { ...user, role };
      store.data.users = store.data.users.map((item) => (item.id === id ? updated : item));
      await commit();
      return clone(updated);
    },
    async deactivateUser(id) {
      await delay(latency);
      const user = requireRecord(store.data.users.find((item) => item.id === id), 'User');
      const updated: User = { ...user, role: 'field_inspector', title: `${user.title} (deactivated)` };
      store.data.users = store.data.users.map((item) => (item.id === id ? updated : item));
      await commit();
      return clone(updated);
    },
    async referenceData() {
      await delay(latency);
      return {
        complianceCategories: [
          { value: 'mine_safety', label: 'Mine safety', description: 'Statutory safety obligations.' },
          { value: 'environment', label: 'Environment', description: 'Environmental obligations and monitoring returns.' },
          { value: 'production', label: 'Production', description: 'Production and dispatch reporting obligations.' },
          { value: 'labour', label: 'Labour', description: 'Labour, welfare and hours-of-work obligations.' },
          { value: 'contractor', label: 'Contractor', description: 'Contractor engagement obligations.' },
          { value: 'other', label: 'Other', description: 'Other configured statutory requirements.' },
        ],
        inspectionTypes: [
          { value: 'statutory_safety', label: 'Statutory safety', description: 'Scheduled statutory safety inspection.' },
          { value: 'environment', label: 'Environment', description: 'Environmental inspection.' },
          { value: 'production', label: 'Production', description: 'Production and dispatch verification.' },
          { value: 'labour', label: 'Labour', description: 'Labour and welfare inspection.' },
          { value: 'contractor', label: 'Contractor', description: 'Contractor workface inspection.' },
          { value: 'ad_hoc', label: 'Ad hoc', description: 'Investigation or follow-up visit.' },
        ],
        documentTypes: [
          { value: 'compliance_evidence', label: 'Compliance evidence', description: 'Evidence supporting a compliance submission.' },
          { value: 'inspection_report', label: 'Inspection report', description: 'Inspection report or signed record.' },
          { value: 'contract', label: 'Contract', description: 'Executed contract or agreement.' },
          { value: 'worker_record', label: 'Worker record', description: 'Workforce or attendance record.' },
          { value: 'environment_log', label: 'Environment log', description: 'Environmental monitoring log.' },
          { value: 'production_report', label: 'Production report', description: 'Production or dispatch report.' },
          { value: 'other', label: 'Other', description: 'Other supporting document.' },
        ],
        regions: Array.from(new Set(store.data.mines.map((mine) => mine.region))).sort(),
        units: Array.from(new Set(store.data.environmental.map((record) => record.unit))).sort(),
      };
    },
    async integrationStatus() {
      await delay(latency);
      return [
        {
          id: 'dev-adapter',
          name: 'CoalGuard backend',
          category: 'api' as const,
          status: 'healthy' as const,
          detail: 'Development adapter is serving deterministic demonstration records.',
          lastCheckedAt: nowIso(),
          verified: false,
        },
        {
          id: 'ocr',
          name: 'Document OCR service',
          category: 'ocr' as const,
          status: 'degraded' as const,
          detail: 'No production OCR service is connected. Extraction shown is a clearly-labelled development simulation.',
          lastCheckedAt: nowIso(),
          verified: false,
        },
        {
          id: 'mapbox',
          name: 'Mapbox GL',
          category: 'map' as const,
          status: process.env.NEXT_PUBLIC_MAPBOX_TOKEN ? ('healthy' as const) : ('unavailable' as const),
          detail: process.env.NEXT_PUBLIC_MAPBOX_TOKEN
            ? 'A public Mapbox token is configured.'
            : 'No Mapbox token is configured. The GIS module renders a table fallback.',
          lastCheckedAt: nowIso(),
          verified: false,
        },
        {
          id: 'ledger',
          name: 'Blockchain audit ledger',
          category: 'ledger' as const,
          status: 'unavailable' as const,
          detail: 'No Hyperledger Fabric or equivalent ledger is connected. Audit records are the platform audit log only.',
          lastCheckedAt: nowIso(),
          verified: false,
        },
        {
          id: 'analytics',
          name: 'Analytics engine',
          category: 'analytics' as const,
          status: 'degraded' as const,
          detail: 'Risk insights are produced by deterministic development rules, not a trained model.',
          lastCheckedAt: nowIso(),
          verified: false,
        },
        {
          id: 'messaging',
          name: 'Notification delivery',
          category: 'messaging' as const,
          detail: 'Only in-app delivery is available. Email, SMS and WhatsApp channels are not configured.',
          status: 'degraded' as const,
          lastCheckedAt: nowIso(),
          verified: false,
        },
      ];
    },
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
    mode: 'development',
  };
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

const RISK_WEIGHT: Record<RiskLevel, number> = {
  low: 1,
  moderate: 2,
  elevated: 3,
  high: 4,
  critical: 5,
};

type ProductionCompletenessResult = Awaited<ReturnType<ProductionService['completeness']>>;

const THRESHOLDS: import('@/types').EnvironmentalThresholdRegister = {
  provenance:
    'Development adapter placeholder thresholds. In production these values are supplied by the configured environmental reference register maintained by the environmental officer.',
  lastConfiguredAt: '2026-01-05T09:00:00.000Z',
  thresholds: [
    { indicator: 'air_quality_pm10', unit: 'µg/m³', limit: 100, comparison: 'above', label: 'PM10 — ambient concentration', configuredBy: 'usr-05' },
    { indicator: 'air_quality_pm25', unit: 'µg/m³', limit: 60, comparison: 'above', label: 'PM2.5 — ambient concentration', configuredBy: 'usr-05' },
    { indicator: 'dust_deposition', unit: 'mg/m²/day', limit: 30, comparison: 'above', label: 'Dust deposition rate', configuredBy: 'usr-05' },
    { indicator: 'water_quality_ph', unit: 'pH', limit: 6.5, comparison: 'below', label: 'Water pH — lower bound', configuredBy: 'usr-05' },
    { indicator: 'water_quality_tds', unit: 'mg/l', limit: 1000, comparison: 'above', label: 'Water TDS — upper bound', configuredBy: 'usr-05' },
    { indicator: 'noise_level', unit: 'dB(A)', limit: 85, comparison: 'above', label: 'Noise level at boundary', configuredBy: 'usr-05' },
    { indicator: 'stack_emission', unit: 'mg/Nm³', limit: 50, comparison: 'above', label: 'Stack emission particulate', configuredBy: 'usr-05' },
    { indicator: 'waste_generation', unit: 'tonnes/day', limit: 12, comparison: 'above', label: 'Daily waste generation', configuredBy: 'usr-05' },
  ],
};

/**
 * Advances the simulated OCR pipeline based on how long ago the document was
 * uploaded. The engine identifier makes it obvious this is not a real OCR
 * service.
 */
function advanceOcrPipeline(store: ReturnType<typeof getDevStore>): void {
  const now = Date.now();
  let changed = false;
  for (const document of store.data.documents) {
    if (!['uploaded', 'queued', 'processing'].includes(document.status)) continue;
    const age = now - new Date(document.uploadedAt).getTime();
    if (document.status === 'uploaded' && age > 400) {
      document.status = 'queued';
      changed = true;
    } else if (document.status === 'queued' && age > 1200) {
      document.status = 'processing';
      changed = true;
    } else if (document.status === 'processing' && age > 2600) {
      const willFail = document.name.toLowerCase().includes('corrupt') || document.mimeType === 'application/octet-stream';
      if (willFail) {
        document.status = 'failed';
        document.ocrError =
          'OCR processing failed: the document could not be decoded (development simulation of an engine failure).';
      } else {
        document.status = 'needs_review';
        document.ocrEngine = 'development-mock-ocr';
        document.ocrConfidence = 0.82;
        document.ocrProcessedAt = new Date(now).toISOString();
        document.extractedFields = [
          { id: `${document.id}-f1`, label: 'Document title', value: document.name.replace(/\.pdf$/i, ''), confidence: 0.9, pageNumber: 1, confirmed: false },
          { id: `${document.id}-f2`, label: 'Mine reference', value: document.mineId ?? '—', confidence: 0.74, pageNumber: 1, confirmed: false },
          { id: `${document.id}-f3`, label: 'Reporting period', value: new Date().toISOString().slice(0, 10), confidence: 0.68, pageNumber: 1, confirmed: false },
        ];
        document.extractedText = `Development OCR simulation for ${document.name}. This text was not produced by a production OCR engine.`;
      }
      changed = true;
    }
  }
  if (changed) store.save();
}

function buildReportRows(
  db: ReturnType<typeof getDevStore>['data'],
  category: string,
  request: ReportRequest,
): Record<string, unknown>[] {
  const mineName = (mineId: string | undefined) =>
    db.mines.find((mine) => mine.id === mineId)?.name ?? '—';
  const subsidiaryName = (mineId: string | undefined) => {
    const mine = db.mines.find((m) => m.id === mineId);
    return db.subsidiaries.find((s) => s.id === mine?.subsidiaryId)?.name ?? '—';
  };

  switch (category) {
    case 'statutory_compliance':
      return db.compliance
        .filter((record) => inScope(request, record.applicableMineIds[0]))
        .map((record) => ({
          code: record.code,
          title: record.title,
          mineName: mineName(record.applicableMineIds[0]),
          subsidiaryName: subsidiaryName(record.applicableMineIds[0]),
          category: record.category,
          status: record.status,
          dueDate: record.dueDate ?? '',
          lastVerifiedAt: record.lastVerifiedAt ?? '',
        }));
    case 'inspection_summary':
      return db.inspections
        .filter((record) => inScope(request, record.mineId))
        .map((record) => ({
          code: record.code,
          mineName: mineName(record.mineId),
          subsidiaryName: subsidiaryName(record.mineId),
          type: record.type,
          status: record.status,
          scheduledDate: record.scheduledDate,
          findingCount: record.findings.length,
        }));
    case 'safety_observations':
      return db.safetyRecords
        .filter((record) => inScope(request, record.mineId))
        .map((record) => ({
          code: record.code,
          mineName: mineName(record.mineId),
          title: record.title,
          severity: record.severity,
          status: record.status,
          reportedAt: record.reportedAt,
        }));
    case 'incidents':
      return db.incidents
        .filter((record) => inScope(request, record.mineId))
        .map((record) => ({
          code: record.code,
          mineName: mineName(record.mineId),
          title: record.title,
          severity: record.severity,
          injuriesReported: record.injuriesReported,
          occurredAt: record.occurredAt,
        }));
    case 'corrective_actions':
      return db.correctiveActions
        .filter((record) => inScope(request, record.mineId))
        .map((record) => ({
          code: record.code,
          mineName: mineName(record.mineId),
          description: record.description,
          priority: record.priority,
          status: record.status,
          dueDate: record.dueDate ?? '',
        }));
    case 'environmental_monitoring':
      return db.environmental
        .filter((record) => inScope(request, record.mineId))
        .map((record) => ({
          indicator: record.indicator,
          mineName: mineName(record.mineId),
          value: record.value,
          unit: record.unit,
          status: record.status,
          measuredAt: record.measuredAt,
          source: record.source,
        }));
    case 'production':
      return db.production
        .filter((record) => inScope(request, record.mineId))
        .map((record) => ({
          date: record.date,
          mineName: mineName(record.mineId),
          shift: record.shift,
          productionTonnes: record.productionTonnes,
          targetTonnes: record.targetTonnes ?? '',
          valueKind: record.valueKind,
        }));
    case 'contractor_compliance':
      return db.contractors.map((contractor) => ({
        code: contractor.code,
        name: contractor.name,
        type: contractor.type,
        complianceStatus: contractor.complianceStatus,
        registeredOn: contractor.registeredOn,
      }));
    case 'workforce':
      return db.attendance
        .filter((record) => inScope(request, record.mineId))
        .map((record) => ({
          workerRef: record.workerRef,
          mineName: mineName(record.mineId),
          date: record.date,
          shift: record.shift,
          status: record.status,
        }));
    case 'audit_history':
      return db.audit.map((event) => ({
        timestamp: event.timestamp,
        actorName: event.actorName,
        action: event.action,
        entityType: event.entityType,
        entityId: event.entityId,
      }));
    default:
      return [];
  }
}

function inScope(request: ReportRequest, mineId: string | undefined): boolean {
  if (!mineId) return false;
  if (request.mineIds.length && !request.mineIds.includes(mineId)) return false;
  return true;
}
