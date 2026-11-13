'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Plus } from 'lucide-react';
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
  NumberInput,
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
  INCIDENT_STATUS_LABELS,
  PRIORITY_LABELS,
  PRIORITY_OPTIONS,
  SAFETY_STATUS_OPTIONS,
} from '@/lib/domain/reference';
import { formatDateTime } from '@/lib/formatting/dates';
import { incidentSchema, type IncidentFormValues } from '@/lib/validation/schemas';
import type { Incident } from '@/types';

type IncidentRow = Incident & { mineName?: string; assigneeName?: string };

export default function IncidentsPage() {
  const services = useServices();
  const router = useRouter();
  const [state, update, reset] = useListQueryState({ pageSize: 20 });
  const [searchInput, setSearchInput] = React.useState('');
  const debouncedSearch = useDebouncedValue(searchInput, 300);
  const [createOpen, setCreateOpen] = React.useState(false);

  const { options: mineOptions } = useMineOptions();
  const { options: userOptions } = useUserOptions();

  React.useEffect(() => {
    update({ search: debouncedSearch });
  }, [debouncedSearch, update]);

  const query = useListData<IncidentRow>('safety:incidents', state, (listQuery) =>
    services.safety.incidents(listQuery),
  );

  const rows = query.data?.items ?? [];
  const meta = query.data?.meta;

  const sorting: SortingState = state.sortBy
    ? [{ id: state.sortBy, desc: state.sortDir === 'desc' }]
    : [];

  const columns = React.useMemo<ColumnDef<IncidentRow, unknown>[]>(
    () => [
      {
        id: 'code',
        header: 'Incident',
        accessorKey: 'code',
        enableSorting: true,
        meta: { label: 'Incident' },
        cell: ({ row }) => (
          <div className="min-w-0">
            <Link
              href={`/safety/incidents/${row.original.id}`}
              className="font-medium underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {row.original.code}
            </Link>
            <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{row.original.title}</p>
          </div>
        ),
      },
      {
        id: 'status',
        header: 'Status',
        accessorKey: 'status',
        enableSorting: true,
        meta: { label: 'Status' },
        cell: ({ row }) => <StatusBadge domain="safety" value={row.original.status} />,
      },
      {
        id: 'severity',
        header: 'Severity',
        accessorKey: 'severity',
        enableSorting: true,
        meta: { label: 'Severity' },
        cell: ({ row }) => <StatusBadge domain="priority" value={row.original.severity} />,
      },
      {
        id: 'injuries',
        header: 'Injuries',
        enableSorting: false,
        meta: { label: 'Injuries' },
        cell: ({ row }) => (
          <span className={`text-xs tabular-nums ${row.original.injuriesReported > 0 ? 'font-medium text-destructive' : ''}`}>
            {row.original.injuriesReported}
          </span>
        ),
      },
      {
        id: 'mineName',
        header: 'Mine',
        enableSorting: false,
        meta: { label: 'Mine', secondary: true },
        cell: ({ row }) => <span className="text-xs">{row.original.mineName ?? '—'}</span>,
      },
      {
        id: 'occurredAt',
        header: 'Occurred',
        accessorKey: 'occurredAt',
        enableSorting: true,
        meta: { label: 'Occurred' },
        cell: ({ row }) => (
          <span className="text-xs tabular-nums">{formatDateTime(row.original.occurredAt)}</span>
        ),
      },
      {
        id: 'downtimeHours',
        header: 'Downtime',
        enableSorting: false,
        meta: { label: 'Downtime', secondary: true },
        cell: ({ row }) => (
          <span className="text-xs tabular-nums">
            {row.original.downtimeHours !== undefined ? `${row.original.downtimeHours} h` : '—'}
          </span>
        ),
      },
    ],
    [],
  );

  return (
    <ListPage
      title="Incidents"
      description="Recorded incidents with injuries, downtime and investigation status. Injury counts are recorded from the report and are never inferred."
      headerActions={
        <>
          <Button asChild variant="outline" size="sm">
            <Link href="/safety">
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
              Safety register
            </Link>
          </Button>
          <ExportButton
            rows={rows}
            fileName="coalguard-incidents"
            columns={[
              { key: 'code', label: 'Incident code', value: (row) => row.code },
              { key: 'title', label: 'Title', value: (row) => row.title },
              { key: 'status', label: 'Status', value: (row) => INCIDENT_STATUS_LABELS[row.status] },
              { key: 'severity', label: 'Severity', value: (row) => PRIORITY_LABELS[row.severity] },
              { key: 'mine', label: 'Mine', value: (row) => row.mineName ?? '' },
              { key: 'occurred', label: 'Occurred at', value: (row) => row.occurredAt },
              { key: 'injuries', label: 'Injuries reported', value: (row) => String(row.injuriesReported) },
              {
                key: 'downtime',
                label: 'Downtime (hours)',
                value: (row) => (row.downtimeHours !== undefined ? String(row.downtimeHours) : ''),
              },
            ]}
          />
          <PermissionGate permission="safety.create" showFallback={false}>
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              Record incident
            </Button>
          </PermissionGate>
        </>
      }
      toolbar={
        <FilterBar
          searchValue={searchInput}
          onSearchChange={setSearchInput}
          searchPlaceholder="Search by incident code or title"
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
            options={SAFETY_STATUS_OPTIONS}
            allLabel="All statuses"
          />
          <FilterSelect
            label="Severity"
            value={state.filters.severity ?? 'all'}
            onValueChange={(value) => update({ filters: { ...state.filters, severity: value } })}
            options={PRIORITY_OPTIONS}
            allLabel="All severities"
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
      <DataTable<IncidentRow>
        columns={columns}
        data={rows}
        getRowId={(row) => row.id}
        caption="Incidents with status, severity, injury count and downtime"
        loading={query.isLoading}
        error={query.error}
        onRetry={() => void query.refetch()}
        emptyTitle="No incidents match the current filters"
        emptyDescription="Adjust the filters, or record a new incident."
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
        secondaryColumns={['mineName', 'downtimeHours']}
        renderMobileCard={(row) => (
          <div className="space-y-1.5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <Link
                  href={`/safety/incidents/${row.id}`}
                  className="font-medium underline-offset-2 hover:underline"
                >
                  {row.code}
                </Link>
                <p className="line-clamp-2 text-xs text-muted-foreground">{row.title}</p>
              </div>
              <StatusBadge domain="safety" value={row.status} />
            </div>
            <p className="text-xs text-muted-foreground">
              {formatDateTime(row.occurredAt)} · {row.injuriesReported} injur
              {row.injuriesReported === 1 ? 'y' : 'ies'} reported
            </p>
          </div>
        )}
      />

      <RecordIncidentDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        mineOptions={mineOptions}
        userOptions={userOptions}
        onCreated={(incident) => router.push(`/safety/incidents/${incident.id}`)}
      />
    </ListPage>
  );
}

function RecordIncidentDialog({
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
  onCreated: (incident: Incident) => void;
}) {
  const services = useServices();

  const emptyValues: IncidentFormValues = {
    mineId: '',
    title: '',
    description: '',
    severity: 'high',
    occurredAt: '',
    injuriesReported: 0,
    locationDescription: '',
    assignedTo: '',
    relatedInspectionId: '',
  };

  const form = useZodForm<IncidentFormValues>({ schema: incidentSchema, defaultValues: emptyValues });

  React.useEffect(() => {
    if (open) form.reset(emptyValues);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const mutation = useAppMutation({
    mutationFn: async (values: IncidentFormValues) => {
      const parsed = incidentSchema.parse(values);
      return services.safety.createIncident({
        mineId: parsed.mineId,
        title: parsed.title,
        description: parsed.description,
        severity: parsed.severity,
        occurredAt: parsed.occurredAt,
        injuriesReported: parsed.injuriesReported,
        downtimeHours: parsed.downtimeHours,
        locationDescription: parsed.locationDescription,
        assignedTo: parsed.assignedTo,
        relatedInspectionId: parsed.relatedInspectionId,
        ...(parsed.lat !== undefined && parsed.lng !== undefined
          ? { lat: parsed.lat, lng: parsed.lng, accuracyM: parsed.accuracyM }
          : {}),
      });
    },
    successMessage: (incident) => `Incident ${incident.code} recorded.`,
    invalidates: [['safety:incidents', 'list'], ['safety', 'list'], ['dashboard'], ['audit', 'list']],
  });

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const incident = await mutation.mutateAsync(values);
      onOpenChange(false);
      onCreated(incident);
    } catch (error) {
      applyServerFieldErrors(error, form.setError as never);
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Record an incident</DialogTitle>
          <DialogDescription>
            Record what is known at the time of reporting. The injury count and downtime are taken from the
            report, not estimated by the platform.
          </DialogDescription>
        </DialogHeader>

        <FormProvider form={form}>
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            <FormErrorSummary form={form} />

            <SelectInput name="mineId" label="Mine" required options={mineOptions} placeholder="Select a mine" />

            <TextInput name="title" label="Title" required placeholder="Short summary" />

            <TextAreaInput name="description" label="Description" required rows={3} />

            <div className="grid gap-3 sm:grid-cols-2">
              <SelectInput name="severity" label="Severity" required options={PRIORITY_OPTIONS} />
              <TextInput
                name="occurredAt"
                label="Occurred at"
                type="datetime-local"
                required
                description="Local time of the incident as reported."
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <NumberInput
                name="injuriesReported"
                label="Injuries reported"
                min={0}
                step={1}
                required
                description="Number of people reported injured. Enter 0 when none."
              />
              <NumberInput
                name="downtimeHours"
                label="Downtime (hours)"
                min={0}
                step={0.5}
                description="Optional. Only if downtime was recorded."
              />
            </div>

            <TextInput name="locationDescription" label="Location description" />

            <SelectInput name="assignedTo" label="Owner" options={userOptions} placeholder="Unassigned" />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={mutation.isPending}>
                Record incident
              </Button>
            </DialogFooter>
          </form>
        </FormProvider>
      </DialogContent>
    </Dialog>
  );
}
