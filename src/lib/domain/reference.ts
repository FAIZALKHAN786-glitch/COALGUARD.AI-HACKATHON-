/**
 * Presentation metadata for domain enums.
 *
 * These maps only decide how a value is *labelled and grouped* in the UI.
 * They never encode a statutory limit, a legal deadline or a regulatory
 * threshold — those come from the configured registers served by the API.
 */

import type {
  AuditAction,
  ComplianceCategory,
  ComplianceStatus,
  ContractorType,
  CorrectiveActionSource,
  CorrectiveActionStatus,
  DocumentStatus,
  DocumentType,
  EnvironmentalIndicator,
  EnvironmentalMeasurement,
  Incident,
  InsightCategory,
  InsightReviewStatus,
  InspectionStatus,
  InspectionType,
  MeasurementSource,
  Mine,
  NotificationSeverity,
  NotificationType,
  Priority,
  ProductionRecord,
  ReportCategory,
  RiskLevel,
  Role,
  SafetyRecordStatus,
  SafetyRecordType,
  Shift,
  VerificationStatus,
  ViolationStatus,
} from '@/types';
import {
  AUDIT_ACTIONS,
  COMPLIANCE_CATEGORIES,
  COMPLIANCE_STATUSES,
  CONTRACTOR_TYPES,
  CORRECTIVE_ACTION_SOURCES,
  CORRECTIVE_ACTION_STATUSES,
  DOCUMENT_STATUSES,
  DOCUMENT_TYPES,
  ENVIRONMENTAL_INDICATORS,
  INSPECTION_STATUSES,
  INSPECTION_TYPES,
  INSIGHT_REVIEW_STATUSES,
  MEASUREMENT_SOURCES,
  NOTIFICATION_SEVERITIES,
  NOTIFICATION_TYPES,
  OPERATIONAL_STATUSES,
  PRIORITIES,
  PRODUCTION_VALUE_KINDS,
  REPORT_CATEGORIES,
  RISK_LEVELS,
  ROLES,
  SAFETY_RECORD_STATUSES,
  SAFETY_RECORD_TYPES,
  SHIFTS,
  VIOLATION_STATUSES,
} from '@/types';
import { ROLE_LABELS } from '@/lib/auth/permissions';

export interface Option<T extends string = string> {
  value: T;
  label: string;
}

function options<T extends string>(values: readonly T[], labels: Record<T, string>): Option<T>[] {
  return values.map((value) => ({ value, label: labels[value] }));
}

/** Turns an enum value into a readable label as a defensive fallback. */
export function humanise(value: string): string {
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

/* -------------------------------------------------------------------------- */
/* Labels                                                                      */
/* -------------------------------------------------------------------------- */

export const COMPLIANCE_CATEGORY_LABELS: Record<ComplianceCategory, string> = {
  mine_safety: 'Mine safety',
  environment: 'Environment',
  production: 'Production',
  labour: 'Labour',
  contractor: 'Contractor',
  other: 'Other',
};

export const COMPLIANCE_STATUS_LABELS: Record<ComplianceStatus, string> = {
  draft: 'Draft',
  pending_submission: 'Pending submission',
  submitted: 'Submitted',
  under_review: 'Under review',
  compliant: 'Compliant',
  non_compliant: 'Non-compliant',
  overdue: 'Overdue',
  awaiting_verification: 'Awaiting verification',
};

export const INSPECTION_TYPE_LABELS: Record<InspectionType, string> = {
  statutory_safety: 'Statutory safety',
  environment: 'Environment',
  production: 'Production',
  labour: 'Labour',
  contractor: 'Contractor',
  ad_hoc: 'Ad hoc',
};

export const PRIORITY_LABELS: Record<Priority, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  critical: 'Critical',
};

export const INSPECTION_STATUS_LABELS: Record<InspectionStatus, string> = {
  scheduled: 'Scheduled',
  in_progress: 'In progress',
  submitted: 'Submitted',
  under_review: 'Under review',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export const SAFETY_STATUS_LABELS: Record<SafetyRecordStatus, string> = {
  open: 'Open',
  under_investigation: 'Under investigation',
  action_assigned: 'Action assigned',
  resolved: 'Resolved',
  closed: 'Closed',
};

export const SAFETY_RECORD_TYPE_LABELS: Record<SafetyRecordType, string> = {
  observation: 'Observation',
  hazard: 'Hazard',
  near_miss: 'Near miss',
  incident: 'Incident',
};

export const RISK_LEVEL_LABELS: Record<RiskLevel, string> = {
  low: 'Low',
  moderate: 'Moderate',
  elevated: 'Elevated',
  high: 'High',
  critical: 'Critical',
};

export const VERIFICATION_LABELS: Record<VerificationStatus, string> = {
  not_required: 'Verification not required',
  pending: 'Verification pending',
  verified: 'Verified',
  rejected: 'Verification rejected',
};

export const VIOLATION_STATUS_LABELS: Record<ViolationStatus, string> = {
  open: 'Open',
  under_remediation: 'Under remediation',
  awaiting_verification: 'Awaiting verification',
  closed: 'Closed',
};

export const CORRECTIVE_ACTION_STATUS_LABELS: Record<CorrectiveActionStatus, string> = {
  proposed: 'Proposed',
  assigned: 'Assigned',
  in_progress: 'In progress',
  submitted_for_verification: 'Submitted for verification',
  verified: 'Verified',
  rejected: 'Rejected',
  closed: 'Closed',
};

export const CORRECTIVE_ACTION_SOURCE_LABELS: Record<CorrectiveActionSource, string> = {
  inspection: 'Inspection',
  incident: 'Incident',
  violation: 'Violation',
  observation: 'Safety observation',
};

export const OPERATIONAL_STATUS_LABELS: Record<Mine['operationalStatus'], string> = {
  operational: 'Operational',
  partial: 'Partially operational',
  suspended: 'Suspended',
  decommissioned: 'Decommissioned',
};

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  compliance_evidence: 'Compliance evidence',
  inspection_report: 'Inspection report',
  contract: 'Contract',
  worker_record: 'Worker record',
  environment_log: 'Environment log',
  production_report: 'Production report',
  other: 'Other',
};

export const DOCUMENT_STATUS_LABELS: Record<DocumentStatus, string> = {
  uploaded: 'Uploaded',
  queued: 'Queued',
  processing: 'Processing',
  processed: 'Processed',
  needs_review: 'Needs review',
  failed: 'Failed',
};

export const ENVIRONMENTAL_INDICATOR_LABELS: Record<EnvironmentalIndicator, string> = {
  air_quality_pm10: 'PM10 — ambient concentration',
  air_quality_pm25: 'PM2.5 — ambient concentration',
  dust_deposition: 'Dust deposition rate',
  water_quality_ph: 'Water pH',
  water_quality_tds: 'Water total dissolved solids',
  noise_level: 'Noise level at boundary',
  stack_emission: 'Stack emission particulate',
  waste_generation: 'Waste generation',
};

export const MEASUREMENT_SOURCE_LABELS: Record<MeasurementSource, string> = {
  sensor: 'Continuous sensor',
  manual: 'Manual reading',
  imported: 'Imported file',
  sample: 'Laboratory sample',
  ai_estimate: 'Estimated',
};

export const MEASUREMENT_STATUS_LABELS: Record<EnvironmentalMeasurement['status'], string> = {
  within_limit: 'Within configured limit',
  exceeds_limit: 'Exceeds configured limit',
  unknown: 'Not evaluated — no configured limit',
};

export const SHIFT_LABELS: Record<Shift, string> = {
  day: 'Day',
  swing: 'Swing',
  night: 'Night',
};

export const PRODUCTION_VALUE_KIND_LABELS: Record<ProductionRecord['valueKind'], string> = {
  reported: 'Reported',
  approved: 'Approved',
  estimated: 'Estimated',
};

export const INSIGHT_CATEGORY_LABELS: Record<InsightCategory, string> = {
  compliance_risk: 'Compliance risk',
  recurring_violations: 'Recurring violations',
  safety_repeat_offences: 'Safety repeat offences',
  environmental_anomaly: 'Environmental anomaly',
  production_anomaly: 'Production anomaly',
  contractor_risk: 'Contractor risk',
  overdue_pattern: 'Overdue pattern',
};

export const INSIGHT_REVIEW_STATUS_LABELS: Record<InsightReviewStatus, string> = {
  unreviewed: 'Unreviewed',
  acknowledged: 'Acknowledged',
  investigating: 'Investigating',
  dismissed: 'Dismissed',
  escalated: 'Escalated',
};

export const NOTIFICATION_TYPE_LABELS: Record<NotificationType, string> = {  compliance_deadline: 'Compliance deadline',
  compliance_overdue: 'Compliance overdue',
  inspection_assigned: 'Inspection assigned',
  review_request: 'Review request',
  corrective_action_reminder: 'Corrective action reminder',
  contract_expiring: 'Contract expiring',
  environmental_alert: 'Environmental alert',
  safety_observation: 'Safety observation',
  approval_request: 'Approval request',
  escalation: 'Escalation',
  system: 'System',
};

export const NOTIFICATION_SEVERITY_LABELS: Record<NotificationSeverity, string> = {
  info: 'Information',
  success: 'Success',
  warning: 'Warning',
  critical: 'Critical',
};

export const AUDIT_ACTION_LABELS: Record<AuditAction, string> = {
  create: 'Created',
  update: 'Updated',
  status_change: 'Status changed',
  assign: 'Assigned',
  verify: 'Verified',
  submit: 'Submitted',
  archive: 'Archived',
  delete: 'Deleted',
  export: 'Exported',
  login: 'Signed in',
  logout: 'Signed out',
};

export const REPORT_CATEGORY_LABELS: Record<ReportCategory, string> = {
  statutory_compliance: 'Statutory compliance status',
  inspection_summary: 'Inspection summary',
  safety_observations: 'Safety observations',
  incidents: 'Incident register',
  corrective_actions: 'Corrective action register',
  environmental_monitoring: 'Environmental monitoring',
  production: 'Production summary',
  contractor_compliance: 'Contractor compliance',
  workforce: 'Workforce records',
  audit_history: 'Audit history',
};

export const REPORT_STATUS_LABELS: Record<'queued' | 'processing' | 'ready' | 'failed', string> = {
  queued: 'Queued',
  processing: 'Processing',
  ready: 'Ready to download',
  failed: 'Failed',
};

export const REPORT_FORMAT_LABELS: Record<'csv' | 'pdf' | 'xlsx', string> = {
  csv: 'CSV (comma-separated values)',
  pdf: 'PDF document',
  xlsx: 'Excel workbook (XLSX)',
};

export const REPORT_GROUP_BY_LABELS: Record<'mine' | 'subsidiary' | 'category' | 'month' | 'none', string> = {
  none: 'No grouping',
  mine: 'Group by mine',
  subsidiary: 'Group by subsidiary',
  category: 'Group by category',
  month: 'Group by month',
};

export const REPORT_FORMAT_OPTIONS = options(['csv', 'pdf', 'xlsx'] as const, REPORT_FORMAT_LABELS);
export const REPORT_GROUP_BY_OPTIONS = options(
  ['none', 'mine', 'subsidiary', 'category', 'month'] as const,
  REPORT_GROUP_BY_LABELS,
);
export const REPORT_STATUS_OPTIONS = options(
  ['queued', 'processing', 'ready', 'failed'] as const,
  REPORT_STATUS_LABELS,
);

export const CONTRACTOR_TYPE_LABELS: Record<ContractorType, string> = {
  drilling: 'Drilling',
  blasting: 'Blasting',
  hauling: 'Hauling',
  civil_works: 'Civil works',
  maintenance: 'Maintenance',
  security: 'Security',
  transport: 'Transport',
};

export const CONTRACTOR_COMPLIANCE_LABELS: Record<
  'compliant' | 'non_compliant' | 'under_review' | 'unassessed',
  string
> = {
  compliant: 'Documents verified',
  non_compliant: 'Non-compliant',
  under_review: 'Under review',
  unassessed: 'Not yet assessed',
};

export const CONTRACT_STATUS_LABELS: Record<
  'draft' | 'active' | 'expiring' | 'expired' | 'terminated',
  string
> = {
  draft: 'Draft',
  active: 'Active',
  expiring: 'Expiring soon',
  expired: 'Expired',
  terminated: 'Terminated',
};

export const ATTENDANCE_STATUS_LABELS: Record<
  'present' | 'absent' | 'leave' | 'half_day' | 'not_recorded',
  string
> = {
  present: 'Present',
  absent: 'Absent',
  leave: 'On leave',
  half_day: 'Half day',
  not_recorded: 'Not recorded',
};

export const INCIDENT_STATUS_LABELS: Record<Incident['status'], string> = {
  open: 'Open',
  under_investigation: 'Under investigation',
  action_assigned: 'Action assigned',
  resolved: 'Resolved',
  closed: 'Closed',
};

/* -------------------------------------------------------------------------- */
/* Option lists                                                                */
/* -------------------------------------------------------------------------- */

export const COMPLIANCE_CATEGORY_OPTIONS = options(COMPLIANCE_CATEGORIES, COMPLIANCE_CATEGORY_LABELS);
export const COMPLIANCE_STATUS_OPTIONS = options(COMPLIANCE_STATUSES, COMPLIANCE_STATUS_LABELS);
export const INSPECTION_TYPE_OPTIONS = options(INSPECTION_TYPES, INSPECTION_TYPE_LABELS);
export const INSPECTION_STATUS_OPTIONS = options(INSPECTION_STATUSES, INSPECTION_STATUS_LABELS);
export const SAFETY_STATUS_OPTIONS = options(SAFETY_RECORD_STATUSES, SAFETY_STATUS_LABELS);
export const SAFETY_RECORD_TYPE_OPTIONS = options(SAFETY_RECORD_TYPES, SAFETY_RECORD_TYPE_LABELS);
export const PRIORITY_OPTIONS = options(PRIORITIES, PRIORITY_LABELS);
export const RISK_LEVEL_OPTIONS = options(RISK_LEVELS, RISK_LEVEL_LABELS);
export const VIOLATION_STATUS_OPTIONS = options(VIOLATION_STATUSES, VIOLATION_STATUS_LABELS);
export const CORRECTIVE_ACTION_STATUS_OPTIONS = options(
  CORRECTIVE_ACTION_STATUSES,
  CORRECTIVE_ACTION_STATUS_LABELS,
);
export const CORRECTIVE_ACTION_SOURCE_OPTIONS = options(
  CORRECTIVE_ACTION_SOURCES,
  CORRECTIVE_ACTION_SOURCE_LABELS,
);
export const OPERATIONAL_STATUS_OPTIONS = options(OPERATIONAL_STATUSES, OPERATIONAL_STATUS_LABELS);
export const DOCUMENT_TYPE_OPTIONS = options(DOCUMENT_TYPES, DOCUMENT_TYPE_LABELS);
export const DOCUMENT_STATUS_OPTIONS = options(DOCUMENT_STATUSES, DOCUMENT_STATUS_LABELS);
export const ENVIRONMENTAL_INDICATOR_OPTIONS = options(
  ENVIRONMENTAL_INDICATORS,
  ENVIRONMENTAL_INDICATOR_LABELS,
);
export const MEASUREMENT_SOURCE_OPTIONS = options(MEASUREMENT_SOURCES, MEASUREMENT_SOURCE_LABELS);
export const SHIFT_OPTIONS = options(SHIFTS, SHIFT_LABELS);
export const PRODUCTION_VALUE_KIND_OPTIONS = options(
  PRODUCTION_VALUE_KINDS,
  PRODUCTION_VALUE_KIND_LABELS,
);
export const INSIGHT_CATEGORY_OPTIONS = options(
  Object.keys(INSIGHT_CATEGORY_LABELS) as InsightCategory[],
  INSIGHT_CATEGORY_LABELS,
);
export const INSIGHT_REVIEW_STATUS_OPTIONS = options(
  INSIGHT_REVIEW_STATUSES,
  INSIGHT_REVIEW_STATUS_LABELS,
);
export const NOTIFICATION_TYPE_OPTIONS = options(NOTIFICATION_TYPES, NOTIFICATION_TYPE_LABELS);
export const NOTIFICATION_SEVERITY_OPTIONS = options(
  NOTIFICATION_SEVERITIES,
  NOTIFICATION_SEVERITY_LABELS,
);
export const AUDIT_ACTION_OPTIONS = options(AUDIT_ACTIONS, AUDIT_ACTION_LABELS);
export const REPORT_CATEGORY_OPTIONS = options(REPORT_CATEGORIES, REPORT_CATEGORY_LABELS);
export const CONTRACTOR_TYPE_OPTIONS = options(CONTRACTOR_TYPES, CONTRACTOR_TYPE_LABELS);
export const ROLE_OPTIONS = options(ROLES, ROLE_LABELS);
export const CONTRACT_STATUS_OPTIONS = options(
  ['draft', 'active', 'expiring', 'expired', 'terminated'] as const,
  CONTRACT_STATUS_LABELS,
);
export const CONTRACTOR_COMPLIANCE_OPTIONS = options(
  ['compliant', 'non_compliant', 'under_review', 'unassessed'] as const,
  CONTRACTOR_COMPLIANCE_LABELS,
);
export const ATTENDANCE_STATUS_OPTIONS = options(
  ['present', 'absent', 'leave', 'half_day', 'not_recorded'] as const,
  ATTENDANCE_STATUS_LABELS,
);

/** Role labels re-exported for convenience in admin screens. */
export const ROLE_LABEL_MAP: Record<Role, string> = ROLE_LABELS;
