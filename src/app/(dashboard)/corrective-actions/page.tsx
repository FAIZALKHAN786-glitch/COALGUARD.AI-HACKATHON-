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
import { useApiQuery, useServices } from '@/lib/api/use-services';
import { applyServerFieldErrors } from '@/lib/errors/normalise';
import { useAppMutation } from '@/lib/hooks/use-app-mutation';
import { useListData, useListQueryState } from '@/lib/hooks/use-list-query';
import { useMineOptions, useUserOptions } from '@/lib/hooks/use-mine-options';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import {
  CORRECTIVE_ACTION_SOURCE_LABELS,
  CORRECTIVE_ACTION_STATUS_LABELS,
  CORRECTIVE_ACTION_STATUS_OPTIONS,
  PRIORITY_LABELS,
  PRIORITY_OPTIONS,
} from '@/lib/domain/reference';
import { daysUntil, deadlineState, formatDate } from '@/lib/formatting/dates';
import { correctiveActionSchema, type CorrectiveActionFormValues } from '@/lib/validation/schemas';
import type { CorrectiveAction } from '@/types';

export type CorrectiveActionRow = CorrectiveAction & { mineName?: string; assigneeName?: string };

export default function CorrectiveActionsPage() {
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

  const query = useListData<CorrectiveActionRow>('corrective-actions', state, (listQuery) =>
    services.correctiveActions.list(listQuery),
  );

  const rows = query.data?.items ?? [];
  const meta = query.data?.meta;

  const sorting: SortingState = state.sortBy
    ? [{ id: state.sortBy, desc: state.sortDir === 'desc' }]
    : [];

  const columns = React.useMemo<ColumnDef<CorrectiveActionRow, unknown>[]>(
    () => [
      {
        id: 'code',
        header: 'Action',
        accessorKey: 'code',
        enableSorting: true,
        meta: { label: 'Action' },
        cell: ({ row }) => (
          <div className="min-w-0">
            <Link
              href={`/corrective-actions/${row.original.id}`}
              className="font-medium underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {row.original.code}
            </Link>
            <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{row.original.description}</p>
          </div>
        ),
      },
      {
        id: 'status',
        header: 'Status',
        accessorKey: 'status',
        enableSorting: true,
        meta: { label: 'Status' },
        cell: ({ row }) => <StatusBadge domain="corrective_action" value={row.original.status} />,
      },
      {
        id: 'priority',
        header: 'Priority',
        accessorKey: 'priority',
        enableSorting: true,
        meta: { label: 'Priority' },
        cell: ({ row }) => <StatusBadge domain="priority" value={row.original.priority} />,
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
        id: 'dueDate',
        header: 'Due',
        accessorKey: 'dueDate',
        enableSorting: true,
        meta: { label: 'Due' },
        cell: ({ row }) => <DueCell action={row.original} />,
      },
      {
        id: 'sourceType',
        header: 'Source',
        enableSorting: false,
        meta: { label: 'Source', secondary: true },
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">
            {CORRECTIVE_ACTION_SOURCE_LABELS[row.original.sourceType]}
          </span>
        ),
      },
    ],
    [],
  );

  return (
    <ListPage
      title="Corrective actions"
      description="Remediation raised from inspections, incidents and observations, through verification and closure."
      headerActions={
        <>
          <ExportButton
            rows={rows}
            fileName="coalguard-corrective-actions"
            columns={[
              { key: 'code', label: 'Action code', value: (row) => row.code },
              { key: 'description', label: 'Description', value: (row) => row.description },
              { key: 'status', label: 'Status', value: (row) => CORRECTIVE_ACTION_STATUS_LABELS[row.status] },
              { key: 'priority', label: 'Priority', value: (row) => PRIORITY_LABELS[row.priority] },
              { key: 'mine', label: 'Mine', value: (row) => row.mineName ?? '' },
              { key: 'owner', label: 'Owner', value: (row) => row.assigneeName ?? '' },
              { key: 'due', label: 'Due date', value: (row) => row.dueDate ?? '' },
              {
                key: 'source',
                label: 'Source',
                value: (row) => CORRECTIVE_ACTION_SOURCE_LABELS[row.sourceType],
              },
              { key: 'created', label: 'Created at', value: (row) => row.createdAt },
              { key: 'closed', label: 'Closed at', value: (row) => row.closedAt ?? '' },
            ]}
          />
          <PermissionGate permission="corrective_action.create" showFallback={false}>
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              Raise action
            </Button>
          </PermissionGate>
        </>
      }
      toolbar={
        <FilterBar
          searchValue={searchInput}
          onSearchChange={setSearchInput}
          searchPlaceholder="Search by action code or description"
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
            options={CORRECTIVE_ACTION_STATUS_OPTIONS}
            allLabel="All statuses"
          />
          <FilterSelect
            label="Priority"
            value={state.filters.priority ?? 'all'}
            onValueChange={(value) => update({ filters: { ...state.filters, priority: value } })}
            options={PRIORITY_OPTIONS}
            allLabel="All priorities"
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
      <DataTable<CorrectiveActionRow>
        columns={columns}
        data={rows}
        getRowId={(row) => row.id}
        caption="Corrective actions with status, priority, owner and due date"
        loading={query.isLoading}
        error={query.error}
        onRetry={() => void query.refetch()}
        emptyTitle="No corrective actions match the current filters"
        emptyDescription="Adjust the filters, or raise a new action from an inspection or incident."
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
        secondaryColumns={['mineName', 'assigneeName', 'sourceType']}
        renderMobileCard={(row) => (
          <div className="space-y-1.5">
            <div className="flex items-start justify-between gap-2">
              <Link href={`/corrective-actions/${row.id}`} className="font-medium underline-offset-2 hover:underline">
                {row.code}
              </Link>
              <StatusBadge domain="corrective_action" value={row.status} />
            </div>
            <p className="line-clamp-2 text-xs text-muted-foreground">{row.description}</p>
            <p className="text-xs text-muted-foreground">
              {row.mineName ?? '—'} · Due {formatDate(row.dueDate)}
            </p>
          </div>
        )}
      />

      <RaiseActionDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        mineOptions={mineOptions}
        userOptions={userOptions}
        onCreated={(action) => router.push(`/corrective-actions/${action.id}`)}
      />
    </ListPage>
  );
}

function DueCell({ action }: { action: CorrectiveActionRow }) {
  if (!action.dueDate) return <span className="text-xs text-muted-foreground">Not set</span>;
  const state = deadlineState(action.dueDate);
  const days = daysUntil(action.dueDate);
  const closed = action.status === 'closed' || action.status === 'verified';

  return (
    <div className="text-xs">
      <p className="tabular-nums">{formatDate(action.dueDate)}</p>
      {!closed && state === 'overdue' && days !== null && (
        <p className="font-medium text-destructive">Overdue by {Math.abs(days)} day(s)</p>
      )}
      {!closed && state === 'due_today' && <p className="font-medium text-warning-strong">Due today</p>}
      {!closed && (state === 'due_soon' || state === 'upcoming') && days !== null && (
        <p className="text-muted-foreground">{days} day(s) left</p>
      )}
    </div>
  );
}

const SOURCE_TYPE_OPTIONS = [
  { value: 'inspection', label: 'Inspection' },
  { value: 'incident', label: 'Incident' },
  { value: 'observation', label: 'Safety observation' },
  { value: 'violation', label: 'Violation' },
];

function RaiseActionDialog({
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
  onCreated: (action: CorrectiveAction) => void;
}) {
  const services = useServices();
  const [sourceType, setSourceType] = React.useState<CorrectiveActionFormValues['sourceType']>('inspection');
  const inspections = useApiQuery(['inspections', 'list', { pageSize: 100 }], () =>
    services.inspections.list({ pageSize: 100 }),
  );
  const incidents = useApiQuery(['safety', 'incidents', { pageSize: 100 }], () =>
    services.safety.incidents({ pageSize: 100 }),
  );
  const observations = useApiQuery(['safety', 'list', { pageSize: 100 }], () =>
    services.safety.observations({ pageSize: 100 }),
  );

  const sourceOptions = React.useMemo(() => {
    if (sourceType === 'inspection') {
      return (inspections.data?.items ?? []).map((item) => ({
        value: item.id,
        label: `${item.code} — ${item.type.replace(/_/g, ' ')} (${item.status})`,
      }));
    }
    if (sourceType === 'incident') {
      return (incidents.data?.items ?? []).map((item) => ({
        value: item.id,
        label: `${item.code} — ${item.title} (${item.status})`,
      }));
    }
    if (sourceType === 'violation') {
      // Violations are raised from inspection findings; there is no violation
      // list surface to pick from here, so the option list stays empty rather
      // than offering an ungrounded free-text identifier.
      return [];
    }
    return (observations.data?.items ?? []).map((item) => ({
      value: item.id,
      label: `${item.code} — ${item.title} (${item.status})`,
    }));
  }, [sourceType, inspections.data, incidents.data, observations.data]);

  const emptyValues: CorrectiveActionFormValues = {
    sourceType: 'inspection',
    sourceId: '',
    mineId: '',
    description: '',
    assignedTo: '',
    priority: 'medium',
    dueDate: '',
  };

  const form = useZodForm<CorrectiveActionFormValues>({
    schema: correctiveActionSchema,
    defaultValues: emptyValues,
  });

  React.useEffect(() => {
    if (open) {
      form.reset(emptyValues);
      setSourceType('inspection');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Keep the source-record list in step with the selected source type.
  const watchedSourceType = form.watch('sourceType');
  React.useEffect(() => {
    if (watchedSourceType === sourceType) return;
    setSourceType(watchedSourceType);
    form.setValue('sourceId', '');
  }, [watchedSourceType, sourceType, form]);

  const mutation = useAppMutation({
    mutationFn: async (values: CorrectiveActionFormValues) => {
      const parsed = correctiveActionSchema.parse(values);
      return services.correctiveActions.create({
        sourceType: parsed.sourceType,
        sourceId: parsed.sourceId,
        mineId: parsed.mineId,
        description: parsed.description,
        assignedTo: parsed.assignedTo,
        priority: parsed.priority,
        dueDate: parsed.dueDate,
      });
    },
    successMessage: (action) => `Corrective action ${action.code} raised.`,
    invalidates: [['corrective-actions', 'list'], ['dashboard'], ['audit', 'list']],
  });

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const action = await mutation.mutateAsync(values);
      onOpenChange(false);
      onCreated(action);
    } catch (error) {
      applyServerFieldErrors(error, form.setError as never);
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Raise a corrective action</DialogTitle>
          <DialogDescription>
            The action is created in the <em>proposed</em> state and must be assigned before work starts.
          </DialogDescription>
        </DialogHeader>

        <FormProvider form={form}>
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            <FormErrorSummary form={form} />

            <SelectInput
              name="sourceType"
              label="Source record type"
              required
              options={SOURCE_TYPE_OPTIONS}
            />

            <SelectInput
              name="sourceId"
              label="Source record"
              required
              options={sourceOptions}
              placeholder={
                sourceOptions.length === 0 ? 'No records available for this source type' : 'Select a record'
              }
              description="Corrective actions must be traceable to the record that raised them."
            />

            <SelectInput name="mineId" label="Mine" required options={mineOptions} placeholder="Select a mine" />

            <TextAreaInput name="description" label="Required action" required rows={3} />

            <div className="grid gap-3 sm:grid-cols-2">
              <SelectInput
                name="assignedTo"
                label="Owner"
                options={userOptions}
                placeholder="Unassigned"
              />
              <SelectInput name="priority" label="Priority" required options={PRIORITY_OPTIONS} />
            </div>

            <TextInput
              name="dueDate"
              label="Due date"
              type="date"
              description="Optional. Record the date your organisation has committed to."
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={mutation.isPending}>
                Raise action
              </Button>
            </DialogFooter>
          </form>
        </FormProvider>
      </DialogContent>
    </Dialog>
  );
}
