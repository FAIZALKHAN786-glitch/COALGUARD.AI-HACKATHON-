# CoalGuard.AI — Backend API Contract

This document is the contract implemented by the production HTTP adapter in
[`src/services/http/index.ts`](../src/services/http/index.ts). The frontend has
**no knowledge of the transport**; it consumes the interfaces in
[`src/services/types.ts`](../src/services/types.ts).

> **Status.** No CoalGuard backend is deployed. This document describes the API
> the frontend is written against so that a backend can be implemented against
> it without changing the UI. Until a real backend is connected, the
> application runs on the clearly-labelled development adapter
> (`NEXT_PUBLIC_DATA_SOURCE=development`).

---

## 1. Conventions

### Base URL and authentication

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_API_BASE_URL` | Base URL for every request, e.g. `https://api.coalguard.example/v1`. |
| `NEXT_PUBLIC_AUTH_MODE` | `development` (default) or `oidc`. |

When `NEXT_PUBLIC_DATA_SOURCE=api`, the base URL **must** be set; otherwise the
application raises a `configuration_error` and refuses to start rather than
silently falling back to demonstration data.

Authenticated requests carry `Authorization: Bearer <token>`. The token is
supplied by `createHttpServices({ baseUrl, getToken })`; the adapter never
stores credentials itself.

### Envelope

Successful single-record responses return the record object directly.

Successful list responses return:

```json
{
  "items": [ { "id": "…" } ],
  "meta": {
    "source": "live",
    "generatedAt": "2026-01-31T09:15:00.000Z",
    "total": 128,
    "page": 1,
    "pageSize": 20
  }
}
```

`meta.source` is one of `live`, `cached`, `stale`, `development`. The UI labels
the value; it never hides it.

### Errors

Failures return a non-2xx status with:

```json
{
  "status": 422,
  "code": "validation_error",
  "message": "The submitted data is invalid.",
  "details": { "dueDate": ["A due date is required."] },
  "requestId": "req_01H…"
}
```

`message` must be safe to display to an end user. `details` maps a field name to
a list of messages.

### Query parameters (list endpoints)

| Parameter | Type | Notes |
| --- | --- | --- |
| `page` | integer | 1-based. |
| `pageSize` | integer | 1–200, default 20. |
| `search` | string | Free-text match on the resource's searchable fields. |
| `sortBy` | string | Field name; must be whitelisted server-side. |
| `sortDir` | `asc` \| `desc` | Required when `sortBy` is present. |
| filters | string | Any resource-specific filter, e.g. `status=overdue`, `mineId=…`. Repeating a key means "any of". |

### Permissions

Every endpoint enforces the permissions declared in
[`src/lib/auth/permissions.ts`](../src/lib/auth/permissions.ts) **server-side**.
The frontend permission checks only decide what to render. A backend that
accepts a write the caller's role forbids is a defect.

Regulatory observers (`regulatory_user`) are read-only everywhere.

### Idempotency

`POST` requests that create a record accept an `Idempotency-Key` header. The
HTTP client generates one per mutating call so that a retry cannot create a
duplicate record.

### Timeouts and cancellation

The client applies a 30-second default timeout and forwards the abort signal
from react-query. `408` maps to `TimeoutError`, `0` to `NetworkError`.

---

## 2. Endpoints

### Authentication

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/auth/session` | Current session, or `401` when signed out. |
| `POST` | `/auth/sign-in` | `{ email, password }` → `Session`. |
| `POST` | `/auth/sign-out` | Ends the session. |
| `GET` | `/auth/identities` | Identities available in the current auth mode. Only populated in development mode. |

### Organisation

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/mines` | List mines. Supports `subsidiaryId`, `region`, `operationalStatus`. |
| `POST` | `/mines` | Create a mine. |
| `GET` | `/mines/{id}` | Fetch one mine. |
| `PATCH` | `/mines/{id}` | Update a mine. |
| `POST` | `/mines/{id}/archive` | `{ reason }` → decommissioned mine. |
| `GET` | `/subsidiaries` | All subsidiaries. |
| `GET` | `/users` | List users. Supports `role`, `mineId`. |

### Compliance

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/compliance` | List requirements. Supports `status`, `category`, `mineId`. |
| `POST` | `/compliance` | Create a requirement. |
| `GET` | `/compliance/{id}` | Fetch one requirement. |
| `PATCH` | `/compliance/{id}` | Update a requirement. |
| `POST` | `/compliance/{id}/transition` | `{ to, comment }` — validated against the workflow map. |
| `POST` | `/compliance/{id}/evidence` | `{ documentId }` — attaches evidence. |
| `GET` | `/compliance/calendar` | Requirements ordered by due date. |

### Inspections

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/inspections` | List inspections. Supports `status`, `type`, `mineId`. |
| `POST` | `/inspections` | Schedule an inspection. |
| `GET` | `/inspections/{id}` | Fetch one inspection. |
| `PATCH` | `/inspections/{id}` | Update an inspection. |
| `POST` | `/inspections/{id}/findings` | Add a finding. A finding with `isViolation: true` creates a violation. |
| `POST` | `/inspections/{id}/transition` | `{ to, comment }`. |
| `POST` | `/inspections/{id}/assign` | `{ inspectorId }`. |

### Safety

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/safety/observations` | List safety records. Supports `type`, `status`, `severity`, `mineId`. |
| `POST` | `/safety/observations` | Create an observation, hazard or near miss. |
| `GET` | `/safety/observations/{id}` | Fetch one safety record. |
| `PATCH` | `/safety/observations/{id}` | Update a safety record. |
| `POST` | `/safety/observations/{id}/transition` | `{ to, comment }`. |
| `GET` | `/safety/incidents` | List incidents. |
| `POST` | `/safety/incidents` | Create an incident. |
| `GET` | `/safety/incidents/{id}` | Fetch one incident. |
| `GET` | `/safety/near-misses` | List near misses. |

### Environment

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/environment/measurements` | List measurements. Supports `indicator`, `status`, `mineId`. |
| `POST` | `/environment/measurements` | Record a measurement; the server evaluates it against the configured threshold. |
| `GET` | `/environment/measurements/{id}` | Fetch one measurement. |
| `GET` | `/environment/thresholds` | The configured threshold register, including its provenance. |
| `GET` | `/environment/indicators` | Indicators that have a configured threshold. |

### Production

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/production/records` | List production records. Supports `mineId`, `dateFrom`, `dateTo`, `shift`. |
| `POST` | `/production/records` | Create a record. |
| `GET` | `/production/records/{id}` | Fetch one record. |
| `POST` | `/production/records/{id}/approve` | Marks a record as approved. |
| `GET` | `/production/anomalies` | Detected anomalies. |
| `GET` | `/production/completeness` | Reporting-grid completeness per mine. |

### Contractors

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/contractors` | List contractors. Supports `type`, `complianceStatus`, `mineId`. |
| `POST` | `/contractors` | Register a contractor. |
| `GET` | `/contractors/{id}` | Fetch one contractor. |
| `PATCH` | `/contractors/{id}` | Update a contractor. |
| `POST` | `/contractors/{id}/archive` | `{ reason }`. |
| `GET` | `/contracts` | List contracts. Supports `contractorId`, `mineId`, `status`. |

### Workforce

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/workforce/attendance` | List attendance records. Supports `mineId`, `date`, `shift`, `status`. |
| `POST` | `/workforce/attendance/{id}/corrections` | `{ correctedStatus, reason }` — creates a pending correction. |
| `POST` | `/workforce/attendance/{id}/corrections/{correctionId}/decision` | `{ approve, reason }`. |

Attendance records expose a pseudonymous `workerRef`; personal identifiers are
not part of the contract.

### Corrective actions

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/corrective-actions` | List actions. Supports `status`, `priority`, `mineId`, `sourceType`. |
| `POST` | `/corrective-actions` | Create an action. |
| `GET` | `/corrective-actions/{id}` | Fetch one action. |
| `PATCH` | `/corrective-actions/{id}` | Update an action. |
| `POST` | `/corrective-actions/{id}/transition` | `{ to, comment }`. |
| `POST` | `/corrective-actions/{id}/evidence` | `{ documentId }`. |

### Documents

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/documents` | List documents. Supports `type`, `status`, `mineId`. |
| `POST` | `/documents` | `{ name, mimeType, sizeBytes, type, mineId, content }`. |
| `GET` | `/documents/{id}` | Fetch one document, including extracted fields. |
| `PATCH` | `/documents/{id}` | `{ status }`. |
| `POST` | `/documents/{id}/ocr/retry` | Re-queue extraction. |
| `POST` | `/documents/{id}/fields/{fieldId}` | `{ value }` — confirm or amend an extracted field. |
| `POST` | `/documents/{id}/compliance` | `{ complianceId }` — link the document as evidence. |

`ocrEngine`, `ocrConfidence` and `ledgerProof` are only populated by a real
service. The platform never fabricates a proof of authenticity.

### Analytics

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/analytics/insights` | List insights. Supports `riskLevel`, `category`, `mineId`, `reviewStatus`. |
| `GET` | `/analytics/insights/{id}` | Fetch one insight, including evidence and limitations. |
| `POST` | `/analytics/insights/{id}/review` | `{ status, note }`. |
| `GET` | `/analytics/risk-distribution` | Risk level counts and per-mine scores. |

Every insight carries `isPrediction: true`. Insights are never presented as
confirmed violations.

### Notifications and workflows

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/notifications` | List notifications. Supports `read`, `severity`, `type`. |
| `PATCH` | `/notifications/{id}` | `{ read }`. |
| `POST` | `/notifications/read-all` | Marks every notification as read. |
| `GET` | `/notifications/unread-count` | Integer count. |
| `GET` | `/workflows/rules` | Escalation workflow rules. |
| `PATCH` | `/workflows/rules/{id}` | Update a rule (`enabled`, `stages`). |

### Reporting

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/reports/catalogue` | Available report definitions and their columns. |
| `GET` | `/reports` | List report jobs. |
| `POST` | `/reports` | `{ category, title, mineIds, subsidiaryIds, dateFrom, dateTo, statusFilters, format, groupBy }`. |
| `GET` | `/reports/{id}` | Poll a job. `status` is `queued`, `processing`, `ready` or `failed`. |
| `GET` | `/reports/{id}/content.csv` | The generated CSV (also used for `pdf`/`xlsx` jobs once rendered). |

A report job with `status: "failed"` must include `error`.

### Audit

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/audit` | List audit events. Supports `entityType`, `entityId`, `actorId`, `action`. |
| `GET` | `/audit/ledger-status` | `true` **only** when a real blockchain ledger is connected. |

`AuditEvent.source` is `platform_log` for ordinary audit rows and
`blockchain_ledger` only when a real ledger supplied the proof.

### Dashboard and search

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/dashboard/summary` | `DashboardSummary` for the supplied filters. |
| `GET` | `/dashboard/trends/compliance` | `TrendPoint[]`. |
| `GET` | `/dashboard/trends/production` | `TrendPoint[]`. |
| `GET` | `/dashboard/mine-comparison` | `MineComparison[]`. |
| `GET` | `/dashboard/risk-distribution` | `RiskDistribution`. |
| `GET` | `/search` | `q` and optional `types` → `SearchResults`. |

### Administration

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/admin/users` | List users. |
| `PATCH` | `/admin/users/{id}/role` | `{ role }`. |
| `POST` | `/admin/users/{id}/deactivate` | Deactivates a user. |
| `GET` | `/admin/reference-data` | Reference lists used to populate pickers. |
| `GET` | `/admin/integrations` | Integration status. `verified` is `true` only for a real probe. |

---

## 3. What the UI will never do

* Invent a statutory deadline, a legal threshold or a reference value. Values
  come from the API (see `/environment/thresholds` and
  `/admin/reference-data`).
* Present a model prediction as a confirmed violation.
* Present an audit row as blockchain-verified without a ledger proof.
* Report a successful write when the request failed.
