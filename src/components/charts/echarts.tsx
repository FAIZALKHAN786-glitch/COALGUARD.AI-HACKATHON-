'use client';

import * as React from 'react';
import * as echarts from 'echarts/core';
import { BarChart, LineChart, PieChart } from 'echarts/charts';
import {
  DatasetComponent,
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  TitleComponent,
  TooltipComponent,
  VisualMapComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

import { ErrorState } from '@/components/data-display/states';
import { Skeleton } from '@/components/ui/skeleton';

echarts.use([
  BarChart,
  LineChart,
  PieChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  TitleComponent,
  DatasetComponent,
  MarkLineComponent,
  VisualMapComponent,
  CanvasRenderer,
]);

export interface EChartProps {
  option: echarts.EChartsCoreOption;
  height?: number | string;
  className?: string;
  loading?: boolean;
  error?: Error | null;
  onRetry?: () => void;
  empty?: boolean;
  emptyMessage?: string;
  ariaLabel: string;
  /** Optional test id for automation. */
  testId?: string;
}

/**
 * Lightweight wrapper around Apache ECharts.
 *
 * The chart is only created in the browser (no SSR of the canvas) and is fully
 * disposed on unmount to avoid leaking WebGL/canvas resources.
 */
export function EChart({
  option,
  height = 280,
  className,
  loading,
  error,
  onRetry,
  empty,
  emptyMessage = 'No data available for the current filters.',
  ariaLabel,
  testId,
}: EChartProps) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const chartRef = React.useRef<echarts.ECharts | null>(null);
  const [width, setWidth] = React.useState(0);

  React.useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setWidth(entry.contentRect.width);
    });
    observer.observe(element);
    setWidth(element.clientWidth);
    return () => observer.disconnect();
  }, []);

  React.useEffect(() => {
    const element = containerRef.current;
    if (!element || width === 0) return;
    if (!chartRef.current) {
      chartRef.current = echarts.init(element, undefined, { renderer: 'canvas' });
    }
    chartRef.current.setOption(option, { notMerge: true });
    chartRef.current.resize();
  }, [option, width]);

  React.useEffect(() => {
    return () => {
      chartRef.current?.dispose();
      chartRef.current = null;
    };
  }, []);

  if (error) {
    return (
      <ErrorState
        title="Chart could not be rendered"
        description={error.message}
        onRetry={onRetry}
        className="py-10"
      />
    );
  }

  if (loading) {
    return <Skeleton className="w-full rounded-md" style={{ height: typeof height === 'number' ? `${height}px` : height }} />;
  }

  if (empty) {
    return (
      <div
        className="flex items-center justify-center rounded-md border border-dashed border-border text-sm text-muted-foreground"
        style={{ height: typeof height === 'number' ? `${height}px` : height }}
      >
        {emptyMessage}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      role="img"
      aria-label={ariaLabel}
      data-testid={testId}
      className={className}
      style={{ height: typeof height === 'number' ? `${height}px` : height, width: '100%' }}
    />
  );
}

export { echarts };
