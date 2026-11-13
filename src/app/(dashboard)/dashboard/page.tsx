'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ClipboardCheck,
  FileWarning,
  Gauge,
  HardHat,
  ListChecks,
  RefreshCw,
  ShieldCheck,
  TrendingUp,
} from 'lucide-react';

import { ComplianceTrendChart, MineComparisonChart, ProductionTrendChart, RiskDistributionChart } from '@/components/charts/governance-charts';
import { StatCard } from '@/components/data-display/stat-card';
import { SectionCard } from '@/components/data-display/detail-list';
import { ErrorState, TableSkeleton } from '@/components/data-display/states';
import { FilterSelect } from '@/components/data-display/filter-bar';
import { ListPage } from '@/components/shared/page-shell';
import { ProvenanceNote } from '@/components/shared/provenance-note';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useApiQuery, useServices } from '@/lib/api/use-services';
import { METRIC_DEFINITIONS } from '@/lib/metrics/dashboard';
import { formatDateTime, formatRelative } from '@/lib/formatting/dates';
import { formatPercent, formatTonnes, ratioPercent } from '@/lib/formatting/numbers';
import { useAppMutation } from '@/lib/hooks/use-app-mutation';
import { useAuth } from '@/lib/auth/AuthProvider';
import { isDevelopmentData } from '@/config/app';
import type { DashboardFilters } from '@/types';

const EMPTY_FILTERS: DashboardFilters = {};

export default function DashboardPage() {
  const services = useServices();
  const { user, can } = useAuth();
  const [filters, setFilters] = React.useState<DashboardFilters>(EMPTY_FILTERS);
  const [autoRefresh, setAutoRefresh] = React.useState(false);

  const summaryQuery = useApiQuery(['dashboard', 'summary', filters], () =>
    services.dashboard.summary(filters),
  );
  const complianceTrend = useApiQuery(['dashboard', 'trend', 'compliance', filters], () =>
    services.dashboard.complianceTrend(filters),
  );
  const productionTrend = useApiQuery(['dashboard', 'trend', 'production', filters], () =>
    services.dashboard.productionTrend(filters),
  );
  const mineComparison = useApiQuery(['dashboard', 'mine-comparison', filters], () =>
    services.dashboard.mineStatusComparison(filters),
  );
  const riskDistribution = useApiQuery(['dashboard', 'risk-distribution', filters], () =>
    services.dashboard.riskByMine(filters),
  );
  const subsidiaries = useApiQuery(['subsidiaries', 'list'], () => services.mines.subsidiaries());
  const mines = useApiQuery(['mines', 'options'], () => services.mines.list({ pageSize: 200 }));

  const refreshAll = React.useCallback(() => {
    void summaryQuery.refetch();
    void complianceTrend.refetch();
    void productionTrend.refetch();
    void mineComparison.refetch();
    void riskDistribution.refetch();
  }, [complianceTrend, mineComparison, productionTrend, riskDistribution, summaryQuery]);

  React.useEffect(() => {
    if (!autoRefresh) return;
    const timer = window.setInterval(refreshAll, 60_000);
    return () => window.clearInterval(timer);
  }, [autoRefresh, refreshAll]);

  const summary = summaryQuery.data;

  const role = user?.role;
  const isInspector = role === 'field_inspector';
  const isManager = role === 'mine_manager' || role === 'mine_admin';
  const isCompliance = role === 'compliance_officer';
  const isSafety = role === 'safety_officer';
  const isEnv = role === 'environmental_officer';
  const isCorporate = role === 'corporate_management';
  const isRegulator = role === 'regulatory_user';
  const isAdmin = role === 'system_admin';

  const subsidiaryOptions = React.useMemo(
    () => (subsidiaries.data ?? []).map((entry) => ({ value: entry.id, label: entry.name })),
    [subsidiaries.data],
  );
  const mineOptions = React.useMemo(
    () =>
      (mines.data?.items ?? [])
        .filter((mine) => !filters.subsidiaryId || mine.subsidiaryId === filters.subsidiaryId)
        .map((mine) => ({ value: mine.id, label: mine.name })),
    [filters.subsidiaryId, mines.data],
  );

  const loading = summaryQuery.isLoading;

  const verificationCoverage = summary
    ? ratioPercent(summary.complianceCompliant + summary.complianceNonCompliant, summary.complianceCompliant + summary.complianceNonCompliant + summary.pendingComplianceRequirements)
    : null;

  const productionAchievement = summary
    ? ratioPercent(summary.productionTonnesMonth, summary.productionTargetMonth ?? 0)
    : null;

  return (
    <ListPage
      title={isInspector ? 'Inspector workspace' : isManager ? 'Mine management workspace' : isCompliance ? 'Compliance workspace' : isSafety ? 'Safety workspace' : isCorporate ? 'Corporate oversight' : isRegulator ? 'Regulatory view' : isAdmin ? 'Platform workspace' : 'Governance dashboard'}
      description={
        isInspector
          ? 'Your assigned inspections, findings, and evidence. Submit for review when complete.'
          : isManager
          ? `Mine-level governance, reviews, and approvals${user ? ` for ${user.title}` : ''}.`
          : isCompliance
          ? 'Compliance register, submissions, verification, and audit readiness.'
          : isSafety
          ? 'Observations, incidents, investigations, and corrective actions.'
          : isCorporate || isRegulator
          ? 'Cross-mine oversight, reports, and analytics within your scope.'
          : isAdmin
          ? 'Platform operations and configuration with scoped access to governance data.'
          : `Organisation-wide compliance, inspection and operational posture${user ? ` for ${user.title}` : ''}. Every figure is computed from the records returned by the active data source.`
      }
      headerMeta={
        summary ? (
          <>
            <span className="text-xs text-muted-foreground">
              Generated {formatRelative(summary.dataFreshness.generatedAt)} ·{' '}
              {formatDateTime(summary.dataFreshness.generatedAt)}
            </span>
            <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              source: {summary.dataFreshness.source}
            </span>
          </>
        ) : null
      }
      headerActions={
        <>
          <div className="flex items-center gap-2 rounded-md border border-border/80 bg-white/70 px-3 py-1.5">
            <Switch
              id="auto-refresh"
              checked={autoRefresh}
              onCheckedChange={setAutoRefresh}
              aria-describedby="auto-refresh-hint"
            />
            <Label htmlFor="auto-refresh" className="text-xs font-normal">
              Refresh every minute
            </Label>
            <span id="auto-refresh-hint" className="sr-only">
              Reloads every dashboard query once a minute while the page is open.
            </span>
          </div>
          <Button variant="outline" size="sm" onClick={refreshAll} loading={summaryQuery.isFetching}>
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            Refresh
          </Button>
        </>
      }
      toolbar={
        (isCorporate || isRegulator || isManager || isAdmin) ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border/80 bg-card p-3">
          <FilterSelect
            label="Subsidiary"
            value={filters.subsidiaryId ?? 'all'}
            onValueChange={(value) =>
              setFilters((previous) => ({
                ...previous,
                subsidiaryId: value === 'all' ? undefined : value,
                mineId: undefined,
              }))
            }
            options={subsidiaryOptions}
            allLabel="All subsidiaries"
          />
          <FilterSelect
            label="Mine"
            value={filters.mineId ?? 'all'}
            onValueChange={(value) =>
              setFilters((previous) => ({ ...previous, mineId: value === 'all' ? undefined : value }))
            }
            options={mineOptions}
            allLabel="All mines"
          />
          <FilterSelect
            label="Operational status"
            value={filters.operationalStatus ?? 'all'}
            onValueChange={(value) =>
              setFilters((previous) => ({
                ...previous,
                operationalStatus:
                  value === 'all' ? undefined : (value as DashboardFilters['operationalStatus']),
              }))
            }
            options={[
              { value: 'operational', label: 'Operational' },
              { value: 'partial', label: 'Partially operational' },
              { value: 'suspended', label: 'Suspended' },
              { value: 'decommissioned', label: 'Decommissioned' },
            ]}
            allLabel="All statuses"
          />
          {Object.keys(filters).length > 0 && (
            <Button variant="ghost" size="sm" onClick={() => setFilters(EMPTY_FILTERS)}>
              Clear filters
            </Button>
          )}
        </div>
        ) : null
      }
    >
      {summaryQuery.error ? (
        <ErrorState
          title="The dashboard summary could not be loaded"
          description={summaryQuery.error.message}
          onRetry={refreshAll}
        />
      ) : null}

      {loading && !summary ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, index) => (
            <div key={index} className="h-28 rounded-lg border border-border/80 bg-card p-4">
              <div className="h-3 w-24 animate-pulse rounded bg-muted" />
              <div className="mt-4 h-6 w-16 animate-pulse rounded bg-muted" />
            </div>
          ))}
        </div>
      ) : summary ? (
        <>
          <section aria-labelledby="compliance-metrics" className="space-y-3">
            <h2 id="compliance-metrics" className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Compliance
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard
                label="Pending requirements"
                value={summary.pendingComplianceRequirements}
                hint={METRIC_DEFINITIONS.pendingComplianceRequirements}
                icon={<ClipboardCheck className="h-4 w-4" aria-hidden="true" />}
                href="/compliance?status=pending_submission"
              />
              <StatCard
                label="Overdue obligations"
                value={summary.overdueComplianceObligations}
                hint={METRIC_DEFINITIONS.overdueComplianceObligations}
                tone={summary.overdueComplianceObligations > 0 ? 'destructive' : 'success'}
                icon={<AlertTriangle className="h-4 w-4" aria-hidden="true" />}
                href="/compliance?status=overdue"
                footer={
                  <p className="text-xs text-muted-foreground">
                    {summary.complianceCompliant} compliant · {summary.complianceNonCompliant} non-compliant
                  </p>
                }
              />
              <StatCard
                label="Awaiting verification"
                value={summary.complianceAwaitingVerification}
                hint={METRIC_DEFINITIONS.complianceAwaitingVerification}
                icon={<ShieldCheck className="h-4 w-4" aria-hidden="true" />}
                href="/compliance?status=awaiting_verification"
                footer={
                  <p className="text-xs text-muted-foreground">
                    Verification coverage {formatPercent(verificationCoverage, 0)}
                  </p>
                }
              />
              <StatCard
                label="Open violations"
                value={summary.openViolations}
                hint={METRIC_DEFINITIONS.openViolations}
                tone={summary.overdueViolations > 0 ? 'destructive' : 'warning'}
                icon={<FileWarning className="h-4 w-4" aria-hidden="true" />}
                footer={
                  <p className="text-xs text-muted-foreground">
                    {summary.overdueViolations} past their recorded response window ·{' '}
                    {summary.totalViolations} recorded in total
                  </p>
                }
              />
            </div>
          </section>

          <section aria-labelledby="operational-metrics" className="space-y-3">
            <h2 id="operational-metrics" className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Operations
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard
                label="Open corrective actions"
                value={summary.openCorrectiveActions}
                hint={METRIC_DEFINITIONS.openCorrectiveActions}
                icon={<ListChecks className="h-4 w-4" aria-hidden="true" />}
                href="/corrective-actions"
                footer={
                  <p className="text-xs text-muted-foreground">
                    {summary.overdueCorrectiveActions} overdue · {summary.correctiveActionsCompleted} verified
                    and closed
                  </p>
                }
              />
              <StatCard
                label="Inspections"
                value={summary.inspectionsCompleted}
                hint={`${METRIC_DEFINITIONS.inspectionsCompleted} ${METRIC_DEFINITIONS.inspectionsScheduled} ${METRIC_DEFINITIONS.inspectionsInProgress}`}
                icon={<ShieldCheck className="h-4 w-4" aria-hidden="true" />}
                href="/inspections"
                footer={
                  <p className="text-xs text-muted-foreground">
                    {summary.inspectionsScheduled} scheduled · {summary.inspectionsInProgress} in flight
                  </p>
                }
              />
              <StatCard
                label="Environmental alerts"
                value={summary.environmentalAlerts}
                hint={METRIC_DEFINITIONS.environmentalAlerts}
                tone={summary.environmentalAlerts > 0 ? 'warning' : 'success'}
                icon={<Gauge className="h-4 w-4" aria-hidden="true" />}
                href="/environment"
              />
              <StatCard
                label="High-priority safety records"
                value={summary.highPrioritySafetyObservations}
                hint={METRIC_DEFINITIONS.highPrioritySafetyObservations}
                tone={summary.highPrioritySafetyObservations > 0 ? 'destructive' : 'success'}
                icon={<AlertTriangle className="h-4 w-4" aria-hidden="true" />}
                href="/safety"
              />
            </div>
          </section>

          <section aria-labelledby="production-metrics" className="space-y-3">
            <h2 id="production-metrics" className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Production &amp; contractors
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard
                label="Reported production this month"
                value={formatTonnes(summary.productionTonnesMonth)}
                hint={METRIC_DEFINITIONS.productionTonnesMonth}
                icon={<TrendingUp className="h-4 w-4" aria-hidden="true" />}
                href="/production"
                footer={
                  summary.productionTargetMonth !== undefined ? (
                    <p className="text-xs text-muted-foreground">
                      {formatPercent(productionAchievement, 1)} of the configured target (
                      {formatTonnes(summary.productionTargetMonth)})
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      No target is configured for the current month.
                    </p>
                  )
                }
              />
              <StatCard
                label="Contractors registered"
                value={summary.contractorsTotal}
                hint={METRIC_DEFINITIONS.contractorsTotal}
                icon={<HardHat className="h-4 w-4" aria-hidden="true" />}
                href="/contractors"
                footer={
                  <p className="text-xs text-muted-foreground">
                    {summary.contractorsNonCompliant} with an unresolved compliance status
                  </p>
                }
              />
              <StatCard
                label="Mines in scope"
                value={summary.totalMines}
                hint={METRIC_DEFINITIONS.totalMines}
                icon={<TrendingUp className="h-4 w-4" aria-hidden="true" />}
                href="/mines"
                footer={
                  <p className="text-xs text-muted-foreground">
                    Across {summary.totalSubsidiaries} subsidiaries
                  </p>
                }
              />
              <StatCard
                label="Outstanding report jobs"
                value={summary.outstandingReports}
                hint={METRIC_DEFINITIONS.outstandingReports}
                icon={<ClipboardCheck className="h-4 w-4" aria-hidden="true" />}
                href="/reports"
                footer={
                  <p className="text-xs text-muted-foreground">
                    Reports that have not completed successfully.
                  </p>
                }
              />
            </div>
          </section>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Compliance verification trend</CardTitle>
              </CardHeader>
              <CardContent>
                <ComplianceTrendChart
                  data={complianceTrend.data ?? []}
                  loading={complianceTrend.isLoading}
                  error={complianceTrend.error}
                  onRetry={() => void complianceTrend.refetch()}
                />
                <ProvenanceNote className="mt-3" label="Method">
                  Buckets are the month of the last verification timestamp recorded on each compliance
                  requirement. Only requirements whose applicable mines fall inside the active filters
                  are counted.
                </ProvenanceNote>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Production against configured target</CardTitle>
              </CardHeader>
              <CardContent>
                <ProductionTrendChart
                  data={productionTrend.data ?? []}
                  loading={productionTrend.isLoading}
                  error={productionTrend.error}
                  onRetry={() => void productionTrend.refetch()}
                />
                <ProvenanceNote className="mt-3" label="Method">
                  Daily totals of reported tonnage. The dashed line is the sum of the configured shift
                  targets; it is absent where no target has been configured.
                </ProvenanceNote>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Compliance score by mine</CardTitle>
              </CardHeader>
              <CardContent>
                <MineComparisonChart
                  data={mineComparison.data ?? []}
                  loading={mineComparison.isLoading}
                  error={mineComparison.error}
                  onRetry={() => void mineComparison.refetch()}
                />
                <ProvenanceNote className="mt-3" label="Method">
                  Score = verified compliant requirements ÷ all requirements applicable to the mine.
                  Mines with no applicable requirements show 0% rather than being hidden.
                </ProvenanceNote>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-sm">AI risk insight distribution</CardTitle>
              </CardHeader>
              <CardContent>
                <RiskDistributionChart
                  levels={riskDistribution.data?.levels ?? {}}
                  loading={riskDistribution.isLoading}
                  error={riskDistribution.error}
                  onRetry={() => void riskDistribution.refetch()}
                />
                <ProvenanceNote className="mt-3" tone="warning" label="Prediction">
                  Risk levels are model or rule outputs, not confirmed violations. They must be reviewed
                  by a responsible officer before any action is taken.
                </ProvenanceNote>
              </CardContent>
            </Card>
          </div>

          <SectionCard
            title="Mines requiring attention"
            description="Lowest compliance scores first, with their outstanding work."
            actions={
              can('mine.view') ? (
                <Button asChild variant="outline" size="sm">
                  <Link href="/mines">Open mine register</Link>
                </Button>
              ) : null
            }
          >
            {mineComparison.isLoading ? (
              <TableSkeleton rows={4} columns={4} />
            ) : (mineComparison.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No mines match the active filters.
              </p>
            ) : (
              <ul className="divide-y divide-border/70">
                {(mineComparison.data ?? []).slice(0, 6).map((entry) => (
                  <li key={entry.mineId} className="flex flex-wrap items-center justify-between gap-3 py-2">
                    <div className="min-w-0">
                      <Link
                        href={`/mines/${entry.mineId}`}
                        className="text-sm font-medium underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {entry.mineName}
                      </Link>
                      <p className="text-xs text-muted-foreground">{entry.subsidiaryName}</p>
                    </div>
                    <div className="flex items-center gap-4 text-xs">
                      <span>
                        <span className="text-muted-foreground">Score </span>
                        <span className="font-semibold tabular-nums">{entry.complianceScore}%</span>
                      </span>
                      <span>
                        <span className="text-muted-foreground">Open actions </span>
                        <span className="font-semibold tabular-nums">{entry.openActions}</span>
                      </span>
                      <span>
                        <span className="text-muted-foreground">Open safety records </span>
                        <span className="font-semibold tabular-nums">{entry.openObservations}</span>
                      </span>
                      <span className="rounded-full border border-border px-2 py-0.5 text-[10px] uppercase tracking-wide">
                        {entry.level === 'at_risk' ? 'At risk' : entry.level === 'watch' ? 'Watch' : 'Healthy'}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>

          <ProvenanceNote tone={isDevelopmentData ? 'warning' : 'info'} label={isDevelopmentData ? 'Demonstration data' : 'Data source'}>
            {isDevelopmentData
              ? 'This dashboard is reading the deterministic development dataset. No production CoalGuard backend is connected, so no figure on this page reflects a real mine.'
              : 'Figures are computed from the live CoalGuard backend for the selected filters. The metric definitions are shown in each card tooltip.'}
          </ProvenanceNote>
        </>
      ) : null}
    </ListPage>
  );
}
