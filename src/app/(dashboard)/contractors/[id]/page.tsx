'use client';

import * as React from 'react';
import Link from 'next/link';
import { Archive, Pencil } from 'lucide-react';
import type { ColumnDef } from '@tanstack/react-table';

import { DataTable } from '@/components/data-display/data-table';
import { DetailList, SectionCard } from '@/components/data-display/detail-list';
import { StatusBadge } from '@/components/data-display/status-badge';
import { ErrorState, LoadingState } from '@/components/data-display/states';
import { DetailPage } from '@/components/shared/page-shell';
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
import { useMineOptions } from '@/lib/hooks/use-mine-options';
import {
  CONTRACTOR_TYPE_LABELS,
  CONTRACTOR_TYPE_OPTIONS,
  DOCUMENT_TYPE_LABELS,
} from '@/lib/domain/reference';
import { daysUntil, deadlineState, formatDate } from '@/lib/formatting/dates';
import { contractorSchema, type ContractorFormValues } from '@/lib/validation/schemas';
import type { Contract, DocumentRecord } from '@/types';

type ContractRow = Contract & { mineName?: string; daysToExpiry?: number | null };

export default function ContractorDetailPage({ params }: { params: { id: string } }) {
  const services = useServices();
  const contractor = useApiQuery(['contractors', 'detail', params.id], () =>
    services.contractors.get(params.id),
  );
  const { mines } = useMineOptions();
  const contracts = useApiQuery(
    ['contractors', 'contracts', { contractorId: params.id }],
    () => services.contractors.contracts({ pageSize: 50, filters: { contractorId: params.id } }),
    { enabled: contractor.isSuccess },
  );
  const documents = useApiQuery(['documents', 'list', { pageSize: 200 }], () =>
    services.documents.list({ pageSize: 200 }),
  );

  const [editOpen, setEditOpen] = React.useState(false);
  const [archiveOpen, setArchiveOpen] = React.useState(false);

  if (contractor.isLoading) return <LoadingState label="Loading contractor" />;
  if (contractor.error) {
    return (
      <ErrorState
        title="This contractor could not be loaded"
        description={contractor.error.message}
        onRetry={() => void contractor.refetch()}
      />
    );
  }
  if (!contractor.data) return null;

  const item = contractor.data;
  const requiredDocs = (documents.data?.items ?? []).filter((doc) =>
    item.requiredDocumentIds.includes(doc.id),
  );
  const missingDocs = item.requiredDocumentIds.filter((id) => !item.verifiedDocumentIds.includes(id));

  const contractColumns: ColumnDef<ContractRow, unknown>[] = [
    {
      id: 'title',
      header: 'Contract',
      meta: { label: 'Contract' },
      cell: ({ row }) => (
        <div>
          <p className="text-sm font-medium">{row.original.title}</p>
          <p className="text-xs text-muted-foreground">{row.original.code}</p>
        </div>
      ),
    },
    {
      id: 'mineName',
      header: 'Mine',
      meta: { label: 'Mine' },
      cell: ({ row }) => <span className="text-xs">{row.original.mineName ?? '—'}</span>,
    },
    {
      id: 'period',
      header: 'Period',
      meta: { label: 'Period' },
      cell: ({ row }) => (
        <div className="text-xs tabular-nums">
          <p>
            {formatDate(row.original.startDate)} → {formatDate(row.original.endDate)}
          </p>
          {row.original.status === 'active' && (() => {
            const days = daysUntil(row.original.endDate);
            if (days === null) return null;
            const state = deadlineState(row.original.endDate);
            if (state === 'overdue') return <p className="font-medium text-destructive">Expired</p>;
            if (days <= 60) return <p className="text-warning-strong">Expires in {days} day(s)</p>;
            return null;
          })()}
        </div>
      ),
    },
    {
      id: 'status',
      header: 'Status',
      meta: { label: 'Status' },
      cell: ({ row }) => <Badge variant="outline">{row.original.status}</Badge>,
    },
    {
      id: 'value',
      header: 'Value',
      meta: { label: 'Value', secondary: true },
      cell: ({ row }) => (
        <span className="text-xs tabular-nums">
          {row.original.valueInrLakhs !== undefined ? `₹${row.original.valueInrLakhs} lakh` : '—'}
        </span>
      ),
    },
  ];

  return (
    <DetailPage
      title={item.name}
      description={`${item.code} · ${CONTRACTOR_TYPE_LABELS[item.type]}`}
      backHref="/contractors"
      backLabel="Back to contractors"
      headerMeta={<StatusBadge domain="contractor_compliance" value={item.complianceStatus} />}
      headerActions={
        <>
          <PermissionGate permission="contractor.edit" showFallback={false}>
            <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
              Edit
            </Button>
          </PermissionGate>
          <PermissionGate permission="contractor.archive" showFallback={false}>
            <Button variant="outline" size="sm" onClick={() => setArchiveOpen(true)}>
              <Archive className="h-3.5 w-3.5" aria-hidden="true" />
              Archive
            </Button>
          </PermissionGate>
        </>
      }
    >
      <div className="grid gap-4 lg:grid-cols-3">
        <SectionCard title="Contractor record" className="lg:col-span-2">
          <DetailList
            columns={2}
            items={[
              { label: 'Contractor code', value: item.code },
              { label: 'Registered name', value: item.name },
              { label: 'Type', value: CONTRACTOR_TYPE_LABELS[item.type] },
              { label: 'Registered on', value: formatDate(item.registeredOn) },
              { label: 'Contact person', value: item.contactPerson },
              {
                label: 'Contact email',
                value: (
                  <a href={`mailto:${item.contactEmail}`} className="underline-offset-2 hover:underline">
                    {item.contactEmail}
                  </a>
                ),
              },
              { label: 'Contact phone', value: item.contactPhone },
              { label: 'PAN', value: item.panNumber ?? 'Not recorded' },
              { label: 'GSTIN', value: item.gstNumber ?? 'Not recorded' },
              { label: 'Registered address', value: item.registeredAddress },
              {
                label: 'Associated mines',
                value: (
                  <ul className="space-y-0.5">
                    {item.mineIds.map((mineId) => (
                      <li key={mineId}>
                        <Link href={`/mines/${mineId}`} className="underline-offset-2 hover:underline">
                          {mines.find((mine) => mine.id === mineId)?.name ?? mineId}
                        </Link>
                      </li>
                    ))}
                  </ul>
                ),
              },
              {
                label: 'Compliance status',
                value: <StatusBadge domain="contractor_compliance" value={item.complianceStatus} />,
                hint: 'Derived from document verification and recorded findings.',
              },
            ]}
          />
        </SectionCard>

        <SectionCard title="Document verification" description="Statutory documents required of this contractor.">
          {missingDocs.length === 0 ? (
            <p className="text-sm text-success">Every required document is verified.</p>
          ) : (
            <p className="text-sm">
              <span className="font-medium text-warning-strong">{missingDocs.length}</span> of{' '}
              {item.requiredDocumentIds.length} required document(s) remain unverified.
            </p>
          )}
          <ul className="mt-3 space-y-2">
            {requiredDocs.map((doc: DocumentRecord) => {
              const verified = item.verifiedDocumentIds.includes(doc.id);
              return (
                <li key={doc.id} className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <Link
                      href={`/documents/${doc.id}`}
                      className="text-sm underline-offset-2 hover:underline"
                    >
                      {doc.name}
                    </Link>
                    <p className="text-xs text-muted-foreground">{DOCUMENT_TYPE_LABELS[doc.type]}</p>
                  </div>
                  <Badge variant={verified ? 'success' : 'warning'}>{verified ? 'Verified' : 'Pending'}</Badge>
                </li>
              );
            })}
            {requiredDocs.length === 0 && (
              <li className="text-sm text-muted-foreground">No document requirement is configured.</li>
            )}
          </ul>
          <ProvenanceNote className="mt-3" tone="neutral" label="Verification">
            Verification is recorded by a document reviewer. The interface never marks a document verified
            automatically.
          </ProvenanceNote>
        </SectionCard>
      </div>

      <SectionCard
        title="Contracts"
        description={`${contracts.data?.meta.total ?? 0} contract(s) on record.`}
      >
        {contracts.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading contracts…</p>
        ) : contracts.error ? (
          <p className="text-sm text-destructive">{contracts.error.message}</p>
        ) : (
          <DataTable<ContractRow>
            columns={contractColumns}
            data={contracts.data?.items ?? []}
            getRowId={(row) => row.id}
            caption="Contracts held by this contractor"
            emptyTitle="No contracts are recorded for this contractor"
            page={1}
            pageSize={Math.max(contracts.data?.items.length ?? 1, 1)}
            total={contracts.data?.items.length ?? 0}
            secondaryColumns={['value']}
          />
        )}
      </SectionCard>

      <SectionCard title="Linked governance records" description="Findings and actions involving this contractor.">
        <DetailList
          columns={3}
          items={[
            {
              label: 'Safety records',
              value:
                item.safetyRecordIds.length === 0 ? (
                  'None'
                ) : (
                  <ul className="space-y-0.5">
                    {item.safetyRecordIds.map((id) => (
                      <li key={id}>
                        <Link href={`/safety/${id}`} className="underline-offset-2 hover:underline">
                          {id}
                        </Link>
                      </li>
                    ))}
                  </ul>
                ),
            },
            {
              label: 'Inspections',
              value:
                item.inspectionIds.length === 0 ? (
                  'None'
                ) : (
                  <ul className="space-y-0.5">
                    {item.inspectionIds.map((id) => (
                      <li key={id}>
                        <Link href={`/inspections/${id}`} className="underline-offset-2 hover:underline">
                          {id}
                        </Link>
                      </li>
                    ))}
                  </ul>
                ),
            },
            {
              label: 'Open corrective actions',
              value:
                item.openCorrectiveActionIds.length === 0 ? (
                  'None'
                ) : (
                  <ul className="space-y-0.5">
                    {item.openCorrectiveActionIds.map((id) => (
                      <li key={id}>
                        <Link href={`/corrective-actions/${id}`} className="underline-offset-2 hover:underline">
                          {id}
                        </Link>
                      </li>
                    ))}
                  </ul>
                ),
            },
          ]}
        />
      </SectionCard>

      {editOpen && (
        <EditContractorDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          contractor={item}
          onSaved={() => void contractor.refetch()}
        />
      )}

      <ArchiveContractorDialog
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        contractorId={item.id}
        contractorName={item.name}
        onArchived={() => void contractor.refetch()}
      />
    </DetailPage>
  );
}

function EditContractorDialog({
  open,
  onOpenChange,
  contractor,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contractor: import('@/types').Contractor;
  onSaved: () => void;
}) {
  const services = useServices();
  const { options: mineOptions } = useMineOptions();

  const values: ContractorFormValues = {
    code: contractor.code,
    name: contractor.name,
    type: contractor.type,
    contactPerson: contractor.contactPerson,
    contactEmail: contractor.contactEmail,
    contactPhone: contractor.contactPhone,
    registeredAddress: contractor.registeredAddress,
    mineIds: contractor.mineIds,
    registeredOn: contractor.registeredOn,
    panNumber: contractor.panNumber ?? '',
    gstNumber: contractor.gstNumber ?? '',
  };

  const form = useZodForm<ContractorFormValues>({ schema: contractorSchema, defaultValues: values });

  const mutation = useAppMutation({
    mutationFn: async (input: ContractorFormValues) => {
      const parsed = contractorSchema.parse(input);
      return services.contractors.update(contractor.id, {
        code: parsed.code,
        name: parsed.name,
        type: parsed.type,
        contactPerson: parsed.contactPerson,
        contactEmail: parsed.contactEmail,
        contactPhone: parsed.contactPhone,
        registeredAddress: parsed.registeredAddress,
        mineIds: parsed.mineIds,
        registeredOn: parsed.registeredOn,
        panNumber: parsed.panNumber,
        gstNumber: parsed.gstNumber,
      });
    },
    successMessage: (updated) => `Contractor ${updated.code} updated.`,
    invalidates: [['contractors', 'detail', contractor.id], ['contractors', 'list'], ['audit', 'list']],
  });

  const onSubmit = form.handleSubmit(async (input) => {
    try {
      await mutation.mutateAsync(input);
      onOpenChange(false);
      onSaved();
    } catch (error) {
      applyServerFieldErrors(error, form.setError as never);
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit {contractor.name}</DialogTitle>
          <DialogDescription>Changes are recorded in the audit trail.</DialogDescription>
        </DialogHeader>
        <FormProvider form={form}>
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            <FormErrorSummary form={form} />
            <div className="grid gap-3 sm:grid-cols-2">
              <TextInput name="code" label="Contractor code" required />
              <SelectInput name="type" label="Contractor type" required options={CONTRACTOR_TYPE_OPTIONS} />
            </div>
            <TextInput name="name" label="Registered name" required />
            <div className="grid gap-3 sm:grid-cols-2">
              <TextInput name="contactPerson" label="Contact person" required />
              <TextInput name="contactPhone" label="Contact phone" required />
            </div>
            <TextInput name="contactEmail" label="Contact email" type="email" required />
            <TextAreaInput name="registeredAddress" label="Registered address" required rows={2} />
            <CheckboxGroupInput name="mineIds" label="Associated mines" required options={mineOptions} />
            <div className="grid gap-3 sm:grid-cols-3">
              <TextInput name="registeredOn" label="Registered on" type="date" required />
              <TextInput name="panNumber" label="PAN" />
              <TextInput name="gstNumber" label="GSTIN" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={mutation.isPending}>
                Save changes
              </Button>
            </DialogFooter>
          </form>
        </FormProvider>
      </DialogContent>
    </Dialog>
  );
}

function ArchiveContractorDialog({
  open,
  onOpenChange,
  contractorId,
  contractorName,
  onArchived,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contractorId: string;
  contractorName: string;
  onArchived: () => void;
}) {
  const services = useServices();
  const [reason, setReason] = React.useState('');
  const [error, setError] = React.useState<string | undefined>();

  const mutation = useAppMutation({
    mutationFn: (input: { id: string; reason: string }) => services.contractors.archive(input.id, input.reason),
    successMessage: `Contractor archived.`,
    invalidates: [['contractors', 'detail', contractorId], ['contractors', 'list'], ['audit', 'list']],
  });

  React.useEffect(() => {
    if (open) {
      setReason('');
      setError(undefined);
    }
  }, [open]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!reason.trim()) {
      setError('Provide the reason for archiving this contractor.');
      return;
    }
    try {
      await mutation.mutateAsync({ id: contractorId, reason: reason.trim() });
      onOpenChange(false);
      onArchived();
    } catch {
      // The mutation wrapper surfaces the failure toast.
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Archive {contractorName}?</DialogTitle>
          <DialogDescription>
            Archiving resets the contractor&apos;s compliance status to <em>unassessed</em> and records the reason
            in the audit trail. No record is deleted.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <label htmlFor="contractor-archive-reason" className="text-sm font-medium">
              Reason <span className="text-destructive">*</span>
            </label>
            <textarea
              id="contractor-archive-reason"
              rows={3}
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
            <Button type="submit" variant="destructive" loading={mutation.isPending}>
              Archive contractor
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
