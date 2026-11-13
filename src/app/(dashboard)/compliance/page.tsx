'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CalendarDays, List, Plus } from 'lucide-react';
import type { ColumnDef, SortingState } from '@tanstack/react-table';

import { DataTable } from '@/components/data-display/data-table';
import { FilterBar, FilterSelect } from '@/components/data-display/filter-bar';
import { SectionCard } from '@/components/data-display/detail-list';
import { StatusBadge } from '@/components/data-display/status-badge';
import { ExportButton } from '@/components/shared/export-button';
import { ListPage } from '@/components/shared/page-shell';
import { PermissionGate } from '@/components/shared/permission-gate';
import { ProvenanceNote } from '@/components/shared/provenance-note';
import {
  CheckboxGroupInput,
  FormErrorSummary,
  FormProvider,
  SelectInput,
  TextAreaInput,
  TextInput,
  useZodForm,
} from '@/components/forms/form';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
  COMPLIANCE_CATEGORY_LABELS,
  COMPLIANCE_CATEGORY_OPTIONS,
  COMPLIANCE_STATUS_OPTIONS,
  PRIORITY_OPTIONS,
  PRIORITY_LABELS,
} from '@/lib/domain/reference';
import { formatDate, daysUntil, deadlineState } from '@/lib/formatting/dates';
import { complianceSchema, type ComplianceFormValues } from '@/lib/validation/schemas';
import type { ComplianceRecord } from '@/types';

export type ComplianceRow = ComplianceRecord & { mineName?: string; subsidiaryName?: string };

const SUBMISSION_FREQUENCY_OPTIONS = [
  { value: 'once', label: 'One-off' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'annual', label: 'Annual' },
  { value: 'event_based', label: 'Event based' },
];

export default function CompliancePage() {
  const services = useServices();
  const [state, update, reset] = useListQueryState({ pageSize: 20 });
  const [searchInput, setSearchInput] = React.useState('');
  const debouncedSearch = useDebouncedValue(searchInput, 300);
  const [view, setView] = React.useState<'table' | 'calendar'>('table');
  const [createOpen, setCreateOpen] = React.useState(false);

  const { options: mineOptions } = useMineOptions();
  const { options: userOptions } = useUserOptions();

  // A deep link from the mine detail page can scope the register to one mine.
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const mineId = params.get('mineId');
    if (mineId) update({ filters: { applicableMineIds: mineId } });
    // Only read the URL once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  React.useEffect(() => {
    update({ search: debouncedSearch });
  }, [debouncedSearch, update]);

  const query = useListData<ComplianceRow>('compliance', state, (listQuery) =>
    services.compliance.list(listQuery),
  );
  const calendarQuery = useApiQuery(
    ['compliance', 'calendar'],
    () => services.compliance.calendar({ pageSize: 200 }),
    { enabled: view === 'calendar' },
  );

  const rows = query.data?.items ?? [];
  const meta = query.data?.meta;

  const sorting: SortingState = state.sortBy
    ? [{ id: state.sortBy, desc: state.sortDir === 'desc' }]
    : [];

  const columns = React.useMemo<ColumnDef<ComplianceRow, unknown>[]>(
    () => [
      {
        id: 'title',
        header: 'Requirement',
        enableSorting: true,
        meta: { label: 'Requirement' },
        cell: ({ row }) => (
          <div className="min-w-0">
            <Link
              href={`/compliance/${row.original.id}`}
              className="font-medium underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {row.original.title}
            </Link>
            <p className="mt-0.5 text-xs text-muted-foreground">{row.original.code}</p>
          </div>
        ),
      },
      {
        id: 'category',
        header: 'Category',
        accessorKey: 'category',
        enableSorting: true,
        meta: { label: 'Category' },
        cell: ({ row }) => (
          <span className="text-xs">{COMPLIANCE_CATEGORY_LABELS[row.original.category]}</span>
        ),
      },
      {
        id: 'status',
        header: 'Status',
        accessorKey: 'status',
        enableSorting: true,
        meta: { label: 'Status' },
        cell: ({ row }) => <StatusBadge domain="compliance" value={row.original.status} />,
      },
      {
        id: 'mineName',
        header: 'Applicable mines',
        enableSorting: false,
        meta: { label: 'Applicable mines' },
        cell: ({ row }) => (
          <div className="text-xs">
            <p className="font-medium">{row.original.mineName ?? 'Multiple mines'}</p>
            <p className="text-muted-foreground">
              {row.original.applicableMineIds.length} mine
              {row.original.applicableMineIds.length === 1 ? '' : 's'}
            </p>
          </div>
        ),
      },
      {
        id: 'dueDate',
        header: 'Due date',
        accessorKey: 'dueDate',
        enableSorting: true,
        meta: { label: 'Due date' },
        cell: ({ row }) => <DueDateCell record={row.original} />,
      },
      {
        id: 'priority',
        header: 'Priority',
        accessorKey: 'priority',
        enableSorting: true,
        meta: { label: 'Priority', secondary: true },
        cell: ({ row }) => <StatusBadge domain="priority" value={row.original.priority} />,
      },
      {
        id: 'evidence',
        header: 'Evidence',
        enableSorting: false,
        meta: { label: 'Evidence', secondary: true },
        cell: ({ row }) => (
          <span className="text-xs tabular-nums text-muted-foreground">
            {row.original.evidenceDocumentIds.length} document
            {row.original.evidenceDocumentIds.length === 1 ? '' : 's'}
          </span>
        ),
      },
    ],
    [],
  );

  return (
    <ListPage
      title="Statutory compliance register"
      description="Requirements tracked against the mines in scope, with their recorded status, due date and evidence. Source references and dates are recorded by your organisation; the platform does not supply statutory deadlines."
      headerActions={
        <>
          <div className="flex items-center gap-1 rounded-md border border-border/80 p-0.5">
            <Button
              variant={view === 'table' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setView('table')}
              aria-pressed={view === 'table'}
            >
              <List className="h-3.5 w-3.5" aria-hidden="true" />
              Table
            </Button>
            <Button
              variant={view === 'calendar' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setView('calendar')}
              aria-pressed={view === 'calendar'}
            >
              <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
              Calendar
            </Button>
          </div>
          <ExportButton
            rows={rows}
            fileName="coalguard-compliance-register"
            columns={[
              { key: 'code', label: 'Requirement code', value: (row) => row.code },
              { key: 'title', label: 'Title', value: (row) => row.title },
              {
                key: 'category',
                label: 'Category',
                value: (row) => COMPLIANCE_CATEGORY_LABELS[row.category],
              },
              { key: 'status', label: 'Status', value: (row) => row.status },
              {
                key: 'priority',
                label: 'Priority',
                value: (row) => PRIORITY_LABELS[row.priority],
              },
              { key: 'mineName', label: 'Applicable mines', value: (row) => row.mineName ?? '' },
              { key: 'sourceReference', label: 'Source reference', value: (row) => row.sourceReference ?? '' },
              { key: 'effectiveFrom', label: 'Effective from', value: (row) => row.effectiveFrom ?? '' },
              { key: 'dueDate', label: 'Due date', value: (row) => row.dueDate ?? '' },
              {
                key: 'submissionFrequency',
                label: 'Submission frequency',
                value: (row) => row.submissionFrequency ?? '',
              },
            ]}
          />
          <PermissionGate permission="compliance.create" showFallback={false}>
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              Add requirement
            </Button>
          </PermissionGate>
        </>
      }
      toolbar={
        view === 'table' ? (
          <FilterBar
            searchValue={searchInput}
            onSearchChange={setSearchInput}
            searchPlaceholder="Search by requirement code, title or reference"
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
              options={COMPLIANCE_CATEGORY_OPTIONS}
              allLabel="All categories"
            />
            <FilterSelect
              label="Status"
              value={state.filters.status ?? 'all'}
              onValueChange={(value) => update({ filters: { ...state.filters, status: value } })}
              options={COMPLIANCE_STATUS_OPTIONS}
              allLabel="All statuses"
            />
            <FilterSelect
              label="Mine"
              value={state.filters.applicableMineIds ?? 'all'}
              onValueChange={(value) => update({ filters: { ...state.filters, applicableMineIds: value } })}
              options={mineOptions}
              allLabel="All mines"
            />
          </FilterBar>
        ) : undefined
      }
    >
      {view === 'table' ? (
        <DataTable<ComplianceRow>
          columns={columns}
          data={rows}
          getRowId={(row) => row.id}
          caption="Compliance requirements with status, category, applicable mines and due date"
          loading={query.isLoading}
          error={query.error}
          onRetry={() => void query.refetch()}
          emptyTitle="No compliance requirements match the current filters"
          emptyDescription="Adjust the search term or filters, or clear them to see the full register."
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
          secondaryColumns={['priority', 'evidence']}
          renderMobileCard={(row) => (
            <div className="space-y-1.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <Link
                    href={`/compliance/${row.id}`}
                    className="font-medium underline-offset-2 hover:underline"
                  >
                    {row.title}
                  </Link>
                  <p className="text-xs text-muted-foreground">{row.code}</p>
                </div>
                <StatusBadge domain="compliance" value={row.status} />
              </div>
              <p className="text-xs text-muted-foreground">
                {COMPLIANCE_CATEGORY_LABELS[row.category]} · {row.mineName ?? 'Multiple mines'}
              </p>
              <p className="text-xs text-muted-foreground">Due {formatDate(row.dueDate)}</p>
            </div>
          )}
        />
      ) : (
        <CalendarView
          query={calendarQuery}
          loading={calendarQuery.isLoading}
          error={calendarQuery.error}
          onRetry={() => void calendarQuery.refetch()}
        />
      )}

      <CreateComplianceDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        mineOptions={mineOptions}
        userOptions={userOptions}
      />
    </ListPage>
  );
}

/* -------------------------------------------------------------------------- */
/* Due date cell                                                               */
/* -------------------------------------------------------------------------- */

function DueDateCell({ record }: { record: ComplianceRow }) {
  if (!record.dueDate) {
    return <span className="text-xs text-muted-foreground">Not set</span>;
  }
  const state = deadlineState(record.dueDate);
  const days = daysUntil(record.dueDate);

  return (
    <div className="text-xs">
      <p className="tabular-nums">{formatDate(record.dueDate)}</p>
      {state === 'overdue' && days !== null && (
        <p className="font-medium text-destructive">Overdue by {Math.abs(days)} day(s)</p>
      )}
      {state === 'due_today' && <p className="font-medium text-warning-strong">Due today</p>}
      {state === 'due_soon' && days !== null && (
        <p className="text-muted-foreground">Due in {days} day(s)</p>
      )}
      {state === 'upcoming' && days !== null && (
        <p className="text-muted-foreground">Due in {days} day(s)</p>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Calendar view                                                               */
/* -------------------------------------------------------------------------- */

function CalendarView({
  query,
  loading,
  error,
  onRetry,
}: {
  query: ReturnType<typeof useApiQuery<{ items: ComplianceRow[] }>>;
  loading: boolean;
  error: Error | null;
  onRetry: () => void;
}) {
  if (loading) return <p className="text-sm text-muted-foreground">Loading the compliance calendar…</p>;
  if (error) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-destructive">{error.message}</p>
        <Button variant="outline" size="sm" onClick={onRetry}>
          Try again
        </Button>
      </div>
    );
  }

  const items = query.data?.items ?? [];
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">No compliance requirements have a recorded due date.</p>;
  }

  const groups = new Map<string, ComplianceRow[]>();
  for (const item of items) {
    const key = item.dueDate ?? 'No due date recorded';
    const bucket = groups.get(key) ?? [];
    bucket.push(item);
    groups.set(key, bucket);
  }

  const sortedKeys = Array.from(groups.keys()).sort((a, b) =>
    a === 'No due date recorded' ? 1 : b === 'No due date recorded' ? -1 : a.localeCompare(b),
  );

  return (
    <div className="space-y-4">
      <ProvenanceNote tone="neutral" label="Calendar">
        Grouped by the due date recorded against each requirement. Dates are supplied by your organisation, not
        generated by the platform.
      </ProvenanceNote>
      {sortedKeys.map((key) => (
        <SectionCard
          key={key}
          title={key === 'No due date recorded' ? key : formatDate(key)}
          description={`${groups.get(key)!.length} requirement(s)`}
        >
          <ul className="divide-y divide-border/70">
            {groups.get(key)!.map((item) => (
              <li key={item.id} className="flex flex-wrap items-start justify-between gap-2 py-2 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <Link
                    href={`/compliance/${item.id}`}
                    className="text-sm font-medium underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {item.code} — {item.title}
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    {COMPLIANCE_CATEGORY_LABELS[item.category]} · {item.mineName ?? 'Multiple mines'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{PRIORITY_LABELS[item.priority]}</Badge>
                  <StatusBadge domain="compliance" value={item.status} />
                </div>
              </li>
            ))}
          </ul>
        </SectionCard>
      ))}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Create dialog                                                               */
/* -------------------------------------------------------------------------- */

function CreateComplianceDialog({
  open,
  onOpenChange,
  mineOptions,
  userOptions,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mineOptions: { value: string; label: string }[];
  userOptions: { value: string; label: string }[];
}) {
  const services = useServices();
  const router = useRouter();

  const emptyValues: ComplianceFormValues = {
    code: '',
    title: '',
    description: '',
    category: 'mine_safety',
    applicableMineIds: [],
    responsibleOfficerId: '',
    sourceReference: '',
    effectiveFrom: '',
    dueDate: '',
    priority: 'medium',
    submissionFrequency: 'monthly',
    notes: '',
  };

  const form = useZodForm<ComplianceFormValues>({ schema: complianceSchema, defaultValues: emptyValues });

  React.useEffect(() => {
    if (open) form.reset(emptyValues);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const mutation = useAppMutation({
    mutationFn: async (values: ComplianceFormValues) => {
      const parsed = complianceSchema.parse(values);
      return services.compliance.create({
        code: parsed.code,
        title: parsed.title,
        description: parsed.description,
        category: parsed.category,
        applicableMineIds: parsed.applicableMineIds,
        responsibleOfficerId: parsed.responsibleOfficerId,
        sourceReference: parsed.sourceReference,
        effectiveFrom: parsed.effectiveFrom,
        dueDate: parsed.dueDate,
        priority: parsed.priority,
        submissionFrequency: parsed.submissionFrequency,
        notes: parsed.notes,
      });
    },
    successMessage: (record) => `Requirement ${record.code} created as a draft.`,
    invalidates: [['compliance', 'list'], ['compliance', 'calendar'], ['dashboard']],
  });

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const record = await mutation.mutateAsync(values);
      onOpenChange(false);
      router.push(`/compliance/${record.id}`);
    } catch (error) {
      applyServerFieldErrors(error, form.setError as never);
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add a compliance requirement</DialogTitle>
          <DialogDescription>
            A new requirement starts as a draft. The source reference and due date are recorded from your own
            register — the platform does not supply statutory deadlines or legal text.
          </DialogDescription>
        </DialogHeader>

        <FormProvider form={form}>
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            <FormErrorSummary form={form} />

            <div className="grid gap-3 sm:grid-cols-2">
              <TextInput name="code" label="Requirement code" required placeholder="e.g. CMP-SAF-014" />
              <TextInput name="title" label="Title" required placeholder="Short requirement title" />
            </div>

            <TextAreaInput
              name="description"
              label="Description"
              required
              rows={3}
              description="Describe the obligation in your own words. Do not paste legal text you are not licensed to reproduce."
            />

            <div className="grid gap-3 sm:grid-cols-2">
              <SelectInput
                name="category"
                label="Category"
                required
                options={COMPLIANCE_CATEGORY_OPTIONS}
              />
              <SelectInput name="priority" label="Priority" required options={PRIORITY_OPTIONS} />
            </div>

            <CheckboxGroupInput
              name="applicableMineIds"
              label="Applicable mines"
              required
              options={mineOptions}
              description="Select every mine this requirement applies to."
            />

            <div className="grid gap-3 sm:grid-cols-2">
              <SelectInput
                name="responsibleOfficerId"
                label="Responsible officer"
                options={userOptions}
                placeholder="Unassigned"
              />
              <SelectInput
                name="submissionFrequency"
                label="Submission frequency"
                options={SUBMISSION_FREQUENCY_OPTIONS}
              />
            </div>

            <TextInput
              name="sourceReference"
              label="Source reference"
              placeholder="e.g. internal circular reference"
              description="Optional. Record the exact circular, notification or register reference used by your organisation. The platform does not invent one."
            />

            <div className="grid gap-3 sm:grid-cols-2">
              <TextInput
                name="effectiveFrom"
                label="Effective from"
                type="date"
                description="Optional. Taken from the source you are recording."
              />
              <TextInput
                name="dueDate"
                label="Due date"
                type="date"
                description="Optional. The date your organisation tracks. The platform does not supply statutory deadlines."
              />
            </div>

            <TextAreaInput name="notes" label="Internal notes" rows={2} />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={mutation.isPending}>
                Create requirement
              </Button>
            </DialogFooter>
          </form>
        </FormProvider>
      </DialogContent>
    </Dialog>
  );
}

