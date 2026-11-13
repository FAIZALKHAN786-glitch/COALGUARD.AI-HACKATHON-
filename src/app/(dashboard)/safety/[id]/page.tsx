'use client';

import * as React from 'react';
import Link from 'next/link';

import { DetailList, SectionCard } from '@/components/data-display/detail-list';
import { StatusBadge } from '@/components/data-display/status-badge';
import { ErrorState, LoadingState } from '@/components/data-display/states';
import { GeoMap } from '@/components/maps/geo-map';
import { DetailPage } from '@/components/shared/page-shell';
import { ProvenanceNote } from '@/components/shared/provenance-note';
import { StatusTransitionPanel } from '@/components/shared/transition-panel';
import { useApiQuery, useServices } from '@/lib/api/use-services';
import { useAppMutation } from '@/lib/hooks/use-app-mutation';
import { useMineOptions, useUserOptions } from '@/lib/hooks/use-mine-options';
import { SAFETY_RECORD_TYPE_LABELS, SAFETY_STATUS_LABELS } from '@/lib/domain/reference';
import { SAFETY_TRANSITIONS } from '@/lib/auth/workflows';
import { formatDateTime } from '@/lib/formatting/dates';
import type { SafetyRecordStatus } from '@/types';

const TRANSITION_PERMISSION: Partial<
  Record<SafetyRecordStatus, 'safety.edit' | 'safety.investigate' | 'safety.close'>
> = {
  under_investigation: 'safety.investigate',
  action_assigned: 'safety.edit',
  resolved: 'safety.investigate',
  closed: 'safety.close',
};

export default function SafetyRecordPage({ params }: { params: { id: string } }) {
  const services = useServices();
  const record = useApiQuery(['safety', 'detail', params.id], () =>
    services.safety.getObservation(params.id),
  );
  const { mines } = useMineOptions();
  const { users } = useUserOptions();

  const mutation = useAppMutation({
    mutationFn: (input: { to: SafetyRecordStatus; comment?: string }) =>
      services.safety.transitionObservation(params.id, input.to, input.comment),
    successMessage: (updated) => `Safety record moved to ${SAFETY_STATUS_LABELS[updated.status]}.`,
    invalidates: [['safety', 'list'], ['safety', 'detail', params.id], ['dashboard'], ['audit', 'list']],
  });

  if (record.isLoading) return <LoadingState label="Loading safety record" />;
  if (record.error) {
    return (
      <ErrorState
        title="This safety record could not be loaded"
        description={record.error.message}
        onRetry={() => void record.refetch()}
      />
    );
  }
  if (!record.data) return null;

  const item = record.data;
  const mineName = mines.find((mine) => mine.id === item.mineId)?.name ?? item.mineId;
  const reporterName = users.find((user) => user.id === item.reportedBy)?.name ?? item.reportedBy;
  const assigneeName = item.assignedTo
    ? users.find((user) => user.id === item.assignedTo)?.name ?? item.assignedTo
    : 'Unassigned';
  const transitions = SAFETY_TRANSITIONS[item.status] ?? [];

  return (
    <DetailPage
      title={item.title}
      description={`${item.code} · ${SAFETY_RECORD_TYPE_LABELS[item.type]}`}
      backHref="/safety"
      backLabel="Back to safety register"
      headerMeta={
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge domain="safety" value={item.status} />
          <StatusBadge domain="priority" value={item.severity} />
          <span className="text-xs text-muted-foreground">{mineName}</span>
        </div>
      }
    >
      <div className="grid gap-4 lg:grid-cols-3">
        <SectionCard title="Recorded item" className="lg:col-span-2">
          <p className="mb-4 whitespace-pre-line text-sm">{item.description}</p>
          <DetailList
            columns={2}
            items={[
              { label: 'Record code', value: item.code },
              { label: 'Type', value: SAFETY_RECORD_TYPE_LABELS[item.type] },
              {
                label: 'Mine',
                value: (
                  <Link href={`/mines/${item.mineId}`} className="underline-offset-2 hover:underline">
                    {mineName}
                  </Link>
                ),
              },
              { label: 'Severity', value: <StatusBadge domain="priority" value={item.severity} /> },
              { label: 'Status', value: <StatusBadge domain="safety" value={item.status} /> },
              { label: 'Reported by', value: reporterName },
              { label: 'Reported at', value: formatDateTime(item.reportedAt) },
              { label: 'Owner', value: assigneeName },
              { label: 'Location description', value: item.locationDescription ?? 'Not recorded' },
              { label: 'Investigation opened', value: formatDateTime(item.investigationOpenedAt) },
              { label: 'Investigation closed', value: formatDateTime(item.investigationClosedAt) },
              {
                label: 'Related inspection',
                value: item.relatedInspectionId ? (
                  <Link
                    href={`/inspections/${item.relatedInspectionId}`}
                    className="underline-offset-2 hover:underline"
                  >
                    {item.relatedInspectionId}
                  </Link>
                ) : (
                  'None linked'
                ),
              },
            ]}
          />
        </SectionCard>

        <StatusTransitionPanel<SafetyRecordStatus>
          currentLabel={SAFETY_STATUS_LABELS[item.status]}
          options={transitions.map((to) => ({
            value: to,
            label: SAFETY_STATUS_LABELS[to],
            permission: TRANSITION_PERMISSION[to],
          }))}
          onSubmit={async (to, comment) => {
            await mutation.mutateAsync({ to, comment: comment || undefined });
            await record.refetch();
          }}
          pending={mutation.isPending}
          terminalMessage="A closed safety record is final."
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Location" description="Where the issue was recorded.">
          {item.location ? (
            <GeoMap
              markers={[
                {
                  id: item.id,
                  label: item.code,
                  lat: item.location.lat,
                  lng: item.location.lng,
                  kind: item.type === 'hazard' ? 'hazard' : 'observation',
                  detail: item.title,
                },
              ]}
              height={240}
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              No coordinate is recorded for this item. The interface does not estimate one.
            </p>
          )}
        </SectionCard>

        <SectionCard title="Linked records">
          <DetailList
            columns={1}
            items={[
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
            ]}
          />
          <ProvenanceNote className="mt-3" tone="neutral" label="Investigation">
            Status transitions record who moved the item and when. They do not assert that a root cause has been
            established.
          </ProvenanceNote>
        </SectionCard>
      </div>
    </DetailPage>
  );
}
