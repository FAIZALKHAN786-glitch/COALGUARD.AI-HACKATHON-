'use client';

import * as React from 'react';
import Link from 'next/link';
import { Bell, CheckCheck, MailOpen } from 'lucide-react';
import type { ColumnDef, SortingState } from '@tanstack/react-table';

import { DataTable } from '@/components/data-display/data-table';
import { SectionCard } from '@/components/data-display/detail-list';
import { FilterBar, FilterSelect } from '@/components/data-display/filter-bar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ListPage } from '@/components/shared/page-shell';
import { PermissionGate } from '@/components/shared/permission-gate';
import { ProvenanceNote } from '@/components/shared/provenance-note';
import { useApiQuery, useServices } from '@/lib/api/use-services';
import { useAppMutation } from '@/lib/hooks/use-app-mutation';
import { useListData, useListQueryState } from '@/lib/hooks/use-list-query';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import {
  NOTIFICATION_SEVERITY_LABELS,
  NOTIFICATION_SEVERITY_OPTIONS,
  NOTIFICATION_TYPE_LABELS,
  NOTIFICATION_TYPE_OPTIONS,
} from '@/lib/domain/reference';
import { formatDateTime, formatRelative } from '@/lib/formatting/dates';
import { cn } from '@/lib/utils';
import type { AppNotification, WorkflowRule } from '@/types';

const READ_OPTIONS = [
  { value: 'false', label: 'Unread only' },
  { value: 'true', label: 'Read only' },
];

function severityVariant(severity: AppNotification['severity']): 'info' | 'success' | 'warning' | 'destructive' {
  if (severity === 'critical') return 'destructive';
  if (severity === 'warning') return 'warning';
  if (severity === 'success') return 'success';
  return 'info';
}

export default function NotificationsPage() {
  const services = useServices();
  const [state, update, reset] = useListQueryState({ pageSize: 25, sortBy: 'createdAt', sortDir: 'desc' });
  const [searchInput, setSearchInput] = React.useState('');
  const debouncedSearch = useDebouncedValue(searchInput, 300);

  React.useEffect(() => {
    update({ search: debouncedSearch });
  }, [debouncedSearch, update]);

  const query = useListData<AppNotification>('notifications', state, (listQuery) =>
    services.notifications.list(listQuery),
  );
  const unread = useApiQuery(['notifications', 'unread-count'], () =>
    services.notifications.unreadCount(),
  );
  const rules = useApiQuery(['notifications', 'workflow-rules'], () =>
    services.notifications.workflowRules(),
  );

  const rows = query.data?.items ?? [];
  const meta = query.data?.meta;

  const sorting: SortingState = state.sortBy
    ? [{ id: state.sortBy, desc: state.sortDir === 'desc' }]
    : [];

  const markRead = useAppMutation({
    mutationFn: ({ id, read }: { id: string; read: boolean }) =>
      services.notifications.markRead(id, read),
    successMessage: (_data, variables) =>
      variables.read ? 'Notification marked as read.' : 'Notification marked as unread.',
    invalidates: [['notifications']],
  });

  const markAllRead = useAppMutation({
    mutationFn: () => services.notifications.markAllRead(),
    successMessage: 'All notifications marked as read.',
    invalidates: [['notifications']],
  });

  const columns = React.useMemo<ColumnDef<AppNotification, unknown>[]>(
    () => [
      {
        id: 'title',
        accessorKey: 'title',
        header: 'Notification',
        enableSorting: true,
        meta: { label: 'Notification' },
        cell: ({ row }) => (
          <div className="min-w-0 space-y-1">
            <div className="flex items-start gap-2">
              {!row.original.read && (
                <span
                  className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary"
                  aria-label="Unread"
                />
              )}
              <div className="min-w-0">
                <p className={cn('text-sm', row.original.read ? 'font-normal' : 'font-semibold')}>
                  {row.original.title}
                </p>
                <p className="mt-0.5 whitespace-pre-line text-xs text-muted-foreground">
                  {row.original.message}
                </p>
                {row.original.relatedEntity && (
                  <Link
                    href={row.original.relatedEntity.href}
                    className="mt-1 inline-block text-xs font-medium underline-offset-2 hover:underline"
                  >
                    {row.original.relatedEntity.label}
                  </Link>
                )}
              </div>
            </div>
          </div>
        ),
      },
      {
        id: 'type',
        accessorKey: 'type',
        header: 'Type',
        enableSorting: true,
        meta: { label: 'Type' },
        cell: ({ row }) => (
          <span className="text-xs">{NOTIFICATION_TYPE_LABELS[row.original.type]}</span>
        ),
      },
      {
        id: 'severity',
        accessorKey: 'severity',
        header: 'Severity',
        enableSorting: true,
        meta: { label: 'Severity' },
        cell: ({ row }) => (
          <Badge variant={severityVariant(row.original.severity)}>
            {NOTIFICATION_SEVERITY_LABELS[row.original.severity]}
          </Badge>
        ),
      },
      {
        id: 'createdAt',
        accessorKey: 'createdAt',
        header: 'Received',
        enableSorting: true,
        meta: { label: 'Received', secondary: true },
        cell: ({ row }) => (
          <div className="text-xs tabular-nums">
            <p>{formatRelative(row.original.createdAt)}</p>
            <p className="text-muted-foreground">{formatDateTime(row.original.createdAt)}</p>
          </div>
        ),
      },
      {
        id: 'deliveries',
        header: 'Delivery',
        enableSorting: false,
        meta: { label: 'Delivery', secondary: true },
        cell: ({ row }) =>
          row.original.deliveries.length === 0 ? (
            <span className="text-xs text-muted-foreground">In-app only</span>
          ) : (
            <ul className="space-y-0.5 text-xs">
              {row.original.deliveries.map((delivery) => (
                <li key={`${delivery.channel}-${delivery.at ?? 'pending'}`}>
                  <span className="capitalize">{delivery.channel}</span>
                  {': '}
                  <span className="text-muted-foreground">{delivery.status}</span>
                </li>
              ))}
            </ul>
          ),
      },
      {
        id: 'actions',
        header: 'Actions',
        enableSorting: false,
        meta: { label: 'Actions' },
        cell: ({ row }) => (
          <div className="flex flex-wrap items-center gap-1.5">
            {row.original.actionHref && row.original.actionLabel && (
              <Button asChild variant="outline" size="sm">
                <Link href={row.original.actionHref}>{row.original.actionLabel}</Link>
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                markRead.mutate({ id: row.original.id, read: !row.original.read })
              }
              loading={markRead.isPending && markRead.variables?.id === row.original.id}
              loadingLabel="Updating"
            >
              {row.original.read ? (
                <>
                  <MailOpen className="h-3.5 w-3.5" aria-hidden="true" />
                  Mark unread
                </>
              ) : (
                <>
                  <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" />
                  Mark read
                </>
              )}
            </Button>
          </div>
        ),
      },
    ],
    [markRead],
  );

  return (
    <ListPage
      title="Notifications"
      description="Alerts, deadlines, escalations and approval requests addressed to you. A notification records what the platform observed; it is not itself a regulatory finding."
      headerActions={
        <Button
          variant="outline"
          size="sm"
          onClick={() => markAllRead.mutate(undefined)}
          loading={markAllRead.isPending}
          loadingLabel="Updating"
          disabled={(unread.data ?? 0) === 0}
        >
          <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" />
          Mark all read
        </Button>
      }
      headerMeta={
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={(unread.data ?? 0) > 0 ? 'warning' : 'muted'}>
            <Bell className="mr-1 h-3 w-3" aria-hidden="true" />
            {unread.data ?? 0} unread
          </Badge>
        </div>
      }
      toolbar={
        <FilterBar
          searchValue={searchInput}
          onSearchChange={setSearchInput}
          searchPlaceholder="Search notification title or message"
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
            label="Read state"
            value={state.filters.read ?? 'all'}
            onValueChange={(value) => update({ filters: { ...state.filters, read: value } })}
            options={READ_OPTIONS}
            allLabel="Any read state"
          />
          <FilterSelect
            label="Severity"
            value={state.filters.severity ?? 'all'}
            onValueChange={(value) => update({ filters: { ...state.filters, severity: value } })}
            options={NOTIFICATION_SEVERITY_OPTIONS}
            allLabel="All severities"
          />
          <FilterSelect
            label="Type"
            value={state.filters.type ?? 'all'}
            onValueChange={(value) => update({ filters: { ...state.filters, type: value } })}
            options={NOTIFICATION_TYPE_OPTIONS}
            allLabel="All types"
          />
        </FilterBar>
      }
    >
      <ProvenanceNote tone="neutral" label="Notification scope">
        Notifications are generated by the workflow rules configured below and addressed to the recipient. If a
        delivery channel is not connected, the delivery state says so rather than showing the message as sent.
      </ProvenanceNote>

      <DataTable<AppNotification>
        columns={columns}
        data={rows}
        getRowId={(row) => row.id}
        caption="Notifications with type, severity, receipt time and read actions"
        loading={query.isLoading}
        error={query.error}
        onRetry={() => void query.refetch()}
        emptyTitle="No notifications match the current filters"
        emptyDescription="Clear the filters to see the full inbox."
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
        secondaryColumns={['createdAt', 'deliveries']}
        renderMobileCard={(row) => (
          <div className="space-y-1.5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className={cn('text-sm', row.read ? 'font-normal' : 'font-semibold')}>
                  {row.title}
                </p>
                <p className="text-xs text-muted-foreground">
                  {NOTIFICATION_TYPE_LABELS[row.type]} / {formatRelative(row.createdAt)}
                </p>
              </div>
              <Badge variant={severityVariant(row.severity)}>
                {NOTIFICATION_SEVERITY_LABELS[row.severity]}
              </Badge>
            </div>
            <p className="whitespace-pre-line text-xs text-muted-foreground">{row.message}</p>
            <div className="flex flex-wrap gap-1.5">
              {row.actionHref && row.actionLabel && (
                <Button asChild variant="outline" size="sm">
                  <Link href={row.actionHref}>{row.actionLabel}</Link>
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => markRead.mutate({ id: row.id, read: !row.read })}
              >
                {row.read ? 'Mark unread' : 'Mark read'}
              </Button>
            </div>
          </div>
        )}
      />

      <SectionCard
        title="Workflow rules"
        description="Rules that decide when a deadline, escalation or reminder notification is produced. Changes are recorded against your identity."
      >
        {rules.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading workflow rules...</p>
        ) : rules.error ? (
          <div className="space-y-2">
            <p className="text-sm text-destructive">{rules.error.message}</p>
            <Button variant="outline" size="sm" onClick={() => void rules.refetch()}>
              Try again
            </Button>
          </div>
        ) : (rules.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No workflow rule is configured.</p>
        ) : (
          <ul className="space-y-3">
            {(rules.data ?? []).map((rule) => (
              <WorkflowRuleCard key={rule.id} rule={rule} />
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-muted-foreground">
          Escalation delays are configuration values defined by the organisation. The interface does not
          interpret them as statutory deadlines.
        </p>
      </SectionCard>
    </ListPage>
  );
}

function WorkflowRuleCard({ rule }: { rule: WorkflowRule }) {
  const services = useServices();
  const mutation = useAppMutation({
    mutationFn: (enabled: boolean) =>
      services.notifications.updateWorkflowRule(rule.id, { enabled }),
    successMessage: (_data, enabled) =>
      enabled ? `Rule "${rule.name}" enabled.` : `Rule "${rule.name}" disabled.`,
    invalidates: [['notifications', 'workflow-rules']],
  });

  return (
    <li className="rounded-lg border border-border/80 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium">{rule.name}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{rule.description}</p>
          <p className="mt-1 text-xs text-muted-foreground">Trigger: {rule.trigger}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={rule.enabled ? 'success' : 'muted'}>
            {rule.enabled ? 'Enabled' : 'Disabled'}
          </Badge>
          <PermissionGate
            permission="notification.manage"
            fallback={
              <span className="text-xs text-muted-foreground">
                Only an administrator can change this rule.
              </span>
            }
          >
            <Button
              variant="outline"
              size="sm"
              onClick={() => mutation.mutate(!rule.enabled)}
              loading={mutation.isPending}
              loadingLabel="Saving"
            >
              {rule.enabled ? 'Disable' : 'Enable'}
            </Button>
          </PermissionGate>
        </div>
      </div>

      {rule.stages.length > 0 && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-xs">
            <caption className="sr-only">Escalation stages for {rule.name}</caption>
            <thead>
              <tr className="border-b border-border text-left uppercase tracking-wide text-muted-foreground">
                <th scope="col" className="py-1.5 pr-3 font-medium">
                  Stage
                </th>
                <th scope="col" className="py-1.5 pr-3 font-medium">
                  Role
                </th>
                <th scope="col" className="py-1.5 pr-3 font-medium">
                  After
                </th>
                <th scope="col" className="py-1.5 font-medium">
                  Channels
                </th>
              </tr>
            </thead>
            <tbody>
              {[...rule.stages]
                .sort((left, right) => left.order - right.order)
                .map((stage) => (
                  <tr key={stage.id} className="border-b border-border/60 last:border-0">
                    <td className="py-1.5 pr-3">{stage.label}</td>
                    <td className="py-1.5 pr-3 capitalize">{stage.role.replace(/_/g, ' ')}</td>
                    <td className="py-1.5 pr-3 tabular-nums">{stage.afterHours} h</td>
                    <td className="py-1.5 capitalize">{stage.notifyChannels.join(', ')}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-2 text-xs text-muted-foreground">
        Last updated {formatDateTime(rule.updatedAt)} by {rule.updatedBy}.
      </p>
    </li>
  );
}
