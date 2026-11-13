# CoalGuard.AI — page recipe

Every feature screen in this application follows the same recipe. This document is
the contract for how a new screen is built. Read it before writing a page.

## Non-negotiables

1. **No dead controls.** Every button, link, filter and form field does something real.
   Never render `href="#"`, a disabled button with no explanation, or a toast that
   fires without a successful request.
2. **No invented domain data.** Never hard-code a statutory deadline, a legal
   threshold, a regulatory limit, an API response shape or an AI prediction.
   Configured values come from the service layer.
3. **Status is never colour alone.** Use `StatusBadge` (it renders a text label and a
   glyph) rather than a bare coloured `Badge`.
4. **Honest provenance.** Anything computed by the frontend, simulated, or coming
   from the development adapter must be labelled via `ProvenanceNote` or an explicit
   caption. Never claim a production integration exists.
5. **Permissions are presentation only.** Wrap restricted controls in
   `PermissionGate` with the matching permission from `src/lib/auth/permissions.ts`.
   The backend enforces them independently.
6. **TypeScript strict.** `npx tsc --noEmit` must be clean. `noUncheckedIndexedAccess`
   is on, so index access returns `T | undefined` — use `!` only where the invariant
   is guaranteed, otherwise handle it.

## File header

```tsx
'use client';

import * as React from 'react';
```

Every feature page is a client component because it reads from the service layer
through react-query and uses browser-only state.

## A list page

```tsx
export default function SomethingPage() {
  const services = useServices();
  const router = useRouter();
  const [state, update, reset] = useListQueryState({ pageSize: 20 });
  const [searchInput, setSearchInput] = React.useState('');
  const debouncedSearch = useDebouncedValue(searchInput, 300);

  React.useEffect(() => {
    update({ search: debouncedSearch });
  }, [debouncedSearch, update]);

  const query = useListData<Row>('scope', state, (listQuery) => services.scope.list(listQuery));
  const rows = query.data?.items ?? [];
  const meta = query.data?.meta;

  const sorting: SortingState = state.sortBy
    ? [{ id: state.sortBy, desc: state.sortDir === 'desc' }]
    : [];

  const columns = React.useMemo<ColumnDef<Row, unknown>[]>(() => [/* … */], []);

  return (
    <ListPage
      title="…"
      description="…"
      headerActions={<>…</>}
      toolbar={
        <FilterBar
          searchValue={searchInput}
          onSearchChange={setSearchInput}
          searchPlaceholder="…"
          onReset={() => { setSearchInput(''); reset(); }}
          resultCount={meta ? { from: …, to: …, total: meta.total } : undefined}
        >
          <FilterSelect label="…" value={state.filters.x ?? 'all'} onValueChange={…} options={…} allLabel="All …" />
        </FilterBar>
      }
    >
      <DataTable<Row>
        columns={columns}
        data={rows}
        getRowId={(row) => row.id}
        caption="…"
        loading={query.isLoading}
        error={query.error}
        onRetry={() => void query.refetch()}
        emptyTitle="…"
        emptyDescription="…"
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
        onRowClick={(row) => router.push(`/scope/${row.id}`)}
        secondaryColumns={['…']}
        renderMobileCard={(row) => (/* compact card */)}
      />
    </ListPage>
  );
}
```

## A detail page

```tsx
export default function SomethingDetailPage({ params }: { params: { id: string } }) {
  const services = useServices();
  const query = useApiQuery(['scope', 'detail', params.id], () => services.scope.get(params.id));

  if (query.isLoading) return <LoadingState … />;
  if (query.error) return <ErrorState … onRetry={() => void query.refetch()} />;
  if (!query.data) return null;

  return (
    <DetailPage title={query.data.title} description={…} backHref="/scope" backLabel="Back to …">
      <SectionCard title="…" description="…">
        <DetailList items={[/* { label, value } */]} columns={2} />
      </SectionCard>
    </DetailPage>
  );
}
```

`SectionCard` and `DetailList` come from `@/components/data-display/detail-list`.

## A mutation

Always use `useAppMutation` from `@/lib/hooks/use-app-mutation`. It shows a success
toast only after the request resolves and an error toast when it rejects.

```tsx
const mutation = useAppMutation({
  mutationFn: async (values: FormValues) => {
    const parsed = schema.parse(values);
    return services.scope.create({ /* map parsed values */ });
  },
  successMessage: (record) => `Record ${record.code} created.`,
  invalidates: [['scope', 'list'], ['dashboard']],
});

const onSubmit = form.handleSubmit(async (values) => {
  try {
    const record = await mutation.mutateAsync(values);
    onOpenChange(false);
    router.push(`/scope/${record.id}`);
  } catch (error) {
    applyServerFieldErrors(error, form.setError as never);
  }
});
```

**Invalidation keys** — invalidate the scope you wrote to, plus any derived view:

| Scope | Keys |
| --- | --- |
| mines | `['mines', 'list']`, `['mines', 'regions']`, `['dashboard']` |
| compliance | `['compliance', 'list']`, `['dashboard']` |
| inspections | `['inspections', 'list']`, `['dashboard']` |
| corrective actions | `['corrective-actions', 'list']`, `['dashboard']` |
| safety | `['safety', 'list']`, `['safety', 'incidents']`, `['dashboard']` |
| environment | `['environment', 'measurements']`, `['dashboard']` |
| production | `['production', 'list']`, `['dashboard']` |
| contractors | `['contractors', 'list']` |
| workforce | `['workforce', 'attendance']` |
| documents | `['documents', 'list']` |
| analytics | `['analytics', 'insights']` |
| reports | `['reports', 'list']` |
| notifications | `['notifications']` |
| admin | `['admin', 'users']`, `['admin', 'workflows']` |

## A form

Use `useZodForm` + `FormProvider` + the field components from
`@/components/forms/form`. The Zod schema comes from
`@/lib/validation/schemas.ts` — **reuse an existing schema, do not add a new one
per page**.

```tsx
const form = useZodForm<FormValues>({ schema: someSchema, defaultValues: { … } });

<FormProvider form={form}>
  <form onSubmit={onSubmit} className="space-y-4" noValidate>
    <FormErrorSummary form={form} />
    <TextInput name="title" label="Title" required />
    <SelectInput name="status" label="Status" options={STATUS_OPTIONS} />
    <DialogFooter>
      <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
      <Button type="submit" loading={form.formState.isSubmitting}>Save</Button>
    </DialogFooter>
  </form>
</FormProvider>
```

Available field components: `TextInput`, `TextAreaInput`, `NumberInput`, `DateInput`,
`SelectInput`, `CheckboxGroupInput`, `CheckboxInput`, `FormErrorSummary`.

## Labels and options

Never hand-write a label for a domain enum. Use the maps in
`@/lib/domain/reference.ts`:

- `StatusBadge` for status pills (`domain` is one of `compliance`, `inspection`,
  `safety`, `corrective_action`, `document`, `priority`, `risk`, `verification`,
  `violation`).
- `*_OPTIONS` arrays for `SelectInput` / `FilterSelect`:
  `COMPLIANCE_CATEGORY_OPTIONS`, `COMPLIANCE_STATUS_OPTIONS`, `INSPECTION_TYPE_OPTIONS`,
  `PRIORITY_OPTIONS`, `RISK_LEVEL_OPTIONS`, `VIOLATION_STATUS_OPTIONS`,
  `CORRECTIVE_ACTION_STATUS_OPTIONS`, `CORRECTIVE_ACTION_SOURCE_OPTIONS`,
  `OPERATIONAL_STATUS_OPTIONS`, `DOCUMENT_TYPE_OPTIONS`, `DOCUMENT_STATUS_OPTIONS`,
  `ENVIRONMENTAL_INDICATOR_OPTIONS`, `MEASUREMENT_SOURCE_OPTIONS`, `SHIFT_OPTIONS`,
  `PRODUCTION_VALUE_KIND_OPTIONS`, `INSIGHT_CATEGORY_OPTIONS`, `NOTIFICATION_TYPE_OPTIONS`,
  `NOTIFICATION_SEVERITY_OPTIONS`, `AUDIT_ACTION_OPTIONS`, `REPORT_CATEGORY_OPTIONS`,
  `CONTRACTOR_TYPE_OPTIONS`, `ROLE_OPTIONS`, `CONTRACT_STATUS_OPTIONS`,
  `CONTRACTOR_COMPLIANCE_OPTIONS`, `ATTENDANCE_STATUS_OPTIONS`.
- `*_LABELS` maps for inline text.

## Reference implementation

`src/app/(dashboard)/mines/page.tsx` is the canonical list page with a create
dialog. `src/app/(dashboard)/dashboard/page.tsx` is the canonical metrics page.
Copy their structure, not their wording.

## Checklist before you finish a page

- [ ] `npx tsc --noEmit` is clean.
- [ ] `npm run lint` is clean.
- [ ] Every control does something real.
- [ ] Status is never colour alone.
- [ ] Computed / simulated / development data is labelled.
- [ ] Restricted actions are wrapped in `PermissionGate`.
- [ ] The page is usable at 375px width (mobile card layout, stacked actions).
- [ ] No `href="#"`, no `console.log`, no `TODO`.
