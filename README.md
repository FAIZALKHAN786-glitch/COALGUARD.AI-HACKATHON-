# CoalGuard.AI - frontend

An AI-enabled governance, statutory compliance and inspection-monitoring interface for
Indian coal mines. This repository contains the **frontend only**. It runs against a
deterministic in-browser development adapter; no production backend, identity provider,
OCR engine or mapping token ships with it.

> **Honesty first.** Every screen that uses demonstration data says so. The interface
> never claims a production integration, a successful extraction it did not perform, or
> a statutory threshold it cannot source.

## What is implemented

- 32 page routes covering dashboard, mine register, compliance, inspections, corrective
  actions, safety and incidents, environment, production, contractors, workforce,
  documents/OCR, analytics, GIS map, reports, notifications, audit trail, assistant,
  administration and profile.
- Role-based navigation, route guards and action-level permission gates for 10 roles.
- Server-state management with TanStack Query, sortable/filterable/paginated tables with
  mobile card fallbacks, charts, forms with Zod validation, CSV export and audit events.
- A retrieval-based assistant that cites the stored records it used and states its limits.
- Typed service boundary with two adapters:
  - `src/services/dev` - deterministic seeded adapter (default, used by the demo and tests).
  - `src/services/http` - REST adapter implementing the documented backend contract.

## Quick start

Requirements: Node.js 20+ and npm.

```bash
npm ci
cp .env.example .env.local   # optional; defaults already use the development adapter
npm run dev                  # http://localhost:3000
```

Pick any demonstration identity on the sign-in screen. All addresses use the reserved
`.invalid` domain, so they cannot resolve or receive mail.

## Demonstration identities

| Name | Email | Role |
| --- | --- | --- |
| Anita Deshmukh | anita.deshmukh@example.invalid | Compliance Officer |
| Ravinder Singh | ravinder.singh@example.invalid | Mine Manager, Rajmahal |
| Meera Nair | meera.nair@example.invalid | Safety Officer, Sone Valley |
| Suresh Kumar | suresh.kumar@example.invalid | Field Inspector |
| Priya Iyer | priya.iyer@example.invalid | Environmental Officer |
| Deepak Mishra | deepak.mishra@example.invalid | Contractor Manager |
| Nandini Rao | nandini.rao@example.invalid | Corporate Management |
| Vikram Chatterjee | vikram.chatterjee@example.invalid | Regulatory Observer |
| Aarti Bhosale | aarti.bhosale@example.invalid | Mine Administrator, Wani |
| Rohit Saxena | rohit.saxena@example.invalid | System Administrator |
| Kavita Reddy | kavita.reddy@example.invalid | Mine Manager, Sone Valley |
| Imran Sheikh | imran.sheikh@example.invalid | Safety Officer, Khanpur |

These identities are a **development convenience, not a security control**.

## Scripts

| Command | Purpose |
| --- | --- |
| `npm run dev` | Development server on port 3000 |
| `npm run build` | Production build |
| `npm start` | Serve the production build |
| `npm run lint` | Next.js ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest unit and component tests (single run) |
| `npm run test:watch` | Vitest in watch mode |
| `npm run test:e2e` | Playwright against a production build on port 3100 |
| `npm run test:a11y` | Axe accessibility suite |
| `npm run validate` | Lint + typecheck + unit/component tests |

End-to-end tests need a fresh production build and must not share port 3100:

```bash
npx playwright install chromium
npm run build
npm run test:e2e
```

The Playwright configuration refuses to reuse an existing server so a stale build cannot
silently satisfy the suite.

## Architecture at a glance

- **Presentation**: Next.js 14 App Router, TypeScript strict, Tailwind, local shadcn/ui
  primitives, Lucide icons. Glassmorphism is limited to navigation, overlays and floating
  surfaces.
- **Data**: typed services in `src/services/types.ts`. `getServices()` selects exactly one
  adapter from `NEXT_PUBLIC_DATA_SOURCE`; it never falls back after a failed request.
- **State**: TanStack Query for server state and URL query parameters for shareable list
  state; React Hook Form + Zod for forms.
- **Domain rules**: permissions, workflow digests, metric definitions and presentation
  labels live in `src/lib`, not in components.
- **Accessibility**: single `main` landmark and `h1` per screen, skip link, status conveyed
  by text and marker as well as colour, 4.5:1 text contrast, table fallbacks for charts and
  maps, and keyboard-operable dialogs and menus.

Supporting documents:

- `docs/API_CONTRACT.md` - REST contract expected from a backend.
- `docs/FRONTEND_GUIDE.md` - conventions, architecture and data-flow notes.
- `docs/PAGE_RECIPE.md` - mandatory recipe for adding a feature screen.
- `docs/FINAL_REPORT.md` - delivery report, test evidence, defects and remaining limits.

## Integration status (honest)

| Capability | Status in this repository |
| --- | --- |
| Application backend | Not connected. Development adapter only; HTTP adapter is unexercised. |
| Identity provider | Demonstration identities. No tokens are verified server-side. |
| Map basemap | Mapbox token absent by default; an accessible table fallback is shown. |
| Document OCR | Deterministic simulation. No file bytes are stored or parsed. |
| Audit ledger | Not connected. The UI does not claim tamper-evidence. |
| Notifications | Generated demonstration records; no email or SMS delivery. |
| AI assistant | Keyword/retrieval over seeded records, not a generative model. |
| Report formats | PDF/XLSX selections produce a CSV payload; the UI discloses this. |

## Known limitations

See `docs/FINAL_REPORT.md` for the complete list. The most important:

- Permission checks in the browser are a usability aid. A backend must enforce every rule.
- `next@14.2.33` has a published security advisory; upgrade to a patched 14.x release.
- Automated browser coverage is Chromium-only and smoke-level for performance.
- Nothing in this directory is committed to version control (it is not a git repository).
