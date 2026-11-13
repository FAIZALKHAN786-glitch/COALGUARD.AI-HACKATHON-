/**
 * Workflow transition rules.
 *
 * These transitions are enforced in the UI for usability; the backend is
 * authoritative and must reject any invalid transition it receives.
 */

import type {
  ComplianceStatus,
  CorrectiveActionStatus,
  InspectionStatus,
  Priority,
  RiskLevel,
  SafetyRecordStatus,
} from '@/types';

export const COMPLIANCE_TRANSITIONS: Record<ComplianceStatus, readonly ComplianceStatus[]> = {
  draft: ['pending_submission'],
  pending_submission: ['submitted', 'draft'],
  submitted: ['under_review', 'pending_submission'],
  under_review: ['compliant', 'non_compliant', 'awaiting_verification'],
  compliant: ['under_review'],
  non_compliant: ['under_review'],
  overdue: ['under_review', 'pending_submission'],
  awaiting_verification: ['compliant', 'non_compliant'],
};

export const INSPECTION_TRANSITIONS: Record<InspectionStatus, readonly InspectionStatus[]> = {
  scheduled: ['in_progress', 'cancelled'],
  in_progress: ['submitted', 'cancelled'],
  submitted: ['under_review'],
  under_review: ['completed', 'in_progress'],
  completed: [],
  cancelled: [],
};

export const CORRECTIVE_ACTION_TRANSITIONS: Record<
  CorrectiveActionStatus,
  readonly CorrectiveActionStatus[]
> = {
  proposed: ['assigned', 'rejected'],
  assigned: ['in_progress', 'rejected'],
  in_progress: ['submitted_for_verification'],
  submitted_for_verification: ['verified', 'rejected'],
  verified: ['closed'],
  rejected: ['assigned', 'in_progress'],
  closed: [],
};

export const SAFETY_TRANSITIONS: Record<SafetyRecordStatus, readonly SafetyRecordStatus[]> = {
  open: ['under_investigation', 'action_assigned'],
  under_investigation: ['action_assigned', 'resolved'],
  action_assigned: ['resolved'],
  resolved: ['closed', 'action_assigned'],
  closed: [],
};

export interface TransitionResult {
  allowed: boolean;
  reason?: string;
}

export function canTransition<S extends string>(
  map: Record<S, readonly S[]>,
  from: S,
  to: S,
): TransitionResult {
  if (from === to) {
    return { allowed: false, reason: `The record is already in the "${label(from)}" state.` };
  }
  const permitted = map[from] ?? [];
  if (!permitted.includes(to)) {
    return {
      allowed: false,
      reason: `A record cannot move from "${label(from)}" to "${label(to)}".`,
    };
  }
  return { allowed: true };
}

function label(value: string): string {
  return value
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

/** Terminal states cannot be edited further. */
export const TERMINAL_INSPECTION_STATUSES: readonly InspectionStatus[] = ['completed', 'cancelled'];
export const TERMINAL_CORRECTIVE_ACTION_STATUSES: readonly CorrectiveActionStatus[] = ['closed'];

export function riskLevelFromPriority(priority: Priority): RiskLevel {
  switch (priority) {
    case 'critical':
      return 'critical';
    case 'high':
      return 'high';
    case 'medium':
      return 'elevated';
    default:
      return 'low';
  }
}

/** Compliance status derived from a deadline when a record is not otherwise flagged. */
export function deriveComplianceStatus(
  current: ComplianceStatus,
  overdue: boolean,
): ComplianceStatus {
  if (current === 'compliant' || current === 'non_compliant') return current;
  if (overdue && ['pending_submission', 'submitted', 'under_review'].includes(current)) {
    return 'overdue';
  }
  return current;
}
