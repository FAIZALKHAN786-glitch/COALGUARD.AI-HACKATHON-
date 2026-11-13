# CoalGuard.AI Security Report (Access Control Hardening)

**Date:** 2026-10-24  
**Scope:** Backend API, authz model, frontend integration notes, tests, and identified gaps  

## Summary
Implemented a centralized, deny-by-default access control model across the CoalGuard.AI API. Authentication remains token-based (development adapter). Authorization is enforced server-side for protected endpoints with RBAC + resource/scope checks, separation of duties, admin guardrails, and audit logging of denied attempts. All backend security/integration tests pass (40/40). Typechecks clean.

## Role-Permission Matrix (Backend)
Roles defined in `backend/src/auth.ts` with permissions `P[role]`. Key roles present:

| Role | Scope Model | Key Permissions (high level) |
|---|---|---|
| `mine_admin` | Mine-scoped (needs explicit scopes; denied if none) | mine.view/edit, compliance/inspection/safety/env/production/contractor/workforce/corrective actions (full mine ops), reports, analytics, assistant |
| `mine_manager` | Mine-scoped | mine.view, compliance edit/submit/verify context, inspections create/edit/submit/review, safety investigate/close, production approve, workforce approve, corrective actions verify/complete, reports |
| `safety_officer` | Mine-scoped | safety full, inspections create/edit/submit, corrective actions create/edit/complete, reports limited |
| `environmental_officer` | Org-wide capable (restricted if scopes assigned) | env full/export, compliance/inspection/safety/production view/create/edit, reports |
| `compliance_officer` | Org-wide capable | compliance create/edit/submit/verify/export, inspections review, audit.view, reports generate/download |
| `field_inspector` | Mine-scoped | inspections full lifecycle, safety create, findings/corrective actions create, maps/reports |
| `contractor_manager` | Org-wide capable | contractor full, workforce edit/approve, compliance/inspection/safety/env/production view, reports |
| `corporate_management` | Org-wide capable (restricted if scopes assigned) | cross-mine view/export, analytics review/dismiss/escalate, audit.view/export, reports generate/download |
| `regulatory_user` | Org-wide capable (restricted if scopes assigned) | read-heavy + exports/audit, no create/approve/admin by default |
| `system_admin` | Org-wide capable (restricted if scopes assigned) | full admin.*, platform config/workflows/integrations, all modules; still subject to scope checks for business data unless assigned scopes (see policy) |

Policy notes (`backend/src/policy.ts`, `backend/src/auth.ts`):
- **Deny by default**: Mine-scoped roles with no assigned mines/subsidiaries are denied access (`addScope` returns `FALSE`, `canAccessMine` returns `false`).
- **Org-wide capable roles**: If no explicit scopes assigned → org-wide. If explicit scopes assigned → restricted to those scopes (even for org-wide capable roles).
- **Effective scopes**: Session load expands subsidiary scopes to mine IDs (`effective_mine_ids`) so access checks are uniform.
- **Session payload**: Now includes user permissions from server (`sessionPayload` adds `permissions`).

## Protected Endpoint Inventory (key areas)
Enforced via `auth(req)`, `context.require(permission)`, `addScope`, `canAccessMine`/row checks:

| Area | Endpoints | Enforcement |
|---|---|---|
| Auth | `/auth/sign-in`, `/auth/identities` (public in dev), `/auth/session`, `/auth/profile`, `/auth/sign-out` | Session validation, profile audit |
| Mines/Subsidiaries/Users | `/mines*`, `/subsidiaries`, `/users` | `mine.view/create/edit/archive`, `subsidiary.view`, `/users` requires `admin.users` + admin-only |
| Compliance | `/compliance*` | `compliance.view/create/edit/submit/verify`, mine/subsidiary scope, SoD on verify |
| Inspections | `/inspections*` | `inspection.view/create/edit/submit/review`, scope checks, SoD (inspector cannot review own), assignee scope validation |
| Safety/Incidents/Near-misses | `/safety/*` | `safety.view/create/edit/investigate/close`, scope checks |
| Environment | `/environment/*` | `environment.view/create/edit/export` |
| Production | `/production/*` | `production.view/create/approve`, SoD on approve |
| Contractors/Contracts | `/contractors*`, `/contracts` | `contractor.view/create/edit/archive`, scope via mines |
| Workforce/Attendance | `/workforce/*` | `workforce.view/edit/approve`, SoD on correction decisions |
| Corrective Actions | `/corrective-actions*` | `corrective_action.view/create/edit/complete/verify`, SoD on verify |
| Documents | `/documents*` | `document.view/upload/review`, scope checks, link validation |
| Reports | `/reports*` | `report.view/generate/download`, scope validation on create/access |
| Analytics/AI | `/analytics/*`, `/assistant/query` | `analytics.view/review/dismiss/escalate`, `assistant.use` |
| Dashboard/Search | `/dashboard/*`, `/search` | `dashboard.view`, permission-gated search results |
| Admin | `/admin/users*`, `/admin/users/:id/scopes`, `/admin/reference-data`, `/admin/integrations`, `/admin/audit/verify` | `admin.users/admin.access/admin.integrations`, system-admin only for role/scope changes, self-modification blocked, last-admin protected |

## Isolation & Escalation Tests (evidence)
Automated tests in `backend/test/security.test.ts` and `backend/test/integration.test.ts`:

**Cross-mine/org isolation:**
- Mine manager sees only assigned mines (3/12), cannot GET other mine (403). ✓
- Compliance list filtered by scope; cross-scope compliance GET returns 403. ✓
- Reports cannot be created for cross-scope mines (403); CSV content filtered. ✓
- Subsidiaries scoped to assigned mines/subsidiaries. ✓
- Dashboard scoped correctly. ✓

**Privilege escalation:**
- Non-admin cannot change roles (403). ✓
- Only system admin can change roles/scopes; cannot remove own admin role (409); cannot deactivate self (409); cannot modify own scopes (403). ✓
- Cannot remove/deactivate last system admin (409). ✓
- Field inspector cannot create mine (403). ✓
- Regulatory user cannot create safety observation (403). ✓

**Separation of duties:**
- Inspector cannot review/complete own inspection (403). ✓
- Cannot approve own production record (403). ✓
- Cannot approve own attendance correction (403). ✓
- Cannot verify own compliance submission (403). ✓
- Cannot verify own corrective action (403). ✓

**Auth/session:**
- Anonymous → 401 with contract shape. ✓
- Revoked session rejected (401). ✓
- `/users` requires `admin.users` (403 for non-admin). ✓
- Idempotency enforced; conflicts rejected. ✓

**Audit/denials:**
- Authorization denials logged as `authorization_denied` (error handler). ✓
- Audit chain verification works; audit append-only enforced. ✓

All 40 tests pass.

## Security Improvements Made
- **Centralized scoping** in `auth.ts` with effective mine resolution and deny-by-default
- **Permission checks** added to detail endpoints and search
- **SoD enforcement** across inspections, compliance, production, workforce corrections, corrective actions
- **Admin hardening** with self-modification prevention and last-admin protection
- **Report scoping** on create/list/access
- **Assignee validation** (inspector must be in scope)
- **Audit logging** for authorization failures
- **Session payload includes permissions** (server as source of truth)

## Remaining Gaps & Recommendations
| Gap | Severity | Recommendation |
|---|---|---|
| RLS not implemented (documented) | Medium | Add RLS policies for sensitive tables with app role; current app-layer enforcement is in place. |
| Grievances module missing | Medium | If required, implement with strict confidentiality rules and separate permissions. |
| MFA not enforced | Medium | Add MFA for privileged roles (system_admin, corporate/regulatory) in production. |
| Token storage | Medium | Consider httpOnly secure cookies for web; current Bearer tokens are fine for API but need secure transport in prod. |
| Production identity provider | High | Replace dev adapter; enforce `AUTH_MODE=oidc` in prod with `assertProductionSafety`. |
| Rate limiting | Low | Current rate limits exist; consider per-endpoint/per-user limits for sensitive ops. |
| Scope for some global lists | Low | Some reference data is global by design; ensure no PII leakage. |

## Files Modified/Added
**Backend:**
- `src/auth.ts` - scoping model, effective mines, org-wide logic, permissions in session
- `src/policy.ts` (new) - policy helpers
- `src/app.ts` - authz denial logging
- `src/audit.ts` - added `authorization_denied`
- `src/routes/auth.ts` - use full user from row
- `src/routes/core.ts` - users/subsidiaries hardening, permission checks, SoD, assignee validation
- `src/routes/operations.ts` - permission checks, SoD, scope enforcement
- `src/routes/governance.ts` - report scoping, permission-gated search, admin hardening, scope management endpoint
- `migrations/005_access_control_hardening.sql` (new) - audit action constraint, indexes
- `test/security.test.ts` (new) - comprehensive security tests

## Verification
```bash
cd backend
npx tsc -p tsconfig.json --noEmit  # clean
npx vitest run test/security.test.ts test/integration.test.ts  # 40/40 passed
```

**Conclusion:** Access control is enforced server-side with defense in depth. Frontend restrictions are not relied upon for security. Tests demonstrate isolation, privilege escalation prevention, and SoD enforcement.
