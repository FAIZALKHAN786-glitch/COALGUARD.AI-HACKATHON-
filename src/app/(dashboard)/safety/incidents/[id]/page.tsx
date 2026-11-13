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
import { SAFETY_STATUS_LABELS } from '@/lib/domain/reference';
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

export default function IncidentDetailPage({ params }: { params: { id: string } }) {
  const services = useServices();
  const incident = useApiQuery(['safety', 'incident', params.id], () =>
    services.safety.getIncident(params.id),
  );
  const { mines } = useMineOptions();
  const { users } = useUserOptions();

  const mutation = useAppMutation({
    mutationFn: (input: { to: SafetyRecordStatus; comment?: string }) =>
      services.safety.transitionIncident(params.id, input.to, input.comment),
    successMessage: (updated) => `Incident moved to ${SAFETY_STATUS_LABELS[updated.status]}.`,
    invalidates: [
      ['safety', 'incident', params.id],
      ['safety:incidents', 'list'],
      ['dashboard'],
      ['audit', 'list'],
    ],
  });

  if (incident.isLoading) return <LoadingState label="Loading incident" />;
  if (incident.error) {
    return (
      <ErrorState
        title="This incident could not be loaded"
        description={incident.error.message}
        onRetry={() => void incident.refetch()}
      />
    );
  }
  if (!incident.data) return null;

  const item = incident.data;
  const mineName = mines.find((mine) => mine.id === item.mineId)?.name ?? item.mineId;
  const reporterName = users.find((user) => user.id === item.reportedBy)?.name ?? item.reportedBy;
  const assigneeName = item.assignedTo
    ? users.find((user) => user.id === item.assignedTo)?.name ?? item.assignedTo
    : 'Unassigned';
  const transitions = SAFETY_TRANSITIONS[item.status] ?? [];

  return (
    <DetailPage
      title={item.title}
      description={`${item.code} · Incident`}
      backHref="/safety/incidents"
      backLabel="Back to incidents"
      headerMeta={
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge domain="safety" value={item.status} />
          <StatusBadge domain="priority" value={item.severity} />
          <span className="text-xs text-muted-foreground">{mineName}</span>
        </div>
      }
    >
      <div className="grid gap-4 lg:grid-cols-3">
        <SectionCard title="Incident report" className="lg:col-span-2">
          <p className="mb-4 whitespace-pre-line text-sm">{item.description}</p>
          <DetailList
            columns={2}
            items={[
              { label: 'Incident code', value: item.code },
              {
                label: 'Mine',
                value: (
                  <Link href={`/mines/${item.mineId}`} className="underline-offset-2 hover:underline">
                    {mineName}
                  </Link>
                ),
              },
              { label: 'Severity', value: <StatusBadge domain="priority" value={item.severity} /> },
              { label: 'Occurred at', value: formatDateTime(item.occurredAt) },
              { label: 'Reported at', value: formatDateTime(item.reportedAt) },
              { label: 'Reported by', value: reporterName },
              {
                label: 'Injuries reported',
                value: (
                  <span className={item.injuriesReported > 0 ? 'font-medium text-destructive' : ''}>
                    {item.injuriesReported}
                  </span>
                ),
                hint: 'As reported at the time of recording. Not medically verified by the platform.',
              },
              {
                label: 'Downtime',
                value: item.downtimeHours !== undefined ? `${item.downtimeHours} hour(s)` : 'Not recorded',
              },
              { label: 'Owner', value: assigneeName },
              { label: 'Location description', value: item.locationDescription ?? 'Not recorded' },
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
          {item.investigationSummary && (
            <div className="mt-4 rounded-md border border-border/70 bg-muted/30 p-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Investigation notes
              </p>
              <p className="mt-1 whitespace-pre-line text-sm">{item.investigationSummary}</p>
            </div>
          )}
        </SectionCard>

        <StatusTransitionPanel<SafetyRecordStatus>
          title="Investigation status"
          currentLabel={SAFETY_STATUS_LABELS[item.status]}
          options={transitions.map((to) => ({
            value: to,
            label: SAFETY_STATUS_LABELS[to],
            permission: TRANSITION_PERMISSION[to],
          }))}
          onSubmit={async (to, comment) => {
            await mutation.mutateAsync({ to, comment: comment || undefined });
            await incident.refetch();
          }}
          pending={mutation.isPending}
          terminalMessage="A closed incident is final."
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Location" description="Where the incident occurred, as recorded.">
          {item.location ? (
            <GeoMap
              markers={[
                {
                  id: item.id,
                  label: item.code,
                  lat: item.location.lat,
                  lng: item.location.lng,
                  kind: 'incident',
                  detail: item.title,
                },
              ]}
              height={240}
            />
          ) : (
            <p className="text-sm text-muted-foreground">No coordinate is recorded for this incident.</p>
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
          <ProvenanceNote className="mt-3" tone="neutral" label="Injury data">
            Injury counts are transcribed from the report. The platform does not infer or aggregate them into a
            safety performance statistic.
          </ProvenanceNote>
        </SectionCard>
      </div>
    </DetailPage>
  );
}
