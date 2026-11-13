/**
 * Dashboard metric computation.
 *
 * Every metric exposed by the governance dashboard is computed here from the
 * underlying records, and every metric has an explicit definition that is
 * surfaced in the UI (see `METRIC_DEFINITIONS`).
 */

import { daysUntil, isOverdue, toDateOnly } from '@/lib/formatting/dates';
import type {
  ComplianceRecord,
  CorrectiveAction,
  DashboardFilters,
  DashboardSummary,
  DataSource,
  EnvironmentalMeasurement,
  Inspection,
  Mine,
  ProductionRecord,
  SafetyRecord,
  Violation,
} from '@/types';

export interface MetricInputs {
  mines: Mine[];
  compliance: ComplianceRecord[];
  inspections: Inspection[];
  violations: Violation[];
  correctiveActions: CorrectiveAction[];
  safetyRecords: SafetyRecord[];
  environmental: EnvironmentalMeasurement[];
  production: ProductionRecord[];
  contractorNonCompliantCount: number;
  contractorTotal: number;
  outstandingReports: number;
  source: DataSource;
  generatedAt: string;
  now?: Date;
}

export const METRIC_DEFINITIONS: Record<keyof DashboardSummary, string> = {
  totalMines: 'Mines matching the active filters.',
  totalSubsidiaries: 'Distinct subsidiaries owning the filtered mines.',
  complianceCompliant: 'Compliance requirements verified as compliant.',
  complianceNonCompliant: 'Compliance requirements verified as non-compliant.',
  complianceAwaitingVerification: 'Compliance requirements submitted and waiting for verification.',
  pendingComplianceRequirements: 'Compliance requirements not yet verified (draft, pending submission, submitted or under review).',
  overdueComplianceObligations: 'Compliance requirements whose due date has passed and that are not verified compliant or non-compliant.',
  openViolations: 'Violations that are not closed.',
  overdueViolations: 'Open violations whose response due date has passed.',
  violationsAwaitingVerification: 'Violations submitted for verification and not yet verified.',
  totalViolations: 'All violations recorded, including closed ones.',
  openCorrectiveActions: 'Corrective actions that are not closed.',
  overdueCorrectiveActions: 'Corrective actions that are not closed and whose due date has passed.',
  correctiveActionsCompleted: 'Corrective actions that have been verified and closed.',
  highPrioritySafetyObservations: 'Open safety observations and hazards with high or critical severity.',
  inspectionsCompleted: 'Inspections with a completed status.',
  inspectionsScheduled: 'Inspections scheduled but not yet started.',
  inspectionsInProgress: 'Inspections that are in progress or awaiting review.',
  environmentalAlerts: 'Environmental measurements recorded above or below the configured threshold.',
  contractorsTotal: 'Contractors registered against the filtered mines.',
  contractorsNonCompliant: 'Contractors whose compliance status is non-compliant.',
  outstandingReports: 'Report jobs that have not completed successfully.',
  productionTonnesMonth: 'Tonnes recorded for the current calendar month.',
  productionTargetMonth: 'Configured target tonnes for the current calendar month.',
  dataFreshness: 'Origin and generation time of the data behind this dashboard.',
};

function mineInScope(mine: Mine, filters: DashboardFilters): boolean {
  if (filters.mineId && mine.id !== filters.mineId) return false;
  if (filters.subsidiaryId && mine.subsidiaryId !== filters.subsidiaryId) return false;
  if (filters.region && mine.region !== filters.region) return false;
  if (filters.operationalStatus && mine.operationalStatus !== filters.operationalStatus) return false;
  return true;
}

function inDateWindow(value: string | null | undefined, filters: DashboardFilters): boolean {
  if (!filters.dateFrom && !filters.dateTo) return true;
  if (!value) return false;
  const date = toDateOnly(value);
  if (!date) return false;
  if (filters.dateFrom && date < filters.dateFrom) return false;
  if (filters.dateTo && date > filters.dateTo) return false;
  return true;
}

export function computeDashboardSummary(inputs: MetricInputs, filters: DashboardFilters): DashboardSummary {
  const now = inputs.now ?? new Date();
  const scopedMines = inputs.mines.filter((mine) => mineInScope(mine, filters));
  const scopedMineIds = new Set(scopedMines.map((mine) => mine.id));

  const compliance = inputs.compliance.filter((record) => {
    if (record.applicableMineIds.length && !record.applicableMineIds.some((id) => scopedMineIds.has(id))) return false;
    if (filters.complianceCategory && record.category !== filters.complianceCategory) return false;
    if (!inDateWindow(record.dueDate, filters)) return false;
    return true;
  });

  const inspections = inputs.inspections.filter((inspection) => scopedMineIds.has(inspection.mineId));
  const violations = inputs.violations.filter((violation) => scopedMineIds.has(violation.mineId));
  const actions = inputs.correctiveActions.filter((action) => scopedMineIds.has(action.mineId));
  const safety = inputs.safetyRecords.filter((record) => scopedMineIds.has(record.mineId));
  const environmental = inputs.environmental.filter((record) => scopedMineIds.has(record.mineId));

  const production = inputs.production.filter((record) => scopedMineIds.has(record.mineId));

  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const productionTonnesMonth = production
    .filter((record) => record.date >= monthStart)
    .reduce((total, record) => total + record.productionTonnes, 0);
  const productionTargetMonth = production
    .filter((record) => record.date >= monthStart && record.targetTonnes !== undefined)
    .reduce((total, record) => total + (record.targetTonnes ?? 0), 0);

  const verifiedStatuses = new Set(['compliant', 'non_compliant']);

  return {
    totalMines: scopedMines.length,
    totalSubsidiaries: new Set(scopedMines.map((mine) => mine.subsidiaryId)).size,
    complianceCompliant: compliance.filter((record) => record.status === 'compliant').length,
    complianceNonCompliant: compliance.filter((record) => record.status === 'non_compliant').length,
    complianceAwaitingVerification: compliance.filter((record) => record.status === 'awaiting_verification').length,
    pendingComplianceRequirements: compliance.filter((record) => !verifiedStatuses.has(record.status)).length,
    overdueComplianceObligations: compliance.filter(
      (record) => !verifiedStatuses.has(record.status) && isOverdue(record.dueDate, now),
    ).length,
    openViolations: violations.filter((violation) => violation.status !== 'closed').length,
    overdueViolations: violations.filter(
      (violation) => violation.status !== 'closed' && isOverdue(violation.dueDate, now),
    ).length,
    violationsAwaitingVerification: violations.filter(
      (violation) => violation.status === 'awaiting_verification',
    ).length,
    totalViolations: violations.length,
    openCorrectiveActions: actions.filter((action) => action.status !== 'closed').length,
    overdueCorrectiveActions: actions.filter(
      (action) => action.status !== 'closed' && isOverdue(action.dueDate, now),
    ).length,
    correctiveActionsCompleted: actions.filter((action) => action.status === 'closed').length,
    highPrioritySafetyObservations: safety.filter(
      (record) =>
        record.status !== 'closed' &&
        record.status !== 'resolved' &&
        (record.severity === 'high' || record.severity === 'critical'),
    ).length,
    inspectionsCompleted: inspections.filter((inspection) => inspection.status === 'completed').length,
    inspectionsScheduled: inspections.filter((inspection) => inspection.status === 'scheduled').length,
    inspectionsInProgress: inspections.filter(
      (inspection) => inspection.status === 'in_progress' || inspection.status === 'submitted' || inspection.status === 'under_review',
    ).length,
    environmentalAlerts: environmental.filter((record) => record.status === 'exceeds_limit').length,
    contractorsTotal: inputs.contractorTotal,
    contractorsNonCompliant: inputs.contractorNonCompliantCount,
    outstandingReports: inputs.outstandingReports,
    productionTonnesMonth,
    productionTargetMonth: productionTargetMonth > 0 ? productionTargetMonth : undefined,
    dataFreshness: { generatedAt: inputs.generatedAt, source: inputs.source },
  };
}

/** Compliance status distribution used by the dashboard donut chart. */
export function complianceStatusDistribution(
  records: ComplianceRecord[],
): { label: string; value: number }[] {
  const counts = new Map<string, number>();
  for (const record of records) {
    counts.set(record.status, (counts.get(record.status) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
}

/** Percentage of inspections that reached the completed state. */
export function inspectionCompletionRate(inspections: Inspection[]): number | null {
  const closed = inspections.filter(
    (inspection) => inspection.status === 'completed' || inspection.status === 'cancelled',
  ).length;
  if (inspections.length === 0) return null;
  return (closed / inspections.length) * 100;
}

/** Days remaining until a deadline; null when no deadline is configured. */
export function daysRemaining(dueDate: string | null | undefined, now: Date = new Date()): number | null {
  return daysUntil(dueDate, now);
}
