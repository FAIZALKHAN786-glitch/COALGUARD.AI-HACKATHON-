'use client';

import * as React from 'react';
import { Check, X } from 'lucide-react';
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
  FormErrorSummary,
  FormProvider,
  SelectInput,
  TextAreaInput,
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
import { useServices } from '@/lib/api/use-services';
import { applyServerFieldErrors } from '@/lib/errors/normalise';
import { useAppMutation } from '@/lib/hooks/use-app-mutation';
import { useListData, useListQueryState } from '@/lib/hooks/use-list-query';
import { useMineOptions } from '@/lib/hooks/use-mine-options';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { ATTENDANCE_STATUS_LABELS, ATTENDANCE_STATUS_OPTIONS, SHIFT_LABELS } from '@/lib/domain/reference';
import { formatDate, formatDateTime } from '@/lib/formatting/dates';
import { attendanceCorrectionSchema, type AttendanceCorrectionFormValues } from '@/lib/validation/schemas';
import type { AttendanceRecord } from '@/types';

type AttendanceRow = AttendanceRecord & { mineName?: string; contractorName?: string };

export default function WorkforcePage() {
  const services = useServices();
  const [state, update, reset] = useListQueryState({ pageSize: 20 });
  const [searchInput, setSearchInput] = React.useState('');
  const debouncedSearch = useDebouncedValue(searchInput, 300);
  const [correctionTarget, setCorrectionTarget] = React.useState<AttendanceRow | null>(null);
  const [reviewTarget, setReviewTarget] = React.useState<AttendanceRow | null>(null);

  const { options: mineOptions } = useMineOptions();

  React.useEffect(() => {
    update({ search: debouncedSearch });
  }, [debouncedSearch, update]);

  const query = useListData<AttendanceRow>('workforce', state, (listQuery) =>
    services.workforce.attendance(listQuery),
  );

  const rows = query.data?.items ?? [];
  const meta = query.data?.meta;

  const pendingCorrections = rows.flatMap((row) =>
    row.corrections
      .filter((correction) => correction.status === 'pending')
      .map((correction) => ({ record: row, correction })),
  );

  const sorting: SortingState = state.sortBy
    ? [{ id: state.sortBy, desc: state.sortDir === 'desc' }]
    : [];

  const columns = React.useMemo<ColumnDef<AttendanceRow, unknown>[]>(
    () => [
      {
        id: 'workerDisplayName',
        header: 'Worker',
        accessorKey: 'workerDisplayName',
        enableSorting: true,
        meta: { label: 'Worker' },
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="text-sm font-medium">{row.original.workerDisplayName}</p>
            <p className="text-xs text-muted-foreground">{row.original.workerRef}</p>
          </div>
        ),
      },
      {
        id: 'date',
        header: 'Shift',
        accessorKey: 'date',
        enableSorting: true,
        meta: { label: 'Shift' },
        cell: ({ row }) => (
          <div className="text-xs tabular-nums">
            <p>{formatDate(row.original.date)}</p>
            <p className="text-muted-foreground">{SHIFT_LABELS[row.original.shift]} shift</p>
          </div>
        ),
      },
      {
        id: 'status',
        header: 'Attendance',
        accessorKey: 'status',
        enableSorting: true,
        meta: { label: 'Attendance' },
        cell: ({ row }) => (
          <div className="flex flex-col gap-1">
            <StatusBadge domain="attendance" value={row.original.status} />
            {row.original.corrections.some((correction) => correction.status === 'pending') && (
              <Badge variant="warning">Correction pending</Badge>
            )}
          </div>
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
        id: 'contractorName',
        header: 'Contractor',
        enableSorting: false,
        meta: { label: 'Contractor', secondary: true },
        cell: ({ row }) => (
          <span className="text-xs">{row.original.contractorName || 'Direct employee'}</span>
        ),
      },
      {
        id: 'recordedAt',
        header: 'Recorded',
        accessorKey: 'recordedAt',
        enableSorting: true,
        meta: { label: 'Recorded', secondary: true },
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">{formatDateTime(row.original.recordedAt)}</span>
        ),
      },
      {
        id: 'actions',
        header: 'Correction',
        enableSorting: false,
        meta: { label: 'Correction', secondary: true },
        cell: ({ row }) => {
          const pending = row.original.corrections.find((correction) => correction.status === 'pending');
          return (
            <div className="flex flex-wrap gap-1">
              <PermissionGate permission="workforce.edit" showFallback={false}>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCorrectionTarget(row.original)}
                  disabled={Boolean(pending)}
                  title={pending ? 'A correction is already awaiting approval.' : undefined}
                >
                  Request correction
                </Button>
              </PermissionGate>
              {pending && (
                <PermissionGate permission="workforce.approve" showFallback={false}>
                  <Button variant="outline" size="sm" onClick={() => setReviewTarget(row.original)}>
                    Review request
                  </Button>
                </PermissionGate>
              )}
            </div>
          );
        },
      },
    ],
    [],
  );

  return (
    <ListPage
      title="Workforce records"
      description="Attendance and labour-related governance records. Workers are referenced by a pseudonymous reference; personal identifiers are not exposed by this interface."
      headerActions={
        <ExportButton
          rows={rows}
          fileName="coalguard-workforce-attendance"
          columns={[
            { key: 'workerRef', label: 'Worker reference', value: (row) => row.workerRef },
            { key: 'worker', label: 'Worker display name', value: (row) => row.workerDisplayName },
            { key: 'mine', label: 'Mine', value: (row) => row.mineName ?? '' },
            { key: 'contractor', label: 'Contractor', value: (row) => row.contractorName ?? '' },
            { key: 'date', label: 'Date', value: (row) => row.date },
            { key: 'shift', label: 'Shift', value: (row) => SHIFT_LABELS[row.shift] },
            { key: 'status', label: 'Attendance status', value: (row) => ATTENDANCE_STATUS_LABELS[row.status] },
            { key: 'recorded', label: 'Recorded at', value: (row) => row.recordedAt },
            {
              key: 'pendingCorrections',
              label: 'Pending corrections',
              value: (row) => String(row.corrections.filter((correction) => correction.status === 'pending').length),
            },
          ]}
        />
      }
      toolbar={
        <FilterBar
          searchValue={searchInput}
          onSearchChange={setSearchInput}
          searchPlaceholder="Search by worker reference or name"
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
            label="Attendance"
            value={state.filters.status ?? 'all'}
            onValueChange={(value) => update({ filters: { ...state.filters, status: value } })}
            options={ATTENDANCE_STATUS_OPTIONS}
            allLabel="All statuses"
          />
          <FilterSelect
            label="Shift"
            value={state.filters.shift ?? 'all'}
            onValueChange={(value) => update({ filters: { ...state.filters, shift: value } })}
            options={[
              { value: 'day', label: 'Day' },
              { value: 'swing', label: 'Swing' },
              { value: 'night', label: 'Night' },
            ]}
            allLabel="All shifts"
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
      <SectionCard
        title="Corrections awaiting approval"
        description={`${pendingCorrections.length} request(s) on this page of results.`}
      >
        {pendingCorrections.length === 0 ? (
          <p className="text-sm text-muted-foreground">No attendance correction is awaiting approval.</p>
        ) : (
          <ul className="space-y-3">
            {pendingCorrections.map(({ record, correction }) => (
              <li
                key={correction.id}
                className="flex flex-wrap items-start justify-between gap-3 rounded-md border border-border/80 p-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {record.workerDisplayName} — {ATTENDANCE_STATUS_LABELS[correction.originalStatus]} →{' '}
                    {ATTENDANCE_STATUS_LABELS[correction.correctedStatus]}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(record.date)} · {SHIFT_LABELS[record.shift]} shift · requested{' '}
                    {formatDateTime(correction.at)}
                  </p>
                  <p className="mt-1 text-sm">{correction.reason}</p>
                </div>
                <PermissionGate permission="workforce.approve" showFallback={false}>
                  <Button variant="outline" size="sm" onClick={() => setReviewTarget(record)}>
                    Review
                  </Button>
                </PermissionGate>
              </li>
            ))}
          </ul>
        )}
        <ProvenanceNote className="mt-3" tone="neutral" label="Approval">
          A correction only changes the attendance status after an approver with the workforce approval
          permission records a decision. The original value stays in the audit history.
        </ProvenanceNote>
      </SectionCard>

      <DataTable<AttendanceRow>
        columns={columns}
        data={rows}
        getRowId={(row) => row.id}
        caption="Attendance records with status, mine and contractor"
        loading={query.isLoading}
        error={query.error}
        onRetry={() => void query.refetch()}
        emptyTitle="No attendance records match the current filters"
        emptyDescription="Adjust the filters or clear the search term."
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
        secondaryColumns={['mineName', 'contractorName', 'recordedAt', 'actions']}
        renderMobileCard={(row) => (
          <div className="space-y-1.5">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-medium">{row.workerDisplayName}</p>
                <p className="text-xs text-muted-foreground">
                  {row.workerRef} · {formatDate(row.date)}
                </p>
              </div>
              <StatusBadge domain="attendance" value={row.status} />
            </div>
            <p className="text-xs text-muted-foreground">
              {row.mineName ?? '—'} · {row.contractorName || 'Direct employee'}
            </p>
          </div>
        )}
      />

      {correctionTarget && (
        <RequestCorrectionDialog
          open={Boolean(correctionTarget)}
          onOpenChange={(open) => !open && setCorrectionTarget(null)}
          record={correctionTarget}
          onDone={() => {
            setCorrectionTarget(null);
            void query.refetch();
          }}
        />
      )}

      {reviewTarget && (
        <ReviewCorrectionDialog
          open={Boolean(reviewTarget)}
          onOpenChange={(open) => !open && setReviewTarget(null)}
          record={reviewTarget}
          onDone={() => {
            setReviewTarget(null);
            void query.refetch();
          }}
        />
      )}
    </ListPage>
  );
}

function RequestCorrectionDialog({
  open,
  onOpenChange,
  record,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  record: AttendanceRow;
  onDone: () => void;
}) {
  const services = useServices();
  const form = useZodForm<AttendanceCorrectionFormValues>({
    schema: attendanceCorrectionSchema,
    defaultValues: { correctedStatus: record.status, reason: '' },
  });

  const mutation = useAppMutation({
    mutationFn: (values: AttendanceCorrectionFormValues) => {
      const parsed = attendanceCorrectionSchema.parse(values);
      return services.workforce.requestCorrection(record.id, parsed);
    },
    successMessage: 'Correction requested. It now awaits approval.',
    invalidates: [['workforce', 'list'], ['audit', 'list']],
  });

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await mutation.mutateAsync(values);
      onDone();
    } catch (error) {
      applyServerFieldErrors(error, form.setError as never);
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Request an attendance correction</DialogTitle>
          <DialogDescription>
            {record.workerDisplayName} · {formatDate(record.date)} · {SHIFT_LABELS[record.shift]} shift. The request
            is reviewed by an approver before the record changes.
          </DialogDescription>
        </DialogHeader>
        <FormProvider form={form}>
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            <FormErrorSummary form={form} />
            <SelectInput
              name="correctedStatus"
              label="Corrected status"
              required
              options={ATTENDANCE_STATUS_OPTIONS}
            />
            <TextAreaInput
              name="reason"
              label="Reason"
              required
              rows={3}
              description="Explain why the recorded attendance is wrong. This is shown to the approver."
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={mutation.isPending}>
                Submit request
              </Button>
            </DialogFooter>
          </form>
        </FormProvider>
      </DialogContent>
    </Dialog>
  );
}

function ReviewCorrectionDialog({
  open,
  onOpenChange,
  record,
  onDone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  record: AttendanceRow;
  onDone: () => void;
}) {
  const services = useServices();
  const pending = record.corrections.find((correction) => correction.status === 'pending');
  const [reason, setReason] = React.useState('');
  const [error, setError] = React.useState<string | undefined>();

  const mutation = useAppMutation({
    mutationFn: (input: { correctionId: string; approve: boolean; reason?: string }) =>
      services.workforce.approveCorrection(record.id, input.correctionId, input.approve, input.reason),
    successMessage: (updated, variables) =>
      variables.approve ? 'Correction approved and applied.' : 'Correction rejected.',
    invalidates: [['workforce', 'list'], ['audit', 'list']],
  });

  if (!pending) return null;

  const decide = async (approve: boolean) => {
    if (!approve && !reason.trim()) {
      setError('Provide a reason when rejecting a correction.');
      return;
    }
    setError(undefined);
    try {
      await mutation.mutateAsync({
        correctionId: pending.id,
        approve,
        reason: reason.trim() || undefined,
      });
      onDone();
    } catch {
      // The mutation wrapper surfaces the failure toast.
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Review attendance correction</DialogTitle>
          <DialogDescription>
            {record.workerDisplayName} · {formatDate(record.date)}. Approving applies the corrected status; the
            original value remains in the audit history.
          </DialogDescription>
        </DialogHeader>

        <dl className="space-y-2 text-sm">
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">Original</dt>
            <dd>{ATTENDANCE_STATUS_LABELS[pending.originalStatus]}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">Requested</dt>
            <dd>{ATTENDANCE_STATUS_LABELS[pending.correctedStatus]}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">Requested at</dt>
            <dd>{formatDateTime(pending.at)}</dd>
          </div>
        </dl>

        <div className="rounded-md border border-border/70 bg-muted/30 p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Reason given</p>
          <p className="mt-1 text-sm">{pending.reason}</p>
        </div>

        <div className="space-y-1.5">
          <label htmlFor="decision-reason" className="text-sm font-medium">
            Decision note <span className="font-normal text-muted-foreground">(required to reject)</span>
          </label>
          <textarea
            id="decision-reason"
            rows={2}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            aria-invalid={Boolean(error) || undefined}
            className="flex w-full rounded-md border border-input bg-white/80 px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          {error && (
            <p className="text-xs font-medium text-destructive" role="alert">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            loading={mutation.isPending}
            onClick={() => void decide(false)}
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
            Reject
          </Button>
          <Button type="button" loading={mutation.isPending} onClick={() => void decide(true)}>
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
            Approve
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
