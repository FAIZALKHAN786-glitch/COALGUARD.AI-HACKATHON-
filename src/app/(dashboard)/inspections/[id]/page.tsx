'use client';

import * as React from 'react';
import Link from 'next/link';
import { Plus, UserCog } from 'lucide-react';

import { DetailList, SectionCard } from '@/components/data-display/detail-list';
import { StatusBadge } from '@/components/data-display/status-badge';
import { ErrorState, LoadingState } from '@/components/data-display/states';
import { DetailPage } from '@/components/shared/page-shell';
import { PermissionGate } from '@/components/shared/permission-gate';
import { ProvenanceNote } from '@/components/shared/provenance-note';
import { StatusTransitionPanel } from '@/components/shared/transition-panel';
import {
  CheckboxInput,
  FormErrorSummary,
  FormProvider,
  SelectInput,
  TextAreaInput,
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
import { Label } from '@/components/ui/label';
import { useApiQuery, useServices } from '@/lib/api/use-services';
import { applyServerFieldErrors } from '@/lib/errors/normalise';
import { useAppMutation } from '@/lib/hooks/use-app-mutation';
import { useMineOptions, useUserOptions } from '@/lib/hooks/use-mine-options';
import {
  COMPLIANCE_CATEGORY_LABELS,
  COMPLIANCE_CATEGORY_OPTIONS,
  INSPECTION_STATUS_LABELS,
  INSPECTION_TYPE_LABELS,
  PRIORITY_OPTIONS,
} from '@/lib/domain/reference';
import { INSPECTION_TRANSITIONS } from '@/lib/auth/workflows';
import { formatDate, formatDateTime } from '@/lib/formatting/dates';
import { findingSchema, type FindingFormValues } from '@/lib/validation/schemas';
import type { InspectionStatus } from '@/types';

const TRANSITION_LABELS: Record<InspectionStatus, string> = {
  scheduled: 'Scheduled',
  in_progress: 'In progress',
  submitted: 'Submitted',
  under_review: 'Under review',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

const TRANSITION_PERMISSION: Partial<
  Record<InspectionStatus, 'inspection.edit' | 'inspection.submit' | 'inspection.review' | 'inspection.complete'>
> = {
  in_progress: 'inspection.edit',
  submitted: 'inspection.submit',
  under_review: 'inspection.submit',
  completed: 'inspection.complete',
  cancelled: 'inspection.edit',
};

export default function InspectionDetailPage({ params }: { params: { id: string } }) {
  const services = useServices();
  const inspection = useApiQuery(['inspections', 'detail', params.id], () =>
    services.inspections.get(params.id),
  );
  const { mines } = useMineOptions();
  const { users } = useUserOptions();

  const [findingOpen, setFindingOpen] = React.useState(false);
  const [assignOpen, setAssignOpen] = React.useState(false);

  const transitionMutation = useAppMutation({
    mutationFn: (input: { to: InspectionStatus; comment?: string; attestation?: string }) =>
      services.inspections.transition(params.id, input.to, input.comment, input.attestation),
    successMessage: (updated) => `Inspection moved to ${INSPECTION_STATUS_LABELS[updated.status]}.`,
    invalidates: [
      ['inspections', 'list'],
      ['inspections', 'detail', params.id],
      ['dashboard'],
      ['audit', 'list'],
    ],
  });

  if (inspection.isLoading) return <LoadingState label="Loading inspection" />;
  if (inspection.error) {
    return (
      <ErrorState
        title="This inspection could not be loaded"
        description={inspection.error.message}
        onRetry={() => void inspection.refetch()}
      />
    );
  }
  if (!inspection.data) return null;

  const item = inspection.data;
  const mineName = mines.find((mine) => mine.id === item.mineId)?.name ?? item.mineId;
  const inspectorName = users.find((user) => user.id === item.inspectorId)?.name ?? item.inspectorId;
  const reviewerName = item.reviewerId
    ? users.find((user) => user.id === item.reviewerId)?.name ?? item.reviewerId
    : undefined;
  const transitions = INSPECTION_TRANSITIONS[item.status] ?? [];
  const isTerminal = item.status === 'completed' || item.status === 'cancelled';
  const canAddFinding = item.status === 'in_progress' || item.status === 'scheduled';

  return (
    <DetailPage
      title={`Inspection ${item.code}`}
      description={`${INSPECTION_TYPE_LABELS[item.type]} · ${mineName}`}
      backHref="/inspections"
      backLabel="Back to inspections"
      headerMeta={
        <div className="flex items-center gap-2">
          <StatusBadge domain="inspection" value={item.status} />
          <span className="text-xs text-muted-foreground">
            {item.findings.length} finding(s)
            {item.findings.some((finding) => finding.isViolation) && (
              <span className="ml-1 font-medium text-destructive">
                ({item.findings.filter((finding) => finding.isViolation).length} violation
                {item.findings.filter((finding) => finding.isViolation).length === 1 ? '' : 's'})
              </span>
            )}
          </span>
        </div>
      }
      headerActions={
        <>
          <PermissionGate permission="inspection.edit" showFallback={false}>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAssignOpen(true)}
              disabled={isTerminal}
              title={isTerminal ? 'A completed or cancelled inspection cannot be reassigned.' : undefined}
            >
              <UserCog className="h-3.5 w-3.5" aria-hidden="true" />
              Reassign
            </Button>
          </PermissionGate>
          <PermissionGate permission="inspection.edit" showFallback={false}>
            <Button
              size="sm"
              onClick={() => setFindingOpen(true)}
              disabled={!canAddFinding}
              title={
                canAddFinding
                  ? undefined
                  : 'Findings can only be recorded while the inspection is scheduled or in progress.'
              }
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              Add finding
            </Button>
          </PermissionGate>
        </>
      }
    >
      <div className="grid gap-4 lg:grid-cols-3">
        <SectionCard title="Inspection record" className="lg:col-span-2">
          <DetailList
            columns={2}
            items={[
              { label: 'Inspection code', value: item.code },
              {
                label: 'Mine',
                value: (
                  <Link
                    href={`/mines/${item.mineId}`}
                    className="underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {mineName}
                  </Link>
                ),
              },
              { label: 'Type', value: INSPECTION_TYPE_LABELS[item.type] },
              { label: 'Inspector', value: inspectorName },
              { label: 'Scheduled date', value: formatDate(item.scheduledDate) },
              { label: 'Actual date', value: formatDate(item.actualDate) },
              { label: 'Started at', value: formatDateTime(item.startedAt) },
              { label: 'Submitted at', value: formatDateTime(item.submittedAt) },
              { label: 'Completed at', value: formatDateTime(item.completedAt) },
              { label: 'Reviewer', value: reviewerName ?? 'Not assigned' },
              { label: 'Created at', value: formatDateTime(item.createdAt) },
              { label: 'Created by', value: item.createdBy },
            ]}
          />
          {item.scope && (
            <div className="mt-4 rounded-md border border-border/70 bg-muted/30 p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Scope</p>
              <p className="mt-1 whitespace-pre-line text-sm">{item.scope}</p>
            </div>
          )}
        </SectionCard>

        <StatusTransitionPanel<InspectionStatus>
          currentLabel={INSPECTION_STATUS_LABELS[item.status]}
          options={transitions.map((to) => ({
            value: to,
            label: TRANSITION_LABELS[to],
            permission: TRANSITION_PERMISSION[to],
          }))}
          onSubmit={async (to, comment) => {
            const attestation = to === 'submitted' ? 'I attest this inspection reflects work actually performed.' : undefined;
            await transitionMutation.mutateAsync({ to, comment: comment || undefined, attestation });
            await inspection.refetch();
          }}
          pending={transitionMutation.isPending}
          terminalMessage="A completed or cancelled inspection is final and cannot transition further."
        />
      </div>

      <SectionCard
        title="Findings"
        description={`${item.findings.length} finding(s) recorded during this inspection.`}
      >
        {item.findings.length === 0 ? (
          <p className="text-sm text-muted-foreground">No findings have been recorded for this inspection.</p>
        ) : (
          <ul className="space-y-3">
            {item.findings.map((finding) => (
              <li key={finding.id} className="rounded-md border border-border/80 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm">{finding.description}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {COMPLIANCE_CATEGORY_LABELS[finding.category]} · raised{' '}
                      {formatDateTime(finding.raisedAt)}
                      {finding.recordedBy ? ` by ${finding.recordedBy}` : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge domain="priority" value={finding.severity} />
                    {finding.isViolation ? (
                      <StatusBadge domain="violation" value="open" />
                    ) : (
                      <span className="text-xs text-muted-foreground">Observation</span>
                    )}
                  </div>
                </div>
                {finding.complianceRecordIds.length > 0 && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Linked requirements:{' '}
                    {finding.complianceRecordIds.map((id, index) => (
                      <React.Fragment key={id}>
                        {index > 0 && ', '}
                        <Link href={`/compliance/${id}`} className="underline underline-offset-2">
                          {id}
                        </Link>
                      </React.Fragment>
                    ))}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
        <ProvenanceNote className="mt-3" tone="neutral" label="Findings">
          Findings are recorded by the inspector. A violation flag records the inspector&apos;s judgement at the
          time of inspection; it is not a legal determination.
        </ProvenanceNote>
      </SectionCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Review history" description="Every status change recorded against this inspection.">
          {item.reviewHistory.length === 0 ? (
            <p className="text-sm text-muted-foreground">No review events have been recorded yet.</p>
          ) : (
            <ol className="space-y-3">
              {item.reviewHistory.map((event) => (
                <li key={event.id} className="border-l-2 border-border pl-3">
                  <p className="text-sm font-medium">
                    {event.fromStatus} → {event.toStatus}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {event.actorName} · {formatDateTime(event.at)}
                  </p>
                  {event.comment && <p className="mt-1 text-sm">{event.comment}</p>}
                </li>
              ))}
            </ol>
          )}
        </SectionCard>

        <SectionCard title="Linked records" description="Associated requirements, evidence and corrective actions.">
          <DetailList
            columns={1}
            items={[
              {
                label: 'Compliance requirements',
                value:
                  item.complianceRecordIds.length === 0 ? (
                    'None linked'
                  ) : (
                    <ul className="space-y-0.5">
                      {item.complianceRecordIds.map((id) => (
                        <li key={id}>
                          <Link href={`/compliance/${id}`} className="underline-offset-2 hover:underline">
                            {id}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ),
              },
              {
                label: 'Corrective actions',
                value:
                  item.correctiveActionIds.length === 0 ? (
                    'None linked'
                  ) : (
                    <ul className="space-y-0.5">
                      {item.correctiveActionIds.map((id) => (
                        <li key={id}>
                          <Link href={`/corrective-actions/${id}`} className="underline-offset-2 hover:underline">
                            {id}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ),
              },
              {
                label: 'Evidence documents',
                value:
                  item.evidenceDocumentIds.length === 0 ? (
                    'None linked'
                  ) : (
                    <ul className="space-y-0.5">
                      {item.evidenceDocumentIds.map((id) => (
                        <li key={id}>
                          <Link href={`/documents/${id}`} className="underline-offset-2 hover:underline">
                            {id}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ),
              },
              {
                label: 'Recorded location',
                value: item.location
                  ? `${item.location.lat.toFixed(5)}, ${item.location.lng.toFixed(5)} (${item.location.source})`
                  : 'No location recorded',
              },
            ]}
          />
        </SectionCard>
      </div>

      <AddFindingDialog
        open={findingOpen}
        onOpenChange={setFindingOpen}
        inspectionId={item.id}
        onAdded={() => void inspection.refetch()}
      />

      <ReassignDialog
        open={assignOpen}
        onOpenChange={setAssignOpen}
        inspectionId={item.id}
        currentInspectorId={item.inspectorId}
        onAssigned={() => void inspection.refetch()}
      />
    </DetailPage>
  );
}

function AddFindingDialog({
  open,
  onOpenChange,
  inspectionId,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  inspectionId: string;
  onAdded: () => void;
}) {
  const services = useServices();

  const emptyValues: FindingFormValues = {
    description: '',
    category: 'mine_safety',
    severity: 'medium',
    isViolation: false,
    complianceRecordIds: [],
  };

  const form = useZodForm<FindingFormValues>({ schema: findingSchema, defaultValues: emptyValues });

  React.useEffect(() => {
    if (open) form.reset(emptyValues);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const mutation = useAppMutation({
    mutationFn: async (values: FindingFormValues) => {
      const parsed = findingSchema.parse(values);
      return services.inspections.addFinding(inspectionId, {
        description: parsed.description,
        category: parsed.category,
        severity: parsed.severity,
        isViolation: parsed.isViolation,
        complianceRecordIds: parsed.complianceRecordIds ?? [],
      });
    },
    successMessage: 'Finding recorded against the inspection.',
    invalidates: [['inspections', 'detail', inspectionId], ['inspections', 'list'], ['audit', 'list']],
  });

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await mutation.mutateAsync(values);
      onOpenChange(false);
      onAdded();
    } catch (error) {
      applyServerFieldErrors(error, form.setError as never);
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Record a finding</DialogTitle>
          <DialogDescription>
            Describe what was observed. Marking a finding as a violation records the inspector&apos;s judgement;
            it does not create a legal determination.
          </DialogDescription>
        </DialogHeader>

        <FormProvider form={form}>
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            <FormErrorSummary form={form} />

            <TextAreaInput name="description" label="Description" required rows={3} />

            <div className="grid gap-3 sm:grid-cols-2">
              <SelectInput name="category" label="Category" required options={COMPLIANCE_CATEGORY_OPTIONS} />
              <SelectInput name="severity" label="Severity" required options={PRIORITY_OPTIONS} />
            </div>

            <CheckboxInput
              name="isViolation"
              label="This finding is a violation"
              description="Leave unticked for an observation that requires no remedial action."
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={mutation.isPending}>
                Record finding
              </Button>
            </DialogFooter>
          </form>
        </FormProvider>
      </DialogContent>
    </Dialog>
  );
}

function ReassignDialog({
  open,
  onOpenChange,
  inspectionId,
  currentInspectorId,
  onAssigned,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  inspectionId: string;
  currentInspectorId: string;
  onAssigned: () => void;
}) {
  const services = useServices();
  const { options: userOptions } = useUserOptions();
  const [inspectorId, setInspectorId] = React.useState(currentInspectorId);
  const [error, setError] = React.useState<string | undefined>();

  React.useEffect(() => {
    if (open) {
      setInspectorId(currentInspectorId);
      setError(undefined);
    }
  }, [open, currentInspectorId]);

  const mutation = useAppMutation({
    mutationFn: (id: string) => services.inspections.assignInspector(inspectionId, id),
    successMessage: 'Inspector reassigned.',
    invalidates: [['inspections', 'detail', inspectionId], ['inspections', 'list'], ['audit', 'list']],
  });

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!inspectorId) {
      setError('Select an inspector.');
      return;
    }
    try {
      await mutation.mutateAsync(inspectorId);
      onOpenChange(false);
      onAssigned();
    } catch {
      // The mutation wrapper surfaces the failure toast.
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reassign inspector</DialogTitle>
          <DialogDescription>The change is recorded in the audit trail.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="inspector-select">Inspector</Label>
            <select
              id="inspector-select"
              value={inspectorId}
              onChange={(event) => setInspectorId(event.target.value)}
              className="flex h-9 w-full rounded-md border border-input bg-white/80 px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">Select an inspector…</option>
              {userOptions.map((option) => (
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
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={mutation.isPending}>
              Reassign
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
