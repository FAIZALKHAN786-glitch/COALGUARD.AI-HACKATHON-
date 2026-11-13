'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Archive, MapPin, Pencil } from 'lucide-react';

import { DataTable } from '@/components/data-display/data-table';
import { DetailList, SectionCard } from '@/components/data-display/detail-list';
import { StatusBadge } from '@/components/data-display/status-badge';
import { ErrorState, LoadingState } from '@/components/data-display/states';
import { GeoMap } from '@/components/maps/geo-map';
import { LocationCapture } from '@/components/maps/location-capture';
import { DetailPage } from '@/components/shared/page-shell';
import { PermissionGate } from '@/components/shared/permission-gate';
import { ProvenanceNote } from '@/components/shared/provenance-note';
import {
  FormErrorSummary,
  FormProvider,
  NumberInput,
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
import {
  OPERATIONAL_STATUS_LABELS,
  OPERATIONAL_STATUS_OPTIONS,
  COMPLIANCE_CATEGORY_LABELS,
  DOCUMENT_TYPE_LABELS,
} from '@/lib/domain/reference';
import { formatDate, formatDateTime } from '@/lib/formatting/dates';
import { formatFileSize, formatTonnes } from '@/lib/formatting/numbers';
import { mineSchema, type MineFormValues } from '@/lib/validation/schemas';
import type { ComplianceRecord, Contractor, DocumentRecord, GeoPoint, Mine } from '@/types';
import type { ColumnDef } from '@tanstack/react-table';

const STATUS_BADGE_VARIANT: Record<Mine['operationalStatus'], 'success' | 'warning' | 'destructive' | 'muted'> = {
  operational: 'success',
  partial: 'warning',
  suspended: 'destructive',
  decommissioned: 'muted',
};

export default function MineDetailPage({ params }: { params: { id: string } }) {
  const services = useServices();
  const router = useRouter();

  const mine = useApiQuery(['mines', 'detail', params.id], () => services.mines.get(params.id));
  const subsidiaries = useApiQuery(['subsidiaries', 'list'], () => services.mines.subsidiaries());

  const compliance = useApiQuery(
    ['compliance', 'list', { mineId: params.id, pageSize: 50 }],
    () => services.compliance.list({ pageSize: 50, filters: { applicableMineIds: params.id } }),
    { enabled: mine.isSuccess },
  );
  const inspections = useApiQuery(
    ['inspections', 'list', { mineId: params.id, pageSize: 50 }],
    () => services.inspections.list({ pageSize: 50, filters: { mineId: params.id } }),
    { enabled: mine.isSuccess },
  );
  const safety = useApiQuery(
    ['safety', 'list', { mineId: params.id, pageSize: 50 }],
    () => services.safety.observations({ pageSize: 50, filters: { mineId: params.id } }),
    { enabled: mine.isSuccess },
  );
  const environment = useApiQuery(
    ['environment', 'measurements', { mineId: params.id }],
    () => services.environment.measurements({ pageSize: 100, filters: { mineId: params.id } }),
    { enabled: mine.isSuccess },
  );
  const production = useApiQuery(
    ['production', 'list', { mineId: params.id, pageSize: 50 }],
    () => services.production.list({ pageSize: 50, filters: { mineId: params.id } }),
    { enabled: mine.isSuccess },
  );
  const contractors = useApiQuery(
    ['contractors', 'list', { mineId: params.id, pageSize: 50 }],
    () => services.contractors.list({ pageSize: 50, filters: { mineIds: params.id } }),
    { enabled: mine.isSuccess },
  );
  const documents = useApiQuery(
    ['documents', 'list', { mineId: params.id, pageSize: 50 }],
    () => services.documents.list({ pageSize: 50, filters: { mineId: params.id } }),
    { enabled: mine.isSuccess },
  );

  const [editOpen, setEditOpen] = React.useState(false);
  const [archiveOpen, setArchiveOpen] = React.useState(false);

  if (mine.isLoading) {
    return <LoadingState label="Loading mine record" />;
  }

  if (mine.error) {
    return (
      <ErrorState
        title="This mine record could not be loaded"
        description={mine.error.message}
        onRetry={() => void mine.refetch()}
      />
    );
  }

  if (!mine.data) return null;

  const record = mine.data;
  const subsidiaryName = subsidiaries.data?.find((entry) => entry.id === record.subsidiaryId)?.name;

  const openCompliance = (compliance.data?.items ?? []).filter(
    (entry) => entry.status !== 'compliant' && entry.status !== 'non_compliant',
  ).length;
  const openSafety = (safety.data?.items ?? []).filter(
    (entry) => entry.status !== 'closed' && entry.status !== 'resolved',
  ).length;
  const exceededReadings = (environment.data?.items ?? []).filter((entry) => entry.status === 'exceeds_limit').length;

  return (
    <DetailPage
      title={record.name}
      description={`${record.code} · ${record.district}, ${record.state} · ${record.region}`}
      backHref="/mines"
      backLabel="Back to mine register"
      headerMeta={
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={STATUS_BADGE_VARIANT[record.operationalStatus]}>
            {OPERATIONAL_STATUS_LABELS[record.operationalStatus]}
          </Badge>
          <span className="text-xs text-muted-foreground">
            {subsidiaryName ? `Subsidiary: ${subsidiaryName}` : 'Subsidiary not resolved'}
          </span>
        </div>
      }
      headerActions={
        <>
          <PermissionGate permission="mine.edit" showFallback={false}>
            <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
              Edit mine
            </Button>
          </PermissionGate>
          <PermissionGate permission="mine.archive" showFallback={false}>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setArchiveOpen(true)}
              disabled={record.operationalStatus === 'decommissioned'}
              title={
                record.operationalStatus === 'decommissioned'
                  ? 'This mine is already decommissioned.'
                  : 'Archive this mine (marks it decommissioned with a recorded reason).'
              }
            >
              <Archive className="h-3.5 w-3.5" aria-hidden="true" />
              Archive
            </Button>
          </PermissionGate>
        </>
      }
    >
      <div className="grid gap-4 lg:grid-cols-3">
        <SectionCard title="Mine record" className="lg:col-span-2">
          <DetailList
            columns={2}
            items={[
              { label: 'Mine code', value: record.code },
              { label: 'Name', value: record.name },
              { label: 'Subsidiary', value: subsidiaryName ?? '—' },
              { label: 'Region', value: record.region },
              { label: 'District', value: record.district },
              { label: 'State', value: record.state },
              {
                label: 'Operational status',
                value: (
                  <Badge variant={STATUS_BADGE_VARIANT[record.operationalStatus]}>
                    {OPERATIONAL_STATUS_LABELS[record.operationalStatus]}
                  </Badge>
                ),
              },
              {
                label: 'Approved capacity',
                value: record.approvedCapacityTPA ? formatTonnes(record.approvedCapacityTPA) : 'Not configured',
                hint: record.approvedCapacityTPA
                  ? 'Sourced from the mine registry configuration.'
                  : 'No approved capacity is configured for this mine.',
              },
              { label: 'Commissioned on', value: formatDate(record.commissionedOn) },
              { label: 'Site contact', value: record.contactPhone ?? 'Not recorded' },
              { label: 'Mine manager', value: record.mineManagerId ?? 'Not assigned' },
              { label: 'Safety officer', value: record.safetyOfficerId ?? 'Not assigned' },
              { label: 'Compliance officer', value: record.complianceOfficerId ?? 'Not assigned' },
              { label: 'Environmental officer', value: record.environmentalOfficerId ?? 'Not assigned' },
            ]}
          />
          {record.note && (
            <div className="mt-4 rounded-md border border-border/70 bg-muted/30 p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Operational note
              </p>
              <p className="mt-1 whitespace-pre-line text-sm">{record.note}</p>
            </div>
          )}
        </SectionCard>

        <div className="space-y-4">
          <SectionCard title="Location" description="Recorded position and its provenance.">
            {record.location ? (
              <>
                <DetailList
                  columns={1}
                  items={[
                    {
                      label: 'Coordinates',
                      value: (
                        <span className="inline-flex items-center gap-1 tabular-nums">
                          <MapPin className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                          {record.location.lat.toFixed(5)}, {record.location.lng.toFixed(5)}
                        </span>
                      ),
                    },
                    { label: 'Source', value: record.location.source },
                    { label: 'Captured at', value: formatDateTime(record.location.capturedAt) },
                    ...(record.location.accuracyM !== undefined
                      ? [{ label: 'Accuracy', value: `${record.location.accuracyM} m` }]
                      : []),
                  ]}
                />
                <div className="mt-4">
                  <GeoMap
                    markers={[
                      {
                        id: record.id,
                        label: record.code,
                        lat: record.location.lat,
                        lng: record.location.lng,
                        kind: 'mine',
                        detail: `${record.name} — ${record.district}, ${record.state}`,
                      },
                    ]}
                    height={240}
                  />
                </div>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                No coordinate is recorded for this mine. The interface does not estimate a location; add one
                from the mine registry when it is known.
              </p>
            )}
          </SectionCard>

          <SectionCard title="Related record counts" description="Derived from the records loaded on this page.">
            <ul className="space-y-2 text-sm">
              <li className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Compliance requirements needing action</span>
                <span className="font-medium tabular-nums">{openCompliance}</span>
              </li>
              <li className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Open safety records</span>
                <span className="font-medium tabular-nums">{openSafety}</span>
              </li>
              <li className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Readings above configured limit</span>
                <span className="font-medium tabular-nums">{exceededReadings}</span>
              </li>
            </ul>
            <ProvenanceNote className="mt-3" tone="neutral" label="Derived">
              These counts are calculated from the most recent records returned for this mine. They are not an
              authoritative organisation-wide total.
            </ProvenanceNote>
          </SectionCard>
        </div>
      </div>

      <SectionCard
        title="Compliance requirements"
        description={`${compliance.data?.meta.total ?? 0} requirement(s) apply to this mine.`}
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href={`/compliance?mineId=${record.id}`}>Open compliance register</Link>
          </Button>
        }
      >
        <ComplianceTable rows={compliance.data?.items ?? []} loading={compliance.isLoading} error={compliance.error} />
      </SectionCard>

      <SectionCard title="Inspections" description={`${inspections.data?.meta.total ?? 0} inspection(s) recorded.`}>
        <InspectionsTable
          rows={inspections.data?.items ?? []}
          loading={inspections.isLoading}
          error={inspections.error}
        />
      </SectionCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Safety records" description={`${safety.data?.meta.total ?? 0} record(s).`}>
          <SimpleList
            loading={safety.isLoading}
            error={safety.error}
            empty="No safety observations or hazards are recorded for this mine."
            items={(safety.data?.items ?? []).map((entry) => ({
              id: entry.id,
              href: `/safety/${entry.id}`,
              title: `${entry.code} — ${entry.title}`,
              meta: `Severity ${entry.severity} · ${entry.status}`,
            }))}
          />
        </SectionCard>

        <SectionCard title="Environmental readings" description={`${environment.data?.meta.total ?? 0} reading(s).`}>
          <SimpleList
            loading={environment.isLoading}
            error={environment.error}
            empty="No environmental readings are recorded for this mine."
            items={(environment.data?.items ?? []).map((entry) => ({
              id: entry.id,
              title: `${entry.indicator} — ${entry.value} ${entry.unit}`,
              meta: `${formatDateTime(entry.measuredAt)} · ${entry.status}${
                entry.stale ? ' · reading is stale' : ''
              }`,
            }))}
          />
        </SectionCard>

        <SectionCard title="Production" description={`${production.data?.meta.total ?? 0} dispatch record(s).`}>
          <SimpleList
            loading={production.isLoading}
            error={production.error}
            empty="No production records are recorded for this mine."
            items={(production.data?.items ?? []).map((entry) => ({
              id: entry.id,
              title: `${formatDate(entry.date)} · ${entry.shift} shift`,
              meta: `${formatTonnes(entry.productionTonnes)} (${entry.valueKind})`,
            }))}
          />
        </SectionCard>

        <SectionCard title="Contractors" description={`${contractors.data?.meta.total ?? 0} contractor(s) assigned.`}>
          <SimpleList
            loading={contractors.isLoading}
            error={contractors.error}
            empty="No contractors are assigned to this mine."
            items={(contractors.data?.items ?? []).map((entry) => ({
              id: entry.id,
              href: `/contractors/${entry.id}`,
              title: `${entry.code} — ${entry.name}`,
              meta: `${entry.type} · ${entry.complianceStatus}`,
            }))}
          />
        </SectionCard>
      </div>

      <SectionCard title="Documents" description={`${documents.data?.meta.total ?? 0} document(s) filed against this mine.`}>
        <DocumentList
          rows={documents.data?.items ?? []}
          loading={documents.isLoading}
          error={documents.error}
        />
      </SectionCard>

      {editOpen && (
        <EditMineDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          mine={record}
          subsidiaries={subsidiaries.data ?? []}
          onSaved={() => void mine.refetch()}
        />
      )}

      {archiveOpen && (
        <ArchiveMineDialog
          open={archiveOpen}
          onOpenChange={setArchiveOpen}
          mine={record}
          onArchived={() => {
            void mine.refetch();
            void router.refresh();
          }}
        />
      )}
    </DetailPage>
  );
}

/* -------------------------------------------------------------------------- */
/* Linked-record tables                                                        */
/* -------------------------------------------------------------------------- */

function ComplianceTable({
  rows,
  loading,
  error,
}: {
  rows: ComplianceRecord[];
  loading: boolean;
  error: Error | null;
}) {
  const columns = React.useMemo<ColumnDef<ComplianceRecord, unknown>[]>(
    () => [
      {
        id: 'title',
        header: 'Requirement',
        meta: { label: 'Requirement' },
        cell: ({ row }) => (
          <Link
            href={`/compliance/${row.original.id}`}
            className="font-medium underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {row.original.code} — {row.original.title}
          </Link>
        ),
      },
      {
        id: 'category',
        header: 'Category',
        meta: { label: 'Category' },
        cell: ({ row }) => (
          <span className="text-xs">{COMPLIANCE_CATEGORY_LABELS[row.original.category]}</span>
        ),
      },
      {
        id: 'status',
        header: 'Status',
        meta: { label: 'Status' },
        cell: ({ row }) => <StatusBadge domain="compliance" value={row.original.status} />,
      },
      {
        id: 'dueDate',
        header: 'Due date',
        meta: { label: 'Due date', secondary: true },
        cell: ({ row }) => <span className="text-xs">{formatDate(row.original.dueDate)}</span>,
      },
      {
        id: 'priority',
        header: 'Priority',
        meta: { label: 'Priority', secondary: true },
        cell: ({ row }) => <StatusBadge domain="priority" value={row.original.priority} />,
      },
    ],
    [],
  );

  return (
    <DataTable<ComplianceRecord>
      columns={columns}
      data={rows}
      getRowId={(row) => row.id}
      caption="Compliance requirements applying to this mine"
      loading={loading}
      error={error}
      emptyTitle="No compliance requirements apply to this mine"
      page={1}
      pageSize={Math.max(rows.length, 1)}
      total={rows.length}
      secondaryColumns={['dueDate', 'priority']}
    />
  );
}

function InspectionsTable({
  rows,
  loading,
  error,
}: {
  rows: Awaited<ReturnType<ReturnType<typeof useServices>['inspections']['list']>>['items'];
  loading: boolean;
  error: Error | null;
}) {
  const columns = React.useMemo<ColumnDef<(typeof rows)[number], unknown>[]>(
    () => [
      {
        id: 'code',
        header: 'Inspection',
        meta: { label: 'Inspection' },
        cell: ({ row }) => (
          <div>
            <Link
              href={`/inspections/${row.original.id}`}
              className="font-medium underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {row.original.code}
            </Link>
            <p className="text-xs text-muted-foreground">{row.original.type}</p>
          </div>
        ),
      },
      {
        id: 'status',
        header: 'Status',
        meta: { label: 'Status' },
        cell: ({ row }) => <StatusBadge domain="inspection" value={row.original.status} />,
      },
      {
        id: 'scheduledDate',
        header: 'Scheduled',
        meta: { label: 'Scheduled' },
        cell: ({ row }) => <span className="text-xs">{formatDate(row.original.scheduledDate)}</span>,
      },
      {
        id: 'findings',
        header: 'Findings',
        meta: { label: 'Findings', secondary: true },
        cell: ({ row }) => <span className="text-xs tabular-nums">{row.original.findings.length}</span>,
      },
    ],
    [],
  );

  return (
    <DataTable<(typeof rows)[number]>
      columns={columns}
      data={rows}
      getRowId={(row) => row.id}
      caption="Inspections recorded at this mine"
      loading={loading}
      error={error}
      emptyTitle="No inspections are recorded for this mine"
      page={1}
      pageSize={Math.max(rows.length, 1)}
      total={rows.length}
      secondaryColumns={['findings']}
    />
  );
}

function DocumentList({
  rows,
  loading,
  error,
}: {
  rows: DocumentRecord[];
  loading: boolean;
  error: Error | null;
}) {
  const columns = React.useMemo<ColumnDef<DocumentRecord, unknown>[]>(
    () => [
      {
        id: 'name',
        header: 'Document',
        meta: { label: 'Document' },
        cell: ({ row }) => (
          <Link
            href={`/documents/${row.original.id}`}
            className="font-medium underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {row.original.name}
          </Link>
        ),
      },
      {
        id: 'type',
        header: 'Type',
        meta: { label: 'Type' },
        cell: ({ row }) => (
          <span className="text-xs">{DOCUMENT_TYPE_LABELS[row.original.type]}</span>
        ),
      },
      {
        id: 'status',
        header: 'Status',
        meta: { label: 'Status' },
        cell: ({ row }) => <StatusBadge domain="document" value={row.original.status} />,
      },
      {
        id: 'size',
        header: 'Size',
        meta: { label: 'Size', secondary: true },
        cell: ({ row }) => (
          <span className="text-xs tabular-nums">{formatFileSize(row.original.sizeBytes)}</span>
        ),
      },
      {
        id: 'uploadedAt',
        header: 'Uploaded',
        meta: { label: 'Uploaded', secondary: true },
        cell: ({ row }) => <span className="text-xs">{formatDateTime(row.original.uploadedAt)}</span>,
      },
    ],
    [],
  );

  if (loading) return <p className="text-sm text-muted-foreground">Loading documents…</p>;
  if (error) return <p className="text-sm text-destructive">{error.message}</p>;
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">No documents are filed.</p>;

  return (
    <DataTable<DocumentRecord>
      columns={columns}
      data={rows}
      getRowId={(row) => row.id}
      caption="Documents filed against this mine"
      page={1}
      pageSize={Math.max(rows.length, 1)}
      total={rows.length}
      secondaryColumns={['size', 'uploadedAt']}
    />
  );
}

function SimpleList({
  items,
  loading,
  error,
  empty,
}: {
  items: { id: string; href?: string; title: string; meta: string }[];
  loading: boolean;
  error: Error | null;
  empty: string;
}) {
  if (loading) return <p className="text-sm text-muted-foreground">Loading records…</p>;
  if (error) return <p className="text-sm text-destructive">{error.message}</p>;
  if (items.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>;

  return (
    <ul className="divide-y divide-border/70">
      {items.map((item) => (
        <li key={item.id} className="py-2 first:pt-0 last:pb-0">
          {item.href ? (
            <Link
              href={item.href}
              className="text-sm font-medium underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {item.title}
            </Link>
          ) : (
            <p className="text-sm font-medium">{item.title}</p>
          )}
          <p className="text-xs text-muted-foreground">{item.meta}</p>
        </li>
      ))}
    </ul>
  );
}

/* -------------------------------------------------------------------------- */
/* Edit dialog                                                                 */
/* -------------------------------------------------------------------------- */

function EditMineDialog({
  open,
  onOpenChange,
  mine,
  subsidiaries,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mine: Mine;
  subsidiaries: { id: string; name: string }[];
  onSaved: () => void;
}) {
  const services = useServices();
  const [location, setLocation] = React.useState<GeoPoint | null>(mine.location ?? null);

  const values: MineFormValues = {
    code: mine.code,
    name: mine.name,
    subsidiaryId: mine.subsidiaryId,
    region: mine.region,
    district: mine.district,
    state: mine.state,
    operationalStatus: mine.operationalStatus,
    approvedCapacityTPA: mine.approvedCapacityTPA,
    commissionedOn: mine.commissionedOn ?? '',
    mineManagerId: mine.mineManagerId ?? '',
    safetyOfficerId: mine.safetyOfficerId ?? '',
    complianceOfficerId: mine.complianceOfficerId ?? '',
    environmentalOfficerId: mine.environmentalOfficerId ?? '',
    contactPhone: mine.contactPhone ?? '',
    note: mine.note ?? '',
  };

  const form = useZodForm<MineFormValues>({ schema: mineSchema, defaultValues: values });

  const mutation = useAppMutation({
    mutationFn: async (input: MineFormValues) => {
      const parsed = mineSchema.parse(input);
      return services.mines.update(mine.id, {
        code: parsed.code,
        name: parsed.name,
        subsidiaryId: parsed.subsidiaryId,
        region: parsed.region,
        district: parsed.district,
        state: parsed.state,
        operationalStatus: parsed.operationalStatus,
        approvedCapacityTPA: parsed.approvedCapacityTPA,
        commissionedOn: parsed.commissionedOn,
        mineManagerId: parsed.mineManagerId,
        safetyOfficerId: parsed.safetyOfficerId,
        complianceOfficerId: parsed.complianceOfficerId,
        environmentalOfficerId: parsed.environmentalOfficerId,
        contactPhone: parsed.contactPhone,
        note: parsed.note,
        ...(location ? { lat: location.lat, lng: location.lng } : {}),
      });
    },
    successMessage: (updated) => `Mine ${updated.code} updated.`,
    invalidates: [['mines', 'list'], ['mines', 'detail', mine.id], ['mines', 'regions'], ['dashboard']],
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
          <DialogTitle>Edit {mine.name}</DialogTitle>
          <DialogDescription>
            Changes are recorded in the platform audit trail. Coordinates keep the provenance of the capture.
          </DialogDescription>
        </DialogHeader>

        <FormProvider form={form}>
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            <FormErrorSummary form={form} />

            <div className="grid gap-3 sm:grid-cols-2">
              <TextInput name="code" label="Mine code" required />
              <TextInput name="name" label="Mine name" required />
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
                description="Optional. Supplied by the mine registry; the interface does not derive it."
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <TextInput name="commissionedOn" label="Commissioned on" type="date" />
              <TextInput name="contactPhone" label="Site contact phone" />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <TextInput name="mineManagerId" label="Mine manager user id" />
              <TextInput name="safetyOfficerId" label="Safety officer user id" />
              <TextInput name="complianceOfficerId" label="Compliance officer user id" />
              <TextInput name="environmentalOfficerId" label="Environmental officer user id" />
            </div>

            <LocationCapture
              value={location}
              onChange={setLocation}
              description="Changing the coordinates replaces the recorded position and stores the new provenance."
            />

            <TextAreaInput name="note" label="Operational note" rows={3} />

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

/* -------------------------------------------------------------------------- */
/* Archive dialog                                                              */
/* -------------------------------------------------------------------------- */

function ArchiveMineDialog({
  open,
  onOpenChange,
  mine,
  onArchived,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mine: Mine;
  onArchived: () => void;
}) {
  const services = useServices();
  const [reason, setReason] = React.useState('');
  const [error, setError] = React.useState<string | undefined>();

  const mutation = useAppMutation({
    mutationFn: (input: { id: string; reason: string }) => services.mines.archive(input.id, input.reason),
    successMessage: (updated) => `Mine ${updated.code} archived.`,
    invalidates: [['mines', 'list'], ['mines', 'detail', mine.id], ['dashboard'], ['audit', 'list']],
  });

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!reason.trim()) {
      setError('Provide the reason for archiving this mine.');
      return;
    }
    setError(undefined);
    try {
      await mutation.mutateAsync({ id: mine.id, reason: reason.trim() });
      onOpenChange(false);
      onArchived();
    } catch {
      // The mutation wrapper already surfaces the failure toast.
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Archive {mine.name}?</DialogTitle>
          <DialogDescription>
            Archiving marks the mine as decommissioned and records the reason in the audit trail. It does not
            delete any historical record.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <label htmlFor="archive-reason" className="text-sm font-medium">
              Reason
              <span className="ml-0.5 text-destructive" aria-hidden="true">
                *
              </span>
            </label>
            <textarea
              id="archive-reason"
              rows={3}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              aria-invalid={Boolean(error) || undefined}
              aria-describedby={error ? 'archive-reason-error' : undefined}
              className="flex w-full rounded-md border border-input bg-white/80 px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="e.g. Mine closed following the board's decommissioning decision dated …"
            />
            {error && (
              <p id="archive-reason-error" className="text-xs font-medium text-destructive" role="alert">
                {error}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="destructive" loading={mutation.isPending}>
              Archive mine
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
