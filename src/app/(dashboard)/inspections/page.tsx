'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import type { ColumnDef, SortingState } from '@tanstack/react-table';

import { DataTable } from '@/components/data-display/data-table';
import { FilterBar, FilterSelect } from '@/components/data-display/filter-bar';
import { StatusBadge } from '@/components/data-display/status-badge';
import { ExportButton } from '@/components/shared/export-button';
import { ListPage } from '@/components/shared/page-shell';
import { PermissionGate } from '@/components/shared/permission-gate';
import {
  FormErrorSummary,
  FormProvider,
  SelectInput,
  TextAreaInput,
  TextInput,
  useZodForm,
} from '@/components/forms/form';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useServices } from '@/lib/api/use-services';
import { applyServerFieldErrors } from '@/lib/errors/normalise';
import { useAppMutation } from '@/lib/hooks/use-app-mutation';
import { useListData, useListQueryState } from '@/lib/hooks/use-list-query';
import { useMineOptions, useUserOptions } from '@/lib/hooks/use-mine-options';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import {
  INSPECTION_STATUS_LABELS,
  INSPECTION_STATUS_OPTIONS,
  INSPECTION_TYPE_LABELS,
  INSPECTION_TYPE_OPTIONS,
} from '@/lib/domain/reference';
import { formatDate, formatDateTime } from '@/lib/formatting/dates';
import { inspectionSchema, type InspectionFormValues } from '@/lib/validation/schemas';
import type { Inspection } from '@/types';

export type InspectionRow = Inspection & {
  mineName?: string;
  inspectorName?: string;
  findingCount?: number;
  violationCount?: number;
};

export default function InspectionsPage() {
  const services = useServices();
  const router = useRouter();
  const [state, update, reset] = useListQueryState({ pageSize: 20 });
  const [searchInput, setSearchInput] = React.useState('');
  const debouncedSearch = useDebouncedValue(searchInput, 300);
  const [createOpen, setCreateOpen] = React.useState(false);

  const { options: mineOptions } = useMineOptions();
  const { options: userOptions } = useUserOptions();

  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const mineId = params.get('mineId');
    if (mineId) update({ filters: { mineId } });
    // Only read the URL once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    update({ search: debouncedSearch });
  }, [debouncedSearch, update]);

  const query = useListData<InspectionRow>('inspections', state, (listQuery) =>
    services.inspections.list(listQuery),
  );

  const rows = query.data?.items ?? [];
  const meta = query.data?.meta;

  const sorting: SortingState = state.sortBy
    ? [{ id: state.sortBy, desc: state.sortDir === 'desc' }]
    : [];

  const columns = React.useMemo<ColumnDef<InspectionRow, unknown>[]>(
    () => [
      {
        id: 'code',
        header: 'Inspection',
        accessorKey: 'code',
        enableSorting: true,
        meta: { label: 'Inspection' },
        cell: ({ row }) => (
          <div>
            <Link
              href={`/inspections/${row.original.id}`}
              className="font-medium underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {row.original.code}
            </Link>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {INSPECTION_TYPE_LABELS[row.original.type]}
            </p>
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
        id: 'status',
        header: 'Status',
        accessorKey: 'status',
        enableSorting: true,
        meta: { label: 'Status' },
        cell: ({ row }) => <StatusBadge domain="inspection" value={row.original.status} />,
      },
      {
        id: 'inspectorName',
        header: 'Inspector',
        enableSorting: false,
        meta: { label: 'Inspector', secondary: true },
        cell: ({ row }) => <span className="text-xs">{row.original.inspectorName ?? '—'}</span>,
      },
      {
        id: 'scheduledDate',
        header: 'Scheduled',
        accessorKey: 'scheduledDate',
        enableSorting: true,
        meta: { label: 'Scheduled' },
        cell: ({ row }) => (
          <div className="text-xs">
            <p className="tabular-nums">{formatDate(row.original.scheduledDate)}</p>
            {row.original.actualDate && (
              <p className="text-muted-foreground">Actual {formatDate(row.original.actualDate)}</p>
            )}
          </div>
        ),
      },
      {
        id: 'findings',
        header: 'Findings',
        enableSorting: false,
        meta: { label: 'Findings', secondary: true },
        cell: ({ row }) => (
          <span className="text-xs tabular-nums">
            {row.original.findingCount ?? row.original.findings.length}
            {row.original.violationCount ? (
              <span className="ml-1 text-destructive">
                ({row.original.violationCount} violation
                {row.original.violationCount === 1 ? '' : 's'})
              </span>
            ) : null}
          </span>
        ),
      },
      {
        id: 'createdAt',
        header: 'Created',
        accessorKey: 'createdAt',
        enableSorting: true,
        meta: { label: 'Created', secondary: true },
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">{formatDateTime(row.original.createdAt)}</span>
        ),
      },
    ],
    [],
  );

  return (
    <ListPage
      title="Inspections"
      description="The inspection lifecycle from scheduling through review and closure, including every recorded finding."
      headerActions={
        <>
          <ExportButton
            rows={rows}
            fileName="coalguard-inspections"
            columns={[
              { key: 'code', label: 'Inspection code', value: (row) => row.code },
              { key: 'mine', label: 'Mine', value: (row) => row.mineName ?? '' },
              { key: 'type', label: 'Type', value: (row) => INSPECTION_TYPE_LABELS[row.type] },
              { key: 'status', label: 'Status', value: (row) => INSPECTION_STATUS_LABELS[row.status] },
              { key: 'inspector', label: 'Inspector', value: (row) => row.inspectorName ?? '' },
              { key: 'scheduled', label: 'Scheduled date', value: (row) => row.scheduledDate },
              { key: 'actual', label: 'Actual date', value: (row) => row.actualDate ?? '' },
              { key: 'findings', label: 'Findings', value: (row) => String(row.findings.length) },
              {
                key: 'violations',
                label: 'Violations',
                value: (row) => String(row.findings.filter((finding) => finding.isViolation).length),
              },
            ]}
          />
          <PermissionGate permission="inspection.create" showFallback={false}>
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              Schedule inspection
            </Button>
          </PermissionGate>
        </>
      }
      toolbar={
        <FilterBar
          searchValue={searchInput}
          onSearchChange={setSearchInput}
          searchPlaceholder="Search by inspection code or scope"
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
            options={INSPECTION_STATUS_OPTIONS}
            allLabel="All statuses"
          />
          <FilterSelect
            label="Type"
            value={state.filters.type ?? 'all'}
            onValueChange={(value) => update({ filters: { ...state.filters, type: value } })}
            options={INSPECTION_TYPE_OPTIONS}
            allLabel="All types"
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
      <DataTable<InspectionRow>
        columns={columns}
        data={rows}
        getRowId={(row) => row.id}
        caption="Inspections with mine, type, status, inspector and findings"
        loading={query.isLoading}
        error={query.error}
        onRetry={() => void query.refetch()}
        emptyTitle="No inspections match the current filters"
        emptyDescription="Adjust the search term or filters, or schedule a new inspection."
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
        secondaryColumns={['inspectorName', 'findings', 'createdAt']}
        renderMobileCard={(row) => (
          <div className="space-y-1.5">
            <div className="flex items-start justify-between gap-2">
              <div>
                <Link href={`/inspections/${row.id}`} className="font-medium underline-offset-2 hover:underline">
                  {row.code}
                </Link>
                <p className="text-xs text-muted-foreground">
                  {INSPECTION_TYPE_LABELS[row.type]} · {row.mineName ?? '—'}
                </p>
              </div>
              <StatusBadge domain="inspection" value={row.status} />
            </div>
            <p className="text-xs text-muted-foreground">
              Scheduled {formatDate(row.scheduledDate)} · {row.findings.length} finding(s)
            </p>
          </div>
        )}
      />

      <ScheduleInspectionDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        mineOptions={mineOptions}
        userOptions={userOptions}
        onCreated={(inspection) => router.push(`/inspections/${inspection.id}`)}
      />
    </ListPage>
  );
}

function ScheduleInspectionDialog({
  open,
  onOpenChange,
  mineOptions,
  userOptions,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mineOptions: { value: string; label: string }[];
  userOptions: { value: string; label: string }[];
  onCreated: (inspection: Inspection) => void;
}) {
  const services = useServices();

  const emptyValues: InspectionFormValues = {
    mineId: '',
    type: 'statutory_safety',
    inspectorId: '',
    scheduledDate: '',
    scope: '',
    complianceRecordIds: [],
  };

  const form = useZodForm<InspectionFormValues>({ schema: inspectionSchema, defaultValues: emptyValues });

  React.useEffect(() => {
    if (open) form.reset(emptyValues);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const mutation = useAppMutation({
    mutationFn: async (values: InspectionFormValues) => {
      const parsed = inspectionSchema.parse(values);
      return services.inspections.create({
        mineId: parsed.mineId,
        type: parsed.type,
        inspectorId: parsed.inspectorId,
        scheduledDate: parsed.scheduledDate,
        scope: parsed.scope,
        complianceRecordIds: parsed.complianceRecordIds ?? [],
      });
    },
    successMessage: (inspection) => `Inspection ${inspection.code} scheduled.`,
    invalidates: [['inspections', 'list'], ['dashboard']],
  });

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const inspection = await mutation.mutateAsync(values);
      onOpenChange(false);
      onCreated(inspection);
    } catch (error) {
      applyServerFieldErrors(error, form.setError as never);
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Schedule an inspection</DialogTitle>
          <DialogDescription>
            The inspection is created in the <em>scheduled</em> state. Findings can be recorded once it moves to
            in-progress.
          </DialogDescription>
        </DialogHeader>

        <FormProvider form={form}>
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            <FormErrorSummary form={form} />

            <SelectInput name="mineId" label="Mine" required options={mineOptions} placeholder="Select a mine" />

            <div className="grid gap-3 sm:grid-cols-2">
              <SelectInput name="type" label="Inspection type" required options={INSPECTION_TYPE_OPTIONS} />
              <TextInput name="scheduledDate" label="Scheduled date" type="date" required />
            </div>

            <SelectInput
              name="inspectorId"
              label="Inspector"
              required
              options={userOptions}
              placeholder="Select an inspector"
            />

            <TextAreaInput
              name="scope"
              label="Scope"
              rows={3}
              description="Optional. Describe what this inspection covers so reviewers can judge completeness."
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={mutation.isPending}>
                Schedule inspection
              </Button>
            </DialogFooter>
          </form>
        </FormProvider>
      </DialogContent>
    </Dialog>
  );
}
