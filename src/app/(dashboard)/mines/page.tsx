'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { MapPin, Plus } from 'lucide-react';
import type { ColumnDef, SortingState } from '@tanstack/react-table';

import { DataTable } from '@/components/data-display/data-table';
import { FilterBar, FilterSelect } from '@/components/data-display/filter-bar';
import { ListPage } from '@/components/shared/page-shell';
import { ExportButton } from '@/components/shared/export-button';
import { PermissionGate } from '@/components/shared/permission-gate';
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
import {
  FormErrorSummary,
  FormProvider,
  NumberInput,
  SelectInput,
  TextAreaInput,
  TextInput,
  useZodForm,
} from '@/components/forms/form';
import { LocationCapture } from '@/components/maps/location-capture';
import { useApiQuery, useServices } from '@/lib/api/use-services';
import { useListData, useListQueryState } from '@/lib/hooks/use-list-query';
import { useAppMutation } from '@/lib/hooks/use-app-mutation';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { mineSchema, type MineFormValues } from '@/lib/validation/schemas';
import { OPERATIONAL_STATUS_LABELS, OPERATIONAL_STATUS_OPTIONS } from '@/lib/domain/reference';
import { formatDate } from '@/lib/formatting/dates';
import { formatTonnes } from '@/lib/formatting/numbers';
import { applyServerFieldErrors } from '@/lib/errors/normalise';
import type { GeoPoint, Mine } from '@/types';

export type MineRow = Mine & { subsidiaryName?: string };

export default function MinesPage() {
  const services = useServices();
  const router = useRouter();
  const [state, update, reset] = useListQueryState({ pageSize: 20 });
  const [searchInput, setSearchInput] = React.useState('');
  const debouncedSearch = useDebouncedValue(searchInput, 300);
  const [createOpen, setCreateOpen] = React.useState(false);

  React.useEffect(() => {
    update({ search: debouncedSearch });
  }, [debouncedSearch, update]);

  const query = useListData<MineRow>('mines', state, (listQuery) => services.mines.list(listQuery));
  const subsidiaries = useApiQuery(['subsidiaries', 'list'], () => services.mines.subsidiaries());
  const regions = useApiQuery(['mines', 'regions'], async () => {
    const result = await services.mines.list({ pageSize: 200 });
    return Array.from(new Set(result.items.map((mine) => mine.region))).sort();
  });

  const sorting: SortingState = state.sortBy
    ? [{ id: state.sortBy, desc: state.sortDir === 'desc' }]
    : [];

  const rows = query.data?.items ?? [];
  const meta = query.data?.meta;

  const columns = React.useMemo<ColumnDef<MineRow, unknown>[]>(
    () => [
      {
        id: 'name',
        accessorKey: 'name',
        header: 'Mine',
        enableSorting: true,
        meta: { label: 'Mine' },
        cell: ({ row }) => (
          <div className="min-w-0">
            <Link
              href={`/mines/${row.original.id}`}
              className="font-medium underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {row.original.name}
            </Link>
            <p className="mt-0.5 text-xs text-muted-foreground">{row.original.code}</p>
          </div>
        ),
      },
      {
        id: 'location',
        header: 'Location',
        enableSorting: false,
        meta: { label: 'Location' },
        cell: ({ row }) => (
          <div className="text-xs">
            <p className="font-medium">
              {row.original.district}, {row.original.state}
            </p>
            <p className="text-muted-foreground">{row.original.region}</p>
          </div>
        ),
      },
      {
        id: 'operationalStatus',
        accessorKey: 'operationalStatus',
        header: 'Operational status',
        enableSorting: true,
        meta: { label: 'Operational status' },
        cell: ({ row }) => (
          <Badge
            variant={
              row.original.operationalStatus === 'operational'
                ? 'success'
                : row.original.operationalStatus === 'partial'
                  ? 'warning'
                  : row.original.operationalStatus === 'suspended'
                    ? 'destructive'
                    : 'muted'
            }
          >
            {OPERATIONAL_STATUS_LABELS[row.original.operationalStatus]}
          </Badge>
        ),
      },
      {
        id: 'approvedCapacityTPA',
        accessorKey: 'approvedCapacityTPA',
        header: 'Approved capacity',
        enableSorting: true,
        meta: { label: 'Approved capacity', secondary: true },
        cell: ({ row }) => (
          <span className="text-xs tabular-nums">
            {row.original.approvedCapacityTPA ? formatTonnes(row.original.approvedCapacityTPA) : '—'}
          </span>
        ),
      },
      {
        id: 'commissionedOn',
        accessorKey: 'commissionedOn',
        header: 'Commissioned',
        enableSorting: true,
        meta: { label: 'Commissioned', secondary: true },
        cell: ({ row }) => <span className="text-xs">{formatDate(row.original.commissionedOn)}</span>,
      },
      {
        id: 'coordinates',
        header: 'Coordinates',
        enableSorting: false,
        meta: { label: 'Coordinates', secondary: true },
        cell: ({ row }) =>
          row.original.location ? (
            <span className="inline-flex items-center gap-1 text-xs tabular-nums">
              <MapPin className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
              {row.original.location.lat.toFixed(4)}, {row.original.location.lng.toFixed(4)}
              <span className="text-muted-foreground">({row.original.location.source})</span>
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">Not recorded</span>
          ),
      },
    ],
    [],
  );

  return (
    <ListPage
      title="Mine register"
      description="Every mine in scope with its subsidiary, operational status, approved capacity and recorded location. Coordinates come from the source system and are never estimated by the interface."
      headerActions={
        <>
          <ExportButton
            rows={rows}
            fileName="coalguard-mines"
            columns={[
              { key: 'code', label: 'Mine code', value: (row) => row.code },
              { key: 'name', label: 'Mine name', value: (row) => row.name },
              { key: 'subsidiary', label: 'Subsidiary', value: (row) => row.subsidiaryName ?? '' },
              { key: 'region', label: 'Region', value: (row) => row.region },
              { key: 'district', label: 'District', value: (row) => row.district },
              { key: 'state', label: 'State', value: (row) => row.state },
              {
                key: 'operationalStatus',
                label: 'Operational status',
                value: (row) => OPERATIONAL_STATUS_LABELS[row.operationalStatus],
              },
              {
                key: 'approvedCapacityTPA',
                label: 'Approved capacity (TPA)',
                value: (row) => row.approvedCapacityTPA ?? '',
              },
              { key: 'lat', label: 'Latitude', value: (row) => row.location?.lat ?? '' },
              { key: 'lng', label: 'Longitude', value: (row) => row.location?.lng ?? '' },
              { key: 'coordinateSource', label: 'Coordinate source', value: (row) => row.location?.source ?? '' },
            ]}
          />
          <PermissionGate permission="mine.create" showFallback={false}>
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              Add mine
            </Button>
          </PermissionGate>
        </>
      }
      toolbar={
        <FilterBar
          searchValue={searchInput}
          onSearchChange={setSearchInput}
          searchPlaceholder="Search by mine name, code or district"
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
            label="Subsidiary"
            value={state.filters.subsidiaryId ?? 'all'}
            onValueChange={(value) => update({ filters: { ...state.filters, subsidiaryId: value } })}
            options={(subsidiaries.data ?? []).map((entry) => ({ value: entry.id, label: entry.name }))}
            allLabel="All subsidiaries"
          />
          <FilterSelect
            label="Status"
            value={state.filters.operationalStatus ?? 'all'}
            onValueChange={(value) => update({ filters: { ...state.filters, operationalStatus: value } })}
            options={OPERATIONAL_STATUS_OPTIONS}
            allLabel="All statuses"
          />
          <FilterSelect
            label="Region"
            value={state.filters.region ?? 'all'}
            onValueChange={(value) => update({ filters: { ...state.filters, region: value } })}
            options={(regions.data ?? []).map((region) => ({ value: region, label: region }))}
            allLabel="All regions"
          />
        </FilterBar>
      }
    >
      <DataTable<MineRow>
        columns={columns}
        data={rows}
        getRowId={(row) => row.id}
        caption="Registered mines with operational status, approved capacity and recorded coordinates"
        loading={query.isLoading}
        error={query.error}
        onRetry={() => void query.refetch()}
        emptyTitle="No mines match the current filters"
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
        onRowClick={(row) => router.push(`/mines/${row.id}`)}
        secondaryColumns={['approvedCapacityTPA', 'commissionedOn', 'coordinates']}
        renderMobileCard={(row) => (
          <div className="space-y-1.5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-medium">{row.name}</p>
                <p className="text-xs text-muted-foreground">{row.code}</p>
              </div>
              <Badge
                variant={
                  row.operationalStatus === 'operational'
                    ? 'success'
                    : row.operationalStatus === 'partial'
                      ? 'warning'
                      : row.operationalStatus === 'suspended'
                        ? 'destructive'
                        : 'muted'
                }
              >
                {OPERATIONAL_STATUS_LABELS[row.operationalStatus]}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              {row.district}, {row.state} · {formatTonnes(row.approvedCapacityTPA ?? null)} approved capacity
            </p>
            {row.location && (
              <p className="text-xs tabular-nums text-muted-foreground">
                {row.location.lat.toFixed(5)}, {row.location.lng.toFixed(5)} ({row.location.source})
              </p>
            )}
          </div>
        )}
      />

      <CreateMineDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        subsidiaries={subsidiaries.data ?? []}
        onCreated={(mine) => router.push(`/mines/${mine.id}`)}
      />
    </ListPage>
  );
}

function CreateMineDialog({
  open,
  onOpenChange,
  subsidiaries,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subsidiaries: { id: string; name: string }[];
  onCreated: (mine: Mine) => void;
}) {
  const services = useServices();
  const [location, setLocation] = React.useState<GeoPoint | null>(null);
  const defaultSubsidiary = subsidiaries[0]?.id ?? '';

  const emptyValues: MineFormValues = {
    code: '',
    name: '',
    subsidiaryId: defaultSubsidiary,
    region: '',
    district: '',
    state: '',
    operationalStatus: 'operational',
    approvedCapacityTPA: undefined,
    commissionedOn: '',
    contactPhone: '',
    note: '',
  };

  const form = useZodForm<MineFormValues>({ schema: mineSchema, defaultValues: emptyValues });

  React.useEffect(() => {
    if (!open) return;
    form.reset({ ...emptyValues, subsidiaryId: defaultSubsidiary });
    setLocation(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultSubsidiary]);

  const mutation = useAppMutation({
    mutationFn: async (values: MineFormValues) => {
      const parsed = mineSchema.parse(values);
      return services.mines.create({
        code: parsed.code,
        name: parsed.name,
        subsidiaryId: parsed.subsidiaryId,
        region: parsed.region,
        district: parsed.district,
        state: parsed.state,
        operationalStatus: parsed.operationalStatus,
        approvedCapacityTPA: parsed.approvedCapacityTPA,
        commissionedOn: parsed.commissionedOn,
        contactPhone: parsed.contactPhone,
        note: parsed.note,
        lat: location?.lat,
        lng: location?.lng,
      });
    },
    successMessage: (mine) => `Mine ${mine.code} created.`,
    invalidates: [['mines', 'list'], ['mines', 'regions'], ['dashboard']],
  });

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const mine = await mutation.mutateAsync(values);
      onOpenChange(false);
      onCreated(mine);
    } catch (error) {
      applyServerFieldErrors(error, form.setError as never);
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add a mine</DialogTitle>
          <DialogDescription>
            The mine code must be unique. Coordinates are optional and are stored with their
            provenance, so the register always shows where a position came from.
          </DialogDescription>
        </DialogHeader>

        <FormProvider form={form}>
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            <FormErrorSummary form={form} />

            <div className="grid gap-3 sm:grid-cols-2">
              <TextInput name="code" label="Mine code" required placeholder="e.g. RMC-JDH-04" />
              <TextInput name="name" label="Mine name" required placeholder="e.g. Rajmahal Pit 04" />
            </div>

            <SelectInput
              name="subsidiaryId"
              label="Subsidiary"
              required
              options={subsidiaries.map((entry) => ({ value: entry.id, label: entry.name }))}
            />

            <div className="grid gap-3 sm:grid-cols-3">
              <TextInput name="region" label="Region" required />
              <TextInput name="district" label="District" required />
              <TextInput name="state" label="State" required />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <SelectInput
                name="operationalStatus"
                label="Operational status"
                required
                options={OPERATIONAL_STATUS_OPTIONS}
              />
              <NumberInput
                name="approvedCapacityTPA"
                label="Approved capacity (tonnes per annum)"
                min={0}
                step={1000}
                description="Optional. Leave blank when the approved capacity is not configured."
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <TextInput name="commissionedOn" label="Commissioned on" type="date" />
              <TextInput name="contactPhone" label="Site contact phone" />
            </div>

            <LocationCapture
              value={location}
              onChange={setLocation}
              description="Optional. Capture the device position when registering on site, or enter the coordinates from the mine registry."
            />

            <TextAreaInput name="note" label="Operational note" rows={3} />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={form.formState.isSubmitting}>
                Create mine
              </Button>
            </DialogFooter>
          </form>
        </FormProvider>
      </DialogContent>
    </Dialog>
  );
}
