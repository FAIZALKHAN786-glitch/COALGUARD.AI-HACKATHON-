'use client';

import * as React from 'react';
import Link from 'next/link';
import { CheckCircle2, Plus } from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';

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
import { useMineOptions, useUserOptions } from '@/lib/hooks/use-mine-options';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import {
  PRIORITY_LABELS,
  PRODUCTION_VALUE_KIND_LABELS,
  PRODUCTION_VALUE_KIND_OPTIONS,
  SHIFT_LABELS,
  SHIFT_OPTIONS,
} from '@/lib/domain/reference';
import { formatDate, formatDateTime } from '@/lib/formatting/dates';
import { formatPercent, formatTonnes } from '@/lib/formatting/numbers';
import { productionSchema, type ProductionFormValues } from '@/lib/validation/schemas';
import type { ProductionRecord } from '@/types';

type ProductionRow = ProductionRecord & { mineName?: string; anomalyCount?: number };

export default function ProductionPage() {
  const services = useServices();
  const [state, update, reset] = useListQueryState({ pageSize: 20 });
  const [searchInput, setSearchInput] = React.useState('');
  const debouncedSearch = useDebouncedValue(searchInput, 300);
  const [createOpen, setCreateOpen] = React.useState(false);

  const { options: mineOptions, mines } = useMineOptions();

  React.useEffect(() => {
    update({ search: debouncedSearch });
  }, [debouncedSearch, update]);

  const query = useListData<ProductionRow>('production', state, (listQuery) =>
    services.production.list(listQuery),
  );
  const anomalies = useApiQuery(['production', 'anomalies'], () =>
    services.production.anomalies({ pageSize: 50 }),
  );
  const completeness = useApiQuery(['production', 'completeness'], () => services.production.completeness());

  const rows = React.useMemo(() => query.data?.items ?? [], [query.data]);
  const meta = query.data?.meta;

  const approveMutation = useAppMutation({
    mutationFn: (id: string) => services.production.approve(id),
    successMessage: (record) => `Dispatch for ${formatDate(record.date)} approved.`,
    invalidates: [['production', 'list'], ['production', 'anomalies'], ['dashboard'], ['audit', 'list']],
  });

  const columns = React.useMemo<ColumnDef<ProductionRow, unknown>[]>(
    () => [
      {
        id: 'date',
        header: 'Shift',
        accessorKey: 'date',
        enableSorting: true,
        meta: { label: 'Shift' },
        cell: ({ row }) => (
          <div>
            <p className="text-sm font-medium tabular-nums">{formatDate(row.original.date)}</p>
            <p className="text-xs text-muted-foreground">{SHIFT_LABELS[row.original.shift]} shift</p>
          </div>
        ),
      },
      {
        id: 'mineName',
        header: 'Mine',
        enableSorting: false,
        meta: { label: 'Mine' },
        cell: ({ row }) => <span className="text-xs">{row.original.mineName ?? '—'}</span>,
      },
      {
        id: 'productionTonnes',
        header: 'Produced',
        accessorKey: 'productionTonnes',
        enableSorting: true,
        meta: { label: 'Produced' },
        cell: ({ row }) => (
          <span className="text-sm tabular-nums">{formatTonnes(row.original.productionTonnes)}</span>
        ),
      },
      {
        id: 'targetTonnes',
        header: 'Target',
        accessorKey: 'targetTonnes',
        enableSorting: true,
        meta: { label: 'Target' },
        cell: ({ row }) => (
          <span className="text-xs tabular-nums text-muted-foreground">
            {row.original.targetTonnes !== undefined ? formatTonnes(row.original.targetTonnes) : 'No target'}
          </span>
        ),
      },
      {
        id: 'valueKind',
        header: 'Value basis',
        accessorKey: 'valueKind',
        enableSorting: true,
        meta: { label: 'Value basis' },
        cell: ({ row }) => (
          <div className="flex flex-col gap-1">
            <Badge variant={row.original.valueKind === 'approved' ? 'success' : row.original.valueKind === 'estimated' ? 'warning' : 'info'}>
              {PRODUCTION_VALUE_KIND_LABELS[row.original.valueKind]}
            </Badge>
            {row.original.estimateReason && (
              <span className="text-[11px] text-muted-foreground">{row.original.estimateReason}</span>
            )}
          </div>
        ),
      },
      {
        id: 'anomalyCount',
        header: 'Anomalies',
        enableSorting: false,
        meta: { label: 'Anomalies', secondary: true },
        cell: ({ row }) => (
          <span className="text-xs tabular-nums">
            {row.original.anomalyIds.length > 0 ? (
              <span className="font-medium text-warning-strong">{row.original.anomalyIds.length}</span>
            ) : (
              '0'
            )}
          </span>
        ),
      },
      {
        id: 'approve',
        header: 'Action',
        enableSorting: false,
        meta: { label: 'Action', secondary: true },
        cell: ({ row }) =>
          row.original.valueKind === 'approved' ? (
            <span className="inline-flex items-center gap-1 text-xs text-success">
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
              Approved
            </span>
          ) : (
            <PermissionGate permission="production.approve" showFallback={false}>
              <Button
                variant="outline"
                size="sm"
                loading={approveMutation.isPending}
                onClick={() => approveMutation.mutate(row.original.id)}
              >
                Approve
              </Button>
            </PermissionGate>
          ),
      },
    ],
    [approveMutation],
  );

  const trendSeries = React.useMemo(() => {
    const byDate = new Map<string, number>();
    for (const row of rows) {
      byDate.set(row.date, (byDate.get(row.date) ?? 0) + row.productionTonnes);
    }
    return Array.from(byDate.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [rows]);

  return (
    <ListPage
      title="Production"
      description="Dispatch reporting against the targets configured for each mine, with completeness of the reporting grid and detected anomalies. Estimated values are labelled and can never be approved silently."
      headerActions={
        <>
          <ExportButton
            rows={rows}
            fileName="coalguard-production"
            columns={[
              { key: 'date', label: 'Date', value: (row) => row.date },
              { key: 'mine', label: 'Mine', value: (row) => row.mineName ?? '' },
              { key: 'shift', label: 'Shift', value: (row) => SHIFT_LABELS[row.shift] },
              { key: 'produced', label: 'Produced (t)', value: (row) => String(row.productionTonnes) },
              {
                key: 'target',
                label: 'Target (t)',
                value: (row) => (row.targetTonnes !== undefined ? String(row.targetTonnes) : ''),
              },
              {
                key: 'kind',
                label: 'Value basis',
                value: (row) => PRODUCTION_VALUE_KIND_LABELS[row.valueKind],
              },
              { key: 'estimateReason', label: 'Estimate reason', value: (row) => row.estimateReason ?? '' },
              { key: 'anomalies', label: 'Anomalies', value: (row) => String(row.anomalyIds.length) },
            ]}
          />
          <PermissionGate permission="production.create" showFallback={false}>
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              Record dispatch
            </Button>
          </PermissionGate>
        </>
      }
      toolbar={
        <FilterBar
          searchValue={searchInput}
          onSearchChange={setSearchInput}
          searchPlaceholder="Search production records"
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
            label="Mine"
            value={state.filters.mineId ?? 'all'}
            onValueChange={(value) => update({ filters: { ...state.filters, mineId: value } })}
            options={mineOptions}
            allLabel="All mines"
          />
          <FilterSelect
            label="Shift"
            value={state.filters.shift ?? 'all'}
            onValueChange={(value) => update({ filters: { ...state.filters, shift: value } })}
            options={SHIFT_OPTIONS}
            allLabel="All shifts"
          />
          <FilterSelect
            label="Value basis"
            value={state.filters.valueKind ?? 'all'}
            onValueChange={(value) => update({ filters: { ...state.filters, valueKind: value } })}
            options={PRODUCTION_VALUE_KIND_OPTIONS}
            allLabel="Any basis"
          />
        </FilterBar>
      }
    >
      {trendSeries.length >= 2 && (
        <SectionCard
          title="Tonnage by date"
          description="Sum of the records on this page, grouped by date. Not an organisation-wide total."
        >
          <EChart
            ariaLabel="Production tonnage by date for the records shown"
            height={260}
            option={{
              grid: { left: 56, right: 24, top: 24, bottom: 48 },
              tooltip: { trigger: 'axis' },
              xAxis: {
                type: 'category',
                data: trendSeries.map(([date]) => formatDate(date)),
                axisLabel: { fontSize: 10, rotate: 30 },
              },
              yAxis: { type: 'value', name: 'tonnes', nameTextStyle: { fontSize: 10 }, axisLabel: { fontSize: 10 } },
              series: [
                {
                  type: 'bar',
                  data: trendSeries.map(([, value]) => value),
                  itemStyle: { borderRadius: [3, 3, 0, 0] },
                },
              ],
            }}
          />
        </SectionCard>
      )}

      <DataTable<ProductionRow>
        columns={columns}
        data={rows}
        getRowId={(row) => row.id}
        caption="Production records with shift, tonnage, target and value basis"
        loading={query.isLoading}
        error={query.error}
        onRetry={() => void query.refetch()}
        emptyTitle="No production records match the current filters"
        emptyDescription="Adjust the filters, or record a dispatch entry."
        page={meta?.page ?? state.page}
        pageSize={meta?.pageSize ?? state.pageSize}
        total={meta?.total ?? rows.length}
        onPageChange={(page) => update({ page })}
        onPageSizeChange={(pageSize) => update({ pageSize })}
        secondaryColumns={['anomalyCount', 'approve']}
        renderMobileCard={(row) => (
          <div className="space-y-1.5">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-medium tabular-nums">{formatDate(row.date)}</p>
                <p className="text-xs text-muted-foreground">
                  {SHIFT_LABELS[row.shift]} shift · {row.mineName ?? '—'}
                </p>
              </div>
              <Badge variant={row.valueKind === 'approved' ? 'success' : row.valueKind === 'estimated' ? 'warning' : 'info'}>
                {PRODUCTION_VALUE_KIND_LABELS[row.valueKind]}
              </Badge>
            </div>
            <p className="text-xs tabular-nums">
              {formatTonnes(row.productionTonnes)} produced
              {row.targetTonnes !== undefined ? ` of ${formatTonnes(row.targetTonnes)} target` : ''}
            </p>
          </div>
        )}
      />

      <SectionCard
        title="Reporting completeness"
        description="How many shift records were reported against the expected number for each mine."
      >
        {completeness.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading completeness…</p>
        ) : completeness.error ? (
          <div className="space-y-2">
            <p className="text-sm text-destructive">{completeness.error.message}</p>
            <Button variant="outline" size="sm" onClick={() => void completeness.refetch()}>
              Try again
            </Button>
          </div>
        ) : (completeness.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No completeness data is available.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">Production reporting completeness by mine</caption>
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th scope="col" className="py-2 pr-3 font-medium">
                    Mine
                  </th>
                  <th scope="col" className="py-2 pr-3 font-medium">
                    Expected
                  </th>
                  <th scope="col" className="py-2 pr-3 font-medium">
                    Reported
                  </th>
                  <th scope="col" className="py-2 pr-3 font-medium">
                    Missing
                  </th>
                  <th scope="col" className="py-2 font-medium">
                    Completeness
                  </th>
                </tr>
              </thead>
              <tbody>
                {(completeness.data ?? []).map((row) => (
                  <tr key={row.mineId} className="border-b border-border/60 last:border-0">
                    <td className="py-2 pr-3">
                      <Link href={`/mines/${row.mineId}`} className="underline-offset-2 hover:underline">
                        {mines.find((mine) => mine.id === row.mineId)?.name ?? row.mineId}
                      </Link>
                    </td>
                    <td className="py-2 pr-3 tabular-nums">{row.expectedRecords}</td>
                    <td className="py-2 pr-3 tabular-nums">{row.reportedRecords}</td>
                    <td className="py-2 pr-3 tabular-nums">
                      {row.missingShifts > 0 ? (
                        <span className="font-medium text-warning-strong">{row.missingShifts}</span>
                      ) : (
                        row.missingShifts
                      )}
                    </td>
                    <td className="py-2 tabular-nums">
                      {formatPercent(row.completenessPercent)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="Detected anomalies"
        description="Deviations flagged by the configured detector. Each record names the detector that produced it."
      >
        {anomalies.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading anomalies…</p>
        ) : anomalies.error ? (
          <div className="space-y-2">
            <p className="text-sm text-destructive">{anomalies.error.message}</p>
            <Button variant="outline" size="sm" onClick={() => void anomalies.refetch()}>
              Try again
            </Button>
          </div>
        ) : (anomalies.data?.items ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No anomalies have been detected.</p>
        ) : (
          <ul className="space-y-3">
            {(anomalies.data?.items ?? []).map((anomaly) => (
              <li key={anomaly.id} className="rounded-md border border-border/80 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">
                      {anomaly.metric} — {anomaly.direction === 'above' ? 'above' : 'below'} expected
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(anomaly.date)} · detected {formatDateTime(anomaly.detectedAt)} ·{' '}
                      {anomaly.detector}
                      {anomaly.zScore !== undefined ? ` · z=${anomaly.zScore}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge domain="priority" value={anomaly.severity} />
                    <Badge variant="outline">{anomaly.reviewStatus.replace(/_/g, ' ')}</Badge>
                  </div>
                </div>
                <p className="mt-2 text-sm">{anomaly.explanation}</p>
              </li>
            ))}
          </ul>
        )}
        <ProvenanceNote className="mt-3" tone="neutral" label="Anomaly detection">
          Anomalies are statistical or rule-based signals, not findings of misconduct. Priority reflects the
          detector&apos;s configured severity, not an assessment of fault.
        </ProvenanceNote>
      </SectionCard>

      <RecordDispatchDialog open={createOpen} onOpenChange={setCreateOpen} mineOptions={mineOptions} />
    </ListPage>
  );
}

function RecordDispatchDialog({
  open,
  onOpenChange,
  mineOptions,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mineOptions: { value: string; label: string }[];
}) {
  const services = useServices();
  const { options: userOptions } = useUserOptions();

  const emptyValues: ProductionFormValues = {
    mineId: '',
    date: '',
    shift: 'day',
    productionTonnes: '' as unknown as number,
    targetTonnes: '' as unknown as number,
    valueKind: 'reported',
    estimateReason: '',
    shiftSupervisorId: '',
    notes: '',
  };

  const form = useZodForm<ProductionFormValues>({ schema: productionSchema, defaultValues: emptyValues });

  React.useEffect(() => {
    if (open) form.reset(emptyValues);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const valueKind = form.watch('valueKind');

  const mutation = useAppMutation({
    mutationFn: async (values: ProductionFormValues) => {
      const parsed = productionSchema.parse(values);
      return services.production.create({
        mineId: parsed.mineId,
        date: parsed.date,
        shift: parsed.shift,
        productionTonnes: parsed.productionTonnes,
        targetTonnes: parsed.targetTonnes,
        valueKind: parsed.valueKind,
        estimateReason: parsed.estimateReason,
        shiftSupervisorId: parsed.shiftSupervisorId,
        notes: parsed.notes,
      });
    },
    successMessage: (record) => `Dispatch for ${formatDate(record.date)} recorded.`,
    invalidates: [['production', 'list'], ['production', 'completeness'], ['dashboard'], ['audit', 'list']],
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
          <DialogTitle>Record a dispatch entry</DialogTitle>
          <DialogDescription>
            Reported figures are entered by the shift supervisor. If the value is an estimate, a written reason is
            mandatory and the record cannot be approved until it is replaced by a reported figure.
          </DialogDescription>
        </DialogHeader>

        <FormProvider form={form}>
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            <FormErrorSummary form={form} />

            <SelectInput name="mineId" label="Mine" required options={mineOptions} placeholder="Select a mine" />

            <div className="grid gap-3 sm:grid-cols-2">
              <TextInput name="date" label="Dispatched on" type="date" required />
              <SelectInput name="shift" label="Shift" required options={SHIFT_OPTIONS} />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <NumberInput name="productionTonnes" label="Produced (tonnes)" min={0} step={0.01} required />
              <NumberInput
                name="targetTonnes"
                label="Target (tonnes)"
                min={0}
                step={0.01}
                description="Optional. Only where a target is configured for the mine."
              />
            </div>

            <SelectInput name="valueKind" label="Value basis" required options={PRODUCTION_VALUE_KIND_OPTIONS} />

            {valueKind === 'estimated' && (
              <TextAreaInput
                name="estimateReason"
                label="Reason for the estimate"
                required
                rows={2}
                description="Required when the value is an estimate."
              />
            )}

            <SelectInput
              name="shiftSupervisorId"
              label="Shift supervisor"
              options={userOptions}
              placeholder="Not recorded"
            />

            <TextAreaInput name="notes" label="Notes" rows={2} />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={mutation.isPending}>
                Record dispatch
              </Button>
            </DialogFooter>
          </form>
        </FormProvider>
      </DialogContent>
    </Dialog>
  );
}
