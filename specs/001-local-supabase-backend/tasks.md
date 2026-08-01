---
description: "Task list for feature implementation"
---

# Tasks: Admin Backend — Auth, Route CRUD, and Data Collection

**Input**: Design documents from `/specs/001-local-supabase-backend/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: Included. The plan (`plan.md`) explicitly adopts Vitest for `apps/server` (constitution amendment required, see T006) and `quickstart.md` defines unit + integration suites; success criteria SC-001–SC-008 demand automated verification. Tests are written first per story and must fail before implementation.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- Backend app: `apps/server/src/`, tests in `apps/server/tests/`
- Shared package: `packages/shared/src/`
- Supabase local stack: `supabase/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and basic structure

- [x] T001 Create `apps/server` backend package scaffold: `apps/server/package.json` (name `server`, scripts `dev`/`build`/`typecheck`), `apps/server/tsconfig.json` extending `@repo/typescript-config/base`, and `apps/server/.env.example`
- [x] T002 [P] Create `packages/shared` package: `packages/shared/package.json` (name `@komyuter/shared`, types/main → `./src/index.ts`), `packages/shared/tsconfig.json` extending `@repo/typescript-config/base`, and an empty `packages/shared/src/index.ts`
- [x] T003 [P] Initialize local Supabase project: run `supabase init` to create `supabase/config.toml` (with `[db.seed]` → `./seed.sql`), create `supabase/migrations/`, and add a `supabase/seed.sql` placeholder
- [x] T004 [P] Wire the new packages into the monorepo toolchain: extend root `eslint.config.mjs` with `apps/server/**/*.ts` and `packages/shared/**/*.ts` (TS rules + node globals), and add `tsc --noEmit -p apps/server/tsconfig.json` and `-p packages/shared/tsconfig.json` to the root `package.json` `typecheck` script
- [x] T005 Install workspace dependencies: `pnpm --filter server add fastify@5 @fastify/type-provider-zod @fastify/cors zod drizzle-orm pg @supabase/supabase-js` and dev deps `@types/node @types/pg vitest tsx`; `pnpm --filter @komyuter/shared add zod`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core infrastructure that MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T006 Amend `.specify/memory/constitution.md` (PATCH, Engineering Workflow section) to permit a test runner (Vitest) for workspace apps, with stated rationale + migration note; then add `test: "vitest run"` to `apps/server/package.json`, create `apps/server/vitest.config.ts`, and add a `test` task to `turbo.json`
- [x] T007 Define shared types in `packages/shared/src/types/domain.ts` (Route, Direction, Stop, Detour, Restriction, FareConfiguration), `packages/shared/src/types/envelope.ts` (`{ success, data | error }` + error codes), and `packages/shared/src/types/export-dataset.ts` per `contracts/export-dataset.schema.json`
- [x] T008 [P] Define zod schemas in `packages/shared/src/schemas/` mirroring the shared types (route/direction/stop/detour/restriction/fare-config request bodies, envelope, export dataset) and export them from `packages/shared/src/index.ts`
- [x] T009 [P] Create Drizzle schema in `apps/server/src/db/schema.ts`: `routes`, `directions` (base_polyline geometry LineString 4326), `stops` (location geometry Point 4326 + GiST index), `detours`, `restrictions`, `fare_configs`, `admin_users` per `data-model.md`
- [x] T010 Generate schema migrations with drizzle-kit and commit the SQL into `supabase/migrations/` (including an initial `create extension if not exists postgis;` migration) so `supabase start` / `supabase db reset` apply them
- [x] T011 [P] Create config modules: `apps/server/src/config/env.ts` (parse DATABASE_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ADMIN_EMAIL, ADMIN_PASSWORD, PORT), `apps/server/src/config/db.ts` (pg + drizzle client), `apps/server/src/config/supabase.ts` (service-role supabase-js client)
- [x] T012 Write `supabase/seed.sql`: create the single admin user in `auth.users` (with `auth.identities`) from env-provided ADMIN_EMAIL/ADMIN_PASSWORD, insert the matching `admin_users` row, and insert one default fare configuration (spec FR-015/FR-016)
- [x] T013 [P] Implement geometry guards in `apps/server/src/domain/geometry.ts`: validate GeoJSON Point/LineString, enforce `[longitude, latitude]` order (reject out-of-range pairs), and reject non-geometry payloads (spec FR-005)
- [x] T014 [P] Implement spatial helpers in `apps/server/src/db/queries.ts`: wrappers for `ST_GeomFromGeoJSON` (write) and `ST_AsGeoJSON` (read) so every save/load path centralizes the `[lng,lat]` rule
- [x] T015 Bootstrap the Fastify app in `apps/server/src/api/app.ts`: register CORS, `@fastify/type-provider-zod`, a response-envelope serializer (`{ success, data | error }`), a central error handler mapping `VALIDATION_ERROR`/`CONFLICT`/`UNAUTHORIZED`/`FORBIDDEN`/`NOT_FOUND`/`INTERNAL`, and create `apps/server/src/index.ts` entrypoint
- [x] T016 Implement admin auth guard in `apps/server/src/api/auth.ts`: preHandler that extracts the Bearer token, calls `supabase.auth.getUser(token)`, and checks the `admin_users` table → `401` invalid token / `403` non-admin (spec FR-001)
- [x] T017 [P] Unit tests for shared zod schemas and geometry guards in `apps/server/tests/unit/geometry.test.ts` and `apps/server/tests/unit/schemas.test.ts`

**Checkpoint**: Foundation ready - server boots against local Supabase, schema migrated, admin seeded, auth + envelope work, and tests run via `pnpm --filter server test`. User story implementation can now begin.

---

## Phase 3: User Story 1 - Admin manages route data (Priority: P1) 🎯 MVP

**Goal**: An authenticated admin can create, read, update, and deactivate the full transit data model (routes, directions, stops, detours, restrictions, fare configurations) via the API; invalid writes are rejected; unauthorized callers are blocked.

**Independent Test**: Sign in as the seeded admin, create a route with two directions (each with a polyline and ordered stops), add a detour and a restriction, and edit a fare configuration — then verify every read reflects the change without a server restart, invalid writes return 4xx with no data change, and an unauthenticated write returns 401. Maps to quickstart scenarios 1–8 and SC-001/SC-002/SC-003.

### Tests for User Story 1 ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T018 [P] [US1] Integration tests for auth gating in `apps/server/tests/integration/auth.test.ts` (SC-001): unauthenticated write → 401 no data change; non-admin token → 403; seeded admin → success
- [ ] T019 [P] [US1] Integration tests for CRUD reflection and validation rejection in `apps/server/tests/integration/crud.test.ts` (SC-002/SC-003): create/edit/deactivate each entity and re-read; referenced-stop deletion → 409; empty stop list, invalid geometry, off-path detour, out-of-range restriction indices → 4xx with data unchanged

### Implementation for User Story 1

- [ ] T020 [P] [US1] Implement route service + endpoints in `apps/server/src/api/routes.ts` (GET/POST /api/admin/routes, GET/PUT/DELETE /api/admin/routes/:routeId) per `contracts/api.md`, with soft-delete semantics
- [ ] T021 [P] [US1] Implement fare-config service + endpoints in `apps/server/src/api/fare-configs.ts` (CRUD + single `is_default` rule, FR-015)
- [ ] T022 [US1] Implement direction service + endpoints in `apps/server/src/api/directions.ts` (nested under routes; base_polyline save/load via `src/db/queries.ts`; non-empty stop-list rule; terminal references), per `contracts/api.md`
- [ ] T023 [US1] Implement stop service + endpoints in `apps/server/src/api/stops.ts` (location Point via spatial helpers, `stop_order` assignment/reorder, delete conflict when referenced as terminal, FR-004/FR-007)
- [ ] T024 [P] [US1] Implement detour service + endpoints in `apps/server/src/api/detours.ts` (nested under directions; validate `entry`/`exit` lie on the direction's base polyline)
- [ ] T025 [P] [US1] Implement restriction service + endpoints in `apps/server/src/api/restrictions.ts` (nested under directions; validate `from_coord_index`/`to_coord_index` within the current base polyline)
- [ ] T026 [US1] Wire per-entity validation into the CRUD handlers so all FR-004 rejections surface as structured `VALIDATION_ERROR`/`CONFLICT` errors through the central error handler in `apps/server/src/api/app.ts`
- [ ] T027 [US1] Add structured logging for CRUD operations (request id, admin id, entity type/action, outcome) in `apps/server/src/api/app.ts`

**Checkpoint**: At this point, User Story 1 should be fully functional and testable independently.

---

## Phase 4: User Story 2 - Collect plotted route data for the validation script (Priority: P1)

**Goal**: The complete plotted dataset (routes, directions, stops, detours, restrictions, fare configs — active and inactive) is exported as a single JSON file via an admin endpoint, consumable by the Collaboratory script from disk.

**Independent Test**: Plot a route through US1, request `/api/admin/export/dataset`, save the file, and (a) validate it against `contracts/export-dataset.schema.json`, (b) confirm every reference resolves, (c) parse it with a plain JSON reader like the script would. A fresh database returns `routes: []`, never an error. Maps to quickstart scenarios 9–10 and SC-004/SC-005.

> **Note**: US2 depends on US1 for populated data in end-to-end tests; the export assembler itself is independently testable with fixtures after the foundational phase.

### Tests for User Story 2 ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T028 [P] [US2] Unit tests for export assembly in `apps/server/tests/unit/export.test.ts`: fixture routes → correct dataset shape; empty DB → `routes: []`; coordinate-order audit over every stored pair (SC-004)
- [ ] T029 [P] [US2] Integration tests for the export endpoint in `apps/server/tests/integration/export.test.ts` (SC-005): full dataset contains plotted route; 100% of stop/direction/route references resolve; output validates against `contracts/export-dataset.schema.json`; no arrival-time fields (FR-010)

### Implementation for User Story 2

- [ ] T030 [US2] Implement export assembly in `apps/server/src/domain/export.ts`: read all routes/directions/stops/detours/restrictions/fare configs, build the dataset document (schema_version 1.0, `coordinate_order: "lng_lat"`, exported_at, fare_configs, routes) per `contracts/export-dataset.schema.json`
- [ ] T031 [US2] Implement export endpoint in `apps/server/src/api/export.ts`: admin-gated `GET /api/admin/export/dataset` returning `application/json` with `Content-Disposition: attachment; filename="komyuter-dataset.json"` (spec FR-009, Q3 file export)
- [ ] T032 [US2] Add a scripted check in `apps/server/tests/` that validates the exported file against `contracts/export-dataset.schema.json` and confirms it parses standalone (mirrors the Collaboratory script read path)

**Checkpoint**: At this point, User Stories 1 AND 2 should both work; the dataset file is ready for the validation script.

---

## Phase 5: User Story 3 - Team runs the backend locally (Priority: P2)

**Goal**: A clean machine can provision the local Supabase Docker stack + server with one documented command; admin authenticates locally; data persists across restarts; status endpoint reports health and dataset stats.

**Independent Test**: On a clean machine follow `apps/server/README.md` (or `quickstart.md` Setup): `supabase start`, copy `.env`, `pnpm install`, `pnpm --filter server dev`; sign in as the seeded admin, persist a route, restart both server and stack, confirm data survives and `/api/status` reports `status: "ok"` with correct stats. Maps to quickstart scenarios 11–12 and SC-006/SC-007/SC-008.

### Tests for User Story 3 ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T033 [P] [US3] Integration tests for status + persistence in `apps/server/tests/integration/status.test.ts` (SC-006/SC-008, FR-014): status returns ok + correct counts; persisted data is served after a server restart

### Implementation for User Story 3

- [ ] T034 [US3] Implement status endpoint in `apps/server/src/api/status.ts`: `GET /api/status` → `{ success, data: { status: "ok", stats: { routes, directions, stops, detours, restrictions, fare_configs, dataset_updated_at } } }` (FR-012)
- [ ] T035 [US3] Write `apps/server/README.md` setup/run documentation and finalize `apps/server/.env.example`, mirroring `quickstart.md` (supabase start, env copy, install, dev, admin login, CRUD, export)
- [ ] T036 [US3] Verify restart persistence end-to-end: data survives `supabase stop`/`start` and a server restart; the server serves the dataset from committed storage with no startup data-loading step required (drizzle reads at request time) — reconcile with T033 if gaps surface
- [ ] T037 [US3] Add a latency check (SC-007): repeat status + export reads 20× locally and assert ≥19 of 20 complete in under 1 second (small script or vitest perf test)

**Checkpoint**: All user stories independently functional; the full flow (local setup → login → plot → export → restart) works for demo.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [ ] T038 [P] Run `pnpm lint`, `pnpm typecheck`, and `pnpm format:check` repo-wide and fix all violations in `apps/server`, `packages/shared`, `supabase/seed.sql`, and root config
- [ ] T039 [P] Execute every `quickstart.md` validation scenario end-to-end and fix gaps (all 12 scenarios pass)
- [ ] T040 [P] Update docs: refresh `AGENTS.md` (apps/server + @komyuter/shared conventions, server quality gates) and the root `README.md` if it references the backend
- [ ] T041 Commit each logical group with conventional commits (`type(scope): description`) — e.g., `feat(server): add route CRUD`, `chore(constitution): permit vitest test runner` — per commitlint config

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Stories (Phase 3+)**: All depend on Foundational phase completion
  - User stories can then proceed in parallel (if staffed)
  - Or sequentially in priority order (P1 → P2 → P3)
- **Polish (Final Phase)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: Can start after Foundational (Phase 2) - No dependencies on other stories
- **User Story 2 (P1)**: Can start after Foundational (Phase 2) - export assembler testable with fixtures independently; end-to-end dataset test requires US1 data population
- **User Story 3 (P2)**: Can start after Foundational (Phase 2) - independent of US1/US2

### Within Each User Story

- Tests MUST be written and FAIL before implementation (T018/T019, T028/T029, T033)
- Models/types before services before endpoints
- Core implementation before integration
- Story complete before moving to next priority

### Parallel Opportunities

- All Setup tasks marked [P] can run in parallel
- All Foundational tasks marked [P] can run in parallel (within Phase 2)
- Once Foundational phase completes, all user stories can start in parallel (if team capacity allows)
- Within US1: T018/T019 (tests), then T020/T021 (routes/fare-configs), T024/T025 (detours/restrictions) are parallel; T022/T023 sequential (stops depend on directions); T026/T027 depend on all US1 services
- Within US2: T028/T029 parallel; T030 → T031 → T032 sequential
- Different user stories can be worked on in parallel by different team members

---

## Parallel Example: User Story 1

```bash
# Launch the two US1 integration test files together (must fail first):
Task: "Integration tests for auth gating in apps/server/tests/integration/auth.test.ts"
Task: "Integration tests for CRUD reflection and validation in apps/server/tests/integration/crud.test.ts"

# Launch independent CRUD services together after tests exist:
Task: "Route service + endpoints in apps/server/src/api/routes.ts"
Task: "Fare-config service + endpoints in apps/server/src/api/fare-configs.ts"
Task: "Detour service + endpoints in apps/server/src/api/detours.ts"
Task: "Restriction service + endpoints in apps/server/src/api/restrictions.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL - blocks all stories; includes the T006 constitution amendment)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: Test User Story 1 independently (quickstart scenarios 1–8)
5. Deploy/demo if ready

### Incremental Delivery

1. Complete Setup + Foundational → Foundation ready
2. Add User Story 1 → Test independently → Demo (MVP)
3. Add User Story 2 → Test independently → dataset file ready for the Collaboratory script
4. Add User Story 3 → Test independently → reproducible local demo
5. Each story adds value without breaking previous stories

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: User Story 1
   - Developer B: User Story 2 (assembler with fixtures; endpoint after US1 data)
   - Developer C: User Story 3
3. Stories complete and integrate independently

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Verify tests fail before implementing (T018/T019, T028/T029, T033)
- Commit after each task or logical group (T041)
- Stop at any checkpoint to validate story independently
- Avoid: vague tasks, same file conflicts, cross-story dependencies that break independence
