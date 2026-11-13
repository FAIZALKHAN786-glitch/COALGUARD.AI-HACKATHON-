# CoalGuard.AI frontend - delivery report

**Date:** 22 October 2026
**Scope:** frontend implementation and verification in `C:\faizal\hackathon`
**Verdict:** the frontend meets the agreed functional and quality gates **against its
deterministic development adapter**. It is not a production-integrated system, and this
report does not claim that it is.

---

## 1. What was delivered

A complete Next.js 14 App Router frontend (TypeScript strict, Tailwind, local shadcn/ui
primitives, TanStack Query/Table, ECharts, Mapbox GL JS, React Hook Form + Zod) with:

| Area | Routes / capability |
| --- | --- |
| Entry and identity | `/`, `/login`, `/access-denied`; 12 demonstration identities across 10 roles; safe post-login redirects |
| Governance overview | `/dashboard` with computed KPIs, definitions, trends and risk summaries |
| Mine register | `/mines`, `/mines/[id]`; create, duplicate-code rejection, archive with reason, location capture |
| Statutory compliance | `/compliance`, `/compliance/[id]`; filters, deadline states, evidence links, guarded workflow transitions |
| Inspections | `/inspections`, `/inspections/[id]`; scheduling state, observations and findings |
| Corrective actions | `/corrective-actions`, `/corrective-actions/[id]`; assignment, progress and verification states |
| Safety | `/safety`, `/safety/[id]`, `/safety/incidents`, `/safety/incidents/[id]`; incident and near-miss registers |
| Environment and production | `/environment`, `/production`; readings against configured limits, trends and anomaly views |
| Contractors and workforce | `/contractors`, `/contractors/[id]`, `/workforce`; compliance documents, expiries, attendance |
| Documents | `/documents`, `/documents/[id]`; metadata, simulated OCR results, review states |
| Analytics | `/analytics`, `/analytics/[id]`; explainable indicators, not predictions presented as fact |
| GIS | `/map`; accessible markers plus a full table fallback when no token is present |
| Reporting | `/reports`; generation, catalogue, CSV download, export audit event |
| Notifications | `/notifications`; unread counts and mark-as-read |
| Audit trail | `/audit`; actor, action, entity and time, with explicit ledger limitation |
| Assistant | `/assistant`; retrieval-based answers with citations, no-match honesty and a legal-question hedge |
| Administration | `/admin`; users, workflow rules and integration status |
| Profile | `/profile`; name/title update persisted through the adapter |

Cross-cutting: persistent navigation with permission filtering, route guards, permission
gates on actions, global search, breadcrumbs, data-source and identity-mode notices,
responsive card fallbacks for tables, empty/loading/error states, and keyboard support.

## 2. Architecture and provenance

- `src/services/types.ts` is the authoritative service contract.
- `src/services/dev` is a deterministic, seeded, `localStorage`-backed adapter
  (`coalguard.devdb.v1`). It is the default and the only adapter exercised end to end.
- `src/services/http` implements the REST contract in `docs/API_CONTRACT.md`; it is written
  and type-checked but **not exercised against a server**.
- The adapter is selected once by `NEXT_PUBLIC_DATA_SOURCE`. There is no silent fallback to
  development data after a failed request.
- Permissions (`src/lib/auth/permissions.ts`), workflows (`src/lib/auth/workflows.ts`),
  metrics (`src/lib/metrics/dashboard.ts`) and presentation labels
  (`src/lib/domain/reference.ts`) are centralised and unit-tested.
- Every demonstration surface is labelled. The header shows "Demonstration dataset", and
  the banner states that development identities are not production credentials.
- There are no statutory deadlines or thresholds asserted as legal fact. Limit statuses are
  derived only from configured values and say "No configured limit" otherwise.

## 3. Integration status

| Capability | Status | What the user sees |
| --- | --- | --- |
| Application backend | **Not connected** | Demonstration data; HTTP adapter unused |
| Identity provider | **Demonstration only** | Local identity picker; explicit non-production warning |
| PostgreSQL / PostGIS | **Not connected** | Seeded records; coordinates come from seed data |
| Mapbox | **Unavailable without token** | Warned table fallback; no fake map |
| Document storage / OCR | **Simulated** | Deterministic extraction text; no file bytes stored |
| Audit ledger | **Not connected** | `ledgerConnected: false`; UI does not claim tamper-evidence |
| Email / SMS | **Not connected** | In-app notifications only |
| AI model | **Not connected** | Keyword retrieval over stored records, always labelled retrieval-based |
| PDF / XLSX generation | **Not implemented** | Selection produces CSV; the UI states this before download |

`admin.integrationStatus()` reports dev-adapter `healthy`, OCR `degraded`, and Mapbox and
ledger `unavailable`. These are honest states, not decoration.

## 4. Acceptance gates

Gates were defined for this delivery and assessed by execution, not inspection alone.

### Gate A - Functional completeness and control integrity: **PASS**

- All 32 page routes render with a single `h1` and a `main` landmark.
- Every primary action is wired to a real service call, validation or navigation. There are
  no placeholder links, dead buttons or success toasts without a completed mutation.
- End-to-end evidence covers mine creation through the real form and its appearance in the
  register, empty-form field errors, a permitted compliance transition with audit
  invalidation, report generation with a downloaded CSV payload, assistant citation,
  assistant no-match, assistant legal refusal, and empty-question validation.
- Remaining workflow transitions are enforced at the adapter level and covered by unit tests;
  they are not all exercised through the browser. This is stated as a coverage limit, not a
  functional gap.

### Gate B - Type, lint and build integrity: **PASS**

- `npm run lint`: "No ESLint warnings or errors".
- `npx tsc --noEmit`: no diagnostics.
- `npm run build`: success. 32 page routes plus the generated not-found route.
- First Load JS: 87.7 kB for `/`, 87.5 kB shared, up to 460 kB on chart-heavy routes
  (`/environment`, `/production`). Those budgets are documented, not hidden.

### Gate C - Automated testing: **PASS**

| Suite | Result |
| --- | --- |
| Vitest unit tests (6 files) | 102 passed |
| Vitest component tests (4 files) | 18 passed |
| **Vitest total (10 files)** | **120 passed** |
| Playwright e2e (8 files) | **68 passed** in 1.8 minutes |
| Axe serious/critical violations (9 checks) | **0** |

Unit coverage includes CSV escaping and injection prefixing, permissions, workflow legality,
query parsing/serialisation, schema behaviour and 24 development-adapter scenarios.
Component coverage includes status badges, data tables, permission gates and form primitives.
End-to-end coverage includes authentication, 20-route navigation, role denial, workflows,
security, accessibility, responsive layouts and performance smoke checks.

Limits: no line/branch coverage threshold is configured; browser coverage is Chromium only;
performance checks are smoke budgets, not Lighthouse or load tests.

### Gate D - Accessibility: **PASS (representative set)**

- Axe checks on login, dashboard, compliance, reports, assistant, map, admin, profile and a
  keyboard-only flow report zero serious or critical violations.
- Each audited page has one `main` landmark and one `h1`; the skip link moves focus to
  `#main-content`.
- Status uses text and a marker in addition to colour. Mobile card views keep the same
  information as tables.
- A full WCAG 2.2 AA audit of all 32 routes and a screen-reader review were **not** performed.

### Gate E - Security and honesty: **PASS within frontend scope**

- Static scan found no literal `href="#"`, no raw HTML injection sink and no dynamic code
  execution (`eval` / `new Function`).
- Protected content is not rendered before authentication; denied direct detail URLs inherit
  list-route permissions.
- Hostile assistant and search inputs render as literal text.
- The signed-in identity does not leak onto the login page.
- Post-login `next` values are restricted to same-origin paths; protocol-relative and
  off-site redirects are ignored (covered by tests).
- CSV values are quoted, and cells beginning with formula characters are prefixed to prevent
  spreadsheet injection.
- **Important:** browser permission checks are a usability aid. The backend must enforce
  authorisation independently. Development identities are not authentication.

### Gate F - Responsiveness and performance: **PASS (smoke level)**

- 390x844 and 768x1024 checks show no horizontal document overflow, working mobile drawer
  navigation, card fallbacks on phones and table views from the medium breakpoint.
- Dashboard reaches an interactive state within the configured budget and logs no console
  errors; the five heaviest list screens render without application console errors.
- Script payload for the dashboard is within the documented budget.
- Not covered: Firefox/Safari, low-end Android devices, slow 3G emulation, long-run memory
  behaviour or sustained load.

## 5. Defects found and fixed

All of the following were found by executing tests or exploratory scripts, not by assuming
the code was correct.

| # | Severity | Defect | Fix and evidence |
| --- | --- | --- | --- |
| 1 | High (data entry) | Clearing an optional numeric field produced `NaN` from React Hook Form's `valueAsNumber`. A blank "Approved capacity" was rejected as "must be a number", blocking mine creation. Unit tests had missed it because they passed `''`, not `NaN`. | `blankToUndefined` now treats `NaN` as "not supplied". Required numeric fields still report a missing-reading error. Added three regression tests (mine capacity, measurement value, production tonnage). Mine creation e2e now passes. |
| 2 | Medium (accessibility) | Warning badges rendered at 3.27:1 and the login footer at 3.55:1, below 4.5:1 for normal text. All audited pages failed axe `color-contrast`. | Added a `warning-strong` token (light 30 92% 28%, dark 34 88% 64%) for text on tinted surfaces, and moved the login footer to `graphite-400` (5.25:1). Axe now reports zero serious/critical violations. |
| 3 | Medium (assistant correctness) | Retrieval used substring matching, so two-letter tokens such as "am" matched unrelated records and produced misleading citations. | Matching now normalises underscores and uses whole-word boundaries. Covered by adapter tests for grounded, no-match and scope cases. |
| 4 | Medium (advice risk) | A legal question could return an unhedged retrieval answer, implying the assistant interpreted law. | Legal questions always carry the prefix "This assistant cannot interpret legislation or decide liability" and the limitation "This is not legal advice." Covered by unit and e2e tests. |
| 5 | Low (export quality) | `safeFileName` left mixed separators and trailing punctuation (`report-_q3-2026_-final-`). | Unsafe runs collapse to a single hyphen, leading/trailing separators are trimmed, length is capped, and an empty result falls back to `export`. Unit tests pin the behaviour. |
| 6 | Medium (security) | The login `next` parameter accepted absolute/protocol-relative URLs, enabling an open redirect. | Only same-origin paths beginning with `/` and not `//` are honoured. Two e2e tests cover off-site and protocol-relative attempts. |

**Test-harness corrections (not product defects):** scoping duplicate alert nodes, using the
combobox role for global search, correcting the profile heading expectation, matching the
status-badge label around its decorative marker, asserting the page-specific empty state,
and excluding a test-induced aborted RSC prefetch from console-error collection. Each change
made the test describe the real behaviour more accurately.

## 6. Remaining limits and risks

1. **No backend.** All persistence is `localStorage` and can be cleared by the user. Data is
   per-browser. The HTTP adapter and the REST contract are unverified against a server.
2. **Authentication is not real.** Showing an identity selector and storing a session object
   is a demo affordance, not a security boundary.
3. **Authorisation is client-side only.** UI hiding and route guards must be duplicated in
   the backend for every endpoint.
4. **Map, OCR, ledger, messaging and AI are not integrated.** Their fallbacks and status
   labels are deliberate; the UI does not simulate success for them.
5. **Documents store metadata only.** There is no upload of file bytes, malware scanning,
   retention policy or signed URL flow.
6. **Report format selection is honest but limited.** PDF and XLSX choices produce CSV.
7. **Retrieval assistant is not generative.** It has no language understanding beyond token
   matching, no conversation memory, and no legal or engineering judgement.
8. **Dependency risk.** `next@14.2.33` has a published advisory; upgrade to a patched 14.x
   release and re-run the full suite.
9. **Coverage shape.** Chromium only; representative axe pages; adapter-level unit tests for
   transitions not driven through the UI; no visual regression, mutation or load testing.
10. **No repository or CI.** The directory is not a git repository, nothing is committed, and
    no pipeline enforces the gates automatically.

## 7. How to run and verify

```bash
npm ci
npx playwright install chromium

npm run dev        # http://localhost:3000, demonstration identities
npm run validate   # lint + tsc + 120 unit/component tests
npm run build      # production build, 32 page routes
npm run test:e2e   # 68 Playwright tests against the production build on port 3100
```

The e2e runner starts its own `next start` on port 3100 and refuses to reuse an existing
server, so a stale build cannot silently satisfy the suite. Stop anything already bound to
3100 before running it.

## 8. Recommended next steps

1. Implement the backend against `docs/API_CONTRACT.md`, including server-side authorisation,
   scope enforcement and append-only audit. Add contract tests that run the HTTP adapter.
2. Replace the demonstration identity picker with OIDC/OAuth, server sessions, CSRF
   protection and token rotation.
3. Add object storage and a real OCR pipeline with malware scanning, extraction confidence,
   human review and retention rules.
4. Scope a Mapbox token by URL, add a geocoding/PostGIS-backed map layer and verify the
   table fallback with real large datasets.
5. Connect the audit ledger and signed exports before making any tamper-evidence claim.
6. If a generative assistant is added, keep retrieval citations, add refusal policies, an
   evaluation set and prompt-injection testing. Never let it decide liability.
7. Upgrade Next.js to a patched release, add dependency and secret scanning, initialise git,
   and enforce `npm run validate`, build, e2e and axe in CI.
8. Expand verification: Firefox/WebKit, full-route axe, screen-reader scripts, visual
   regression, load tests and performance budgets on representative field devices.

---

### Summary

The frontend is complete for the agreed scope and is verifiably functional on its
demonstration data: **120 unit/component tests and 68 end-to-end tests pass**, the build is
clean, and representative accessibility checks report no serious or critical violations.
It is **not** a production compliance system until the backend, identity, OCR, mapping and
ledger integrations are implemented and independently authorised and tested.
