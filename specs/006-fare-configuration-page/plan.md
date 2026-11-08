# Implementation Plan: Fare Configuration Page

**Branch**: `feat/fares-page` (spec `006-fare-configuration-page`) | **Date**: 2026-08-06 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/006-fare-configuration-page/spec.md`

## Summary

Replace the placeholder `apps/admin/src/pages/Fares.tsx` with a working Fares section: a server-backed list of fare configurations (label, base fare, base distance, rate/km, student/senior discounts, default indicator, active status), a create/edit form (dialog), and a guarded deactivate flow (confirm dialog; delete disabled for the sole default or any configuration referenced by an active Route). The page consumes the existing `/api/admin/fare-configs` CRUD endpoints with two small server extensions, per the clarifications recorded in `spec.md`:

1. **Route-reference delete guard (server)**: `DELETE /api/admin/fare-configs/:fareConfigId` must reject (CONFLICT) when any **active** Route references the configuration; the list response gains `active_route_count` so the page can disable delete up front. Tests written FIRST (server TDD gate).
2. **Block default-on-inactive (client + server)**: marking an inactive configuration as default is rejected inline ("reactivate first"); the server also rejects an update that would leave the default inactive (FR-015 holds at the API boundary).
3. **Unique labels (client)**: the form rejects duplicate labels inline against the loaded list.

UI primitives are generated with the shadcn CLI on Base UI (already the admin's component system): `dialog`, `alert-dialog`, `switch`, `table` (researched — all available for React 18 in the `base-nova` registry). Pure validation/formatting helpers are unit-tested with the admin's existing Vitest setup; server behavior is integration-tested first per the repo's server TDD convention.

## Technical Context

**Language/Version**: TypeScript 5.5.4 (repo-pinned), strict via `@repo/typescript-config/vite.json` (admin) and the server's existing config. React 18.3 + Vite 5 (admin, repo convention per `docs/ADMIN.md` §3).

**Primary Dependencies**: Admin — existing: `@tanstack/react-query` 5 (queries/mutations), `axios` via `lib/api.ts` (envelope-aware client), `@base-ui/react` ^1.6.0 + shadcn-generated `components/ui/*` wrappers, `lucide-react`, `sonner`, `cva`/`clsx`/`tailwind-merge`, Tailwind CSS 4. NEW via shadcn CLI: `dialog`, `alert-dialog`, `switch`, `table` (researched in R2). Server — no new dependencies; reuses `drizzle-orm` against the existing `fare_configs` + `routes` tables and the `conflict()` helper from `src/api/errors.ts`.

**Storage**: PostgreSQL/PostGIS (existing). No migration required: the delete guard is a query-time check (`routes.fare_config_id = :id AND routes.is_active = true`), and `active_route_count` is computed by an aggregate LEFT JOIN on the list query.

**Testing**: Admin — Vitest unit tests for pure helpers (`features/fares/validation.ts`, `features/fares/format.ts`) in `apps/admin/src/tests/`. Server — integration tests written FIRST (TDD per AGENTS.md): route-reference delete guard + `active_route_count` in the list, appended to the existing fare-configs coverage in `apps/server/tests/integration/crud.test.ts` (or a new `fare-configs.test.ts` using `helpers.ts` + `buildApp`).

**Target Platform**: Modern evergreen desktop browsers (Chrome/Firefox/Edge/Safari, latest two majors). The admin is a desk tool.

**Project Type**: Web application (SPA section) inside the existing pnpm monorepo, plus a small additive change to the existing Fastify admin API.

**Performance Goals**: Fares list renders perceived-instant on a local connection (<300 ms); form save round-trip shows success/error feedback within the same interaction; no measurable constraint at thesis scale (single operator, ≤ dozens of configurations, no pagination).

**Constraints**: Strict TS (extend shared configs, never redefine); single root ESLint flat config; repo prettier `format:check`; Route Sign grammar (pure white ground, green-blue/amber, ≤4px corners, no shadows, no state by color alone — per `DESIGN.md`); API envelope `{ success, data | error }` with codes from `src/api/errors.ts`; server tests FIRST (TDD gate in AGENTS.md); exactly-one-default enforced server-side (existing); delete guard + default-on-inactive + unique labels per the `spec.md` clarifications; no ETA anywhere (ADR-0009); `@komyuter/shared` owns the `FareConfiguration` type and `create/updateFareConfigSchema` — reused, never reimplemented.

**Scale/Scope**: Single Administrator role; one page; ≤ dozens of fare configurations; no pagination or virtualization; no mobile/responsive targets beyond graceful desktop narrowness.

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| Gate                                                                                                                                                                                                                                                                           | Status |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| I. Precision Is Trust — exact ₱/km/% values displayed, never rounded into plausibility (FR-011, SC-007); delete guard states exactly what is blocked and why                                                                                                                   | PASS   |
| II. Recorded Decisions Govern — reconciled with ADR-0006 (auth), ADR-0009 (no ETA), ADMIN.md §5.4 ("guarded fare-config delete") and §3 stack; clarification decisions recorded in spec.md Session 2026-08-06; no new ADR required (guard implements a documented requirement) | PASS   |
| III. Shared, Never Reimplemented — reuses `@komyuter/shared` `FareConfiguration` type + `createFareConfigSchema`/`updateFareConfigSchema`; extends root ESLint/tsconfig conventions; no new lint config                                                                        | PASS   |
| IV. Canonical Language — Administrator, Fare Configuration, Route used consistently; no off-glossary synonyms                                                                                                                                                                  | PASS   |
| V. Measurable Deliverables — SC-001…SC-011 measurable and reviewer-verifiable (quickstart maps each)                                                                                                                                                                           | PASS   |
| Engineering Workflow — server guard tests written FIRST (TDD); root `lint`/`typecheck`/`format:check` + `pnpm --filter admin test` + `pnpm --filter server test` gates                                                                                                         | PASS   |
| UI work — `PRODUCT.md` and `DESIGN.md` conventions respected; Route Sign grammar applied; text+color for default/inactive (FR-012)                                                                                                                                             | PASS   |
| Complexity — no uncomplicated-alternative rejection required                                                                                                                                                                                                                   | PASS   |

No violations. Complexity Tracking intentionally empty.

## Project Structure

### Documentation (this feature)

```text
specs/006-fare-configuration-page/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
│   ├── fare-configs-api.md     # admin API contract (+ the two server extensions)
│   └── fare-config-page-ui.md  # Fares page UI contract
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
apps/admin/
├── components.json          # style base-nova (unchanged)
└── src/
    ├── pages/
    │   └── Fares.tsx            # REWRITE: page composition — list + create/edit dialog + delete flow + states
    ├── features/fares/
    │   ├── api.ts               # NEW: fareConfigsApi — list/create/update/deactivate (axios → admin API)
    │   ├── queries.ts           # NEW: useFareConfigsQuery + useCreateFareConfig/useUpdateFareConfig/useDeactivateFareConfig
    │   ├── validation.ts        # NEW: pure validateFareConfigForm (label required/unique, non-negative, 0–100 discounts)
    │   ├── format.ts            # NEW: pure formatPeso / formatKm / formatPct
    │   ├── FareConfigTable.tsx  # NEW: table rows + default/inactive badges + row actions
    │   ├── FareConfigForm.tsx   # NEW: dialog form (label, numeric fields, discounts, set-as-default switch, active switch)
    │   └── DeleteFareConfigDialog.tsx  # NEW: alert-dialog confirm + disabled-state explanation
    ├── components/ui/
    │   ├── dialog.tsx           # NEW (shadcn add dialog)
    │   ├── alert-dialog.tsx     # NEW (shadcn add alert-dialog)
    │   ├── switch.tsx           # NEW (shadcn add switch)
    │   └── table.tsx            # NEW (shadcn add table)
    ├── lib/
    │   └── queryKeys.ts         # NEW: query key factory (fare-configs list key; ADMIN.md §10.1 target)
    └── tests/
        ├── fare-validation.test.ts   # NEW: validation rules incl. duplicate-label + default-on-inactive
        └── fare-format.test.ts       # NEW: ₱/km/% formatting (SC-007)

apps/server/
├── src/api/
│   └── fare-configs.ts         # EDIT: list serializer adds active_route_count; DELETE adds route-reference guard
└── tests/
    └── integration/
        └── crud.test.ts        # EDIT (TDD first): fare-configs guard tests — DELETE blocked when referenced
                                 #   by active Route (409), allowed when only inactive Routes reference it,
                                 #   list exposes active_route_count
```

**Structure Decision**: The page follows the target architecture already proven by the appshell feature (`docs/ADMIN.md` §10.1 and `specs/005-admin-appshell`): page composition lives in `pages/`, feature logic in `features/fares/` (api/queries/pure helpers/components), shadcn-generated primitives in `components/ui/`, pure tested helpers in `src/tests/`. The server change stays inside the existing `fare-configs.ts` module and its integration test file — no new modules, no new tables.

## Complexity Tracking

No violations were recorded in the Constitution Check, so this section is intentionally empty per the template guidance.
