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
  CheckboxGroupInput,
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
import { useMineOptions } from '@/lib/hooks/use-mine-options';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import {
  CONTRACTOR_COMPLIANCE_LABELS,
  CONTRACTOR_COMPLIANCE_OPTIONS,
  CONTRACTOR_TYPE_LABELS,
  CONTRACTOR_TYPE_OPTIONS,
} from '@/lib/domain/reference';
import { formatDate } from '@/lib/formatting/dates';
import { contractorSchema, type ContractorFormValues } from '@/lib/validation/schemas';
import type { Contractor } from '@/types';

type ContractorRow = Contractor & {
  mineNames?: string;
  contractCount?: number;
  nextContractEnd?: string;
};

function ComplianceBadge({ status }: { status: Contractor['complianceStatus'] }) {
  return <StatusBadge domain="contractor_compliance" value={status} />;
}

export default function ContractorsPage() {
  const services = useServices();
  const router = useRouter();
  const [state, update, reset] = useListQueryState({ pageSize: 20 });
  const [searchInput, setSearchInput] = React.useState('');
  const debouncedSearch = useDebouncedValue(searchInput, 300);
  const [createOpen, setCreateOpen] = React.useState(false);

  const { options: mineOptions } = useMineOptions();

  React.useEffect(() => {
    update({ search: debouncedSearch });
  }, [debouncedSearch, update]);

  const query = useListData<ContractorRow>('contractors', state, (listQuery) =>
    services.contractors.list(listQuery),
  );

  const rows = query.data?.items ?? [];
  const meta = query.data?.meta;

  const sorting: SortingState = state.sortBy
    ? [{ id: state.sortBy, desc: state.sortDir === 'desc' }]
    : [];

  const columns = React.useMemo<ColumnDef<ContractorRow, unknown>[]>(
    () => [
      {
        id: 'name',
        header: 'Contractor',
        accessorKey: 'name',
        enableSorting: true,
        meta: { label: 'Contractor' },
        cell: ({ row }) => (
          <div className="min-w-0">
            <Link
              href={`/contractors/${row.original.id}`}
              className="font-medium underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {row.original.name}
            </Link>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {row.original.code} · {CONTRACTOR_TYPE_LABELS[row.original.type]}
            </p>
          </div>
        ),
      },
      {
        id: 'complianceStatus',
        header: 'Compliance',
        accessorKey: 'complianceStatus',
        enableSorting: true,
        meta: { label: 'Compliance' },
        cell: ({ row }) => (
          <div className="flex flex-col gap-1">
            <ComplianceBadge status={row.original.complianceStatus} />
            <span className="text-[11px] text-muted-foreground">
              {row.original.verifiedDocumentIds.length}/{row.original.requiredDocumentIds.length} docs verified
            </span>
          </div>
        ),
      },
      {
        id: 'mineNames',
        header: 'Mines',
        enableSorting: false,
        meta: { label: 'Mines' },
        cell: ({ row }) => (
          <span className="text-xs">{row.original.mineNames || `${row.original.mineIds.length} mine(s)`}</span>
        ),
      },
      {
        id: 'contactPerson',
        header: 'Contact',
        enableSorting: false,
        meta: { label: 'Contact', secondary: true },
        cell: ({ row }) => (
          <div className="text-xs">
            <p>{row.original.contactPerson}</p>
            <p className="text-muted-foreground">{row.original.contactPhone}</p>
          </div>
        ),
      },
      {
        id: 'contractCount',
        header: 'Contracts',
        enableSorting: false,
        meta: { label: 'Contracts', secondary: true },
        cell: ({ row }) => (
          <div className="text-xs">
            <p className="tabular-nums">{row.original.contractCount ?? 0}</p>
            {row.original.nextContractEnd && (
              <p className="text-muted-foreground">Ends {formatDate(row.original.nextContractEnd)}</p>
            )}
          </div>
        ),
      },
      {
        id: 'openCorrectiveActionIds',
        header: 'Open actions',
        enableSorting: false,
        meta: { label: 'Open actions', secondary: true },
        cell: ({ row }) => (
          <span
            className={`text-xs tabular-nums ${
              row.original.openCorrectiveActionIds.length > 0 ? 'font-medium text-warning-strong' : ''
            }`}
          >
            {row.original.openCorrectiveActionIds.length}
          </span>
        ),
      },
      {
        id: 'registeredOn',
        header: 'Registered',
        accessorKey: 'registeredOn',
        enableSorting: true,
        meta: { label: 'Registered', secondary: true },
        cell: ({ row }) => (
          <span className="text-xs tabular-nums">{formatDate(row.original.registeredOn)}</span>
        ),
      },
    ],
    [],
  );

  return (
    <ListPage
      title="Contractors"
      description="Contractor registry with document verification status, mine associations and the contracts in force."
      headerActions={
        <>
          <ExportButton
            rows={rows}
            fileName="coalguard-contractors"
            columns={[
              { key: 'code', label: 'Contractor code', value: (row) => row.code },
              { key: 'name', label: 'Name', value: (row) => row.name },
              { key: 'type', label: 'Type', value: (row) => CONTRACTOR_TYPE_LABELS[row.type] },
              {
                key: 'compliance',
                label: 'Compliance status',
                value: (row) => CONTRACTOR_COMPLIANCE_LABELS[row.complianceStatus],
              },
              { key: 'mines', label: 'Mines', value: (row) => row.mineNames ?? row.mineIds.join('; ') },
              {
                key: 'verified',
                label: 'Verified documents',
                value: (row) => `${row.verifiedDocumentIds.length}/${row.requiredDocumentIds.length}`,
              },
              { key: 'contact', label: 'Contact person', value: (row) => row.contactPerson },
              { key: 'email', label: 'Contact email', value: (row) => row.contactEmail },
              { key: 'phone', label: 'Contact phone', value: (row) => row.contactPhone },
              { key: 'registered', label: 'Registered on', value: (row) => row.registeredOn },
            ]}
          />
          <PermissionGate permission="contractor.create" showFallback={false}>
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              Add contractor
            </Button>
          </PermissionGate>
        </>
      }
      toolbar={
        <FilterBar
          searchValue={searchInput}
          onSearchChange={setSearchInput}
          searchPlaceholder="Search by name, code or contact person"
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
            options={CONTRACTOR_TYPE_OPTIONS}
            allLabel="All types"
          />
          <FilterSelect
            label="Compliance"
            value={state.filters.complianceStatus ?? 'all'}
            onValueChange={(value) => update({ filters: { ...state.filters, complianceStatus: value } })}
            options={CONTRACTOR_COMPLIANCE_OPTIONS}
            allLabel="Any status"
          />
          <FilterSelect
            label="Mine"
            value={state.filters.mineIds ?? 'all'}
            onValueChange={(value) => update({ filters: { ...state.filters, mineIds: value } })}
            options={mineOptions}
            allLabel="All mines"
          />
        </FilterBar>
      }
    >
      <DataTable<ContractorRow>
        columns={columns}
        data={rows}
        getRowId={(row) => row.id}
        caption="Contractors with compliance status, mine associations and contracts"
        loading={query.isLoading}
        error={query.error}
        onRetry={() => void query.refetch()}
        emptyTitle="No contractors match the current filters"
        emptyDescription="Adjust the filters, or add a contractor to the registry."
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
        secondaryColumns={['contactPerson', 'contractCount', 'openCorrectiveActionIds', 'registeredOn']}
        renderMobileCard={(row) => (
          <div className="space-y-1.5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <Link href={`/contractors/${row.id}`} className="font-medium underline-offset-2 hover:underline">
                  {row.name}
                </Link>
                <p className="text-xs text-muted-foreground">
                  {row.code} · {CONTRACTOR_TYPE_LABELS[row.type]}
                </p>
              </div>
              <ComplianceBadge status={row.complianceStatus} />
            </div>
            <p className="text-xs text-muted-foreground">
              {row.contactPerson} · {row.verifiedDocumentIds.length}/{row.requiredDocumentIds.length} docs verified
            </p>
          </div>
        )}
      />

      <CreateContractorDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        mineOptions={mineOptions}
        onCreated={(contractor) => router.push(`/contractors/${contractor.id}`)}
      />
    </ListPage>
  );
}

function CreateContractorDialog({
  open,
  onOpenChange,
  mineOptions,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mineOptions: { value: string; label: string }[];
  onCreated: (contractor: Contractor) => void;
}) {
  const services = useServices();

  const emptyValues: ContractorFormValues = {
    code: '',
    name: '',
    type: 'transport',
    contactPerson: '',
    contactEmail: '',
    contactPhone: '',
    registeredAddress: '',
    mineIds: [],
    registeredOn: '',
    panNumber: '',
    gstNumber: '',
  };

  const form = useZodForm<ContractorFormValues>({ schema: contractorSchema, defaultValues: emptyValues });

  React.useEffect(() => {
    if (open) form.reset(emptyValues);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const mutation = useAppMutation({
    mutationFn: async (values: ContractorFormValues) => {
      const parsed = contractorSchema.parse(values);
      return services.contractors.create({
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
    successMessage: (contractor) => `Contractor ${contractor.code} added.`,
    invalidates: [['contractors', 'list'], ['dashboard'], ['audit', 'list']],
  });

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const contractor = await mutation.mutateAsync(values);
      onOpenChange(false);
      onCreated(contractor);
    } catch (error) {
      applyServerFieldErrors(error, form.setError as never);
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add a contractor</DialogTitle>
          <DialogDescription>
            A new contractor starts as <em>unassessed</em>. Compliance status is derived from document
            verification and recorded findings — it is never entered directly.
          </DialogDescription>
        </DialogHeader>

        <FormProvider form={form}>
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            <FormErrorSummary form={form} />

            <div className="grid gap-3 sm:grid-cols-2">
              <TextInput name="code" label="Contractor code" required placeholder="e.g. CTR-0042" />
              <SelectInput name="type" label="Contractor type" required options={CONTRACTOR_TYPE_OPTIONS} />
            </div>

            <TextInput name="name" label="Registered name" required />

            <div className="grid gap-3 sm:grid-cols-2">
              <TextInput name="contactPerson" label="Contact person" required />
              <TextInput name="contactPhone" label="Contact phone" required />
            </div>

            <TextInput name="contactEmail" label="Contact email" type="email" required />

            <TextAreaInput name="registeredAddress" label="Registered address" required rows={2} />

            <CheckboxGroupInput
              name="mineIds"
              label="Associated mines"
              required
              options={mineOptions}
              description="At least one mine is required."
            />

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
                Add contractor
              </Button>
            </DialogFooter>
          </form>
        </FormProvider>
      </DialogContent>
    </Dialog>
  );
}
