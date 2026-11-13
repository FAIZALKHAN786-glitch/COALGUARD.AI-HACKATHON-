'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import type { ColumnDef, SortingState } from '@tanstack/react-table';

import { DataTable } from '@/components/data-display/data-table';
import { FilterBar, FilterSelect } from '@/components/data-display/filter-bar';
import { SectionCard } from '@/components/data-display/detail-list';
import { StatusBadge } from '@/components/data-display/status-badge';
import { EmptyState } from '@/components/data-display/states';
import { ExportButton } from '@/components/shared/export-button';
import { ListPage } from '@/components/shared/page-shell';
import { PermissionGate } from '@/components/shared/permission-gate';
import { ProvenanceNote } from '@/components/shared/provenance-note';
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
import { useApiQuery, useServices } from '@/lib/api/use-services';
import { applyServerFieldErrors } from '@/lib/errors/normalise';
import { useAppMutation } from '@/lib/hooks/use-app-mutation';
import { useListData, useListQueryState } from '@/lib/hooks/use-list-query';
import { useMineOptions, useUserOptions } from '@/lib/hooks/use-mine-options';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import {
  PRIORITY_LABELS,
  PRIORITY_OPTIONS,
  SAFETY_RECORD_TYPE_LABELS,
  SAFETY_RECORD_TYPE_OPTIONS,
  SAFETY_STATUS_LABELS,
  SAFETY_STATUS_OPTIONS,
} from '@/lib/domain/reference';
import { formatDateTime } from '@/lib/formatting/dates';
import { safetyRecordSchema, type SafetyRecordFormValues } from '@/lib/validation/schemas';
import type { NearMiss, SafetyRecord } from '@/types';

type SafetyRow = SafetyRecord & { mineName?: string; assigneeName?: string };
type Tab = 'register' | 'near_misses';

export default function SafetyPage() {
  const services = useServices();
  const router = useRouter();
  const [tab, setTab] = React.useState<Tab>('register');
  const [state, update, reset] = useListQueryState({ pageSize: 20 });
  const [searchInput, setSearchInput] = React.useState('');
  const debouncedSearch = useDebouncedValue(searchInput, 300);
  const [createOpen, setCreateOpen] = React.useState(false);

  const { options: mineOptions } = useMineOptions();
  const { options: userOptions } = useUserOptions();

  React.useEffect(() => {
    update({ search: debouncedSearch });
  }, [debouncedSearch, update]);

  const query = useListData<SafetyRow>('safety', state, (listQuery) =>
    services.safety.observations(listQuery),
  );

  const nearMissQuery = useApiQuery(
    ['safety', 'near-misses', { pageSize: 100 }],
    () => services.safety.nearMisses({ pageSize: 100 }),
    { enabled: tab === 'near_misses' },
  );

  const rows = query.data?.items ?? [];
  const meta = query.data?.meta;

  const sorting: SortingState = state.sortBy
    ? [{ id: state.sortBy, desc: state.sortDir === 'desc' }]
    : [];

  const columns = React.useMemo<ColumnDef<SafetyRow, unknown>[]>(
    () => [
      {
        id: 'code',
        header: 'Record',
        accessorKey: 'code',
        enableSorting: true,
        meta: { label: 'Record' },
        cell: ({ row }) => (
          <div className="min-w-0">
            <Link
              href={`/safety/${row.original.id}`}
              className="font-medium underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {row.original.code}
            </Link>
            <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{row.original.title}</p>
          </div>
        ),
      },
      {
        id: 'type',
        header: 'Type',
        accessorKey: 'type',
        enableSorting: true,
        meta: { label: 'Type' },
        cell: ({ row }) => (
          <span className="text-xs">{SAFETY_RECORD_TYPE_LABELS[row.original.type]}</span>
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
        id: 'mineName',
        header: 'Mine',
        enableSorting: false,
        meta: { label: 'Mine', secondary: true },
        cell: ({ row }) => <span className="text-xs">{row.original.mineName ?? '—'}</span>,
      },
      {
        id: 'assigneeName',
        header: 'Owner',
        enableSorting: false,
        meta: { label: 'Owner', secondary: true },
        cell: ({ row }) => <span className="text-xs">{row.original.assigneeName ?? 'Unassigned'}</span>,
      },
      {
        id: 'reportedAt',
        header: 'Reported',
        accessorKey: 'reportedAt',
        enableSorting: true,
        meta: { label: 'Reported', secondary: true },
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">{formatDateTime(row.original.reportedAt)}</span>
        ),
      },
    ],
    [],
  );

  const nearMissColumns = React.useMemo<ColumnDef<NearMiss, unknown>[]>(
    () => [
      {
        id: 'code',
        header: 'Near miss',
        meta: { label: 'Near miss' },
        cell: ({ row }) => (
          <div>
            <p className="font-medium">{row.original.code}</p>
            <p className="text-xs text-muted-foreground">{row.original.title}</p>
          </div>
        ),
      },
      {
        id: 'description',
        header: 'Description',
        meta: { label: 'Description', secondary: true },
        cell: ({ row }) => <span className="text-xs">{row.original.description}</span>,
      },
      {
        id: 'preventiveActions',
        header: 'Preventive actions',
        meta: { label: 'Preventive actions', secondary: true },
        cell: ({ row }) => (
          <span className="text-xs tabular-nums">{row.original.preventiveActions.length}</span>
        ),
      },
      {
        id: 'reportedAt',
        header: 'Reported',
        meta: { label: 'Reported' },
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">{formatDateTime(row.original.reportedAt)}</span>
        ),
      },
    ],
    [],
  );

  return (
    <ListPage
      title="Safety & incidents"
      description="Safety observations, hazards and near misses recorded at mine level. Incidents are tracked separately so that injury and downtime data is never mixed with preventive observations."
      headerActions={
        <>
          <Button asChild variant="outline" size="sm">
            <Link href="/safety/incidents">Incidents</Link>
          </Button>
          <ExportButton
            rows={rows}
            fileName="coalguard-safety-register"
            columns={[
              { key: 'code', label: 'Record code', value: (row) => row.code },
              { key: 'type', label: 'Type', value: (row) => SAFETY_RECORD_TYPE_LABELS[row.type] },
              { key: 'title', label: 'Title', value: (row) => row.title },
              { key: 'status', label: 'Status', value: (row) => SAFETY_STATUS_LABELS[row.status] },
              { key: 'severity', label: 'Severity', value: (row) => PRIORITY_LABELS[row.severity] },
              { key: 'mine', label: 'Mine', value: (row) => row.mineName ?? '' },
              { key: 'reported', label: 'Reported at', value: (row) => row.reportedAt },
            ]}
          />
          <PermissionGate permission="safety.create" showFallback={false}>
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              Record safety item
            </Button>
          </PermissionGate>
        </>
      }
      toolbar={
        <div className="space-y-3">
          <div className="inline-flex items-center gap-1 rounded-md border border-border/80 p-0.5">
            <Button
              variant={tab === 'register' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setTab('register')}
              aria-pressed={tab === 'register'}
            >
              Observations &amp; hazards
            </Button>
            <Button
              variant={tab === 'near_misses' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setTab('near_misses')}
              aria-pressed={tab === 'near_misses'}
            >
              Near misses
            </Button>
          </div>

          {tab === 'register' && (
            <FilterBar
              searchValue={searchInput}
              onSearchChange={setSearchInput}
              searchPlaceholder="Search by record code or title"
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
                label="Type"
                value={state.filters.type ?? 'all'}
                onValueChange={(value) => update({ filters: { ...state.filters, type: value } })}
                options={SAFETY_RECORD_TYPE_OPTIONS}
                allLabel="All types"
              />
              <FilterSelect
                label="Status"
                value={state.filters.status ?? 'all'}
                onValueChange={(value) => update({ filters: { ...state.filters, status: value } })}
                options={SAFETY_STATUS_OPTIONS}
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
          )}
        </div>
      }
    >
      {tab === 'register' ? (
        <DataTable<SafetyRow>
          columns={columns}
          data={rows}
          getRowId={(row) => row.id}
          caption="Safety observations, hazards and near misses with status and severity"
          loading={query.isLoading}
          error={query.error}
          onRetry={() => void query.refetch()}
          emptyTitle="No safety records match the current filters"
          emptyDescription="Adjust the filters, or record a new safety observation."
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
          secondaryColumns={['mineName', 'assigneeName', 'reportedAt']}
          renderMobileCard={(row) => (
            <div className="space-y-1.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <Link href={`/safety/${row.id}`} className="font-medium underline-offset-2 hover:underline">
                    {row.code}
                  </Link>
                  <p className="line-clamp-2 text-xs text-muted-foreground">{row.title}</p>
                </div>
                <StatusBadge domain="safety" value={row.status} />
              </div>
              <p className="text-xs text-muted-foreground">
                {SAFETY_RECORD_TYPE_LABELS[row.type]} · {row.mineName ?? '—'}
              </p>
            </div>
          )}
        />
      ) : (
        <SectionCard
          title="Near misses"
          description="Events that did not cause harm but indicate a risk that must be addressed."
        >
          {nearMissQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading near misses…</p>
          ) : nearMissQuery.error ? (
            <div className="space-y-2">
              <p className="text-sm text-destructive">{nearMissQuery.error.message}</p>
              <Button variant="outline" size="sm" onClick={() => void nearMissQuery.refetch()}>
                Try again
              </Button>
            </div>
          ) : (nearMissQuery.data?.items ?? []).length === 0 ? (
            <EmptyState
              title="No near misses are recorded"
              description="Near misses recorded at any mine will appear here."
            />
          ) : (
            <DataTable<NearMiss>
              columns={nearMissColumns}
              data={nearMissQuery.data?.items ?? []}
              getRowId={(row) => row.id}
              caption="Recorded near misses with preventive actions"
              page={1}
              pageSize={Math.max(nearMissQuery.data?.items.length ?? 1, 1)}
              total={nearMissQuery.data?.items.length ?? 0}
              secondaryColumns={['description', 'preventiveActions']}
            />
          )}
          <ProvenanceNote className="mt-3" tone="neutral" label="Near misses">
            Near-miss records are read-only in this interface. They are created through the field reporting
            channel so that the reporter identity and capture timestamp are preserved.
          </ProvenanceNote>
        </SectionCard>
      )}

      <RecordSafetyItemDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        mineOptions={mineOptions}
        userOptions={userOptions}
        onCreated={(record) => router.push(`/safety/${record.id}`)}
      />
    </ListPage>
  );
}

function RecordSafetyItemDialog({
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
  onCreated: (record: SafetyRecord) => void;
}) {
  const services = useServices();

  const emptyValues: SafetyRecordFormValues = {
    type: 'hazard',
    mineId: '',
    title: '',
    description: '',
    severity: 'medium',
    locationDescription: '',
    assignedTo: '',
    relatedInspectionId: '',
  };

  const form = useZodForm<SafetyRecordFormValues>({
    schema: safetyRecordSchema,
    defaultValues: emptyValues,
  });

  React.useEffect(() => {
    if (open) form.reset(emptyValues);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const mutation = useAppMutation({
    mutationFn: async (values: SafetyRecordFormValues) => {
      const parsed = safetyRecordSchema.parse(values);
      return services.safety.createObservation({
        type: parsed.type,
        mineId: parsed.mineId,
        title: parsed.title,
        description: parsed.description,
        severity: parsed.severity,
        locationDescription: parsed.locationDescription,
        assignedTo: parsed.assignedTo,
        relatedInspectionId: parsed.relatedInspectionId,
        ...(parsed.lat !== undefined && parsed.lng !== undefined
          ? { lat: parsed.lat, lng: parsed.lng, accuracyM: parsed.accuracyM }
          : {}),
      });
    },
    successMessage: (record) => `Safety record ${record.code} created.`,
    invalidates: [['safety', 'list'], ['dashboard'], ['audit', 'list']],
  });

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const record = await mutation.mutateAsync(values);
      onOpenChange(false);
      onCreated(record);
    } catch (error) {
      applyServerFieldErrors(error, form.setError as never);
    }
  });

  const filteredTypeOptions = SAFETY_RECORD_TYPE_OPTIONS.filter((option) => option.value !== 'incident');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Record a safety item</DialogTitle>
          <DialogDescription>
            Observations and hazards start in the <em>open</em> state. Incidents must be recorded from the
            incidents register so injury data is captured.
          </DialogDescription>
        </DialogHeader>

        <FormProvider form={form}>
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            <FormErrorSummary form={form} />

            <div className="grid gap-3 sm:grid-cols-2">
              <SelectInput name="type" label="Record type" required options={filteredTypeOptions} />
              <SelectInput name="severity" label="Severity" required options={PRIORITY_OPTIONS} />
            </div>

            <SelectInput name="mineId" label="Mine" required options={mineOptions} placeholder="Select a mine" />

            <TextInput name="title" label="Title" required placeholder="Short summary of the issue" />

            <TextAreaInput name="description" label="Description" required rows={3} />

            <TextInput
              name="locationDescription"
              label="Location description"
              placeholder="e.g. Bench 3, north haul road"
            />

            <div className="grid gap-3 sm:grid-cols-2">
              <SelectInput
                name="assignedTo"
                label="Owner"
                options={userOptions}
                placeholder="Unassigned"
              />
              <TextInput
                name="relatedInspectionId"
                label="Related inspection id"
                description="Optional. Paste the inspection id if this was raised during a formal inspection."
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={mutation.isPending}>
                Record item
              </Button>
            </DialogFooter>
          </form>
        </FormProvider>
      </DialogContent>
    </Dialog>
  );
}
