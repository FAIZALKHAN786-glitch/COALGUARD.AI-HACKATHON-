'use client';

import * as React from 'react';
import Link from 'next/link';
import type { ColumnDef, SortingState } from '@tanstack/react-table';

import { DataTable } from '@/components/data-display/data-table';
import { FilterBar, FilterSelect } from '@/components/data-display/filter-bar';
import { SectionCard } from '@/components/data-display/detail-list';
import { StatusBadge } from '@/components/data-display/status-badge';
import { EChart } from '@/components/charts/echarts';
import { ExportButton } from '@/components/shared/export-button';
import { ListPage } from '@/components/shared/page-shell';
import { ProvenanceNote } from '@/components/shared/provenance-note';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useApiQuery, useServices } from '@/lib/api/use-services';
import { useListData, useListQueryState } from '@/lib/hooks/use-list-query';
import { useMineOptions } from '@/lib/hooks/use-mine-options';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import {
  INSIGHT_CATEGORY_LABELS,
  INSIGHT_CATEGORY_OPTIONS,
  INSIGHT_REVIEW_STATUS_LABELS,
  INSIGHT_REVIEW_STATUS_OPTIONS,
  RISK_LEVEL_LABELS,
  RISK_LEVEL_OPTIONS,
} from '@/lib/domain/reference';
import { formatDateTime } from '@/lib/formatting/dates';
import { formatPercent } from '@/lib/formatting/numbers';
import type { AiInsight, RiskLevel } from '@/types';

type InsightRow = AiInsight & { mineName?: string };

const RISK_COLOURS: Record<RiskLevel, string> = {
  low: '#2f7d54',
  moderate: '#8a9a2f',
  elevated: '#c98a12',
  high: '#c2551f',
  critical: '#a32b2b',
};

export default function AnalyticsPage() {
  const services = useServices();
  const [state, update, reset] = useListQueryState({ pageSize: 20 });
  const [searchInput, setSearchInput] = React.useState('');
  const debouncedSearch = useDebouncedValue(searchInput, 300);

  const { options: mineOptions } = useMineOptions();

  React.useEffect(() => {
    update({ search: debouncedSearch });
  }, [debouncedSearch, update]);

  const query = useListData<InsightRow>('analytics', state, (listQuery) =>
    services.analytics.insights(listQuery),
  );
  const distribution = useApiQuery(['analytics', 'risk-distribution'], () =>
    services.analytics.riskDistribution(),
  );

  const rows = query.data?.items ?? [];
  const meta = query.data?.meta;

  const sorting: SortingState = state.sortBy
    ? [{ id: state.sortBy, desc: state.sortDir === 'desc' }]
    : [];

  const columns = React.useMemo<ColumnDef<InsightRow, unknown>[]>(
    () => [
      {
        id: 'title',
        header: 'Insight',
        accessorKey: 'title',
        enableSorting: true,
        meta: { label: 'Insight' },
        cell: ({ row }) => (
          <div className="min-w-0">
            <Link
              href={`/analytics/${row.original.id}`}
              className="font-medium underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {row.original.title}
            </Link>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {row.original.code} · {INSIGHT_CATEGORY_LABELS[row.original.category]}
            </p>
          </div>
        ),
      },
      {
        id: 'riskLevel',
        header: 'Risk level',
        accessorKey: 'riskLevel',
        enableSorting: true,
        meta: { label: 'Risk level' },
        cell: ({ row }) => <StatusBadge domain="risk" value={row.original.riskLevel} />,
      },
      {
        id: 'mineName',
        header: 'Scope',
        enableSorting: false,
        meta: { label: 'Scope' },
        cell: ({ row }) => (
          <span className="text-xs">{row.original.mineName ?? 'Organisation-wide'}</span>
        ),
      },
      {
        id: 'reviewStatus',
        header: 'Review',
        accessorKey: 'reviewStatus',
        enableSorting: true,
        meta: { label: 'Review' },
        cell: ({ row }) => (
          <Badge variant={row.original.reviewStatus === 'unreviewed' ? 'warning' : 'outline'}>
            {INSIGHT_REVIEW_STATUS_LABELS[row.original.reviewStatus]}
          </Badge>
        ),
      },
      {
        id: 'confidence',
        header: 'Confidence',
        accessorKey: 'confidence',
        enableSorting: true,
        meta: { label: 'Confidence', secondary: true },
        cell: ({ row }) => (
          <span className="text-xs tabular-nums">
            {row.original.confidence !== undefined
              ? formatPercent(row.original.confidence * 100)
              : 'Not reported'}
          </span>
        ),
      },
      {
        id: 'modelSource',
        header: 'Model',
        enableSorting: false,
        meta: { label: 'Model', secondary: true },
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">{row.original.modelSource}</span>
        ),
      },
      {
        id: 'generatedAt',
        header: 'Generated',
        accessorKey: 'generatedAt',
        enableSorting: true,
        meta: { label: 'Generated', secondary: true },
        cell: ({ row }) => (
          <div className="text-xs text-muted-foreground">
            <p className="tabular-nums">{formatDateTime(row.original.generatedAt)}</p>
            {row.original.dataFreshnessHours !== undefined && (
              <p>Data {row.original.dataFreshnessHours}h old</p>
            )}
          </div>
        ),
      },
    ],
    [],
  );

  const levelSeries = distribution.data
    ? (Object.keys(RISK_COLOURS) as RiskLevel[]).map((level) => ({
        name: RISK_LEVEL_LABELS[level],
        value: distribution.data?.levels[level] ?? 0,
        itemStyle: { color: RISK_COLOURS[level] },
      }))
    : [];

  return (
    <ListPage
      title="AI risk analytics"
      description="Signals produced by the configured analytics pipeline. Every insight is a prediction or statistical indicator, never a confirmed violation, and each one states the evidence it was derived from."
      headerActions={
        <ExportButton
          rows={rows}
          fileName="coalguard-ai-insights"
          columns={[
            { key: 'code', label: 'Insight code', value: (row) => row.code },
            { key: 'title', label: 'Title', value: (row) => row.title },
            { key: 'category', label: 'Category', value: (row) => INSIGHT_CATEGORY_LABELS[row.category] },
            { key: 'risk', label: 'Risk level', value: (row) => RISK_LEVEL_LABELS[row.riskLevel] },
            { key: 'scope', label: 'Scope', value: (row) => row.mineName ?? 'Organisation-wide' },
            { key: 'review', label: 'Review status', value: (row) => INSIGHT_REVIEW_STATUS_LABELS[row.reviewStatus] },
            { key: 'model', label: 'Model source', value: (row) => row.modelSource },
            { key: 'generated', label: 'Generated at', value: (row) => row.generatedAt },
            {
              key: 'confidence',
              label: 'Confidence',
              value: (row) => (row.confidence !== undefined ? String(row.confidence) : ''),
            },
            { key: 'explanation', label: 'Explanation', value: (row) => row.explanation },
          ]}
        />
      }
      toolbar={
        <FilterBar
          searchValue={searchInput}
          onSearchChange={setSearchInput}
          searchPlaceholder="Search insights by title or explanation"
          onReset={() => {
            setSearchInput('');
            reset();
          }}
          resultCount={
            meta
              ? {
                  from: meta.total === 0 ? 0 : (meta.page - 1) * meta.pageSize + 1,
                  to: Math.min(meta.total, meta.page * meta.pageSize),
                  total: meta.total,
                }
              : undefined
          }
        >
          <FilterSelect
            label="Category"
            value={state.filters.category ?? 'all'}
            onValueChange={(value) => update({ filters: { ...state.filters, category: value } })}
            options={INSIGHT_CATEGORY_OPTIONS}
            allLabel="All categories"
          />
          <FilterSelect
            label="Risk level"
            value={state.filters.riskLevel ?? 'all'}
            onValueChange={(value) => update({ filters: { ...state.filters, riskLevel: value } })}
            options={RISK_LEVEL_OPTIONS}
            allLabel="All levels"
          />
          <FilterSelect
            label="Review"
            value={state.filters.reviewStatus ?? 'all'}
            onValueChange={(value) => update({ filters: { ...state.filters, reviewStatus: value } })}
            options={INSIGHT_REVIEW_STATUS_OPTIONS}
            allLabel="Any review status"
          />
          <FilterSelect
            label="Mine"
            value={state.filters.mineId ?? 'all'}
            onValueChange={(value) => update({ filters: { ...state.filters, mineId: value } })}
            options={mineOptions}
            allLabel="All mines"
          />
        </FilterBar>
      }
    >
      <ProvenanceNote tone="warning" label="AI provenance">
        Insights are produced by the model or rule named against each record. They are decision support only: no
        insight is a finding of non-compliance, and none changes a record&apos;s status automatically. Every
        insight must be reviewed by a person.
      </ProvenanceNote>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard
          title="Insights by risk level"
          description="Count of insights currently held, grouped by the pipeline's risk banding."
        >
          {distribution.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading distribution…</p>
          ) : distribution.error ? (
            <div className="space-y-2">
              <p className="text-sm text-destructive">{distribution.error.message}</p>
              <Button variant="outline" size="sm" onClick={() => void distribution.refetch()}>
                Try again
              </Button>
            </div>
          ) : levelSeries.every((entry) => entry.value === 0) ? (
            <p className="text-sm text-muted-foreground">No insight has been generated yet.</p>
          ) : (
            <EChart
              ariaLabel="Bar chart of insight counts by risk level"
              height={240}
              option={{
                grid: { left: 48, right: 24, top: 16, bottom: 32 },
                tooltip: { trigger: 'axis' },
                xAxis: { type: 'category', data: levelSeries.map((entry) => entry.name), axisLabel: { fontSize: 10 } },
                yAxis: { type: 'value', minInterval: 1, axisLabel: { fontSize: 10 } },
                series: [
                  {
                    type: 'bar',
                    data: levelSeries.map((entry) => ({
                      value: entry.value,
                      itemStyle: entry.itemStyle,
                    })),
                    itemStyle: { borderRadius: [3, 3, 0, 0] },
                  },
                ],
              }}
            />
          )}
        </SectionCard>

        <SectionCard
          title="Highest-risk mines"
          description="Average risk weight of the insights attributed to each mine."
        >
          {distribution.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (distribution.data?.byMine ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No mine currently has an insight contributing to a risk score.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="sr-only">Mine risk score derived from insight risk levels</caption>
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th scope="col" className="py-2 pr-3 font-medium">
                      Mine
                    </th>
                    <th scope="col" className="py-2 pr-3 font-medium">
                      Score
                    </th>
                    <th scope="col" className="py-2 font-medium">
                      Band
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {(distribution.data?.byMine ?? []).slice(0, 8).map((entry) => (
                    <tr key={entry.mineId} className="border-b border-border/60 last:border-0">
                      <td className="py-2 pr-3">
                        <Link href={`/mines/${entry.mineId}`} className="underline-offset-2 hover:underline">
                          {entry.mineName}
                        </Link>
                      </td>
                      <td className="py-2 pr-3 tabular-nums">{entry.score.toFixed(2)}</td>
                      <td className="py-2">
                        <StatusBadge domain="risk" value={entry.level as RiskLevel} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            Score is the mean of the risk weights of insights for the mine. It is a summary of the model output,
            not an audit score.
          </p>
        </SectionCard>
      </div>

      <DataTable<InsightRow>
        columns={columns}
        data={rows}
        getRowId={(row) => row.id}
        caption="AI insights with category, risk level and review status"
        loading={query.isLoading}
        error={query.error}
        onRetry={() => void query.refetch()}
        emptyTitle="No insights match the current filters"
        emptyDescription="Adjust the filters, or wait for the analytics pipeline to generate insights."
        page={meta?.page ?? state.page}
        pageSize={meta?.pageSize ?? state.pageSize}
        total={meta?.total ?? rows.length}
        onPageChange={(page) => update({ page })}
        onPageSizeChange={(pageSize) => update({ pageSize })}
        sorting={sorting}
        onSortingChange={(next) => {
          const first = next[0];
          update({ sortBy: first?.id ?? '', sortDir: first?.desc ? 'desc' : 'asc' });
        }}
        secondaryColumns={['confidence', 'modelSource', 'generatedAt']}
        renderMobileCard={(row) => (
          <div className="space-y-1.5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <Link href={`/analytics/${row.id}`} className="font-medium underline-offset-2 hover:underline">
                  {row.title}
                </Link>
                <p className="text-xs text-muted-foreground">{INSIGHT_CATEGORY_LABELS[row.category]}</p>
              </div>
              <StatusBadge domain="risk" value={row.riskLevel} />
            </div>
            <p className="text-xs text-muted-foreground">
              {row.mineName ?? 'Organisation-wide'} · {INSIGHT_REVIEW_STATUS_LABELS[row.reviewStatus]}
            </p>
          </div>
        )}
      />
    </ListPage>
  );
}
