'use client';

import * as React from 'react';
import { ShieldQuestion } from 'lucide-react';
import type { ColumnDef, SortingState } from '@tanstack/react-table';

import { DataTable } from '@/components/data-display/data-table';
import { DetailList } from '@/components/data-display/detail-list';
import { FilterBar, FilterSelect } from '@/components/data-display/filter-bar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { ExportButton } from '@/components/shared/export-button';
import { ListPage } from '@/components/shared/page-shell';
import { PermissionGate } from '@/components/shared/permission-gate';
import { ProvenanceNote } from '@/components/shared/provenance-note';
import { useApiQuery, useServices } from '@/lib/api/use-services';
import { useListData, useListQueryState } from '@/lib/hooks/use-list-query';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { AUDIT_ACTION_LABELS, AUDIT_ACTION_OPTIONS } from '@/lib/domain/reference';
import { ROLE_LABELS } from '@/lib/auth/permissions';
import { formatDateTime } from '@/lib/formatting/dates';
import { cn } from '@/lib/utils';
import type { AuditEvent } from '@/types';

const SOURCE_OPTIONS = [
  { value: 'platform_log', label: 'Platform audit log' },
  { value: 'blockchain_ledger', label: 'Blockchain ledger' },
];

function renderValue(value: unknown): string {
  if (value === undefined) return 'Not recorded';
  if (value === null) return 'null';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export default function AuditPage() {
  const services = useServices();
  const [state, update, reset] = useListQueryState({
    pageSize: 25,
    sortBy: 'timestamp',
    sortDir: 'desc',
  });
  const [searchInput, setSearchInput] = React.useState('');
  const debouncedSearch = useDebouncedValue(searchInput, 300);
  const [detail, setDetail] = React.useState<AuditEvent | null>(null);

  React.useEffect(() => {
    update({ search: debouncedSearch });
  }, [debouncedSearch, update]);

  const query = useListData<AuditEvent>('audit', state, (listQuery) =>
    services.audit.list(listQuery),
  );
  const ledger = useApiQuery(['audit', 'ledger-connected'], () => services.audit.ledgerConnected());

  const rows = query.data?.items ?? [];
  const meta = query.data?.meta;

  const sorting: SortingState = state.sortBy
    ? [{ id: state.sortBy, desc: state.sortDir === 'desc' }]
    : [];

  const columns = React.useMemo<ColumnDef<AuditEvent, unknown>[]>(
    () => [
      {
        id: 'timestamp',
        accessorKey: 'timestamp',
        header: 'Recorded at',
        enableSorting: true,
        meta: { label: 'Recorded at' },
        cell: ({ row }) => (
          <span className="text-xs tabular-nums">{formatDateTime(row.original.timestamp)}</span>
        ),
      },
      {
        id: 'actor',
        header: 'Actor',
        accessorFn: (row) => row.actorName,
        enableSorting: true,
        meta: { label: 'Actor' },
        cell: ({ row }) => (
          <div className="min-w-0 text-xs">
            <p className="font-medium">{row.original.actorName}</p>
            <p className="text-muted-foreground">
              {row.original.actorRole === 'system'
                ? 'System'
                : ROLE_LABELS[row.original.actorRole]}
            </p>
          </div>
        ),
      },
      {
        id: 'action',
        accessorKey: 'action',
        header: 'Action',
        enableSorting: true,
        meta: { label: 'Action' },
        cell: ({ row }) => (
          <span className="text-xs">{AUDIT_ACTION_LABELS[row.original.action]}</span>
        ),
      },
      {
        id: 'entity',
        header: 'Record',
        enableSorting: false,
        meta: { label: 'Record' },
        cell: ({ row }) => (
          <div className="min-w-0 text-xs">
            <p className="truncate font-medium">
              {row.original.entityLabel ?? row.original.entityId}
            </p>
            <p className="text-muted-foreground">{row.original.entityType}</p>
          </div>
        ),
      },
      {
        id: 'source',
        accessorKey: 'source',
        header: 'Source',
        enableSorting: true,
        meta: { label: 'Source' },
        cell: ({ row }) => (
          <Badge variant={row.original.source === 'blockchain_ledger' ? 'success' : 'outline'}>
            {row.original.source === 'blockchain_ledger' ? 'Ledger' : 'Platform log'}
          </Badge>
        ),
      },
      {
        id: 'verification',
        header: 'Verification',
        enableSorting: false,
        meta: { label: 'Verification', secondary: true },
        cell: ({ row }) =>
          row.original.verification ? (
            <span className="text-xs">
              {row.original.verification.method}
              <span className="block text-muted-foreground">
                {formatDateTime(row.original.verification.verifiedAt)}
              </span>
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">None</span>
          ),
      },
      {
        id: 'details',
        header: 'Details',
        enableSorting: false,
        meta: { label: 'Details' },
        cell: ({ row }) => (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDetail(row.original)}
            aria-label={`View audit event for ${row.original.entityLabel ?? row.original.entityId}`}
          >
            Inspect
          </Button>
        ),
      },
    ],
    [],
  );

  return (
    <ListPage
      title="Audit trail"
      description="Chronological record of every action the platform recorded. Entries are append-only from the interface's point of view: nothing here can be edited or deleted."
      headerActions={
        <PermissionGate permission="audit.export" showFallback={false}>
          <ExportButton
            rows={rows}
            fileName="coalguard-audit-trail"
            label="Export page as CSV"
            description="Exports the audit events currently visible on this page."
            columns={[
              { key: 'timestamp', label: 'Recorded at', value: (row) => row.timestamp },
              { key: 'actor', label: 'Actor', value: (row) => row.actorName },
              { key: 'role', label: 'Actor role', value: (row) => row.actorRole },
              { key: 'action', label: 'Action', value: (row) => AUDIT_ACTION_LABELS[row.action] },
              { key: 'entityType', label: 'Entity type', value: (row) => row.entityType },
              { key: 'entityId', label: 'Entity ID', value: (row) => row.entityId },
              { key: 'entityLabel', label: 'Entity label', value: (row) => row.entityLabel ?? '' },
              { key: 'reason', label: 'Reason', value: (row) => row.reason ?? '' },
              { key: 'workflow', label: 'Workflow', value: (row) => row.workflow ?? '' },
              { key: 'source', label: 'Source', value: (row) => row.source },
              {
                key: 'ledgerNetwork',
                label: 'Ledger network',
                value: (row) => row.ledgerProof?.network ?? '',
              },
              {
                key: 'ledgerTransaction',
                label: 'Ledger transaction',
                value: (row) => row.ledgerProof?.transactionId ?? '',
              },
            ]}
          />
        </PermissionGate>
      }
      headerMeta={
        <Badge variant={ledger.data ? 'success' : 'warning'}>
          {ledger.isLoading
            ? 'Checking ledger status'
            : ledger.data
              ? 'Ledger connected'
              : 'No ledger connected'}
        </Badge>
      }
      toolbar={
        <FilterBar
          searchValue={searchInput}
          onSearchChange={setSearchInput}
          searchPlaceholder="Search actor, record or reason"
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
            label="Action"
            value={state.filters.action ?? 'all'}
            onValueChange={(value) => update({ filters: { ...state.filters, action: value } })}
            options={AUDIT_ACTION_OPTIONS}
            allLabel="All actions"
          />
          <FilterSelect
            label="Source"
            value={state.filters.source ?? 'all'}
            onValueChange={(value) => update({ filters: { ...state.filters, source: value } })}
            options={SOURCE_OPTIONS}
            allLabel="All sources"
          />
        </FilterBar>
      }
    >
      <ProvenanceNote
        tone={ledger.data ? 'info' : 'warning'}
        label="Integrity claim"
      >
        {ledger.data
          ? 'A ledger service reports that it is connected. Only entries whose source is "Ledger" and that carry a transaction identifier are externally anchored.'
          : 'No blockchain ledger is connected in this environment. Every entry below is an application audit record. The platform does not claim cryptographic immutability that it cannot verify.'}
      </ProvenanceNote>

      <DataTable<AuditEvent>
        columns={columns}
        data={rows}
        getRowId={(row) => row.id}
        caption="Audit events with actor, action, record and source"
        loading={query.isLoading}
        error={query.error}
        onRetry={() => void query.refetch()}
        emptyTitle="No audit event matches the current filters"
        emptyDescription="Clear the filters to see the full trail."
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
        secondaryColumns={['verification']}
        renderMobileCard={(row) => (
          <div className="space-y-1.5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {AUDIT_ACTION_LABELS[row.action]}{' '}
                  <span className="font-normal text-muted-foreground">
                    {row.entityType}
                  </span>
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {row.entityLabel ?? row.entityId}
                </p>
              </div>
              <Badge variant={row.source === 'blockchain_ledger' ? 'success' : 'outline'}>
                {row.source === 'blockchain_ledger' ? 'Ledger' : 'Platform'}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              {formatDateTime(row.timestamp)} by {row.actorName}
            </p>
            <Button variant="outline" size="sm" onClick={() => setDetail(row)}>
              Inspect
            </Button>
          </div>
        )}
      />

      <Dialog open={detail !== null} onOpenChange={(open) => !open && setDetail(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {detail ? AUDIT_ACTION_LABELS[detail.action] : 'Audit event'}
            </DialogTitle>
            <DialogDescription>
              The stored event exactly as the audit service returned it.
            </DialogDescription>
          </DialogHeader>

          {detail && (
            <div className="space-y-4">
              <DetailList
                columns={2}
                items={[
                  { label: 'Recorded at', value: formatDateTime(detail.timestamp) },
                  { label: 'Actor', value: detail.actorName },
                  {
                    label: 'Actor role',
                    value: detail.actorRole === 'system' ? 'System' : ROLE_LABELS[detail.actorRole],
                  },
                  { label: 'Action', value: AUDIT_ACTION_LABELS[detail.action] },
                  { label: 'Entity type', value: detail.entityType },
                  { label: 'Entity id', value: detail.entityId },
                  { label: 'Entity label', value: detail.entityLabel ?? 'Not recorded' },
                  { label: 'Workflow', value: detail.workflow ?? 'Not recorded' },
                  { label: 'Source', value: detail.source },
                  {
                    label: 'Reason',
                    value: detail.reason ?? 'No reason was supplied',
                  },
                  {
                    label: 'Verification',
                    value: detail.verification
                      ? `${detail.verification.method} at ${formatDateTime(detail.verification.verifiedAt)}`
                      : 'None recorded',
                  },
                  {
                    label: 'Ledger proof',
                    value: detail.ledgerProof
                      ? `${detail.ledgerProof.network} / ${detail.ledgerProof.transactionId}`
                      : 'No ledger proof attached',
                  },
                ]}
              />

              <ValueBlock label="Previous value" value={detail.previousValue} />
              <ValueBlock label="Updated value" value={detail.updatedValue} />

              {detail.source === 'platform_log' && (
                <p className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/5 p-2 text-xs">
                  <ShieldQuestion className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning-strong" aria-hidden="true" />
                  This entry is an ordinary application audit record. It has not been anchored to an external
                  ledger.
                </p>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDetail(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ListPage>
  );
}

function ValueBlock({ label, value }: { label: string; value: unknown }) {
  const empty = value === undefined;
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <pre
        className={cn(
          'mt-1 max-h-48 overflow-auto rounded-md border border-border/80 bg-muted/40 p-2 text-xs',
          empty && 'italic text-muted-foreground',
        )}
      >
        {renderValue(value)}
      </pre>
    </div>
  );
}
