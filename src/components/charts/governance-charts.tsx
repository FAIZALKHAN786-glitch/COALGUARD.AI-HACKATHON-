'use client';

import * as React from 'react';

import { EChart, echarts } from './echarts';

export const CHART_COLOURS = {
  primary: '#B97848',      /* copper */
  secondary: '#688575',    /* mineral sage */
  accent: '#8FA094',       /* lighter sage */
  graphite: '#303934',     /* graphite */
  warning: '#D5A64A',      /* mineral amber */
  danger: '#B7473D',       /* critical danger */
  info: '#688575',         /* mineral sage */
  muted: '#747A74',        /* muted text */
};

export function ComplianceTrendChart({
  data,
  loading,
  error,
  onRetry,
}: {
  data: { label: string; value: number; secondary?: number }[];
  loading?: boolean;
  error?: Error | null;
  onRetry?: () => void;
}) {
  const option = React.useMemo<echarts.EChartsCoreOption>(
    () => ({
      grid: { left: 44, right: 16, top: 36, bottom: 28 },
      tooltip: { trigger: 'axis' },
      legend: { bottom: 0, itemWidth: 12, itemHeight: 8, textStyle: { fontSize: 11 } },
      xAxis: {
        type: 'category',
        data: data.map((point) => point.label),
        axisLabel: { fontSize: 11, color: '#747A74' },
        axisLine: { lineStyle: { color: '#D7D7CF' } },
      },
      yAxis: {
        type: 'value',
        minInterval: 1,
        axisLabel: { fontSize: 11, color: '#747A74' },
        splitLine: { lineStyle: { color: '#E9E7DF' } },
      },
      series: [
        {
          name: 'Verified compliant',
          type: 'bar',
          data: data.map((point) => point.value),
          itemStyle: { color: CHART_COLOURS.primary, borderRadius: [3, 3, 0, 0] },
          barMaxWidth: 26,
        },
        {
          name: 'Verified non-compliant',
          type: 'bar',
          data: data.map((point) => point.secondary ?? 0),
          itemStyle: { color: CHART_COLOURS.danger, borderRadius: [3, 3, 0, 0] },
          barMaxWidth: 26,
        },
      ],
    }),
    [data],
  );

  return (
    <EChart
      option={option}
      height={260}
      loading={loading}
      error={error}
      onRetry={onRetry}
      empty={!loading && !error && data.length === 0}
      ariaLabel="Compliance verification trend by reporting month. Bars show verified compliant and non-compliant requirements."
      testId="compliance-trend-chart"
    />
  );
}

export function ProductionTrendChart({
  data,
  loading,
  error,
  onRetry,
}: {
  data: { label: string; value: number; secondary?: number }[];
  loading?: boolean;
  error?: Error | null;
  onRetry?: () => void;
}) {
  const option = React.useMemo<echarts.EChartsCoreOption>(
    () => ({
      grid: { left: 56, right: 16, top: 36, bottom: 28 },
      tooltip: { trigger: 'axis' },
      legend: { bottom: 0, itemWidth: 12, itemHeight: 8, textStyle: { fontSize: 11 } },
      xAxis: {
        type: 'category',
        data: data.map((point) => point.label),
        axisLabel: { fontSize: 11, color: '#747A74', hideOverlap: true },
        axisLine: { lineStyle: { color: '#D7D7CF' } },
      },
      yAxis: {
        type: 'value',
        name: 'tonnes',
        nameTextStyle: { fontSize: 10, color: '#747A74' },
        axisLabel: { fontSize: 11, color: '#747A74' },
        splitLine: { lineStyle: { color: '#E9E7DF' } },
      },
      series: [
        {
          name: 'Reported production',
          type: 'line',
          smooth: true,
          showSymbol: false,
          data: data.map((point) => point.value),
          lineStyle: { width: 2, color: CHART_COLOURS.primary },
          itemStyle: { color: CHART_COLOURS.primary },
          areaStyle: { color: 'rgba(185,120,72,0.10)' },
        },
        {
          name: 'Configured target',
          type: 'line',
          smooth: true,
          showSymbol: false,
          data: data.map((point) => point.secondary ?? 0),
          lineStyle: { width: 1.5, type: 'dashed', color: CHART_COLOURS.graphite },
          itemStyle: { color: CHART_COLOURS.graphite },
        },
      ],
    }),
    [data],
  );

  return (
    <EChart
      option={option}
      height={260}
      loading={loading}
      error={error}
      onRetry={onRetry}
      empty={!loading && !error && data.length === 0}
      ariaLabel="Production trend showing reported tonnes against the configured target."
      testId="production-trend-chart"
    />
  );
}

export function RiskDistributionChart({
  levels,
  loading,
  error,
  onRetry,
}: {
  levels: Record<string, number>;
  loading?: boolean;
  error?: Error | null;
  onRetry?: () => void;
}) {
  const data = Object.entries(levels).filter(([, value]) => value > 0);
  const option = React.useMemo<echarts.EChartsCoreOption>(
    () => ({
      tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
      legend: { bottom: 0, itemWidth: 10, itemHeight: 8, textStyle: { fontSize: 11 } },
      color: [CHART_COLOURS.accent, CHART_COLOURS.info, CHART_COLOURS.warning, CHART_COLOURS.danger, '#B7473D'],
      series: [
        {
          name: 'Risk level',
          type: 'pie',
          radius: ['46%', '70%'],
          center: ['50%', '44%'],
          avoidLabelOverlap: true,
          itemStyle: { borderColor: '#fff', borderWidth: 2 },
          label: { show: false },
          data: data.map(([name, value]) => ({ name, value })),
        },
      ],
    }),
    [data],
  );

  return (
    <EChart
      option={option}
      height={240}
      loading={loading}
      error={error}
      onRetry={onRetry}
      empty={!loading && !error && data.length === 0}
      emptyMessage="No AI risk insights are available for the current filters."
      ariaLabel="Distribution of AI risk insights by risk level."
      testId="risk-distribution-chart"
    />
  );
}

export function MineComparisonChart({
  data,
  loading,
  error,
  onRetry,
}: {
  data: { mineId: string; mineName: string; complianceScore: number; openActions: number }[];
  loading?: boolean;
  error?: Error | null;
  onRetry?: () => void;
}) {
  const sorted = React.useMemo(() => [...data].sort((a, b) => a.complianceScore - b.complianceScore).slice(0, 10), [data]);
  const option = React.useMemo<echarts.EChartsCoreOption>(
    () => ({
      grid: { left: 130, right: 24, top: 16, bottom: 24 },
      tooltip: {
        trigger: 'axis',
        axisPointer: { type: 'shadow' },
        formatter: (params: unknown) => {
          const list = params as { name: string; value: number }[];
          const first = list[0];
          return first ? `${first.name}: ${first.value}% compliant` : '';
        },
      },
      xAxis: {
        type: 'value',
        max: 100,
        axisLabel: { fontSize: 11, color: '#747A74' },
        splitLine: { lineStyle: { color: '#E9E7DF' } },
      },
      yAxis: {
        type: 'category',
        data: sorted.map((entry) => entry.mineName),
        axisLabel: { fontSize: 11, color: '#303934', width: 120, overflow: 'truncate' },
        axisLine: { show: false },
        axisTick: { show: false },
      },
      series: [
        {
          name: 'Compliance score',
          type: 'bar',
          data: sorted.map((entry) => ({
            value: entry.complianceScore,
            itemStyle: {
              color:
                entry.complianceScore >= 80
                  ? CHART_COLOURS.primary
                  : entry.complianceScore >= 60
                    ? CHART_COLOURS.warning
                    : CHART_COLOURS.danger,
              borderRadius: [0, 3, 3, 0],
            },
          })),
          barMaxWidth: 16,
          label: { show: true, position: 'right', fontSize: 10, formatter: '{c}%' },
        },
      ],
    }),
    [sorted],
  );

  return (
    <EChart
      option={option}
      height={Math.max(220, sorted.length * 30)}
      loading={loading}
      error={error}
      onRetry={onRetry}
      empty={!loading && !error && sorted.length === 0}
      ariaLabel="Compliance score comparison across mines, lowest first."
      testId="mine-comparison-chart"
    />
  );
}
