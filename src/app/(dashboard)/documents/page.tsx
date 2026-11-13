'use client';

import * as React from 'react';
import Link from 'next/link';
import { RefreshCw, Upload } from 'lucide-react';
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
import { useMineOptions } from '@/lib/hooks/use-mine-options';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import {
  DOCUMENT_STATUS_LABELS,
  DOCUMENT_STATUS_OPTIONS,
  DOCUMENT_TYPE_LABELS,
  DOCUMENT_TYPE_OPTIONS,
} from '@/lib/domain/reference';
import { formatDateTime } from '@/lib/formatting/dates';
import { formatFileSize, formatPercent } from '@/lib/formatting/numbers';
import { documentUploadSchema, type DocumentUploadFormValues } from '@/lib/validation/schemas';
import type { DocumentRecord } from '@/types';

type DocumentRow = DocumentRecord & { mineName?: string };

const IN_FLIGHT: DocumentRecord['status'][] = ['uploaded', 'queued', 'processing'];

export default function DocumentsPage() {
  const services = useServices();
  const [state, update, reset] = useListQueryState({ pageSize: 20 });
  const [searchInput, setSearchInput] = React.useState('');
  const debouncedSearch = useDebouncedValue(searchInput, 300);
  const [uploadOpen, setUploadOpen] = React.useState(false);

  const { options: mineOptions } = useMineOptions();

  React.useEffect(() => {
    update({ search: debouncedSearch });
  }, [debouncedSearch, update]);

  const query = useListData<DocumentRow>('documents', state, (listQuery) =>
    services.documents.list(listQuery),
  );

  const rows = React.useMemo(() => query.data?.items ?? [], [query.data]);
  const meta = query.data?.meta;
  const { refetch } = query;
  const processing = rows.filter((row) => IN_FLIGHT.includes(row.status)).length;

  // The development adapter advances its simulated extraction pipeline as time
  // passes, so poll only while a document is actually in flight.
  React.useEffect(() => {
    if (processing === 0) return;
    const timer = window.setTimeout(() => void refetch(), 1500);
    return () => window.clearTimeout(timer);
  }, [processing, refetch]);

  const sorting: SortingState = state.sortBy
    ? [{ id: state.sortBy, desc: state.sortDir === 'desc' }]
    : [];

  const retryMutation = useAppMutation({
    mutationFn: (id: string) => services.documents.retryOcr(id),
    successMessage: 'Extraction re-queued for this document.',
    invalidates: [['documents', 'list'], ['documents', 'detail']],
  });

  const columns = React.useMemo<ColumnDef<DocumentRow, unknown>[]>(
    () => [
      {
        id: 'name',
        header: 'Document',
        accessorKey: 'name',
        enableSorting: true,
        meta: { label: 'Document' },
        cell: ({ row }) => (
          <div className="min-w-0">
            <Link
              href={`/documents/${row.original.id}`}
              className="font-medium underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {row.original.name}
            </Link>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {DOCUMENT_TYPE_LABELS[row.original.type]} · {formatFileSize(row.original.sizeBytes)}
            </p>
          </div>
        ),
      },
      {
        id: 'status',
        header: 'Extraction',
        accessorKey: 'status',
        enableSorting: true,
        meta: { label: 'Extraction' },
        cell: ({ row }) => (
          <div className="space-y-1">
            <StatusBadge domain="document" value={row.original.status} />
            {row.original.ocrConfidence !== undefined && (
              <p className="text-[11px] text-muted-foreground">
                Confidence {formatPercent(row.original.ocrConfidence * 100)}
              </p>
            )}
            {row.original.ocrError && (
              <p className="max-w-[22ch] text-[11px] text-destructive">{row.original.ocrError}</p>
            )}
          </div>
        ),
      },
      {
        id: 'mineName',
        header: 'Mine',
        enableSorting: false,
        meta: { label: 'Mine' },
        cell: ({ row }) => (
          <span className="text-xs">{row.original.mineName ?? 'Not associated'}</span>
        ),
      },
      {
        id: 'fields',
        header: 'Extracted fields',
        enableSorting: false,
        meta: { label: 'Extracted fields', secondary: true },
        cell: ({ row }) => {
          const total = row.original.extractedFields.length;
          const confirmed = row.original.extractedFields.filter((field) => field.confirmed).length;
          if (total === 0) return <span className="text-xs text-muted-foreground">None</span>;
          return (
            <span className="text-xs tabular-nums">
              {confirmed}/{total} confirmed
            </span>
          );
        },
      },
      {
        id: 'linkedComplianceIds',
        header: 'Linked requirements',
        enableSorting: false,
        meta: { label: 'Linked requirements', secondary: true },
        cell: ({ row }) => (
          <span className="text-xs tabular-nums">{row.original.linkedComplianceIds.length}</span>
        ),
      },
      {
        id: 'uploadedAt',
        header: 'Uploaded',
        accessorKey: 'uploadedAt',
        enableSorting: true,
        meta: { label: 'Uploaded', secondary: true },
        cell: ({ row }) => (
          <span className="text-xs text-muted-foreground">{formatDateTime(row.original.uploadedAt)}</span>
        ),
      },
      {
        id: 'actions',
        header: 'Action',
        enableSorting: false,
        meta: { label: 'Action', secondary: true },
        cell: ({ row }) =>
          row.original.status === 'failed' ? (
            <PermissionGate permission="document.upload" showFallback={false}>
              <Button
                variant="outline"
                size="sm"
                loading={retryMutation.isPending}
                onClick={() => retryMutation.mutate(row.original.id)}
              >
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                Retry extraction
              </Button>
            </PermissionGate>
          ) : (
            <span className="text-xs text-muted-foreground">
              {IN_FLIGHT.includes(row.original.status) ? 'In progress…' : '—'}
            </span>
          ),
      },
    ],
    [retryMutation],
  );

  return (
    <ListPage
      title="Documents & OCR"
      description="The document library and the extraction review workflow. Every extracted value requires a human decision before it is treated as confirmed."
      headerActions={
        <>
          <ExportButton
            rows={rows}
            fileName="coalguard-documents"
            columns={[
              { key: 'name', label: 'Document name', value: (row) => row.name },
              { key: 'type', label: 'Document type', value: (row) => DOCUMENT_TYPE_LABELS[row.type] },
              { key: 'status', label: 'Extraction status', value: (row) => DOCUMENT_STATUS_LABELS[row.status] },
              { key: 'mine', label: 'Mine', value: (row) => row.mineName ?? '' },
              { key: 'size', label: 'Size (bytes)', value: (row) => String(row.sizeBytes) },
              { key: 'uploaded', label: 'Uploaded at', value: (row) => row.uploadedAt },
              { key: 'engine', label: 'OCR engine', value: (row) => row.ocrEngine ?? '' },
              {
                key: 'confidence',
                label: 'OCR confidence',
                value: (row) => (row.ocrConfidence !== undefined ? String(row.ocrConfidence) : ''),
              },
              {
                key: 'fields',
                label: 'Extracted fields',
                value: (row) => String(row.extractedFields.length),
              },
              {
                key: 'confirmed',
                label: 'Confirmed fields',
                value: (row) => String(row.extractedFields.filter((field) => field.confirmed).length),
              },
            ]}
          />
          <PermissionGate permission="document.upload" showFallback={false}>
            <Button size="sm" onClick={() => setUploadOpen(true)}>
              <Upload className="h-3.5 w-3.5" aria-hidden="true" />
              Upload document
            </Button>
          </PermissionGate>
        </>
      }
      toolbar={
        <FilterBar
          searchValue={searchInput}
          onSearchChange={setSearchInput}
          searchPlaceholder="Search by document name"
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
            label="Extraction status"
            value={state.filters.status ?? 'all'}
            onValueChange={(value) => update({ filters: { ...state.filters, status: value } })}
            options={DOCUMENT_STATUS_OPTIONS}
            allLabel="Any status"
          />
          <FilterSelect
            label="Type"
            value={state.filters.type ?? 'all'}
            onValueChange={(value) => update({ filters: { ...state.filters, type: value } })}
            options={DOCUMENT_TYPE_OPTIONS}
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
      <ProvenanceNote tone="warning" label="Extraction provenance">
        Extraction is performed by the engine named on each document. In this build the only engine available is
        the labelled development simulation — no production OCR service is connected, and no extracted value is
        treated as verified until a reviewer confirms it.
      </ProvenanceNote>

      <DataTable<DocumentRow>
        columns={columns}
        data={rows}
        getRowId={(row) => row.id}
        caption="Documents with extraction status, confidence and confirmation progress"
        loading={query.isLoading}
        error={query.error}
        onRetry={() => void query.refetch()}
        emptyTitle="No documents match the current filters"
        emptyDescription="Adjust the filters, or upload a document to start extraction."
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
        secondaryColumns={['fields', 'linkedComplianceIds', 'uploadedAt', 'actions']}
        renderMobileCard={(row) => (
          <div className="space-y-1.5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <Link href={`/documents/${row.id}`} className="font-medium underline-offset-2 hover:underline">
                  {row.name}
                </Link>
                <p className="text-xs text-muted-foreground">
                  {DOCUMENT_TYPE_LABELS[row.type]} · {formatFileSize(row.sizeBytes)}
                </p>
              </div>
              <StatusBadge domain="document" value={row.status} />
            </div>
            <p className="text-xs text-muted-foreground">
              {row.mineName ?? 'Not associated'} ·{' '}
              {row.extractedFields.filter((field) => field.confirmed).length}/{row.extractedFields.length} fields
              confirmed
            </p>
          </div>
        )}
      />

      <SectionCard
        title="How extraction review works"
        description="The same sequence is used by every document type."
      >
        <ol className="list-decimal space-y-1.5 pl-5 text-sm">
          <li>Upload creates the record with status <em>uploaded</em>; no fields exist yet.</li>
          <li>Extraction moves the document through <em>queued</em> and <em>processing</em>.</li>
          <li>
            Success sets the document to <em>needs review</em> and records the engine name and confidence per
            field; failure sets <em>failed</em> with the engine&apos;s error text and offers a retry.
          </li>
          <li>
            A reviewer confirms or amends each field individually. The platform never marks a field confirmed on
            the reviewer&apos;s behalf.
          </li>
          <li>Confirmed documents can then be linked as evidence on a compliance requirement.</li>
        </ol>
      </SectionCard>

      <UploadDocumentDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        mineOptions={mineOptions}
        onUploaded={() => void query.refetch()}
      />
    </ListPage>
  );
}

function UploadDocumentDialog({
  open,
  onOpenChange,
  mineOptions,
  onUploaded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mineOptions: { value: string; label: string }[];
  onUploaded: () => void;
}) {
  const services = useServices();
  const [file, setFile] = React.useState<File | null>(null);
  const [fileError, setFileError] = React.useState<string | undefined>();

  const emptyValues: DocumentUploadFormValues = {
    name: '',
    type: 'compliance_evidence',
    mineId: '',
    sizeBytes: 0,
  };

  const form = useZodForm<DocumentUploadFormValues>({
    schema: documentUploadSchema,
    defaultValues: emptyValues,
  });

  React.useEffect(() => {
    if (open) {
      form.reset(emptyValues);
      setFile(null);
      setFileError(undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const mutation = useAppMutation({
    mutationFn: async (values: DocumentUploadFormValues) => {
      const parsed = documentUploadSchema.parse(values);
      if (!file) throw new Error('Select a file to upload.');
      // Text content is only read for small text-like files so the development
      // adapter can echo something meaningful back. Nothing leaves the browser.
      let content: string | undefined;
      const looksTextual =
        file.type.startsWith('text/') || /\.(txt|csv|json|md)$/i.test(file.name);
      if (looksTextual && file.size <= 256 * 1024) {
        try {
          content = await file.text();
        } catch {
          content = undefined;
        }
      }
      return services.documents.upload({
        name: parsed.name,
        type: parsed.type,
        mineId: parsed.mineId,
        sizeBytes: parsed.sizeBytes,
        mimeType: file.type || 'application/octet-stream',
        content,
      });
    },
    successMessage: (document) =>
      `${document.name} uploaded. Extraction will start automatically.`,
    invalidates: [['documents', 'list'], ['audit', 'list']],
  });

  const onSubmit = form.handleSubmit(async (values) => {
    if (!file) {
      setFileError('Choose a file to upload.');
      return;
    }
    setFileError(undefined);
    try {
      await mutation.mutateAsync(values);
      onOpenChange(false);
      onUploaded();
    } catch (error) {
      applyServerFieldErrors(error, form.setError as never);
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Upload a document</DialogTitle>
          <DialogDescription>
            The file is read in this browser and handed to the configured storage adapter. With the development
            adapter it is kept in local storage only — it is not sent to any server.
          </DialogDescription>
        </DialogHeader>

        <FormProvider form={form}>
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            <FormErrorSummary form={form} />

            <div className="space-y-1.5">
              <label htmlFor="document-file" className="text-sm font-medium">
                File <span className="text-destructive">*</span>
              </label>
              <input
                id="document-file"
                type="file"
                onChange={(event) => {
                  const selected = event.target.files?.[0] ?? null;
                  setFile(selected);
                  setFileError(undefined);
                  if (selected) {
                    form.setValue('name', selected.name, { shouldValidate: true });
                    form.setValue('sizeBytes', selected.size, { shouldValidate: true });
                  }
                }}
                aria-invalid={Boolean(fileError) || undefined}
                aria-describedby={fileError ? 'document-file-error' : undefined}
                className="block w-full rounded-md border border-input bg-white/80 px-3 py-2 text-sm shadow-sm file:mr-3 file:rounded file:border-0 file:bg-secondary file:px-2 file:py-1 file:text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              {fileError && (
                <p id="document-file-error" className="text-xs font-medium text-destructive" role="alert">
                  {fileError}
                </p>
              )}
              {file && (
                <p className="text-xs text-muted-foreground">
                  {file.name} · {formatFileSize(file.size)} · {file.type || 'unknown type'}
                </p>
              )}
            </div>

            <TextInput
              name="name"
              label="Display name"
              required
              description="Defaults to the file name. Change it if the stored name should differ."
            />

            <div className="grid gap-3 sm:grid-cols-2">
              <SelectInput
                name="type"
                label="Document type"
                required
                options={DOCUMENT_TYPE_OPTIONS}
              />
              <SelectInput
                name="mineId"
                label="Mine"
                options={mineOptions}
                placeholder="Not associated with a mine"
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={mutation.isPending}>
                Upload
              </Button>
            </DialogFooter>
          </form>
        </FormProvider>
      </DialogContent>
    </Dialog>
  );
}
