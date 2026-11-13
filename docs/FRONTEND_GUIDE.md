# CoalGuard.AI — Frontend Development Guide

Read this before adding a screen. It documents the conventions every page in
`src/app/(dashboard)` follows, so new pages look and behave like the rest of
the platform.

---

## 1. Non-negotiables

1. **Never invent domain values.** Deadlines, thresholds, statutory references
   and reference lists come from the service layer. If a value is not in the
   record or the configured register, show `—` and say where the value should
   come from.
2. **Never claim a capability that does not exist.** The AI module produces
   *predictions*; label them as such (`isPrediction` is always true). The
   blockchain ledger is not connected — never label an audit row as
   blockchain-verified. OCR output comes from a development simulation — say so.
3. **Every control must do something.** No `href="#"`, no button without an
   handler, no toast that claims success without a successful response.
4. **Status is never conveyed by colour alone.** Use `StatusBadge`, which always
   renders a text label (and a glyph).
5. **Errors are visible.** A failed request shows an error state with a retry
   action — never an empty table that looks like "no data".

---

## 2. Layering

```
app/(dashboard)/<feature>/page.tsx      route + data fetching (client component)
components/data-display/*               tables, badges, empty/error states
components/forms/form.tsx                RHF + Zod field controls
components/maps/*                        Mapbox GL + geolocation capture
components/shared/*                      page shells, permission gate, export
lib/                                     pure logic (formatting, metrics, csv)
services/                                the only place that talks to data
```

**Rules**

- A page never imports the service modules directly for HTTP calls; it uses
  `useServices()` from `@/lib/api/use-services` and the service interfaces.
- A page never hard-codes a status colour or label — use `StatusBadge`.
- Pure logic goes in `src/lib` so it can be unit tested without a DOM.

---

## 3. Page scaffolding

Use `ListPage` / `DetailPage` from `@/components/shared/page-shell`:

```tsx
<ListPage
  title="Statutory compliance"
  description="One-line explanation of what this screen shows."
  headerActions={<Button …>New requirement</Button>}
  toolbar={<FilterBar … />}
>
  <DataTable … />
</ListPage>
```

Every list page must provide:

- a `title` and a `description` that says what the data is and where it comes
  from;
- a search box (`FilterBar` with `onSearchChange`);
- filter controls for the meaningful dimensions (mine, status, category…);
- an empty state (`DataTable` handles this via `emptyTitle` / `emptyDescription`);
- a CSV export when the user would reasonably need the data offline
  (`ExportButton`, permission-gated by the relevant `*.export` permission).

---

## 4. Data fetching

```tsx
const services = useServices();
const [state, update, reset] = useListQueryState();
const { data, isLoading, error, refetch } = useListData(
  'compliance',
  state,
  (query) => services.compliance.list(query),
);
```

- `useListData` keeps the react-query key convention `[scope, 'list', query]`.
- Mutations must use `useAppMutation` from `@/lib/hooks/use-app-mutation` and
  declare the query keys they invalidate.
- Never mutate a record and then show a success toast before the promise
  resolves — `useAppMutation` already guarantees this.

Sorting: `DataTable` calls `onSortingChange` with a TanStack `SortingState`.
Translate it into `state.sortBy` / `state.sortDir`.

---

## 5. Forms

```tsx
const form = useZodForm({ schema: complianceSchema, defaultValues: { … } });

<FormProvider form={form}>
  <form onSubmit={form.handleSubmit(onSubmit)}>
    <FormErrorSummary form={form} />
    <TextInput name="title" label="Title" required />
    <SelectInput name="category" label="Category" options={CATEGORY_OPTIONS} />
    <CheckboxGroupInput name="applicableMineIds" label="Applicable mines" options={mineOptions} />
    <Button type="submit" loading={form.formState.isSubmitting}>Save</Button>
  </form>
</FormProvider>
```

- Schemas live in `src/lib/validation/schemas.ts`. Add the schema there, not in
  the page.
- Every field has a visible label and an `aria-invalid` state.
- The error summary is a live region so screen readers announce failures.
- Server-side field errors (`ValidationError.details`) are surfaced next to the
  field, not only in a toast.

---

## 6. Permissions

```tsx
const { can } = useAuth();

{can('compliance.create') && <Button …>New requirement</Button>}

<RequirePermission permission="compliance.verify">
  <VerifyButton />
</RequirePermission>
```

Use `permissionDeniedReason` from `@/lib/auth/permissions` when a control must
be shown but disabled.

---

## 7. Maps and geolocation

- `GeoMap` from `@/components/maps/geo-map` renders Mapbox GL when
  `NEXT_PUBLIC_MAPBOX_TOKEN` is configured and an explicit table fallback
  otherwise. It never fakes a map.
- `LocationCapture` from `@/components/maps/location-capture` handles denied,
  timeout and unavailable outcomes explicitly and always records the coordinate
  provenance (`device_gps` / `manual_entry`).

---

## 8. Exports

`ExportButton` uses `toCsv` from `@/lib/export/csv`, which quotes correctly and
prefixes spreadsheet formula triggers (`= + - @`) with an apostrophe.

---

## 9. Accessibility

- Every icon-only control has an `aria-label`.
- Tables use `<caption className="sr-only">`.
- Status is text + glyph, never colour alone.
- Forms associate labels with inputs via `id`/`htmlFor`.
- Dialogs use `DialogTitle` and `DialogDescription`.

---

## 10. Style

- Tailwind utility classes only; no new CSS files.
- The design tokens live in `tailwind.config.ts` (forest / graphite palettes).
- Glassmorphism is restricted to the nav, floating and overlay surfaces
  (`glass-surface` class) — not to cards or data regions.
- Prefer `text-sm` for body copy and `text-xs` for metadata.
