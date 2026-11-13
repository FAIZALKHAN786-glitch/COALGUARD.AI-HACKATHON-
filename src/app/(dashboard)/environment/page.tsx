'use client';

import * as React from 'react';
import { Plus } from 'lucide-react';
import type { ColumnDef, SortingState } from '@tanstack/react-table';

import { DataTable } from '@/components/data-display/data-table';
import { FilterBar, FilterSelect } from '@/components/data-display/filter-bar';
import { SectionCard } from '@/components/data-display/detail-list';
import { StatusBadge } from '@/components/data-display/status-badge';
import { EChart } from '@/components/charts/echarts';
import { ExportButton } from '@/components/shared/export-button';
import { ListPage } from '@/components/shared/page-shell';
import { PermissionGate } from '@/components/shared/permission-gate';
import { ProvenanceNote } from '@/components/shared/provenance-note';
import {
  FormErrorSummary,
  FormProvider,
  NumberInput,
  SelectInput,
  TextAreaInput,
  TextInput,
  useZodForm,
} from '@/components/forms/form';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useApiQuery, useServices } from '@/lib/api/use-services';
import { applyServerFieldErrors } from '@/lib/errors/normalise';
import { useAppMutation } from '@/lib/hooks/use-app-mutation';
import { useListData, useListQueryState } from '@/lib/hooks/use-list-query';
import { useMineOptions } from '@/lib/hooks/use-mine-options';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import {
  ENVIRONMENTAL_INDICATOR_LABELS,
  ENVIRONMENTAL_INDICATOR_OPTIONS,
  MEASUREMENT_SOURCE_LABELS,
  MEASUREMENT_SOURCE_OPTIONS,
  MEASUREMENT_STATUS_LABELS,
} from '@/lib/domain/reference';
import { formatDateTime } from '@/lib/formatting/dates';
import { measurementSchema, type MeasurementFormValues } from '@/lib/validation/schemas';
import type { EnvironmentalMeasurement } from '@/types';

type MeasurementRow = EnvironmentalMeasurement & { mineName?: string; indicatorLabel?: string };

export default function EnvironmentPage() {
  const services = useServices();
  const [state, update, reset] = useListQueryState({ pageSize: 20 });
  const [searchInput, setSearchInput] = React.useState('');
  const debouncedSearch = useDebouncedValue(searchInput, 300);
  const [createOpen, setCreateOpen] = React.useState(false);

  const { options: mineOptions } = useMineOptions();
  const thresholds = useApiQuery(['environment', 'thresholds'], () => services.environment.thresholds());

  React.useEffect(() => {
    update({ search: debouncedSearch });
  }, [debouncedSearch, update]);

  const query = useListData<MeasurementRow>('environment', state, (listQuery) =>
    services.environment.measurements(listQuery),
  );

  const rows = React.useMemo(() => query.data?.items ?? [], [query.data]);
  const meta = query.data?.meta;

  const exceeded = rows.filter((row) => row.status === 'exceeds_limit').length;
  const stale = rows.filter((row) => row.stale).length;

  const sorting: SortingState = state.sortBy
    ? [{ id: state.sortBy, desc: state.sortDir === 'desc' }]
    : [];

  const trend = React.useMemo(() => {
    const focusIndicator = state.filters.indicator as string | undefined;
    if (!focusIndicator) return null;
    const points = rows
      .filter((row) => row.indicator === focusIndicator)
      .slice()
      .sort((a, b) => a.measuredAt.localeCompare(b.measuredAt));
    if (points.length < 2) return null;
    const threshold = thresholds.data?.thresholds.find((entry) => entry.indicator === focusIndicator);
    return { points, threshold };
  }, [rows, state.filters.indicator, thresholds.data]);

  const columns = React.useMemo<ColumnDef<MeasurementRow, unknown>[]>(
    () => [
      {
        id: 'indicator',
        header: 'Indicator',
        accessorKey: 'indicator',
        enableSorting: true,
        meta: { label: 'Indicator' },
        cell: ({ row }) => (
          <div>
            <p className="text-sm font-medium">{ENVIRONMENTAL_INDICATOR_LABELS[row.original.indicator]}</p>
            <p className="text-xs text-muted-foreground">{row.original.mineName ?? '—'}</p>
          </div>
        ),
      },
      {
        id: 'value',
        header: 'Reading',
        accessorKey: 'value',
        enableSorting: true,
        meta: { label: 'Reading' },
        cell: ({ row }) => (
          <span className="text-sm tabular-nums">
            {row.original.value} {row.original.unit}
          </span>
        ),
      },
      {
        id: 'status',
        header: 'Against threshold',
        accessorKey: 'status',
        enableSorting: true,
        meta: { label: 'Against threshold' },
        cell: ({ row }) => (
          <div className="flex items-center gap-1.5">
            <StatusBadge domain="measurement" value={row.original.status} />
            {row.original.stale && <Badge variant="muted">Stale</Badge>}
          </div>
        ),
      },
      {
        id: 'source',
        header: 'Source',
        accessorKey: 'source',
        enableSorting: true,
        meta: { label: 'Source', secondary: true },
        cell: ({ row }) => (
          <span className="text-xs">{MEASUREMENT_SOURCE_LABELS[row.original.source]}</span>
        ),
      },
      {
        id: 'measuredAt',
        header: 'Measured at',
        accessorKey: 'measuredAt',
        enableSorting: true,
        meta: { label: 'Measured at' },
        cell: ({ row }) => (
          <span className="text-xs tabular-nums">{formatDateTime(row.original.measuredAt)}</span>
        ),
      },
      {
        id: 'location',
        header: 'Location',
        enableSorting: false,
        meta: { label: 'Location', secondary: true },
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">
            {row.original.locationDescription ?? (row.original.location ? 'Coordinate recorded' : 'Not recorded')}
          </span>
        ),
      },
    ],
    [],
  );

  return (
    <ListPage
      title="Environment"
      description="Monitoring readings evaluated against the threshold register configured for your organisation. Readings are never compared with a limit the platform invented."
      headerActions={
        <>
          <ExportButton
            rows={rows}
            fileName="coalguard-environment-readings"
            columns={[
              { key: 'indicator', label: 'Indicator', value: (row) => ENVIRONMENTAL_INDICATOR_LABELS[row.indicator] },
              { key: 'mine', label: 'Mine', value: (row) => row.mineName ?? '' },
              { key: 'value', label: 'Value', value: (row) => String(row.value) },
              { key: 'unit', label: 'Unit', value: (row) => row.unit },
              { key: 'status', label: 'Status', value: (row) => MEASUREMENT_STATUS_LABELS[row.status] },
              { key: 'source', label: 'Source', value: (row) => MEASUREMENT_SOURCE_LABELS[row.source] },
              { key: 'measured', label: 'Measured at', value: (row) => row.measuredAt },
              { key: 'stale', label: 'Stale', value: (row) => (row.stale ? 'yes' : 'no') },
            ]}
          />
          <PermissionGate permission="environment.create" showFallback={false}>
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              Record reading
            </Button>
          </PermissionGate>
        </>
      }
      toolbar={
        <FilterBar
          searchValue={searchInput}
          onSearchChange={setSearchInput}
          searchPlaceholder="Search by indicator, mine or sample"
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
            label="Indicator"
            value={state.filters.indicator ?? 'all'}
            onValueChange={(value) => update({ filters: { ...state.filters, indicator: value } })}
            options={ENVIRONMENTAL_INDICATOR_OPTIONS}
            allLabel="All indicators"
          />
          <FilterSelect
            label="Status"
            value={state.filters.status ?? 'all'}
            onValueChange={(value) => update({ filters: { ...state.filters, status: value } })}
            options={[
              { value: 'within_limit', label: 'Within limit' },
              { value: 'exceeds_limit', label: 'Exceeds limit' },
              { value: 'unknown', label: 'Unknown (no threshold)' },
            ]}
            allLabel="All statuses"
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
      <div className="grid gap-3 sm:grid-cols-3">
        <SummaryTile label="Readings loaded" value={String(rows.length)} note="On this page of results" />
        <SummaryTile
          label="Above configured limit"
          value={String(exceeded)}
          note="Requires investigation by the environmental officer"
          tone={exceeded > 0 ? 'danger' : 'neutral'}
        />
        <SummaryTile
          label="Stale readings"
          value={String(stale)}
          note="Not refreshed within the expected cadence"
          tone={stale > 0 ? 'warning' : 'neutral'}
        />
      </div>

      {trend && (
        <SectionCard
          title={`${ENVIRONMENTAL_INDICATOR_LABELS[trend.points[0]!.indicator]} trend`}
          description={`${trend.points.length} reading(s) on this page, oldest first.${
            trend.threshold?.limit !== undefined
              ? ` Configured limit: ${trend.threshold.limit} ${trend.threshold.unit}.`
              : ' No configured limit is available for this indicator.'
          }`}
        >
          <EChart
            ariaLabel={`Trend of ${ENVIRONMENTAL_INDICATOR_LABELS[trend.points[0]!.indicator]} readings`}
            height={260}
            option={{
              grid: { left: 48, right: 24, top: 24, bottom: 48 },
              tooltip: { trigger: 'axis' },
              xAxis: {
                type: 'category',
                data: trend.points.map((point) => formatDateTime(point.measuredAt)),
                axisLabel: { fontSize: 10, rotate: 30 },
              },
              yAxis: {
                type: 'value',
                name: trend.points[0]!.unit,
                nameTextStyle: { fontSize: 10 },
                axisLabel: { fontSize: 10 },
              },
              series: [
                {
                  type: 'line',
                  smooth: true,
                  data: trend.points.map((point) => point.value),
                  symbolSize: 6,
                  ...(trend.threshold?.limit !== undefined
                    ? {
                        markLine: {
                          silent: true,
                          symbol: 'none',
                          label: { formatter: 'Configured limit', fontSize: 10 },
                          lineStyle: { type: 'dashed' },
                          data: [{ yAxis: trend.threshold.limit }],
                        },
                      }
                    : {}),
                },
              ],
            }}
          />
        </SectionCard>
      )}

      <DataTable<MeasurementRow>
        columns={columns}
        data={rows}
        getRowId={(row) => row.id}
        caption="Environmental readings with status against the configured threshold"
        loading={query.isLoading}
        error={query.error}
        onRetry={() => void query.refetch()}
        emptyTitle="No environmental readings match the current filters"
        emptyDescription="Adjust the filters, or record a new reading."
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
        secondaryColumns={['source', 'location']}
        renderMobileCard={(row) => (
          <div className="space-y-1.5">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-medium">
                  {ENVIRONMENTAL_INDICATOR_LABELS[row.indicator]}
                </p>
                <p className="text-xs text-muted-foreground">{row.mineName ?? '—'}</p>
              </div>
              <StatusBadge domain="measurement" value={row.status} />
            </div>
            <p className="text-xs tabular-nums">
              {row.value} {row.unit} · {formatDateTime(row.measuredAt)}
            </p>
          </div>
        )}
      />

      <SectionCard
        title="Threshold register"
        description="The limits used to evaluate every reading above."
      >
        {thresholds.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading the threshold register…</p>
        ) : thresholds.error ? (
          <div className="space-y-2">
            <p className="text-sm text-destructive">{thresholds.error.message}</p>
            <Button variant="outline" size="sm" onClick={() => void thresholds.refetch()}>
              Try again
            </Button>
          </div>
        ) : (
          <>
            {thresholds.data?.provenance && (
              <ProvenanceNote tone="neutral" label="Provenance">
                {thresholds.data.provenance}
              </ProvenanceNote>
            )}
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="sr-only">Configured environmental thresholds</caption>
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th scope="col" className="py-2 pr-3 font-medium">
                      Indicator
                    </th>
                    <th scope="col" className="py-2 pr-3 font-medium">
                      Limit
                    </th>
                    <th scope="col" className="py-2 pr-3 font-medium">
                      Comparison
                    </th>
                    <th scope="col" className="py-2 font-medium">
                      Configured by
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {(thresholds.data?.thresholds ?? []).map((threshold) => (
                    <tr key={threshold.indicator} className="border-b border-border/60 last:border-0">
                      <td className="py-2 pr-3">
                        <p className="font-medium">{threshold.label}</p>
                        <p className="text-xs text-muted-foreground">
                          {ENVIRONMENTAL_INDICATOR_LABELS[threshold.indicator]}
                        </p>
                      </td>
                      <td className="py-2 pr-3 tabular-nums">
                        {threshold.limit !== undefined ? `${threshold.limit} ${threshold.unit}` : 'Not configured'}
                      </td>
                      <td className="py-2 pr-3 text-xs">
                        {threshold.comparison === 'above' ? 'Exceeded when above' : 'Exceeded when below'}
                      </td>
                      <td className="py-2 text-xs text-muted-foreground">
                        {threshold.configuredBy ?? 'Not recorded'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {thresholds.data?.lastConfiguredAt && (
              <p className="mt-3 text-xs text-muted-foreground">
                Register last configured {formatDateTime(thresholds.data.lastConfiguredAt)}.
              </p>
            )}
          </>
        )}
      </SectionCard>

      <RecordReadingDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        mineOptions={mineOptions}
        thresholds={thresholds.data?.thresholds ?? []}
      />
    </ListPage>
  );
}

function SummaryTile({
  label,
  value,
  note,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  note: string;
  tone?: 'neutral' | 'warning' | 'danger';
}) {
  const toneClass =
    tone === 'danger' ? 'text-destructive' : tone === 'warning' ? 'text-warning-strong' : 'text-foreground';
  return (
    <div className="rounded-lg border border-border/80 bg-card p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${toneClass}`}>{value}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{note}</p>
    </div>
  );
}

function RecordReadingDialog({
  open,
  onOpenChange,
  mineOptions,
  thresholds,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mineOptions: { value: string; label: string }[];
  thresholds: { indicator: string; unit: string; limit?: number }[];
}) {
  const services = useServices();

  const emptyValues: MeasurementFormValues = {
    mineId: '',
    indicator: 'air_quality_pm10',
    // The numeric field starts empty so a value is never pre-filled on the
    // officer's behalf; RHF converts the string on change.
    value: '' as unknown as number,
    unit: '',
    measuredAt: '',
    source: 'manual',
    thresholdId: '',
    locationDescription: '',
    sampleId: '',
  };

  const form = useZodForm<MeasurementFormValues>({
    schema: measurementSchema,
    defaultValues: emptyValues,
  });

  React.useEffect(() => {
    if (open) form.reset(emptyValues);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const indicator = form.watch('indicator');
  const activeThreshold = thresholds.find((entry) => entry.indicator === indicator);

  // Keep the unit in step with the configured register for the chosen indicator.
  React.useEffect(() => {
    if (!activeThreshold) return;
    if (form.getValues('unit') === activeThreshold.unit) return;
    form.setValue('unit', activeThreshold.unit);
  }, [activeThreshold, form]);

  const mutation = useAppMutation({
    mutationFn: async (values: MeasurementFormValues) => {
      const parsed = measurementSchema.parse(values);
      return services.environment.createMeasurement({
        mineId: parsed.mineId,
        indicator: parsed.indicator,
        value: parsed.value,
        unit: parsed.unit,
        measuredAt: parsed.measuredAt,
        source: parsed.source,
        thresholdId: parsed.thresholdId,
        locationDescription: parsed.locationDescription,
        sampleId: parsed.sampleId,
        inspectionId: parsed.inspectionId,
        ...(parsed.lat !== undefined && parsed.lng !== undefined
          ? { lat: parsed.lat, lng: parsed.lng, accuracyM: parsed.accuracyM }
          : {}),
      });
    },
    successMessage: (record) => `Reading recorded (${MEASUREMENT_STATUS_LABELS[record.status]}).`,
    invalidates: [['environment', 'list'], ['dashboard'], ['audit', 'list']],
  });

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await mutation.mutateAsync(values);
      onOpenChange(false);
    } catch (error) {
      applyServerFieldErrors(error, form.setError as never);
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Record an environmental reading</DialogTitle>
          <DialogDescription>
            The reading is evaluated against the configured threshold for the chosen indicator. When no threshold
            is configured the status is recorded as unknown — never assumed compliant.
          </DialogDescription>
        </DialogHeader>

        <FormProvider form={form}>
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            <FormErrorSummary form={form} />

            <SelectInput name="mineId" label="Mine" required options={mineOptions} placeholder="Select a mine" />

            <div className="grid gap-3 sm:grid-cols-2">
              <SelectInput
                name="indicator"
                label="Indicator"
                required
                options={ENVIRONMENTAL_INDICATOR_OPTIONS}
              />
              <SelectInput name="source" label="Source" required options={MEASUREMENT_SOURCE_OPTIONS} />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <NumberInput name="value" label="Reading value" step={0.01} required />
              <TextInput
                name="unit"
                label="Unit"
                required
                description={
                  activeThreshold
                    ? `Configured unit for this indicator: ${activeThreshold.unit}.`
                    : 'No threshold is configured for this indicator.'
                }
              />
            </div>

            <TextInput
              name="measuredAt"
              label="Measured at"
              type="datetime-local"
              required
              description="The time the sample was taken, not the time it was entered."
            />

            <TextInput name="sampleId" label="Sample id" />
            <TextInput name="locationDescription" label="Location description" placeholder="e.g. Near weighbridge 2" />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={mutation.isPending}>
                Record reading
              </Button>
            </DialogFooter>
          </form>
        </FormProvider>
      </DialogContent>
    </Dialog>
  );
}
