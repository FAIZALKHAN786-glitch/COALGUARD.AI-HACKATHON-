'use client';

import * as React from 'react';
import Link from 'next/link';
import { Check, RefreshCw, ShieldQuestion } from 'lucide-react';

import { DetailList, SectionCard } from '@/components/data-display/detail-list';
import { StatusBadge } from '@/components/data-display/status-badge';
import { ErrorState, LoadingState } from '@/components/data-display/states';
import { DetailPage } from '@/components/shared/page-shell';
import { PermissionGate } from '@/components/shared/permission-gate';
import { ProvenanceNote } from '@/components/shared/provenance-note';
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
import { Label } from '@/components/ui/label';
import { useApiQuery, useServices } from '@/lib/api/use-services';
import { useAppMutation } from '@/lib/hooks/use-app-mutation';
import { useMineOptions } from '@/lib/hooks/use-mine-options';
import { DOCUMENT_STATUS_LABELS, DOCUMENT_TYPE_LABELS } from '@/lib/domain/reference';
import { formatDateTime } from '@/lib/formatting/dates';
import { formatFileSize, formatPercent } from '@/lib/formatting/numbers';
import type { DocumentRecord, ExtractedField } from '@/types';

const IN_FLIGHT: DocumentRecord['status'][] = ['uploaded', 'queued', 'processing'];

export default function DocumentDetailPage({ params }: { params: { id: string } }) {
  const services = useServices();
  const document = useApiQuery(['documents', 'detail', params.id], () =>
    services.documents.get(params.id),
  );
  const { mines } = useMineOptions();
  const compliance = useApiQuery(['compliance', 'list', { pageSize: 200 }], () =>
    services.compliance.list({ pageSize: 200 }),
  );

  const [linkOpen, setLinkOpen] = React.useState(false);

  const status = document.data?.status;
  const inFlight = status !== undefined && IN_FLIGHT.includes(status);

  React.useEffect(() => {
    if (!inFlight) return;
    const timer = window.setTimeout(() => void document.refetch(), 1200);
    return () => window.clearTimeout(timer);
  }, [inFlight, document]);

  const retryMutation = useAppMutation({
    mutationFn: () => services.documents.retryOcr(params.id),
    successMessage: 'Extraction re-queued for this document.',
    invalidates: [['documents', 'detail', params.id], ['documents', 'list']],
  });

  if (document.isLoading) return <LoadingState label="Loading document" />;
  if (document.error) {
    return (
      <ErrorState
        title="This document could not be loaded"
        description={document.error.message}
        onRetry={() => void document.refetch()}
      />
    );
  }
  if (!document.data) return null;

  const item = document.data;
  const mineName = item.mineId
    ? (mines.find((mine) => mine.id === item.mineId)?.name ?? item.mineId)
    : 'Not associated with a mine';
  const fields = item.extractedFields;
  const confirmedCount = fields.filter((field) => field.confirmed).length;
  const allConfirmed = fields.length > 0 && confirmedCount === fields.length;
  const linkedCompliance = (compliance.data?.items ?? []).filter((record) =>
    item.linkedComplianceIds.includes(record.id),
  );

  return (
    <DetailPage
      title={item.name}
      description={`${DOCUMENT_TYPE_LABELS[item.type]} · ${formatFileSize(item.sizeBytes)}`}
      backHref="/documents"
      backLabel="Back to document library"
      headerMeta={
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge domain="document" value={item.status} />
          {fields.length > 0 && (
            <Badge variant={allConfirmed ? 'success' : 'warning'}>
              {confirmedCount}/{fields.length} fields confirmed
            </Badge>
          )}
          <span className="text-xs text-muted-foreground">{mineName}</span>
        </div>
      }
      headerActions={
        <PermissionGate permission="document.upload" showFallback={false}>
          <Button
            variant="outline"
            size="sm"
            onClick={() => retryMutation.mutate(undefined)}
            loading={retryMutation.isPending}
            disabled={inFlight}
            title={inFlight ? 'Extraction is already in progress.' : undefined}
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            Re-run extraction
          </Button>
        </PermissionGate>
      }
    >
      <div className="grid gap-4 lg:grid-cols-3">
        <SectionCard title="Document" className="lg:col-span-2">
          <DetailList
            columns={2}
            items={[
              { label: 'File name', value: item.name },
              { label: 'Type', value: DOCUMENT_TYPE_LABELS[item.type] },
              { label: 'MIME type', value: item.mimeType },
              { label: 'Size', value: formatFileSize(item.sizeBytes) },
              { label: 'Uploaded at', value: formatDateTime(item.uploadedAt) },
              { label: 'Uploaded by', value: item.uploadedBy },
              { label: 'Extraction status', value: DOCUMENT_STATUS_LABELS[item.status] },
              { label: 'OCR engine', value: item.ocrEngine ?? 'No engine has run' },
              {
                label: 'OCR confidence',
                value:
                  item.ocrConfidence !== undefined
                    ? formatPercent(item.ocrConfidence * 100)
                    : 'Not reported',
                hint: 'Reported by the engine. Confidence is not a measure of accuracy.',
              },
              { label: 'Extraction completed', value: formatDateTime(item.ocrProcessedAt) },
              { label: 'Detected language', value: item.detectedLanguage ?? 'Not reported' },
              {
                label: 'Mine',
                value: item.mineId ? (
                  <Link href={`/mines/${item.mineId}`} className="underline-offset-2 hover:underline">
                    {mineName}
                  </Link>
                ) : (
                  mineName
                ),
              },
            ]}
          />
          {item.ocrError && (
            <div className="mt-4 rounded-md border border-destructive/40 bg-destructive/5 p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-destructive">Extraction error</p>
              <p className="mt-1 text-sm">{item.ocrError}</p>
            </div>
          )}
        </SectionCard>

        <SectionCard title="Extraction state" description="What the platform knows about this file right now.">
          {item.status === 'failed' ? (
            <div className="space-y-3">
              <p className="text-sm">
                Extraction failed. No fields were produced, so nothing can be confirmed from this document until
                a retry succeeds.
              </p>
              <PermissionGate permission="document.upload" showFallback={false}>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => retryMutation.mutate(undefined)}
                  loading={retryMutation.isPending}
                >
                  <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                  Retry extraction
                </Button>
              </PermissionGate>
            </div>
          ) : inFlight ? (
            <div className="space-y-2">
              <p className="text-sm">
                Extraction is <strong>{DOCUMENT_STATUS_LABELS[item.status].toLowerCase()}</strong>. This page
                refreshes automatically until a result or an error is available.
              </p>
              <p className="text-xs text-muted-foreground">
                Nothing can be confirmed while extraction is in flight.
              </p>
            </div>
          ) : fields.length === 0 ? (
            <p className="text-sm">
              No extracted field exists for this document. An empty field list is not proof that the document is
              compliant.
            </p>
          ) : (
            <div className="space-y-2">
              <p className="text-sm">
                {confirmedCount} of {fields.length} extracted field(s) have been confirmed by a reviewer.
              </p>
              {!allConfirmed && (
                <p className="text-xs text-muted-foreground">
                  Remaining fields keep the engine&apos;s original value until someone confirms or amends them.
                </p>
              )}
              <Button asChild variant="outline" size="sm">
                <Link href="#extracted-fields">Review extracted fields</Link>
              </Button>
            </div>
          )}
        </SectionCard>
      </div>

      <SectionCard
        id="extracted-fields"
        title="Extracted fields"
        description="Confirm each value after checking it against the document itself. Amending a value replaces the engine output for downstream use; the original stays visible."
      >
        {inFlight ? (
          <p className="text-sm text-muted-foreground">Waiting for extraction to finish…</p>
        ) : fields.length === 0 ? (
          <p className="text-sm text-muted-foreground">No extracted fields are available.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">Extracted fields awaiting review</caption>
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th scope="col" className="py-2 pr-3 font-medium">
                    Field
                  </th>
                  <th scope="col" className="py-2 pr-3 font-medium">
                    Engine value
                  </th>
                  <th scope="col" className="py-2 pr-3 font-medium">
                    Confidence
                  </th>
                  <th scope="col" className="py-2 pr-3 font-medium">
                    Review
                  </th>
                  <th scope="col" className="py-2 font-medium">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {fields.map((field) => (
                  <FieldRow key={field.id} field={field} documentId={item.id} onChanged={() => void document.refetch()} />
                ))}
              </tbody>
            </table>
          </div>
        )}
        <ProvenanceNote className="mt-3" tone="warning" label="Extraction provenance">
          {item.ocrEngine
            ? `Values were produced by "${item.ocrEngine}". ${
                item.ocrEngine.includes('development')
                  ? 'That engine is a development simulation, not a production OCR service.'
                  : 'The engine is the one configured for this environment.'
              } A confirmed field records a human decision about the extracted text; it does not certify the underlying document.`
            : 'No extraction engine has run against this document, so no extracted value exists to confirm.'}
        </ProvenanceNote>
      </SectionCard>

      {item.extractedText && (
        <SectionCard
          title="Extracted text"
          description="Raw text produced by the engine, unedited."
        >
          <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-md border border-border/70 bg-muted/30 p-3 text-xs">
            {item.extractedText}
          </pre>
        </SectionCard>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard
          title="Linked compliance evidence"
          description={`${linkedCompliance.length} compliance requirement(s) reference this document as evidence.`}
          actions={
            <PermissionGate permission="document.review" showFallback={false}>
              <Button variant="outline" size="sm" onClick={() => setLinkOpen(true)}>
                Link requirement
              </Button>
            </PermissionGate>
          }
        >
          {linkedCompliance.length === 0 ? (
            <p className="text-sm text-muted-foreground">This document is not linked to any requirement.</p>
          ) : (
            <ul className="divide-y divide-border/70">
              {linkedCompliance.map((record) => (
                <li key={record.id} className="flex items-start justify-between gap-3 py-2 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <Link
                      href={`/compliance/${record.id}`}
                      className="text-sm font-medium underline-offset-2 hover:underline"
                    >
                      {record.title}
                    </Link>
                    <p className="text-xs text-muted-foreground">{record.code}</p>
                  </div>
                  <StatusBadge domain="compliance" value={record.status} />
                </li>
              ))}
            </ul>
          )}
          <ProvenanceNote className="mt-3" tone="neutral" label="Evidence linking">
            Linking records an association between a document and a requirement. It does not assert that the
            document satisfies the requirement.
          </ProvenanceNote>
        </SectionCard>

        <SectionCard title="Audit and integrity">
          {item.ledgerProof ? (
            <DetailList
              columns={1}
              items={[
                { label: 'Network', value: item.ledgerProof.network },
                { label: 'Transaction id', value: item.ledgerProof.transactionId },
                { label: 'Verified at', value: formatDateTime(item.ledgerProof.verifiedAt) },
              ]}
            />
          ) : (
            <div className="flex items-start gap-2 rounded-md border border-border/70 bg-muted/30 p-3">
              <ShieldQuestion className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <div>
                <p className="text-sm font-medium">No ledger proof is recorded</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  No blockchain or external integrity service is connected in this environment. The interface
                  does not display a fabricated transaction reference.
                </p>
              </div>
            </div>
          )}
        </SectionCard>
      </div>

      <LinkComplianceDialog
        open={linkOpen}
        onOpenChange={setLinkOpen}
        documentId={item.id}
        alreadyLinked={item.linkedComplianceIds}
        options={(compliance.data?.items ?? []).map((record) => ({
          value: record.id,
          label: `${record.code} — ${record.title}`,
        }))}
        onLinked={() => void document.refetch()}
      />
    </DetailPage>
  );
}

function FieldRow({
  field,
  documentId,
  onChanged,
}: {
  field: ExtractedField;
  documentId: string;
  onChanged: () => void;
}) {
  const services = useServices();
  const [editing, setEditing] = React.useState(false);
  const [value, setValue] = React.useState(field.correctedValue ?? field.value);
  const [error, setError] = React.useState<string | undefined>();

  const mutation = useAppMutation({
    mutationFn: (input: { fieldId: string; value: string }) =>
      services.documents.confirmField(documentId, input.fieldId, input.value),
    successMessage: 'Extracted field confirmed.',
    invalidates: [['documents', 'detail', documentId], ['documents', 'list'], ['audit', 'list']],
  });

  const save = async (nextValue: string) => {
    if (!nextValue.trim()) {
      setError('A confirmed value cannot be empty. Amend it to the correct text.');
      return;
    }
    setError(undefined);
    try {
      await mutation.mutateAsync({ fieldId: field.id, value: nextValue.trim() });
      setEditing(false);
      onChanged();
    } catch {
      // The mutation wrapper surfaces the failure toast.
    }
  };

  return (
    <tr className="border-b border-border/60 align-top last:border-0">
      <td className="py-2 pr-3">
        <p className="font-medium">{field.label}</p>
        {field.pageNumber !== undefined && (
          <p className="text-xs text-muted-foreground">Page {field.pageNumber}</p>
        )}
      </td>
      <td className="py-2 pr-3">
        {editing ? (
          <div className="space-y-1">
            <Label htmlFor={`field-${field.id}`} className="sr-only">
              Corrected value for {field.label}
            </Label>
            <input
              id={`field-${field.id}`}
              value={value}
              onChange={(event) => setValue(event.target.value)}
              aria-invalid={Boolean(error) || undefined}
              className="flex h-8 w-full min-w-[16ch] rounded-md border border-input bg-white/80 px-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            {error && (
              <p className="text-xs font-medium text-destructive" role="alert">
                {error}
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-0.5">
            <p className="text-sm">{field.correctedValue ?? field.value}</p>
            {field.correctedValue !== undefined && field.correctedValue !== field.value && (
              <p className="text-xs text-muted-foreground line-through">{field.value}</p>
            )}
          </div>
        )}
      </td>
      <td className="py-2 pr-3">
        <span className="text-xs tabular-nums text-muted-foreground">
          {field.confidence !== undefined ? formatPercent(field.confidence * 100) : 'Not reported'}
        </span>
      </td>
      <td className="py-2 pr-3">
        {field.confirmed ? (
          <Badge variant="success">Confirmed</Badge>
        ) : (
          <Badge variant="warning">Awaiting review</Badge>
        )}
      </td>
      <td className="py-2">
        <PermissionGate permission="document.review" showFallback={false}>
          {editing ? (
            <div className="flex flex-wrap gap-1">
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setEditing(false);
                  setError(undefined);
                  setValue(field.correctedValue ?? field.value);
                }}
              >
                Cancel
              </Button>
              <Button size="sm" loading={mutation.isPending} onClick={() => void save(value)}>
                <Check className="h-3.5 w-3.5" aria-hidden="true" />
                Save
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap gap-1">
              {!field.confirmed && (
                <Button size="sm" loading={mutation.isPending} onClick={() => void save(field.value)}>
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  Confirm
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setValue(field.correctedValue ?? field.value);
                  setEditing(true);
                }}
              >
                Amend
              </Button>
            </div>
          )}
        </PermissionGate>
      </td>
    </tr>
  );
}

function LinkComplianceDialog({
  open,
  onOpenChange,
  documentId,
  alreadyLinked,
  options,
  onLinked,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  documentId: string;
  alreadyLinked: string[];
  options: { value: string; label: string }[];
  onLinked: () => void;
}) {
  const services = useServices();
  const [selected, setSelected] = React.useState('');
  const [error, setError] = React.useState<string | undefined>();

  const available = options.filter((option) => !alreadyLinked.includes(option.value));

  React.useEffect(() => {
    if (open) {
      setSelected('');
      setError(undefined);
    }
  }, [open]);

  const mutation = useAppMutation({
    mutationFn: (complianceId: string) => services.documents.attachToCompliance(documentId, complianceId),
    successMessage: 'Document linked to the compliance requirement.',
    invalidates: [
      ['documents', 'detail', documentId],
      ['compliance', 'list'],
      ['audit', 'list'],
    ],
  });

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selected) {
      setError('Select a compliance requirement.');
      return;
    }
    try {
      await mutation.mutateAsync(selected);
      onOpenChange(false);
      onLinked();
    } catch {
      // The mutation wrapper surfaces the failure toast.
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Link this document as evidence</DialogTitle>
          <DialogDescription>
            The requirement and this document will reference each other. Linking does not change the
            requirement&apos;s compliance status.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4" noValidate>
          {available.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              This document is already linked to every available requirement.
            </p>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="compliance-link">Compliance requirement</Label>
              <select
                id="compliance-link"
                value={selected}
                onChange={(event) => setSelected(event.target.value)}
                aria-invalid={Boolean(error) || undefined}
                className="flex h-9 w-full rounded-md border border-input bg-white/80 px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">Select a requirement…</option>
                {available.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              {error && (
                <p className="text-xs font-medium text-destructive" role="alert">
                  {error}
                </p>
              )}
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={mutation.isPending} disabled={available.length === 0}>
              Link document
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
