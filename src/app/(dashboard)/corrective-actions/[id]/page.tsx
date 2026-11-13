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
import { useMineOptions, useUserOptions } from '@/lib/hooks/use-mine-options';
import {
  AUDIT_ACTION_LABELS,
  CORRECTIVE_ACTION_SOURCE_LABELS,
  CORRECTIVE_ACTION_STATUS_LABELS,
  VERIFICATION_LABELS,
} from '@/lib/domain/reference';
import { CORRECTIVE_ACTION_TRANSITIONS } from '@/lib/auth/workflows';
import { daysUntil, deadlineState, formatDate, formatDateTime } from '@/lib/formatting/dates';
import type { CorrectiveActionStatus, DocumentRecord } from '@/types';

const TRANSITION_PERMISSION: Partial<
  Record<
    CorrectiveActionStatus,
    | 'corrective_action.edit'
    | 'corrective_action.complete'
    | 'corrective_action.verify'
    | 'corrective_action.close'
  >
> = {
  assigned: 'corrective_action.edit',
  in_progress: 'corrective_action.edit',
  submitted_for_verification: 'corrective_action.complete',
  verified: 'corrective_action.verify',
  closed: 'corrective_action.close',
  rejected: 'corrective_action.verify',
  proposed: 'corrective_action.edit',
};

export default function CorrectiveActionDetailPage({ params }: { params: { id: string } }) {
  const services = useServices();
  const action = useApiQuery(['corrective-actions', 'detail', params.id], () =>
    services.correctiveActions.get(params.id),
  );
  const { mines } = useMineOptions();
  const { users } = useUserOptions();
  const documents = useApiQuery(['documents', 'list', { pageSize: 200 }], () =>
    services.documents.list({ pageSize: 200 }),
  );

  const [attachOpen, setAttachOpen] = React.useState(false);

  const mutation = useAppMutation({
    mutationFn: (input: { to: CorrectiveActionStatus; comment?: string }) =>
      services.correctiveActions.transition(params.id, input.to, input.comment),
    successMessage: (updated) => `Action moved to ${CORRECTIVE_ACTION_STATUS_LABELS[updated.status]}.`,
    invalidates: [
      ['corrective-actions', 'list'],
      ['corrective-actions', 'detail', params.id],
      ['dashboard'],
      ['audit', 'list'],
    ],
  });

  if (action.isLoading) return <LoadingState label="Loading corrective action" />;
  if (action.error) {
    return (
      <ErrorState
        title="This corrective action could not be loaded"
        description={action.error.message}
        onRetry={() => void action.refetch()}
      />
    );
  }
  if (!action.data) return null;

  const item = action.data;
  const mineName = mines.find((mine) => mine.id === item.mineId)?.name ?? item.mineId;
  const assigneeName = item.assignedTo
    ? users.find((user) => user.id === item.assignedTo)?.name ?? item.assignedTo
    : 'Unassigned';
  const verifierName = item.verifiedBy
    ? users.find((user) => user.id === item.verifiedBy)?.name ?? item.verifiedBy
    : undefined;
  const evidence = (documents.data?.items ?? []).filter((doc) =>
    item.evidenceDocumentIds.includes(doc.id),
  );
  const transitions = CORRECTIVE_ACTION_TRANSITIONS[item.status] ?? [];
  const days = item.dueDate ? daysUntil(item.dueDate) : null;
  const dueState = item.dueDate ? deadlineState(item.dueDate) : null;

  return (
    <DetailPage
      title={`Corrective action ${item.code}`}
      description={CORRECTIVE_ACTION_SOURCE_LABELS[item.sourceType]}
      backHref="/corrective-actions"
      backLabel="Back to corrective actions"
      headerMeta={
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge domain="corrective_action" value={item.status} />
          <StatusBadge domain="priority" value={item.priority} />
          <span className="text-xs text-muted-foreground">{mineName}</span>
        </div>
      }
      headerActions={
        <PermissionGate permission="corrective_action.edit" showFallback={false}>
          <Button variant="outline" size="sm" onClick={() => setAttachOpen(true)}>
            <Paperclip className="h-3.5 w-3.5" aria-hidden="true" />
            Attach evidence
          </Button>
        </PermissionGate>
      }
    >
      <div className="grid gap-4 lg:grid-cols-3">
        <SectionCard title="Action" className="lg:col-span-2">
          <p className="mb-4 whitespace-pre-line text-sm">{item.description}</p>
          <DetailList
            columns={2}
            items={[
              { label: 'Action code', value: item.code },
              {
                label: 'Source',
                value: (
                  <span>
                    {CORRECTIVE_ACTION_SOURCE_LABELS[item.sourceType]} ·{' '}
                    <SourceLink type={item.sourceType} id={item.sourceId} />
                  </span>
                ),
              },
              {
                label: 'Mine',
                value: (
                  <Link href={`/mines/${item.mineId}`} className="underline-offset-2 hover:underline">
                    {mineName}
                  </Link>
                ),
              },
              { label: 'Owner', value: assigneeName },
              {
                label: 'Due date',
                value: (
                  <span>
                    {formatDate(item.dueDate)}
                    {days !== null && dueState === 'overdue' && !item.closedAt && (
                      <span className="ml-1 text-xs font-medium text-destructive">
                        (overdue by {Math.abs(days)} day(s))
                      </span>
                    )}
                  </span>
                ),
              },
              { label: 'Raised at', value: formatDateTime(item.createdAt) },
              { label: 'Raised by', value: item.createdBy },
              { label: 'Submitted at', value: formatDateTime(item.submittedAt) },
              { label: 'Verification', value: VERIFICATION_LABELS[item.verificationStatus] },
              { label: 'Verified at', value: formatDateTime(item.verifiedAt) },
              { label: 'Verified by', value: verifierName ?? 'Not verified' },
              { label: 'Closed at', value: formatDateTime(item.closedAt) },
            ]}
          />
          {item.completionNotes && (
            <div className="mt-4 rounded-md border border-border/70 bg-muted/30 p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Completion notes
              </p>
              <p className="mt-1 whitespace-pre-line text-sm">{item.completionNotes}</p>
            </div>
          )}
          {item.rejectionReason && (
            <div className="mt-4 rounded-md border border-destructive/40 bg-destructive/5 p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-destructive">
                Rejection reason
              </p>
              <p className="mt-1 whitespace-pre-line text-sm">{item.rejectionReason}</p>
            </div>
          )}
        </SectionCard>

        <StatusTransitionPanel<CorrectiveActionStatus>
          currentLabel={CORRECTIVE_ACTION_STATUS_LABELS[item.status]}
          options={transitions.map((to) => ({
            value: to,
            label: CORRECTIVE_ACTION_STATUS_LABELS[to],
            permission: TRANSITION_PERMISSION[to],
          }))}
          onSubmit={async (to, comment) => {
            await mutation.mutateAsync({ to, comment: comment || undefined });
            await action.refetch();
          }}
          pending={mutation.isPending}
          terminalMessage="A closed corrective action is final."
        />
      </div>

      <SectionCard title="Evidence" description={`${evidence.length} document(s) attached.`}>
        {evidence.length === 0 ? (
          <p className="text-sm text-muted-foreground">No evidence document is attached to this action yet.</p>
        ) : (
          <ul className="divide-y divide-border/70">
            {evidence.map((doc) => (
              <li key={doc.id} className="py-2 first:pt-0 last:pb-0">
                <Link href={`/documents/${doc.id}`} className="text-sm font-medium underline-offset-2 hover:underline">
                  {doc.name}
                </Link>
              </li>
            ))}
          </ul>
        )}
        <ProvenanceNote className="mt-3" tone="neutral" label="Evidence">
          Attaching a document records an association. Verification of adequacy remains a human decision recorded
          in the transition history.
        </ProvenanceNote>
      </SectionCard>

      <SectionCard title="Audit history" description="Every recorded change to this action.">
        {item.auditHistory.length === 0 ? (
          <p className="text-sm text-muted-foreground">No audit entries are recorded.</p>
        ) : (
          <ol className="space-y-3">
            {item.auditHistory.map((event) => (
              <li key={event.id} className="border-l-2 border-border pl-3">
                <p className="text-sm font-medium">{AUDIT_ACTION_LABELS[event.action] ?? event.action}</p>
                <p className="text-xs text-muted-foreground">
                  {event.actorName} · {formatDateTime(event.timestamp)}
                  {event.entityType ? ` · ${event.entityType}` : ''}
                </p>
                {event.reason && <p className="mt-1 text-sm">{event.reason}</p>}
              </li>
            ))}
          </ol>
        )}
      </SectionCard>

      <AttachDialog
        open={attachOpen}
        onOpenChange={setAttachOpen}
        actionId={item.id}
        alreadyLinked={item.evidenceDocumentIds}
        documents={documents.data?.items ?? []}
        onChanged={() => void action.refetch()}
      />
    </DetailPage>
  );
}

function SourceLink({ type, id }: { type: string; id: string }) {
  const href =
    type === 'inspection'
      ? `/inspections/${id}`
      : type === 'incident'
        ? `/safety/incidents/${id}`
        : type === 'observation'
          ? `/safety/${id}`
          : null;

  if (!href) return <span className="text-muted-foreground">{id}</span>;

  return (
    <Link href={href} className="underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      {id}
    </Link>
  );
}

function AttachDialog({
  open,
  onOpenChange,
  actionId,
  alreadyLinked,
  documents,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  actionId: string;
  alreadyLinked: string[];
  documents: DocumentRecord[];
  onChanged: () => void;
}) {
  const services = useServices();
  const [selected, setSelected] = React.useState('');
  const [error, setError] = React.useState<string | undefined>();

  const available = documents.filter((doc) => !alreadyLinked.includes(doc.id));

  const mutation = useAppMutation({
    mutationFn: (documentId: string) => services.correctiveActions.attachEvidence(actionId, documentId),
    successMessage: 'Evidence document attached.',
    invalidates: [['corrective-actions', 'detail', actionId], ['corrective-actions', 'list'], ['audit', 'list']],
  });

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selected) {
      setError('Select a document to attach.');
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
          <DialogTitle>Attach evidence</DialogTitle>
          <DialogDescription>Link a document already held in the library.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4" noValidate>
          {available.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Every available document is already attached. Upload new documents from{' '}
              <Link href="/documents" className="underline underline-offset-2">
                Documents &amp; OCR
              </Link>
              .
            </p>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="action-evidence">Document</Label>
              <select
                id="action-evidence"
                value={selected}
                onChange={(event) => setSelected(event.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-white/80 px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">Select a document…</option>
                {available.map((doc) => (
                  <option key={doc.id} value={doc.id}>
                    {doc.name}
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
              Attach document
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
