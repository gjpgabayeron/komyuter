# Implementation Plan: Admin Backend — Auth, Route CRUD, and Data Collection

**Branch**: `001-local-supabase-backend` | **Date**: 2026-07-31 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/001-local-supabase-backend/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

Build the Komyuter server backend that will power the future admin dashboard: an authenticated admin API for creating, reading, updating, and deactivating the full transit data model (routes, directions, stops, detours, restrictions, fare configurations), plus a single-request export of the complete plotted dataset as a JSON file that a separate Collaboratory script reads from disk to validate the navigation algorithm. Runs entirely against a local Supabase Docker stack (Postgres + PostGIS + Auth). Deferred to later features: journey planning, hail-and-ride snapping, trace ingestion, trust scoring, and the admin dashboard UI itself.

## Technical Context

**Language/Version**: TypeScript (strict, extends `@repo/typescript-config/base`), Node.js 22 LTS (Fastify v5 requires Node ≥ 20).

**Primary Dependencies**:

- `fastify` v5 (ADR-0004) with `@fastify/type-provider-zod` + `zod` (request/response schema validation) and `@fastify/cors`.
- `@supabase/supabase-js` — server-side access-token verification (`auth.getUser(token)`) and any auth-admin operations; service-role client.
- `drizzle-orm` + `pg` — type-safe CRUD; PostGIS spatial columns via Drizzle's built-in `geometry` column type and raw `sql` templates for `ST_` functions (BACKEND.md §11).
- `@komyuter/shared` (new workspace package, Constitution Principle III) — shared domain types, envelope types, export schema types, and zod schemas reused by the server now and the admin dashboard later.
- `vitest` — unit + integration tests for `apps/server` (decision, see Constitution Check and research.md).

**Storage**: PostgreSQL with the PostGIS extension, running as part of the **local Supabase Docker stack** (Supabase CLI: `supabase start`). Identity via Supabase Auth (GoTrue) local container. The server connects to Postgres directly through Drizzle (no PostgREST). Schema migrations are SQL files under `supabase/migrations/` (drizzle-kit-generated from the TS schema, plus hand-written PostGIS/seed SQL); the seeded admin user is created by `supabase/seed.sql`.

**Testing**: Vitest (unit: geometry/validation/export-assembly; integration: against the running local Supabase stack). This is a deliberate adoption of a test runner where none existed — recorded as a planned constitution amendment (Engineering Workflow gate, see Constitution Check). `quickstart.md` documents scripted end-to-end validation scenarios mapped to SC-001–SC-008.

**Target Platform**: Node.js server (local), Linux containers via Docker (Supabase local stack). No hosted services.

**Project Type**: web-service (backend API for a future admin dashboard + data export).

**Performance Goals**: SC-007 — 95% of CRUD and export requests complete in under 1 second on the local environment. No load/throughput target.

**Constraints**:

- Coordinate order `[longitude, latitude]` for **every** spatial value stored or returned (constitution, ADR-0007-adjacent rule). This is the single most dangerous pitfall.
- API envelope `{ success, data | error }` on every response.
- Single admin role via Supabase Auth (ADR-0006); exactly one admin account seeded from local configuration (spec FR-016).
- No ETA / no arrival-time data anywhere, including the export (ADR-0009, spec FR-010).
- No Redis (ADR-0005); no graph persistence (graph tables are not created — the graph is derived at a later feature).
- Single connected region; **no `city` column** (ADR-0010).
- One direction = one base path + ordered, non-empty stop list; never derive a direction's geometry by reversing another (ADR-0008 domain rule, spec FR-007).
- Validate before write (spec FR-004): referenced-stop deletion, empty/unordered stop list, invalid path, off-path detour entry/exit all rejected.
- Canonical glossary terms only (Constitution Principle IV).
- ESLint is the single root flat config (extend it for `apps/server` + `packages/shared`); never recreate per-package lint configs.
- Extend `@repo/typescript-config`, never redefine tsconfigs from scratch.
- Quality gates: `pnpm lint`, `pnpm typecheck`, `pnpm format:check` must pass.
- Testability per Principle V remains required even though a runner was previously absent.

**Scale/Scope**: One region (Iloilo City Proper + Oton/Pavia/Leganes); ~10–12 routes, ~100–200 stops anticipated; single admin; single local deployment. CRUD + export only — no navigation.

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

- **I. Precision Is Trust** — PASS. Export carries exact stored values only; no arrival-time/speed data (FR-010). No fabricated numbers.
- **II. Recorded Decisions Govern** — PASS. Stack follows ADR-0004 (Fastify v5), ADR-0006 (Supabase Auth), ADR-0005 (no Redis), ADR-0010 (single region); coordinate-order rule honored. Where design docs disagree with ADRs, ADRs win.
- **III. Shared, Never Reimplemented** — PASS. Plan creates `packages/shared` (`@komyuter/shared`) for shared domain/envelope/export types (reused later by `apps/admin`); extends `@repo/typescript-config`; extends the single root ESLint flat config; does not recreate `@repo/eslint-config`.
- **IV. Canonical Language** — PASS. Data model, API, and export use glossary terms (Route, Direction, Stop, Detour, Restriction, Fare Configuration, Boarding Point, Admin); synonyms ("Line", "user") avoided.
- **V. Measurable Deliverables** — PASS. SC-001–SC-008 are measurable; automated tests plus quickstart scenarios map 1:1 to them.
- **Auth is Supabase, no DIY JWT (ADR-0006)** — PASS. Server verifies Supabase-signed access tokens via `getUser`; admin gating via an `admin_users` table lookup. No hand-rolled JWT code.
- **API envelope** — PASS. `{ success, data | error }` everywhere.
- **No Redis / no graph persistence (ADR-0005)** — PASS. No `graph_nodes`/`graph_edges` tables; graph is a later, derived concern.
- **Single region (ADR-0010)** — PASS. No `city` column in schema.
- **Engineering quality gates** — PASS. Strict TS via shared config; single root ESLint (to be extended for server+shared files); Prettier config unchanged; `pnpm lint`/`typecheck`/`format:check` gates hold.
- **Test strategy TODO (Engineering Workflow)** — RESOLVED BY DECISION: adopt Vitest for `apps/server` and add a `test` task for it. This requires amending this constitution (PATCH to the Engineering Workflow section: record that a test runner is permitted for workspace apps) **before** the `pnpm test` task is wired into `turbo.json`. The amendment is a first implementation task, with stated rationale and a migration note (governance rules). Until the amendment is committed, no `test` task exists.

_Re-check after Phase 1 design (below):_ PASS — no new violations introduced by the artifacts (data-model, contracts, quickstart). The single amendment stands as the only governance action; recorded in Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/001-local-supabase-backend/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
apps/server/                      # NEW backend app (empty dir already present)
├── src/
│   ├── config/
│   │   ├── env.ts                # env parsing (DATABASE_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ADMIN_*)
│   │   ├── db.ts                 # pg + drizzle client (local Supabase Postgres)
│   │   └── supabase.ts           # service-role supabase-js client
│   ├── db/
│   │   ├── schema.ts             # Drizzle TS schema (source of truth; all tables below)
│   │   └── queries.ts            # raw-SQL spatial helpers (ST_GeomFromGeoJSON, ST_AsGeoJSON)
│   ├── domain/
│   │   ├── geometry.ts           # [lng,lat] validation, GeoJSON Point/LineString guards
│   │   ├── validation.ts         # FR-004 rules (referenced-stop, empty stop list, off-path detour)
│   │   ├── fare.ts               # default fare parameters fallback (FR-015)
│   │   └── export.ts             # assemble full dataset JSON (FR-009/FR-010)
│   ├── api/
│   │   ├── app.ts                # Fastify bootstrap: cors, type-provider-zod, envelope, error handler
│   │   ├── auth.ts               # preHandler: getUser(token) + admin_users check (FR-001)
│   │   ├── routes.ts             # routes CRUD
│   │   ├── directions.ts         # directions CRUD (nested under routes)
│   │   ├── stops.ts              # stops CRUD (nested under directions)
│   │   ├── detours.ts            # detours CRUD (nested under directions)
│   │   ├── restrictions.ts       # restrictions CRUD (nested under directions)
│   │   ├── fare-configs.ts       # fare configurations CRUD
│   │   ├── export.ts             # GET dataset export (file download)
│   │   └── status.ts             # health + dataset stats (FR-012)
│   └── index.ts                  # server entrypoint
├── tests/
│   ├── unit/                     # geometry, validation, fare defaults, export assembly
│   └── integration/              # auth gating, CRUD, export, restart persistence (against local stack)
├── package.json
├── tsconfig.json                 # extends @repo/typescript-config/base
└── .env.example

packages/shared/                  # NEW workspace package (Constitution Principle III)
├── src/
│   ├── types/
│   │   ├── domain.ts             # Route, Direction, Stop, Detour, Restriction, FareConfiguration, Admin
│   │   ├── envelope.ts           # { success, data | error } types + error codes
│   │   └── export-dataset.ts     # dataset JSON types + schema_version constant
│   ├── schemas/                  # zod schemas mirrored from types (validated in server)
│   └── index.ts
├── package.json                  # name: "@komyuter/shared", types: "./src/index.ts"
└── tsconfig.json                 # extends @repo/typescript-config/base

supabase/                         # NEW — local Supabase project config
├── config.toml                   # supabase init output; [db.seed] enabled → ./seed.sql
├── migrations/                   # PostGIS enable + drizzle-kit-generated schema SQL (applied by supabase start / db reset)
└── seed.sql                      # seed admin user into auth.users + admin_users row; default fare config
```

**Structure Decision**: The backend lives in `apps/server` (the empty directory already present, matching the `apps/*` workspace glob). Shared domain/envelope/export types go in the new `packages/shared` package to satisfy Constitution Principle III and to be reused verbatim by the future `apps/admin` dashboard (no duplicated type definitions). The local Supabase stack is configured at the repo root under `supabase/` so migrations, PostGIS, seeding, and the Auth container are one reproducible unit (spec FR-013). This is the three-package layout (server + shared + existing workspaces); it is the minimum structure required and adds no unused packages.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation                                                                                      | Why Needed                                                                                                                                   | Simpler Alternative Rejected Because                                                                                  |
| ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Test runner (Vitest) adoption — requires a PATCH amendment to the Engineering Workflow section | SC-001–SC-008 are independently testable (Principle V) and the spec demands automated verification; a runner is the only way to gate on them | Manual-only verification was rejected: it cannot prove 100%-coverage claims like SC-003/SC-004/SC-005 on every change |

_All other Constitution Check gates pass without violation; the amendment is the only governance action and is performed as the first implementation task._
