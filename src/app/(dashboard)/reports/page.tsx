'use client';

import * as React from 'react';
import { Download, FileText, Info, Plus } from 'lucide-react';
import type { ColumnDef, SortingState } from '@tanstack/react-table';
import { toast } from 'sonner';

import { DataTable } from '@/components/data-display/data-table';
import { DetailList, SectionCard } from '@/components/data-display/detail-list';
import { FilterBar, FilterSelect } from '@/components/data-display/filter-bar';
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
import {
  CheckboxGroupInput,
  DateInput,
  FormErrorSummary,
  FormProvider,
  SelectInput,
  TextInput,
  useZodForm,
} from '@/components/forms/form';
import { ListPage } from '@/components/shared/page-shell';
import { PermissionGate } from '@/components/shared/permission-gate';
import { ProvenanceNote } from '@/components/shared/provenance-note';
import { useApiQuery, useServices } from '@/lib/api/use-services';
import { useAppMutation } from '@/lib/hooks/use-app-mutation';
import { useListData, useListQueryState } from '@/lib/hooks/use-list-query';
import { useMineOptions } from '@/lib/hooks/use-mine-options';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import {
  REPORT_CATEGORY_LABELS,
  REPORT_CATEGORY_OPTIONS,
  REPORT_FORMAT_LABELS,
  REPORT_FORMAT_OPTIONS,
  REPORT_GROUP_BY_LABELS,
  REPORT_GROUP_BY_OPTIONS,
  REPORT_STATUS_LABELS,
  REPORT_STATUS_OPTIONS,
} from '@/lib/domain/reference';
import { formatDateTime } from '@/lib/formatting/dates';
import { normaliseError } from '@/lib/errors/normalise';
import { downloadTextFile, safeFileName } from '@/lib/export/csv';
import {
  reportRequestSchema,
  type ReportRequestFormOutput,
  type ReportRequestFormValues,
} from '@/lib/validation/schemas';
import type { ReportDefinition, ReportJob, ReportRequest } from '@/types';

type ReportRow = ReportJob;

function statusVariant(status: ReportJob['status']): 'success' | 'warning' | 'destructive' | 'muted' {
  if (status === 'ready') return 'success';
  if (status === 'processing' || status === 'queued') return 'warning';
  if (status === 'failed') return 'destructive';
  return 'muted';
}

const EMPTY_VALUES: ReportRequestFormValues = {
  category: 'statutory_compliance',
  title: '',
  mineIds: [],
  dateFrom: '',
  dateTo: '',
  format: 'csv',
  groupBy: 'none',
};

export default function ReportsPage() {
  const services = useServices();
  const [state, update, reset] = useListQueryState({ pageSize: 20 });
  const [searchInput, setSearchInput] = React.useState('');
  const debouncedSearch = useDebouncedValue(searchInput, 300);
  const [generateOpen, setGenerateOpen] = React.useState(false);
  const [presetCategory, setPresetCategory] = React.useState<ReportDefinition['category'] | null>(
    null,
  );
  const [detailJob, setDetailJob] = React.useState<ReportJob | null>(null);
  const [downloadingId, setDownloadingId] = React.useState<string | null>(null);

  React.useEffect(() => {
    update({ search: debouncedSearch });
  }, [debouncedSearch, update]);

  const jobsQuery = useListData<ReportRow>('reports', state, (query) => services.reports.list(query));
  const catalogue = useApiQuery(['reports', 'catalogue'], () => services.reports.catalogue());

  const rows = jobsQuery.data?.items ?? [];
  const meta = jobsQuery.data?.meta;

  const sorting: SortingState = state.sortBy
    ? [{ id: state.sortBy, desc: state.sortDir === 'desc' }]
    : [];

  const handleDownload = React.useCallback(
    async (job: ReportJob) => {
      setDownloadingId(job.id);
      try {
        const csv = await services.reports.csv(job.id);
        const baseName = safeFileName(job.request.title || job.fileName || `report-${job.id}`);
        downloadTextFile(csv, `${baseName}.csv`);
        toast.success('Report downloaded as CSV');
      } catch (error) {
        toast.error('The report could not be downloaded', {
          description: normaliseError(error).message,
        });
      } finally {
        setDownloadingId(null);
      }
    },
    [services],
  );

  const columns = React.useMemo<ColumnDef<ReportRow, unknown>[]>(
    () => [
      {
        id: 'title',
        header: 'Report',
        accessorFn: (row) => row.request.title,
        enableSorting: true,
        meta: { label: 'Report' },
        cell: ({ row }) => (
          <div className="min-w-0">
            <button
              type="button"
              onClick={() => setDetailJob(row.original)}
              className="text-left font-medium underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {row.original.request.title}
            </button>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {REPORT_CATEGORY_LABELS[row.original.request.category]}
            </p>
          </div>
        ),
      },
      {
        id: 'status',
        accessorKey: 'status',
        header: 'Status',
        enableSorting: true,
        meta: { label: 'Status' },
        cell: ({ row }) => (
          <Badge variant={statusVariant(row.original.status)}>
            {REPORT_STATUS_LABELS[row.original.status]}
          </Badge>
        ),
      },
      {
        id: 'range',
        header: 'Period',
        enableSorting: false,
        meta: { label: 'Period' },
        cell: ({ row }) => (
          <span className="text-xs tabular-nums">
            {row.original.request.dateFrom} to {row.original.request.dateTo}
          </span>
        ),
      },
      {
        id: 'format',
        header: 'Requested format',
        enableSorting: false,
        meta: { label: 'Format' },
        cell: ({ row }) => (
          <span className="text-xs">{row.original.request.format.toUpperCase()}</span>
        ),
      },
      {
        id: 'rowCount',
        accessorKey: 'rowCount',
        header: 'Rows',
        enableSorting: true,
        meta: { label: 'Rows', secondary: true },
        cell: ({ row }) => (
          <span className="text-xs tabular-nums">
            {row.original.rowCount !== undefined ? row.original.rowCount : 'Not yet counted'}
          </span>
        ),
      },
      {
        id: 'createdAt',
        accessorKey: 'createdAt',
        header: 'Requested',
        enableSorting: true,
        meta: { label: 'Requested', secondary: true },
        cell: ({ row }) => (
          <span className="text-xs tabular-nums">{formatDateTime(row.original.createdAt)}</span>
        ),
      },
      {
        id: 'actions',
        header: 'Actions',
        enableSorting: false,
        meta: { label: 'Actions' },
        cell: ({ row }) => (
          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDetailJob(row.original)}
              aria-label={`View details for ${row.original.request.title}`}
            >
              Details
            </Button>
            <PermissionGate permission="report.download" showFallback={false}>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void handleDownload(row.original)}
                loading={downloadingId === row.original.id}
                loadingLabel="Preparing"
                disabled={row.original.status !== 'ready'}
                aria-label={`Download ${row.original.request.title} as CSV`}
              >
                <Download className="h-3.5 w-3.5" aria-hidden="true" />
                CSV
              </Button>
            </PermissionGate>
          </div>
        ),
      },
    ],
    [downloadingId, handleDownload],
  );

  return (
    <ListPage
      title="Reporting centre"
      description="Generate a report from stored records, track what has been requested and download the produced payload. Report definitions are served by the reporting service; the interface does not invent report content."
      headerActions={
        <PermissionGate permission="report.generate" showFallback={false}>
          <Button
            size="sm"
            onClick={() => {
              setPresetCategory(null);
              setGenerateOpen(true);
            }}
          >
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            Generate report
          </Button>
        </PermissionGate>
      }
      toolbar={
        <FilterBar
          searchValue={searchInput}
          onSearchChange={setSearchInput}
          searchPlaceholder="Search report title"
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
            label="Status"
            value={state.filters.status ?? 'all'}
            onValueChange={(value) => update({ filters: { ...state.filters, status: value } })}
            options={REPORT_STATUS_OPTIONS}
            allLabel="All statuses"
          />
          <FilterSelect
            label="Category"
            value={state.filters.category ?? 'all'}
            onValueChange={(value) => update({ filters: { ...state.filters, category: value } })}
            options={REPORT_CATEGORY_OPTIONS}
            allLabel="All categories"
          />
        </FilterBar>
      }
    >
      <ProvenanceNote tone="neutral" label="How reports are produced">
        A report job is recorded with the exact request that produced it. Downloads are generated from the
        current records at download time, so a report reflects the data as it stands, not a frozen snapshot.
        This environment serves a CSV payload for every request; PDF and XLSX rendering require the reporting
        service to be connected.
      </ProvenanceNote>

      <SectionCard
        title="Available report definitions"
        description="Each definition lists the columns the reporting service returns and the groupings it supports."
      >
        {catalogue.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading report catalogue...</p>
        ) : catalogue.error ? (
          <div className="space-y-2">
            <p className="text-sm text-destructive">{catalogue.error.message}</p>
            <Button variant="outline" size="sm" onClick={() => void catalogue.refetch()}>
              Try again
            </Button>
          </div>
        ) : (catalogue.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">
            The reporting service has not published any report definitions.
          </p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {(catalogue.data ?? []).map((definition) => (
              <div
                key={definition.category}
                className="flex flex-col rounded-lg border border-border/80 p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium">{definition.name}</p>
                  <Badge variant="outline">{definition.formats.map((format) => format.toUpperCase()).join(' / ')}</Badge>
                </div>
                <p className="mt-1 flex-1 text-xs text-muted-foreground">{definition.description}</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {definition.columns.length} columns
                  {definition.groupBy.length > 0
                    ? ` / groups: ${definition.groupBy
                        .map((group) => REPORT_GROUP_BY_LABELS[group])
                        .join(', ')}`
                    : ''}
                </p>
                <PermissionGate permission="report.generate" showFallback={false}>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2 self-start"
                    onClick={() => {
                      setPresetCategory(definition.category);
                      setGenerateOpen(true);
                    }}
                  >
                    <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                    Use this definition
                  </Button>
                </PermissionGate>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <DataTable<ReportRow>
        columns={columns}
        data={rows}
        getRowId={(row) => row.id}
        caption="Requested reports with status, period, format and download action"
        loading={jobsQuery.isLoading}
        error={jobsQuery.error}
        onRetry={() => void jobsQuery.refetch()}
        emptyTitle="No report has been requested yet"
        emptyDescription="Generate a report from one of the definitions above."
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
        secondaryColumns={['rowCount', 'createdAt']}
        renderMobileCard={(row) => (
          <div className="space-y-1.5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-medium">{row.request.title}</p>
                <p className="text-xs text-muted-foreground">
                  {REPORT_CATEGORY_LABELS[row.request.category]}
                </p>
              </div>
              <Badge variant={statusVariant(row.status)}>{REPORT_STATUS_LABELS[row.status]}</Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              {row.request.dateFrom} to {row.request.dateTo} / {row.request.format.toUpperCase()}
            </p>
            <div className="flex gap-1.5">
              <Button variant="outline" size="sm" onClick={() => setDetailJob(row)}>
                Details
              </Button>
              <PermissionGate permission="report.download" showFallback={false}>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void handleDownload(row)}
                  disabled={row.status !== 'ready'}
                >
                  Download CSV
                </Button>
              </PermissionGate>
            </div>
          </div>
        )}
      />

      <GenerateReportDialog
        open={generateOpen}
        onOpenChange={setGenerateOpen}
        definitions={catalogue.data ?? []}
        presetCategory={presetCategory}
      />

      <Dialog open={detailJob !== null} onOpenChange={(open) => !open && setDetailJob(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{detailJob?.request.title ?? 'Report request'}</DialogTitle>
            <DialogDescription>
              The recorded request, so the report can be reproduced and audited.
            </DialogDescription>
          </DialogHeader>
          {detailJob && (
            <>
              <DetailList
                columns={2}
                items={[
                  { label: 'Status', value: REPORT_STATUS_LABELS[detailJob.status] },
                  {
                    label: 'Category',
                    value: REPORT_CATEGORY_LABELS[detailJob.request.category],
                  },
                  { label: 'Period', value: `${detailJob.request.dateFrom} to ${detailJob.request.dateTo}` },
                  {
                    label: 'Requested format',
                    value: REPORT_FORMAT_LABELS[detailJob.request.format],
                  },
                  {
                    label: 'Grouping',
                    value: REPORT_GROUP_BY_LABELS[detailJob.request.groupBy ?? 'none'],
                  },
                  {
                    label: 'Mines',
                    value:
                      detailJob.request.mineIds.length === 0
                        ? 'All mines in scope'
                        : `${detailJob.request.mineIds.length} selected`,
                  },
                  { label: 'Requested at', value: formatDateTime(detailJob.createdAt) },
                  {
                    label: 'Completed at',
                    value: detailJob.completedAt ? formatDateTime(detailJob.completedAt) : 'Not completed',
                  },
                  {
                    label: 'Rows produced',
                    value:
                      detailJob.rowCount !== undefined ? detailJob.rowCount : 'Counted at download',
                  },
                  { label: 'File name', value: detailJob.fileName ?? 'Not assigned' },
                ]}
              />
              {detailJob.status === 'ready' && (
                <p className="flex items-start gap-2 rounded-md border border-border/80 bg-accent/40 p-2 text-xs text-muted-foreground">
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  The download is produced when you request it. If the underlying records change between two
                  downloads, the two files will differ.
                </p>
              )}
              {detailJob.error && (
                <p className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-sm text-destructive">
                  {detailJob.error}
                </p>
              )}
            </>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailJob(null)}>
              Close
            </Button>
            {detailJob && detailJob.status === 'ready' && (
              <PermissionGate permission="report.download" showFallback={false}>
                <Button
                  onClick={() => void handleDownload(detailJob)}
                  loading={downloadingId === detailJob.id}
                  loadingLabel="Preparing"
                >
                  <Download className="h-3.5 w-3.5" aria-hidden="true" />
                  Download CSV
                </Button>
              </PermissionGate>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ListPage>
  );
}

function GenerateReportDialog({
  open,
  onOpenChange,
  definitions,
  presetCategory,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  definitions: ReportDefinition[];
  presetCategory: ReportDefinition['category'] | null;
}) {
  const services = useServices();
  const { options: mineOptions } = useMineOptions();

  const form = useZodForm<ReportRequestFormValues>({
    schema: reportRequestSchema,
    defaultValues: EMPTY_VALUES,
  });

  React.useEffect(() => {
    if (!open) return;
    form.reset({ ...EMPTY_VALUES, category: presetCategory ?? EMPTY_VALUES.category });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, presetCategory]);

  const mutation = useAppMutation({
    mutationFn: async (values: ReportRequestFormValues) => {
      const parsed: ReportRequestFormOutput = reportRequestSchema.parse(values);
      const request: ReportRequest = {
        category: parsed.category,
        title: parsed.title,
        mineIds: parsed.mineIds,
        subsidiaryIds: [],
        dateFrom: parsed.dateFrom,
        dateTo: parsed.dateTo,
        statusFilters: [],
        format: parsed.format,
        groupBy: parsed.groupBy,
      };
      return services.reports.generate(request);
    },
    successMessage: (job) => `Report "${job.request.title}" was generated.`,
    invalidates: [['reports', 'list'], ['audit', 'list'], ['notifications', 'unread']],
    onSuccess: () => onOpenChange(false),
  });

  const selectedDefinition = definitions.find(
    (definition) => definition.category === form.watch('category'),
  );

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await mutation.mutateAsync(values);
    } catch {
      // The mutation wrapper reports the failure; the form keeps its values.
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Generate a report</DialogTitle>
          <DialogDescription>
            The report is built from records that fall inside the selected period. Leave the mine selection
            empty to cover every mine in your scope.
          </DialogDescription>
        </DialogHeader>

        <FormProvider form={form}>
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            <FormErrorSummary form={form} />

            <SelectInput
              name="category"
              label="Report definition"
              required
              options={definitions.map((definition) => ({
                value: definition.category,
                label: REPORT_CATEGORY_LABELS[definition.category],
              }))}
              description={
                selectedDefinition
                  ? selectedDefinition.description
                  : 'The definitions are served by the reporting service.'
              }
            />

            <TextInput
              name="title"
              label="Report title"
              required
              placeholder="e.g. Compliance status - Q3 review"
              description="Shown in the report register and used as the download file name."
            />

            <div className="grid gap-3 sm:grid-cols-2">
              <DateInput name="dateFrom" label="Period start" required />
              <DateInput name="dateTo" label="Period end" required />
            </div>

            <CheckboxGroupInput
              name="mineIds"
              label="Mines (optional)"
              options={mineOptions}
              description="Select none to include every mine in your scope."
              emptyLabel="No mine is available in your current scope."
            />

            <div className="grid gap-3 sm:grid-cols-2">
              <SelectInput
                name="format"
                label="Requested format"
                required
                options={
                  selectedDefinition
                    ? REPORT_FORMAT_OPTIONS.filter((option) =>
                        selectedDefinition.formats.includes(option.value),
                      )
                    : REPORT_FORMAT_OPTIONS
                }
              />
              <SelectInput
                name="groupBy"
                label="Grouping"
                options={
                  selectedDefinition
                    ? REPORT_GROUP_BY_OPTIONS.filter((option) =>
                        selectedDefinition.groupBy.includes(option.value),
                      )
                    : REPORT_GROUP_BY_OPTIONS
                }
              />
            </div>

            <p className="text-xs text-muted-foreground">
              Requesting a PDF or XLSX records that preference on the job. This environment still returns a CSV
              payload until the rendering service is connected.
            </p>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={mutation.isPending}>
                Generate report
              </Button>
            </DialogFooter>
          </form>
        </FormProvider>
      </DialogContent>
    </Dialog>
  );
}
