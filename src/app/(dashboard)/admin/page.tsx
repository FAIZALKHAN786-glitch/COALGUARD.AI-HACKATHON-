'use client';

import * as React from 'react';
import { Building2, PlugZap, ShieldCheck, UserCog } from 'lucide-react';
import type { ColumnDef, SortingState } from '@tanstack/react-table';

import { DataTable } from '@/components/data-display/data-table';
import { DetailList, SectionCard } from '@/components/data-display/detail-list';
import { FilterBar, FilterSelect } from '@/components/data-display/filter-bar';
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
import {
  FormErrorSummary,
  FormProvider,
  SelectInput,
  useZodForm,
} from '@/components/forms/form';
import { ListPage } from '@/components/shared/page-shell';
import { PermissionGate } from '@/components/shared/permission-gate';
import { ProvenanceNote } from '@/components/shared/provenance-note';
import { useAuth } from '@/lib/auth/AuthProvider';
import { ROLE_LABELS, permissionsFor } from '@/lib/auth/permissions';
import { useApiQuery, useServices } from '@/lib/api/use-services';
import { useAppMutation } from '@/lib/hooks/use-app-mutation';
import { useListData, useListQueryState } from '@/lib/hooks/use-list-query';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { humanise, ROLE_OPTIONS } from '@/lib/domain/reference';
import { formatDateTime } from '@/lib/formatting/dates';
import { applyServerFieldErrors } from '@/lib/errors/normalise';
import { userRoleSchema, type UserRoleFormValues } from '@/lib/validation/schemas';
import { isDevelopmentData } from '@/config/app';
import type { IntegrationStatus } from '@/services/types';
import type { User } from '@/types';

const ROLE_FILTER_OPTIONS = ROLE_OPTIONS;

type AdminUser = User & { mineNames?: string[] };

function integrationVariant(
  status: IntegrationStatus['status'],
): 'success' | 'warning' | 'destructive' | 'muted' {
  if (status === 'healthy') return 'success';
  if (status === 'degraded') return 'warning';
  if (status === 'unavailable') return 'destructive';
  return 'muted';
}

export default function AdminPage() {
  const services = useServices();
  const { user: currentUser } = useAuth();
  const [state, update, reset] = useListQueryState({ pageSize: 20 });
  const [searchInput, setSearchInput] = React.useState('');
  const debouncedSearch = useDebouncedValue(searchInput, 300);
  const [roleTarget, setRoleTarget] = React.useState<AdminUser | null>(null);
  const [deactivateTarget, setDeactivateTarget] = React.useState<AdminUser | null>(null);

  React.useEffect(() => {
    update({ search: debouncedSearch });
  }, [debouncedSearch, update]);

  const usersQuery = useListData<AdminUser>('users', state, (query) => services.admin.users(query));
  const reference = useApiQuery(['admin', 'reference-data'], () => services.admin.referenceData());
  const integrations = useApiQuery(['admin', 'integration-status'], () =>
    services.admin.integrationStatus(),
  );

  const rows = usersQuery.data?.items ?? [];
  const meta = usersQuery.data?.meta;

  const sorting: SortingState = state.sortBy
    ? [{ id: state.sortBy, desc: state.sortDir === 'desc' }]
    : [];

  const deactivateMutation = useAppMutation({
    mutationFn: (id: string) => services.admin.deactivateUser(id),
    successMessage: (user) => `${user.name}'s access was deactivated.`,
    invalidates: [['users'], ['audit', 'list']],
  });

  const columns = React.useMemo<ColumnDef<AdminUser, unknown>[]>(
    () => [
      {
        id: 'name',
        accessorKey: 'name',
        header: 'User',
        enableSorting: true,
        meta: { label: 'User' },
        cell: ({ row }) => (
          <div className="min-w-0">
            <p className="font-medium">{row.original.name}</p>
            <p className="truncate text-xs text-muted-foreground">{row.original.email}</p>
            {row.original.developmentIdentity && (
              <Badge variant="warning" className="mt-1">
                Development identity
              </Badge>
            )}
          </div>
        ),
      },
      {
        id: 'title',
        accessorKey: 'title',
        header: 'Job title',
        enableSorting: true,
        meta: { label: 'Job title' },
        cell: ({ row }) => <span className="text-xs">{row.original.title}</span>,
      },
      {
        id: 'role',
        accessorKey: 'role',
        header: 'Role',
        enableSorting: true,
        meta: { label: 'Role' },
        cell: ({ row }) => <Badge variant="outline">{ROLE_LABELS[row.original.role]}</Badge>,
      },
      {
        id: 'scope',
        header: 'Mine scope',
        enableSorting: false,
        meta: { label: 'Mine scope', secondary: true },
        cell: ({ row }) =>
          row.original.mineIds.length === 0 && row.original.subsidiaryIds.length === 0 ? (
            <span className="text-xs text-muted-foreground">Organisation-wide</span>
          ) : (
            <span className="text-xs">
              {row.original.mineIds.length} mine(s), {row.original.subsidiaryIds.length} subsidiary(ies)
            </span>
          ),
      },
      {
        id: 'lastLoginAt',
        accessorKey: 'lastLoginAt',
        header: 'Last sign-in',
        enableSorting: true,
        meta: { label: 'Last sign-in', secondary: true },
        cell: ({ row }) => (
          <span className="text-xs tabular-nums">
            {row.original.lastLoginAt ? formatDateTime(row.original.lastLoginAt) : 'Never'}
          </span>
        ),
      },
      {
        id: 'actions',
        header: 'Actions',
        enableSorting: false,
        meta: { label: 'Actions' },
        cell: ({ row }) => {
          const self = currentUser?.id === row.original.id;
          return (
            <div className="flex flex-wrap gap-1.5">
              <PermissionGate permission="admin.users" showFallback={false}>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setRoleTarget(row.original)}
                  disabled={self}
                  title={self ? 'You cannot change your own role.' : undefined}
                >
                  <UserCog className="h-3.5 w-3.5" aria-hidden="true" />
                  Role
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setDeactivateTarget(row.original)}
                  disabled={self || row.original.developmentIdentity}
                  title={
                    self
                      ? 'You cannot deactivate your own identity.'
                      : row.original.developmentIdentity
                        ? 'Development identities are fixed fixtures and cannot be deactivated.'
                        : undefined
                  }
                >
                  Deactivate
                </Button>
              </PermissionGate>
            </div>
          );
        },
      },
    ],
    [currentUser?.id],
  );

  return (
    <ListPage
      title="Administration"
      description="Administrative controls for identities, reference data and integrations. Every change is recorded in the audit trail."
      headerMeta={
        <Badge variant="outline">
          <ShieldCheck className="mr-1 h-3 w-3" aria-hidden="true" />
          Administrator view
        </Badge>
      }
      toolbar={
        <FilterBar
          searchValue={searchInput}
          onSearchChange={setSearchInput}
          searchPlaceholder="Search users by name, email or title"
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
            label="Role"
            value={state.filters.role ?? 'all'}
            onValueChange={(value) => update({ filters: { ...state.filters, role: value } })}
            options={ROLE_FILTER_OPTIONS}
            allLabel="All roles"
          />
        </FilterBar>
      }
    >
      <ProvenanceNote tone="warning" label="Scope of these controls">
        Role and permission checks in this interface decide what is rendered. They are not the security
        boundary: the backend must enforce the same rules. Deactivating an identity here only takes effect if
        the identity service accepts the change.
      </ProvenanceNote>

      <SectionCard
        title="Identities"
        description="Every identity known to the identity service, with its role and mine scope."
      >
        <DataTable<AdminUser>
          columns={columns}
          data={rows}
          getRowId={(row) => row.id}
          caption="Platform users with role, mine scope and administrative actions"
          loading={usersQuery.isLoading}
          error={usersQuery.error}
          onRetry={() => void usersQuery.refetch()}
          emptyTitle="No identity matches the current filters"
          emptyDescription="Clear the search or role filter to see every identity."
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
          secondaryColumns={['scope', 'lastLoginAt']}
          renderMobileCard={(row) => (
            <div className="space-y-1.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-medium">{row.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{row.email}</p>
                </div>
                <Badge variant="outline">{ROLE_LABELS[row.role]}</Badge>
              </div>
              <p className="text-xs text-muted-foreground">{row.title}</p>
              <PermissionGate permission="admin.users" showFallback={false}>
                <div className="flex gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setRoleTarget(row)}
                    disabled={currentUser?.id === row.id}
                  >
                    Change role
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setDeactivateTarget(row)}
                    disabled={currentUser?.id === row.id || row.developmentIdentity}
                  >
                    Deactivate
                  </Button>
                </div>
              </PermissionGate>
            </div>
          )}
        />
      </SectionCard>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard
          title="Reference data"
          description="Configured values served to the forms. These are configuration, not statutory text."
        >
          {reference.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading reference data...</p>
          ) : reference.error ? (
            <div className="space-y-2">
              <p className="text-sm text-destructive">{reference.error.message}</p>
              <Button variant="outline" size="sm" onClick={() => void reference.refetch()}>
                Try again
              </Button>
            </div>
          ) : reference.data ? (
            <div className="space-y-4">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Compliance categories
                </p>
                <ul className="mt-1 space-y-1">
                  {reference.data.complianceCategories.map((entry) => (
                    <li key={entry.value} className="text-sm">
                      <span className="font-medium">{entry.label}</span>
                      <span className="block text-xs text-muted-foreground">
                        {entry.description}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Inspection types
                </p>
                <ul className="mt-1 space-y-1">
                  {reference.data.inspectionTypes.map((entry) => (
                    <li key={entry.value} className="text-sm">
                      <span className="font-medium">{entry.label}</span>
                      <span className="block text-xs text-muted-foreground">
                        {entry.description}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Document types
                </p>
                <ul className="mt-1 space-y-1">
                  {reference.data.documentTypes.map((entry) => (
                    <li key={entry.value} className="text-sm">
                      <span className="font-medium">{entry.label}</span>
                      <span className="block text-xs text-muted-foreground">
                        {entry.description}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Regions and units
                </p>
                <p className="mt-1 text-sm">{reference.data.regions.join(', ') || 'None configured'}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Units: {reference.data.units.join(', ') || 'None configured'}
                </p>
              </div>
            </div>
          ) : null}
        </SectionCard>

        <SectionCard
          title="Integration status"
          description="The status each integration reported when it was last probed. Unverified entries are configuration statements, not live probes."
          actions={
            <Button variant="outline" size="sm" onClick={() => void integrations.refetch()}>
              <PlugZap className="h-3.5 w-3.5" aria-hidden="true" />
              Re-check
            </Button>
          }
        >
          {integrations.isLoading ? (
            <p className="text-sm text-muted-foreground">Checking integrations...</p>
          ) : integrations.error ? (
            <p className="text-sm text-destructive">{integrations.error.message}</p>
          ) : (integrations.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">No integration is configured.</p>
          ) : (
            <ul className="space-y-2">
              {(integrations.data ?? []).map((integration) => (
                <li key={integration.id} className="rounded-md border border-border/80 p-2.5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{integration.name}</p>
                      <p className="text-xs capitalize text-muted-foreground">
                        {integration.category}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge variant={integrationVariant(integration.status)}>
                        {humanise(integration.status)}
                      </Badge>
                      <Badge variant={integration.verified ? 'info' : 'muted'}>
                        {integration.verified ? 'Probed' : 'Not verified'}
                      </Badge>
                    </div>
                  </div>
                  <p className="mt-1 text-xs">{integration.detail}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Last checked {formatDateTime(integration.lastCheckedAt)}
                  </p>
                </li>
              ))}
            </ul>
          )}
          {isDevelopmentData && (
            <p className="mt-3 flex items-start gap-1.5 text-xs text-muted-foreground">
              <Building2 className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              This build runs against the development data adapter. Integration states describe the adapter,
              not a production deployment.
            </p>
          )}
        </SectionCard>
      </div>

      <RoleDialog
        target={roleTarget}
        onOpenChange={(open) => !open && setRoleTarget(null)}
      />

      <Dialog
        open={deactivateTarget !== null}
        onOpenChange={(open) => !open && setDeactivateTarget(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Deactivate this identity?</DialogTitle>
            <DialogDescription>
              {deactivateTarget
                ? `${deactivateTarget.name} will no longer be able to sign in. Historical audit entries keep their original actor name.`
                : ''}
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This calls the identity service and reports its answer. It does not delete any record.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeactivateTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              loading={deactivateMutation.isPending}
              onClick={async () => {
                if (!deactivateTarget) return;
                try {
                  await deactivateMutation.mutateAsync(deactivateTarget.id);
                  setDeactivateTarget(null);
                } catch {
                  // The mutation wrapper surfaces the failure.
                }
              }}
            >
              Deactivate identity
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ListPage>
  );
}

function RoleDialog({
  target,
  onOpenChange,
}: {
  target: AdminUser | null;
  onOpenChange: (open: boolean) => void;
}) {
  const services = useServices();
  const form = useZodForm<UserRoleFormValues>({
    schema: userRoleSchema,
    defaultValues: { role: target?.role ?? 'field_inspector' },
  });

  React.useEffect(() => {
    if (!target) return;
    form.reset({ role: target.role });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.id, target?.role]);

  const mutation = useAppMutation({
    mutationFn: async (values: UserRoleFormValues) => {
      const parsed = userRoleSchema.parse(values);
      return services.admin.updateUserRole(target!.id, parsed.role);
    },
    successMessage: (user) => `${user.name} now has the ${ROLE_LABELS[user.role]} role.`,
    invalidates: [['users'], ['admin', 'reference-data'], ['audit', 'list']],
    onSuccess: () => onOpenChange(false),
  });

  const onSubmit = form.handleSubmit(async (values) => {
    if (!target) return;
    try {
      await mutation.mutateAsync(values);
    } catch (error) {
      applyServerFieldErrors(error, form.setError as never);
    }
  });

  return (
    <Dialog open={target !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Change role</DialogTitle>
          <DialogDescription>
            {target
              ? `The permissions held by ${target.name} change immediately after the identity service accepts the change.`
              : ''}
          </DialogDescription>
        </DialogHeader>

        <FormProvider form={form}>
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            <FormErrorSummary form={form} />
            <SelectInput name="role" label="Role" required options={ROLE_OPTIONS} />
            {target && (
              <div className="rounded-md border border-border/80 bg-accent/30 p-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Permissions held by this role
                </p>
                <div className="mt-1 flex flex-wrap gap-1">
                  {permissionsFor(form.watch('role')).map((permission) => (
                    <Badge key={permission} variant="outline">
                      {permission}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={mutation.isPending}>
                Save role
              </Button>
            </DialogFooter>
          </form>
        </FormProvider>
      </DialogContent>
    </Dialog>
  );
}
