'use client';

import * as React from 'react';
import Link from 'next/link';
import { Paperclip } from 'lucide-react';

import { DetailList, SectionCard } from '@/components/data-display/detail-list';
import { StatusBadge } from '@/components/data-display/status-badge';
import { ErrorState, LoadingState } from '@/components/data-display/states';
import { DetailPage } from '@/components/shared/page-shell';
import { PermissionGate } from '@/components/shared/permission-gate';
import { ProvenanceNote } from '@/components/shared/provenance-note';
import { StatusTransitionPanel } from '@/components/shared/transition-panel';
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
import { COMPLIANCE_CATEGORY_LABELS, COMPLIANCE_STATUS_LABELS } from '@/lib/domain/reference';
import { COMPLIANCE_TRANSITIONS } from '@/lib/auth/workflows';
import { daysUntil, deadlineState, formatDate, formatDateTime } from '@/lib/formatting/dates';
import { formatFileSize } from '@/lib/formatting/numbers';
import type { ComplianceStatus, DocumentRecord } from '@/types';

const TRANSITION_LABELS: Record<ComplianceStatus, string> = {
  draft: 'Draft',
  pending_submission: 'Pending submission',
  submitted: 'Submitted',
  under_review: 'Under review',
  compliant: 'Compliant',
  non_compliant: 'Non-compliant',
  overdue: 'Overdue',
  awaiting_verification: 'Awaiting verification',
};

/** Permission required to move a compliance record into each state. */
const TRANSITION_PERMISSION: Partial<
  Record<ComplianceStatus, 'compliance.edit' | 'compliance.submit' | 'compliance.verify'>
> = {
  pending_submission: 'compliance.submit',
  submitted: 'compliance.submit',
  draft: 'compliance.edit',
  under_review: 'compliance.submit',
  compliant: 'compliance.verify',
  non_compliant: 'compliance.verify',
  awaiting_verification: 'compliance.verify',
};

export default function ComplianceDetailPage({ params }: { params: { id: string } }) {
  const services = useServices();
  const record = useApiQuery(['compliance', 'detail', params.id], () => services.compliance.get(params.id));
  const { mines } = useMineOptions();
  const documents = useApiQuery(['documents', 'list', { pageSize: 200 }], () =>
    services.documents.list({ pageSize: 200 }),
  );

  const [attachOpen, setAttachOpen] = React.useState(false);

  const mutation = useAppMutation({
    mutationFn: (input: { to: ComplianceStatus; comment?: string }) =>
      services.compliance.transition(params.id, input.to, input.comment),
    successMessage: (updated) => `Status changed to ${COMPLIANCE_STATUS_LABELS[updated.status]}.`,
    invalidates: [['compliance', 'list'], ['compliance', 'detail', params.id], ['dashboard'], ['audit', 'list']],
  });

  if (record.isLoading) return <LoadingState label="Loading compliance requirement" />;
  if (record.error) {
    return (
      <ErrorState
        title="This compliance requirement could not be loaded"
        description={record.error.message}
        onRetry={() => void record.refetch()}
      />
    );
  }
  if (!record.data) return null;

  const item = record.data;
  const transitions = COMPLIANCE_TRANSITIONS[item.status] ?? [];
  const mineNames = item.applicableMineIds.map(
    (id) => mines.find((mine) => mine.id === id)?.name ?? id,
  );
  const evidence = (documents.data?.items ?? []).filter((doc) =>
    item.evidenceDocumentIds.includes(doc.id),
  );
  const days = item.dueDate ? daysUntil(item.dueDate) : null;
  const dueState = item.dueDate ? deadlineState(item.dueDate) : null;

  return (
    <DetailPage
      title={item.title}
      description={item.code}
      backHref="/compliance"
      backLabel="Back to compliance register"
      headerMeta={
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge domain="compliance" value={item.status} />
          <StatusBadge domain="priority" value={item.priority} />
          <span className="text-xs text-muted-foreground">
            {COMPLIANCE_CATEGORY_LABELS[item.category]}
          </span>
        </div>
      }
      headerActions={
        <PermissionGate permission="compliance.edit" showFallback={false}>
          <Button variant="outline" size="sm" onClick={() => setAttachOpen(true)}>
            <Paperclip className="h-3.5 w-3.5" aria-hidden="true" />
            Attach evidence
          </Button>
        </PermissionGate>
      }
    >
      <div className="grid gap-4 lg:grid-cols-3">
        <SectionCard
          title="Requirement"
          className="lg:col-span-2"
          description="Recorded obligation, source reference and dates."
        >
          <p className="mb-4 whitespace-pre-line text-sm">{item.description}</p>
          <DetailList
            columns={2}
            items={[
              { label: 'Requirement code', value: item.code },
              { label: 'Category', value: COMPLIANCE_CATEGORY_LABELS[item.category] },
              {
                label: 'Applicable mines',
                value:
                  mineNames.length > 0 ? (
                    <ul className="space-y-0.5">
                      {mineNames.map((name, index) => (
                        <li key={`${name}-${index}`}>{name}</li>
                      ))}
                    </ul>
                  ) : (
                    'No mine recorded'
                  ),
              },
              { label: 'Responsible officer id', value: item.responsibleOfficerId ?? 'Unassigned' },
              {
                label: 'Source reference',
                value: item.sourceReference ?? 'Not recorded',
                hint: 'Supplied by your organisation. The platform does not generate legal references.',
              },
              { label: 'Effective from', value: formatDate(item.effectiveFrom) },
              {
                label: 'Due date',
                value: (
                  <span>
                    {formatDate(item.dueDate)}
                    {days !== null && dueState === 'overdue' && (
                      <span className="ml-1 text-xs font-medium text-destructive">
                        (overdue by {Math.abs(days)} day(s))
                      </span>
                    )}
                  </span>
                ),
                hint: 'A recorded date, not a statutory deadline computed by the platform.',
              },
              { label: 'Submission frequency', value: item.submissionFrequency ?? 'Not recorded' },
              { label: 'Last submitted', value: formatDateTime(item.lastSubmittedAt) },
              { label: 'Last verified', value: formatDateTime(item.lastVerifiedAt) },
              { label: 'Verification status', value: item.verificationStatus ?? 'Not recorded' },
            ]}
          />
          {item.notes && (
            <div className="mt-4 rounded-md border border-border/70 bg-muted/30 p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Internal notes</p>
              <p className="mt-1 whitespace-pre-line text-sm">{item.notes}</p>
            </div>
          )}
        </SectionCard>

        <StatusTransitionPanel<ComplianceStatus>
          currentLabel={COMPLIANCE_STATUS_LABELS[item.status]}
          options={transitions.map((to) => ({
            value: to,
            label: TRANSITION_LABELS[to],
            permission: TRANSITION_PERMISSION[to],
          }))}
          onSubmit={async (to, comment) => {
            await mutation.mutateAsync({ to, comment: comment || undefined });
            await record.refetch();
          }}
          pending={mutation.isPending}
          terminalMessage="This status has no further transitions in the configured workflow."
        />
      </div>

      <SectionCard
        title="Evidence"
        description={`${evidence.length} document(s) linked as evidence.`}
        actions={
          <PermissionGate permission="compliance.edit" showFallback={false}>
            <Button variant="outline" size="sm" onClick={() => setAttachOpen(true)}>
              Manage evidence
            </Button>
          </PermissionGate>
        }
      >
        {documents.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading documents…</p>
        ) : evidence.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No evidence document is linked to this requirement yet.
          </p>
        ) : (
          <ul className="divide-y divide-border/70">
            {evidence.map((doc) => (
              <li key={doc.id} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
                <Link
                  href={`/documents/${doc.id}`}
                  className="text-sm font-medium underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {doc.name}
                </Link>
                <span className="text-xs text-muted-foreground">
                  {formatFileSize(doc.sizeBytes)} · {formatDateTime(doc.uploadedAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
        <ProvenanceNote className="mt-3" tone="neutral" label="Evidence">
          Linking a document records an association only. It does not assert that the document satisfies the
          requirement — that judgement is made by the verifying officer.
        </ProvenanceNote>
      </SectionCard>

      <SectionCard title="Linked records" description="Records this requirement is associated with.">
        <DetailList
          columns={2}
          items={[
            {
              label: 'Linked violations',
              value:
                item.linkedViolationIds.length === 0
                  ? 'None recorded'
                  : item.linkedViolationIds.join(', '),
            },
            {
              label: 'Linked corrective actions',
              value:
                item.linkedCorrectiveActionIds.length === 0 ? (
                  'None recorded'
                ) : (
                  <ul className="space-y-0.5">
                    {item.linkedCorrectiveActionIds.map((id) => (
                      <li key={id}>
                        <Link
                          href={`/corrective-actions/${id}`}
                          className="underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          {id}
                        </Link>
                      </li>
                    ))}
                  </ul>
                ),
            },
            { label: 'Last updated', value: formatDateTime(item.updatedAt) },
            { label: 'Updated by', value: item.updatedBy ?? 'Not recorded' },
          ]}
        />
      </SectionCard>

      <AttachEvidenceDialog
        open={attachOpen}
        onOpenChange={setAttachOpen}
        recordId={item.id}
        alreadyLinked={item.evidenceDocumentIds}
        documents={documents.data?.items ?? []}
        onChanged={() => void record.refetch()}
      />
    </DetailPage>
  );
}

function AttachEvidenceDialog({
  open,
  onOpenChange,
  recordId,
  alreadyLinked,
  documents,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recordId: string;
  alreadyLinked: string[];
  documents: DocumentRecord[];
  onChanged: () => void;
}) {
  const services = useServices();
  const [selected, setSelected] = React.useState('');
  const [error, setError] = React.useState<string | undefined>();

  const available = documents.filter((doc) => !alreadyLinked.includes(doc.id));

  const mutation = useAppMutation({
    mutationFn: (documentId: string) => services.compliance.attachEvidence(recordId, documentId),
    successMessage: 'Evidence document linked.',
    invalidates: [['compliance', 'detail', recordId], ['compliance', 'list'], ['audit', 'list']],
  });

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selected) {
      setError('Select a document to link.');
      return;
    }
    setError(undefined);
    try {
      await mutation.mutateAsync(selected);
      setSelected('');
      onOpenChange(false);
      onChanged();
    } catch {
      // The mutation wrapper surfaces the failure toast.
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Link an evidence document</DialogTitle>
          <DialogDescription>
            Choose a document already in the library. Uploading happens in the document library so the extraction
            review can be completed first.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4" noValidate>
          {available.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Every available document is already linked. Upload a new document from{' '}
              <Link href="/documents" className="underline underline-offset-2">
                Documents &amp; OCR
              </Link>
              .
            </p>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="evidence-document">Document</Label>
              <select
                id="evidence-document"
                value={selected}
                onChange={(event) => setSelected(event.target.value)}
                aria-invalid={Boolean(error) || undefined}
                className="flex h-9 w-full rounded-md border border-input bg-white/80 px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">Select a document…</option>
                {available.map((doc) => (
                  <option key={doc.id} value={doc.id}>
                    {doc.name} ({doc.type})
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
