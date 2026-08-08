---
description: "Task list for the Route Plotting Page feature implementation"
---

# Tasks: Route Plotting Page

**Input**: Design documents from `/specs/007-route-plotting-page/`

**Prerequisites**: [plan.md](./plan.md) (required), [spec.md](./spec.md) (required), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: TDD is a repo convention — server tests are written FIRST and must FAIL before implementation (per `specs/001-local-supabase-backend/tasks.md`); admin pure helpers get Vitest unit tests. Integration tests require the local Supabase stack up and `apps/server/.env` present.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1–US4)
- Include exact file paths in descriptions

## Path Conventions

- Admin (UI): `apps/admin/src/...` · Server (API): `apps/server/src/...` · Shared: `packages/shared/src/...`
- Tests: `apps/admin/src/tests/`, `apps/server/tests/unit/`, `apps/server/tests/integration/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Dependencies and shared schemas the whole feature builds on.

- [x] T001 Add map dependencies to `apps/admin/package.json` (`pnpm --filter admin add maplibre-gl@^6.2.0 react-map-gl@^8.1.2`) — MapLibre GL JS via the `react-map-gl/maplibre` entry (research R1, ADR-0013)
- [x] T002 [P] Add hotkey dependency to `apps/admin/package.json` (`pnpm --filter admin add react-hotkeys-hook@^4`) (FR-019/FR-020)
- [x] T003 [P] Add shared snap contract: `packages/shared/src/schemas/mapbox.ts` (mapboxDirectionsResponseSchema: `polyline` GeoLineString, `distance_meters` number, `snapped` boolean, `warning` string|null) + `packages/shared/src/types/mapbox.ts` (DirectionRequest, SnappedPath) + export both from `packages/shared/src/index.ts`
- [x] T004 [P] Add optional `MAPBOX_SECRET_TOKEN` to `apps/server/src/config/env.ts` (absent → straight-line fallback, FR-009) and document it in `apps/server/.env.example`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The server save + snapping surface and the map rendering platform. MUST complete before ANY user story.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

### Tests for the foundation (write FIRST, red before implementation) ⚠️

- [x] T005 [P] Unit tests for return-direction derivation in `apps/server/tests/unit/derive.test.ts` (reverse polyline coordinates; reverse stop order; origin/destination swap; auto labels "To {destination stop name}" / "To {origin stop name}"; base object never mutated — ADR-0008/ADR-0011)
- [x] T006 [P] Contract tests for the atomic save in `apps/server/tests/integration/plotting-save.test.ts` (POST creates base + derived return + stops in one transaction; PUT replaces stops + re-derives return; <2 stops rejected 422; path not starting/ending on a stop rejected 422; loop allowed; third active direction rejected 409 — ADR-0008; numeric columns returned as numbers)
- [x] T007 [P] Unit tests for the Mapbox proxy in `apps/server/tests/unit/mapbox-proxy.test.ts` with stubbed fetch (duration field stripped — ADR-0009; >25 waypoints chunked and concatenated without duplicate joints; no token → mock straight-line `snapped:false` + `warning:"no_token"`; upstream error → `snapped:false` + `warning:"upstream_error"`; <2 coordinates → 422)

### Implementation for the foundation

- [x] T008 Implement `apps/server/src/domain/derive.ts` (pure: reverseDirection, deriveLabels, originDestinationFor) — make T005 green
- [x] T009 Implement transactional `POST /api/admin/routes/:routeId/directions` in `apps/server/src/api/directions.ts`: `db.transaction` inserting base Direction + ordered Stops, auto-labels, first/last stop ↔ polyline endpoint validation (tolerance ≈ 100 m), 2-active-directions guard (409), returns `{ direction, return_direction }` each with stops (contract: `contracts/admin-save-api.md`) — make T006 green
- [x] T010 Implement transactional `PUT /api/admin/directions/:directionId` in `apps/server/src/api/directions.ts` (same body; replaces the direction's stops, updates polyline, re-derives the return direction in the same transaction) — make T006 green
- [x] T011 [P] Document the PUT variant (request/response + error table) in `specs/007-route-plotting-page/contracts/admin-save-api.md`
- [x] T012 Implement `GET /api/admin/mapbox/directions` proxy in `apps/server/src/api/mapbox.ts` and register it in `apps/server/src/api/index.ts` (prefix `/api/admin`; Mapbox Directions v5 driving, `geometries=geojson&overview=full&steps=false&alternatives=false`, chunking at 25 waypoints, duration stripped, straight-line mock fallback; shared schema validates the response) — make T007 green
- [x] T013 [P] Create `apps/admin/src/lib/tiles.ts` — tile source resolution: OSM raster fallback when no `MAPBOX_PUBLIC_TOKEN`, Mapbox vector tiles otherwise (ADR-0013 dev fallback)
- [x] T014 [P] Create pure helpers `apps/admin/src/lib/coords.ts` (parse `lng,lat`, coordinate equality, nearestCoordIndex on a LineString) + tests in `apps/admin/src/tests/coords.test.ts` ([lng,lat] sole format — FR-022)
- [x] T015 Create the map platform `apps/admin/src/features/routes/RouteMap.tsx`: full-bleed MapLibre map (`Map` + `useMap` from `react-map-gl/maplibre`), tiles from `lib/tiles.ts`, initial view centered on the service region (Iloilo City Proper + Oton/Pavia/Leganes — ADR-0010), no fixed side columns (FR-001)
- [x] T016 [P] Create the plotting state core `apps/admin/src/lib/plottingStore.ts` (zustand): `mode`, ordered `stops[]`, `polyline`, `snap` state, `selection`, `layers`, `history` (structure only — undo wiring is US3) + selection helpers `apps/admin/src/lib/selection.ts` + tests in `apps/admin/src/tests/selection.test.ts`

**Checkpoint**: Foundation ready — atomic save + snap proxy work (unit/integration green) and the map renders; user story implementation can begin.

---

## Phase 3: User Story 1 - Plot a route's base path on the map (Priority: P1) 🎯 MVP

**Goal**: An authenticated Administrator opens the Route Plotting Page, picks (or creates) a Route, switches to plot mode, clicks along the street to place stops — each click adds a stop and a road-following connecting line; the snapped path is previewed, applied, and saved; the return direction is derived automatically (FR-001…FR-012, FR-017, FR-019, FR-020, FR-023, FR-026, FR-027, FR-028, FR-030).

**Independent Test**: A reviewer can open the page, plot a multi-stop route on the map, see stops in placement order with the path following roads (or the straight-line fallback with a warning when no token), and save it — no other capability required (spec US1).

### Tests for User Story 1 ⚠️ (write FIRST, red before implementation)

- [x] T017 [P] [US1] Unit tests for the snap-preview orchestration in `apps/admin/src/tests/plottingStore.test.ts` (debounced 500 ms request after placement; preview pending → resolved before commit; apply/revert transitions; auto-named "Stop N" in placement order — FR-008/FR-009/FR-028)

### Implementation for User Story 1

- [x] T018 [US1] Rewrite the placeholder `apps/admin/src/pages/RouteWorkspace.tsx` into the plotting surface: full-bleed `RouteMap`, floating nav overlay, centered floating `PlotActionBar`, right-side `PropertiesPanel` slot (hidden until selection), empty-state overlay; keep the existing `/routes` + `/routes/:routeId` routing and `RequireAuth` (FR-001/FR-019/FR-026)
- [x] T019 [P] [US1] Create `apps/admin/src/features/routes/routesApi.ts` — typed axios calls through `lib/api.ts`: GET/POST `/api/admin/routes`, GET `/api/admin/routes/:routeId`, GET `/api/admin/routes/:routeId/directions`, GET `/api/admin/directions/:directionId/stops`, POST/PUT atomic save, GET `/api/admin/mapbox/directions` (envelope `{success, data|error}`)
- [x] T020 [P] [US1] Create `apps/admin/src/features/routes/useRouteQueries.ts` — react-query hooks (route list, route meta, directions, snap preview) + new keys in `apps/admin/src/lib/queryKeys.ts`
- [x] T021 [US1] Create `apps/admin/src/features/routes/RouteList.tsx` — floating nav overlay: searchable route rows, active-route highlight, loads existing stops+path into the plotting surface (FR-002)
- [x] T022 [US1] Create `apps/admin/src/features/routes/NewRouteDialog.tsx` — minimal create-route form (name, short_name, color, optional fare_config) via POST `/api/admin/routes` (FR-002/FR-030)
- [x] T023 [US1] Create the empty-state guidance overlay in `apps/admin/src/features/routes/EmptyState.tsx` — "Create new route" (opens NewRouteDialog) + "Import JSON dataset" disabled with a coming-soon label; element-editing panel hidden (FR-030)
- [x] T024 [US1] Implement stop placement in `RouteMap.tsx` + `plottingStore.ts`: map click → exact `[lng,lat]` stop (FR-022) with auto-default name "Stop N" in placement order (FR-028), default type `major_stop`, marked start-of-route for the first stop (US1 AC1)
- [x] T025 [US1] Implement Automatic-mode connecting line: after each placement, request the snap preview via `/api/admin/mapbox/directions` (debounced 500 ms, coordinates from placed stops) and render it; straight-line fallback + visible warning when `snapped:false` (FR-006/FR-008/FR-009)
- [x] T026 [US1] Implement Apply/Revert: Apply commits the snapped polyline to the draft (undoable); Revert keeps the previous line; pending preview is resolved before another placement or save (FR-008; edge case)
- [x] T027 [US1] Create `apps/admin/src/features/routes/PlotActionBar.tsx` — centered floating bar below the map (FR-019) hosting: mode toggle placeholder (disabled until US2), Connect (disabled until US2), Apply/Revert, undo/redo (disabled until US3), layer toggles (disabled until US4), Save
- [x] T028 [US1] Implement the Save flow in `apps/admin/src/features/routes/useRouteQueries.ts`/`RouteWorkspace.tsx`: pre-validate (≥2 stops; path starts and ends on a stop; loop allowed — FR-004/FR-017); POST atomic save for a new direction, PUT for an existing one (FR-027); render base + derived return (FR-012); clear the draft; success toast; 409 conflict → clear message, local work retained (edge case)
- [x] T029 [US1] Add loading/empty/error states: route load skeleton, load failure with retry, save conflict banner (FR-023)
- [x] T030 [US1] Wire `mod+s` save hotkey via react-hotkeys-hook in `RouteWorkspace.tsx` (FR-020; visible controls remain)

**Checkpoint**: US1 fully functional and independently testable — MVP complete.

---

## Phase 4: User Story 2 - Plot manually, then connect (Priority: P2)

**Goal**: The Administrator can switch to Manual mode, drop all stops first with no connecting lines, then Connect to link them in placement order into the route path (FR-005/FR-007).

**Independent Test**: A reviewer can plot a route in Manual mode (no connecting lines while placing stops) and complete it with a single Connect action — testable with the map alone (spec US2).

### Tests for User Story 2 ⚠️ (write FIRST, red before implementation)

- [x] T031 [P] [US2] Unit tests for mode semantics in `apps/admin/src/tests/plotting-store.test.ts` + `connections.test.ts` (manual placement adds no lines; `linkStops` links/unlinks, commits the straight draft and requests the preview; mode switching mid-plot preserves stops + seeds the chain; chain invariants — FR-005/FR-007, US2 AC3)

### Implementation for User Story 2

- [x] T032 [US2] Implement the Automatic/Manual mode toggle in `PlotActionBar.tsx` (`plottingStore.mode`) — a clear labelled toggle, not an icon-only control (FR-005)
- [x] T033 [US2] Implement Manual mode in `RouteMap.tsx`/`plottingStore.ts` (node-based workflow — replaces the Connect button per product revision): placed stops show no connecting lines (FR-007); clicking a stop starts a rubber-band straight preview that follows the mouse, clicking a second stop links them (toggle: an already-linked pair disconnects), interior links re-route (chain invariant: degree ≤ 2, no cycles) via `lib/connections.ts`; linked edges commit straight into the draft polyline and request the whole-path snap preview (Apply/Revert unchanged); mid-plot switching keeps placed stops (US2 AC2/AC3); only chain stops are saved, off-path stops warned in the left panel

**Checkpoint**: US1 AND US2 both work independently.

---

## Phase 5: User Story 3 - Fix mistakes and keep work safe (Priority: P2)

**Goal**: Undo/Redo for placements, deletions, and snap applications; unsaved work is kept as a 24h client-local draft and offered for restore; drag repositioning (FR-013/FR-014/FR-029).

**Independent Test**: A reviewer can undo and redo a stop placement, a deletion, and a snap application, and confirm unsaved work survives an accidental navigation away — testable without any other capability (spec US3).

### Tests for User Story 3 ⚠️ (write FIRST, red before implementation)

- [x] T034 [P] [US3] Unit tests for the history stack in `apps/admin/src/tests/plottingHistory.test.ts` (undo/redo of stop_placed, stop_deleted, stop_dragged, snap_applied; stack cleared on save; mid-sequence delete reconnects and restores on undo — FR-013, edge case)
- [x] T035 [P] [US3] Unit tests for the draft module in `apps/admin/src/tests/draft.test.ts` (serialize/parse round-trip; 24h TTL expiry → no draft offered; expired draft never silently restored — FR-014)

### Implementation for User Story 3

- [x] T036 [US3] Implement undo/redo history in `apps/admin/src/lib/plottingStore.ts` + `apps/admin/src/lib/plottingHistory.ts` (entries: stop_placed, stop_deleted, stop_dragged, snap_applied) — make T034 green
- [x] T037 [US3] Implement stop deletion (map marker + ordered list): path reconnects across the gap, remaining stops keep order, undo restores the deleted stop (FR-013; edge case)
- [x] T038 [US3] Implement drag repositioning of placed stops in `RouteMap.tsx` (FR-029): marker drag → new `[lng,lat]` → affected segments re-snap (straight-line fallback + warning when service unavailable) → undoable → position persists with next Save
- [x] T039 [US3] Wire `mod+z` / `mod+shift+z` in `RouteWorkspace.tsx` + enable the undo/redo buttons in `PlotActionBar.tsx` (FR-019/FR-020)
- [x] T040 [US3] Create `apps/admin/src/lib/draft.ts` — localStorage draft (`komyuter.draft.{routeId}.{directionId}`, 24h TTL, debounced ~500 ms writes, never sent to the server) — make T035 green
- [x] T041 [US3] Add the navigation guard in `RouteWorkspace.tsx` (unsaved changes → explicit confirmation on `beforeunload` and route leave; leaving keeps the draft — FR-014)
- [x] T042 [US3] Create `apps/admin/src/features/routes/DraftRestoreBanner.tsx` — offers Restore (continues exact state incl. history) or Discard (clears the draft key); nothing offered after expiry (FR-014)

**Checkpoint**: US1–US3 all work independently.

---

## Phase 6: User Story 4 - Understand the plotted route at a glance (Priority: P3)

**Goal**: Stops are visually distinct by type, the route path is legible against the base map, map layers toggle, and selection opens the contextual properties panel (FR-015/FR-016/FR-018/FR-024).

**Independent Test**: A reviewer can identify each stop type by its shape and toggle each map layer on and off — testable on a plotted route alone (spec US4).

### Tests for User Story 4 ⚠️ (write FIRST, red before implementation)

- [x] T043 [P] [US4] Unit tests for stop shapes in `apps/admin/src/tests/stopShapes.test.ts` (terminal → square, major_stop → circle, waiting_area → diamond; shapes and colors are distinct; selection never conveyed by shape or color alone — FR-015)
- [x] T044 [P] [US4] Unit tests for layer filtering in `apps/admin/src/tests/plottingStore.test.ts` (Terminals is a sub-filter of Stops by `type === "terminal"`; toggling a layer affects only that layer — FR-016)

### Implementation for User Story 4

- [x] T045 [US4] Create `apps/admin/src/lib/stopShapes.ts` (type → shape/color mapping, default `major_stop`) and render typed shapes on the map — make T043 green
- [x] T046 [US4] Implement layer toggles in `PlotActionBar.tsx` + filtering in `RouteMap.tsx`: Stops, Terminals (sub-filter of Stops), Routes; toggling restores the layer (FR-016/FR-019)
- [x] T047 [US4] Implement selection highlight: selecting a stop highlights the stop marker AND its row in the ordered stop list; selection state never uses shape or color alone (FR-015, US4 AC3)
- [x] T048 [US4] Create `apps/admin/src/features/routes/PropertiesPanel.tsx` — right-side contextual panel, visible only when an element is selected (Q3/FR-018): stop editor (name, type, is_guaranteed_service, landmark_hint, notes — edits persist through save + reload) + polyline info (exact `distance_meters` from the snap response, no ETA — FR-018/FR-021/FR-024)
- [x] T049 [US4] Wire `PropertiesPanel` into `RouteWorkspace.tsx` (appears on stop/polyline selection, hides on deselect — FR-018)

**Checkpoint**: All user stories independently functional.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories.

- [ ] T050 [P] WCAG AA pass across the page: contrast, visible focus, keyboard operability for every control in `PlotActionBar`, `PropertiesPanel`, `RouteList`, dialogs (FR-020)
- [ ] T051 [P] Route Sign visual compliance audit (FR-025): pure white ground, cerulean identity, amber reserved for attention, ≤4px corners, no shadows; no new visual system introduced
- [ ] T052 [P] ADR-0009 regression guard: grep the admin feature for any travel-time/ETA/duration display; the snap response must never surface `duration` (FR-021)
- [ ] T053 [P] Write canonical ADR files `docs/adr/0011-auto-derived-return.md` and `docs/adr/0013-admin-maplibre-mapbox.md` and reconcile the stale "Leaflet exception / converter (ADR-0007)" text in `AGENTS.md` + constitution spatial section (research R6)
- [ ] T054 Run the full quickstart validation (`specs/007-route-plotting-page/quickstart.md` scenarios 1–3) + quality gates: `pnpm lint`, `pnpm typecheck`, `pnpm format:check`, `pnpm --filter admin test`, `pnpm --filter server test`

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories
- **US1 (Phase 3)**: Depends on Foundational — no dependencies on other stories
- **US2 (Phase 4)**: Depends on Foundational + US1 (reuses the snap-preview/Apply/Revert flow and `PlotActionBar`)
- **US3 (Phase 5)**: Depends on Foundational + US1 (history acts on US1's placement/apply actions; `PlotActionBar` undo/redo buttons)
- **US4 (Phase 6)**: Depends on Foundational + US1 (selection state + properties panel edit US1-plotted stops); independent of US2/US3
- **Polish (Phase 7)**: Depends on all user stories complete

### User Story Dependencies

- **US1 (P1)**: After Foundational — no story dependencies → **MVP scope**
- **US2 (P2)**: After Foundational — depends on US1's snap flow + action bar
- **US3 (P2)**: After Foundational — depends on US1's placement/apply actions; independent of US2
- **US4 (P3)**: After Foundational — depends on US1's stops/polyline; independent of US2/US3
- US3 and US4 can proceed in parallel once US1 is done (staff permitting)

### Within Each User Story

- Tests (included below) MUST be written and FAIL before implementation
- State/helpers before UI: `plottingStore.ts`/`lib/*` → `RouteMap`/panels → wiring in `RouteWorkspace.tsx`
- Core implementation before integration; story complete before moving to next priority

### Parallel Opportunities

- Phase 1: T001–T004 all run in parallel (different files: package.json, shared schemas, env.ts)
- Phase 2: T005–T007 (tests) parallel; then T008–T012 (server) parallel with T013–T016 (admin map/platform)
- US1: T019/T020 (api + queries) parallel; T021/T022/T023 (overlays) parallel; then T024–T030 sequential on the store/map
- US2/US3/US4 phases each start with parallel test tasks; US3 + US4 can run in parallel after US1
- Phase 7: T050–T053 parallel; T054 last

---

## Parallel Example: User Story 1

```bash
# Launch API + query layers together:
Task: "Create routesApi.ts in apps/admin/src/features/routes/routesApi.ts"
Task: "Create useRouteQueries.ts in apps/admin/src/features/routes/useRouteQueries.ts"

# Launch the floating overlays together:
Task: "Create RouteList.tsx in apps/admin/src/features/routes/RouteList.tsx"
Task: "Create NewRouteDialog.tsx in apps/admin/src/features/routes/NewRouteDialog.tsx"
Task: "Create EmptyState.tsx in apps/admin/src/features/routes/EmptyState.tsx"
```

## Parallel Example: User Story 3

```bash
# Tests first, in parallel:
Task: "Unit tests for the history stack in apps/admin/src/tests/plottingHistory.test.ts"
Task: "Unit tests for the draft module in apps/admin/src/tests/draft.test.ts"

# Then implementation (store/draft vs UI):
Task: "Undo/redo history in apps/admin/src/lib/plottingStore.ts"
Task: "Draft module in apps/admin/src/lib/draft.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL — blocks all stories)
3. Complete Phase 3: US1 (automatic-mode plotting + snap + atomic save)
4. **STOP and VALIDATE**: run `quickstart.md` Scenario 1 with US1 only (Manual-mode, undo/redo, layers, panel still disabled)
5. Deploy/demo if ready

### Incremental Delivery

1. Setup + Foundational → foundation ready (server atomic save + snap proxy green)
2. US1 → Test independently (Scenario 1) → Demo (MVP)
3. US2 → Test independently (Scenario: manual plot + Connect)
4. US3 → Test independently (Scenario 2: undo/redo, drag, draft restore)
5. US4 → Test independently (Scenario: shapes, layers, properties panel)
6. Polish → full quickstart + gates green

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: US1 (MVP)
   - Developer B: US3 tests + draft module (independent of US1)
   - Developer C: US4 tests + stopShapes/layers (independent of US1)
3. After US1: A → US2; B → US3 UI; C → US4 panel; integrate independently

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story is independently completable and testable
- Verify tests fail before implementing (TDD, red → green)
- Server integration tests (T006) require the local Supabase stack + `apps/server/.env`; unit tests (T005, T007) run without it
- Commit after each task or logical group; commit messages `type(scope): description`
- Stop at any checkpoint to validate the story independently
- Avoid: vague tasks, same-file conflicts, cross-story dependencies that break independence
- [lng,lat] is the sole coordinate format (ADR-0013); no conversion layer, no ETA anywhere (ADR-0009)
