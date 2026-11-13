import * as React from 'react';

import { cn } from '@/lib/utils';
import type {
  AttendanceStatus,
  ComplianceStatus,
  Contractor,
  CorrectiveActionStatus,
  DocumentStatus,
  EnvironmentalMeasurement,
  InspectionStatus,
  Priority,
  RiskLevel,
  SafetyRecordStatus,
  VerificationStatus,
  ViolationStatus,
} from '@/types';

type Tone = 'default' | 'success' | 'warning' | 'destructive' | 'info' | 'muted' | 'outline';

export interface StatusDescriptor {
  label: string;
  tone: Tone;
  /** Optional short text marker so status is never conveyed by colour alone. */
  marker?: string;
}

const COMPLIANCE: Record<ComplianceStatus, StatusDescriptor> = {
  draft: { label: 'Draft', tone: 'muted', marker: '○' },
  pending_submission: { label: 'Pending submission', tone: 'warning', marker: '◔' },
  submitted: { label: 'Submitted', tone: 'info', marker: '◑' },
  under_review: { label: 'Under review', tone: 'info', marker: '◑' },
  compliant: { label: 'Compliant', tone: 'success', marker: '✓' },
  non_compliant: { label: 'Non-compliant', tone: 'destructive', marker: '✕' },
  overdue: { label: 'Overdue', tone: 'destructive', marker: '!' },
  awaiting_verification: { label: 'Awaiting verification', tone: 'warning', marker: '◔' },
};

const INSPECTION: Record<InspectionStatus, StatusDescriptor> = {
  scheduled: { label: 'Scheduled', tone: 'muted', marker: '○' },
  in_progress: { label: 'In progress', tone: 'info', marker: '◑' },
  submitted: { label: 'Submitted', tone: 'info', marker: '◑' },
  under_review: { label: 'Under review', tone: 'warning', marker: '◔' },
  completed: { label: 'Completed', tone: 'success', marker: '✓' },
  cancelled: { label: 'Cancelled', tone: 'muted', marker: '×' },
};

const SAFETY: Record<SafetyRecordStatus, StatusDescriptor> = {
  open: { label: 'Open', tone: 'destructive', marker: '○' },
  under_investigation: { label: 'Under investigation', tone: 'warning', marker: '◔' },
  action_assigned: { label: 'Action assigned', tone: 'info', marker: '◑' },
  resolved: { label: 'Resolved', tone: 'success', marker: '✓' },
  closed: { label: 'Closed', tone: 'muted', marker: '●' },
};

const CORRECTIVE: Record<CorrectiveActionStatus, StatusDescriptor> = {
  proposed: { label: 'Proposed', tone: 'muted', marker: '○' },
  assigned: { label: 'Assigned', tone: 'info', marker: '◑' },
  in_progress: { label: 'In progress', tone: 'info', marker: '◑' },
  submitted_for_verification: { label: 'Submitted for verification', tone: 'warning', marker: '◔' },
  verified: { label: 'Verified', tone: 'success', marker: '✓' },
  rejected: { label: 'Rejected', tone: 'destructive', marker: '✕' },
  closed: { label: 'Closed', tone: 'muted', marker: '●' },
};

const DOCUMENT: Record<DocumentStatus, StatusDescriptor> = {
  uploaded: { label: 'Uploaded', tone: 'muted', marker: '○' },
  queued: { label: 'Queued', tone: 'info', marker: '◑' },
  processing: { label: 'Processing', tone: 'info', marker: '◑' },
  processed: { label: 'Processed', tone: 'success', marker: '✓' },
  needs_review: { label: 'Needs review', tone: 'warning', marker: '◔' },
  failed: { label: 'Failed', tone: 'destructive', marker: '✕' },
};

const MEASUREMENT: Record<EnvironmentalMeasurement['status'], StatusDescriptor> = {  within_limit: { label: 'Within configured limit', tone: 'success', marker: '✓' },
  exceeds_limit: { label: 'Exceeds configured limit', tone: 'destructive', marker: '!' },
  unknown: { label: 'No configured limit', tone: 'muted', marker: '?' },
};

const ATTENDANCE: Record<AttendanceStatus, StatusDescriptor> = {
  present: { label: 'Present', tone: 'success', marker: '✓' },
  absent: { label: 'Absent', tone: 'destructive', marker: '!' },
  leave: { label: 'Leave', tone: 'info', marker: 'i' },
  half_day: { label: 'Half day', tone: 'warning', marker: '½' },
  not_recorded: { label: 'Not recorded', tone: 'muted', marker: '-' },
};

const CONTRACTOR_COMPLIANCE: Record<Contractor['complianceStatus'], StatusDescriptor> = {
  compliant: { label: 'Compliant', tone: 'success', marker: '✓' },
  non_compliant: { label: 'Non-compliant', tone: 'destructive', marker: '!' },
  under_review: { label: 'Under review', tone: 'warning', marker: '?' },
  unassessed: { label: 'Unassessed', tone: 'muted', marker: '-' },
};

const PRIORITY: Record<Priority, StatusDescriptor> = {  low: { label: 'Low', tone: 'muted', marker: '·' },
  medium: { label: 'Medium', tone: 'info', marker: '◔' },
  high: { label: 'High', tone: 'warning', marker: '▲' },
  critical: { label: 'Critical', tone: 'destructive', marker: '⬤' },
};

const RISK: Record<RiskLevel, StatusDescriptor> = {
  low: { label: 'Low risk', tone: 'success', marker: '✓' },
  moderate: { label: 'Moderate risk', tone: 'info', marker: '◔' },
  elevated: { label: 'Elevated risk', tone: 'warning', marker: '▲' },
  high: { label: 'High risk', tone: 'warning', marker: '▲' },
  critical: { label: 'Critical risk', tone: 'destructive', marker: '⬤' },
};

const VERIFICATION: Record<VerificationStatus, StatusDescriptor> = {
  not_required: { label: 'Verification not required', tone: 'muted', marker: '–' },
  pending: { label: 'Verification pending', tone: 'warning', marker: '◔' },
  verified: { label: 'Verified', tone: 'success', marker: '✓' },
  rejected: { label: 'Verification rejected', tone: 'destructive', marker: '✕' },
};

const VIOLATION: Record<ViolationStatus, StatusDescriptor> = {
  open: { label: 'Open', tone: 'destructive', marker: '○' },
  under_remediation: { label: 'Under remediation', tone: 'warning', marker: '◑' },
  awaiting_verification: { label: 'Awaiting verification', tone: 'info', marker: '◔' },
  closed: { label: 'Closed', tone: 'success', marker: '✓' },
};

const DESCRIPTORS = {
  compliance: COMPLIANCE,
  inspection: INSPECTION,
  safety: SAFETY,
  corrective_action: CORRECTIVE,
  document: DOCUMENT,
  measurement: MEASUREMENT,
  contractor_compliance: CONTRACTOR_COMPLIANCE,
  attendance: ATTENDANCE,
  priority: PRIORITY,
  risk: RISK,
  verification: VERIFICATION,
  violation: VIOLATION,
} as const;

export type StatusDomain = keyof typeof DESCRIPTORS;

export interface StatusBadgeProps {
  domain: StatusDomain;
  value: string;
  className?: string;
  showMarker?: boolean;
}

/**
 * Renders a status as a labelled, colour-coded badge.
 * The text label (and optional glyph) ensure the status is never communicated
 * by colour alone.
 */
export function StatusBadge({ domain, value, className, showMarker = true }: StatusBadgeProps) {
  const table = DESCRIPTORS[domain] as Record<string, StatusDescriptor | undefined>;
  const descriptor = table[value] ?? { label: humanise(value), tone: 'outline' as Tone };
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium',
        toneClasses(descriptor.tone),
        className,
      )}
    >
      {showMarker && descriptor.marker && (
        <span aria-hidden="true" className="text-[10px] leading-none">
          {descriptor.marker}
        </span>
      )}
      {descriptor.label}
    </span>
  );
}

function toneClasses(tone: Tone): string {
  switch (tone) {
    case 'success':
      return 'border-transparent bg-success/12 text-success';
    case 'warning':
      return 'border-transparent bg-warning/15 text-warning-strong';
    case 'destructive':
      return 'border-transparent bg-destructive/12 text-destructive';
    case 'info':
      return 'border-transparent bg-info/12 text-info';
    case 'muted':
      return 'border-transparent bg-muted text-muted-foreground';
    case 'outline':
      return 'border-border text-foreground';
    default:
      return 'border-transparent bg-primary/10 text-primary';
  }
}

function humanise(value: string): string {
  return value
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
