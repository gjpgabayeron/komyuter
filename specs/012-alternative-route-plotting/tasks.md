# Tasks: Alternative Route (Detour) Plotting

**Input**: Design documents from `/specs/012-alternative-route-plotting/`

**Prerequisites**: [plan.md](./plan.md) (required), [spec.md](./spec.md) (required, user stories), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/admin-detours-api.md](./contracts/admin-detours-api.md), [quickstart.md](./quickstart.md)

**Tests**: INCLUDED — the spec explicitly requires server tests for FR-023 ("covered by a few server tests", Assumptions) and the repository mandates TDD red-first for server work (`specs/001-local-supabase-backend/tasks.md`, AGENTS.md). Admin unit tests follow the existing `apps/admin/src/tests/*.test.ts` convention (runner: `pnpm --filter admin test`, config `apps/admin/vitest.config.ts`). Server tests run via `pnpm --filter server test` (unit + integration; integration needs local Supabase + `apps/server/.env` and is the ONLY suite that touches the DB).

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1…US4); Setup/Foundational/Polish have no story label
- Include exact file paths in descriptions

## Path Conventions (this repo)

- Admin SPA: `apps/admin/src/…` (React 18 + Vite + MapLibre GL + zustand + React Query; Vitest tests in `apps/admin/src/tests/*.test.ts`)
- Server: `apps/server/src/…` (Fastify v5 + drizzle/PostGIS; tests in `apps/server/tests/unit/` and `apps/server/tests/integration/`)
- Shared: `packages/shared/src/…` — **read-only for this feature** (no schema/type changes)
- Geometry: `[lng, lat]` only (ADR-0013); server tolerances reuse `DETOUR_ON_LINE_TOLERANCE_METERS = 30` (`apps/server/src/domain/validation.ts:8`)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Feature scaffolding + environment readiness. No new dependencies, no schema changes (research R4/R5).

- [x] T001 Create the detour feature folder `apps/admin/src/features/detours/` with a barrel `index.ts` (exports added by later tasks), per the plan.md structure decision
- [x] T002 [P] Verify prerequisites per quickstart.md: local Supabase stack up (`pnpm supabase start`), `apps/server/.env` present, `apps/admin/.env` has `VITE_MAPBOX_PUBLIC_TOKEN` (ADR-0016); baseline `pnpm lint && pnpm typecheck` clean before any implementation

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The math/validation/API foundation EVERY user story depends on — server FR-023 invariant, client geometry projection, typed detour API clients.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

### Tests (write FIRST — red)

- [x] T003 [P] Write RED server unit tests for `assertDetourLoopEndpoints` in `apps/server/tests/unit/validation.test.ts`: loop[0] >30 m from entry, loop[last] >30 m from exit, degenerate `entry === exit`, boundary case at exactly 30 m, valid loop passes — run `pnpm --filter server test`, confirm the new cases FAIL before implementation
- [x] T004 [P] Write RED server integration tests in `apps/server/tests/integration/crud.test.ts` (alongside the existing detour CRUD tests): `POST /api/admin/directions/:directionId/detours` → 422 envelope error + nothing persisted when `detour_polyline[0]` ≠ entry / `[last]` ≠ exit / degenerate entry=exit; `PUT /api/admin/detours/:detourId` revalidates when only `detour_polyline` changes; negative `additional_distance_meters` → 422 (this last case is already enforced by zod `min(0)`, so its test may be green immediately — the NEW structural cases must be red first). Run `pnpm --filter server test` (stack up)
- [x] T005 [P] Write RED admin unit tests for the two new pure helpers in `apps/admin/src/tests/coords.test.ts`: `projectPointOnPolyline` (between-vertices snap lands on segment, returns `{ coordinate, index, distanceMeters }`, distance ≈ 0 on-line, index correct) and `polylineSegmentLength` (slice of base between two vertex indices) — run `pnpm --filter admin test`, confirm the new cases FAIL first

### Implementation

- [x] T006 [P] Implement `assertDetourLoopEndpoints(loop, entry, exit)` in `apps/server/src/domain/validation.ts` using `coordinatesDistanceMeters` (`apps/server/src/domain/derive.ts:47-61`) + `DETOUR_ON_LINE_TOLERANCE_METERS` (30 m); throws the standard validation error used by `assertPointOnLine`; makes T003 green
- [x] T007 [P] Wire the FR-023 gates into `apps/server/src/api/detours.ts`: call `assertDetourLoopEndpoints` in `POST` always; in `PUT` when `detour_polyline` OR `entry`/`exit` is present in the body (reuse the existing `assertPointOnLine` call sites `detours.ts:54-55` / `:113-118`); no new endpoints; makes T004 green
- [x] T008 [P] Implement `projectPointOnPolyline` + `polylineSegmentLength` in `apps/admin/src/lib/coords.ts` (haversine point-to-segment projection mirroring server segment math; `polylineDistanceMeters` reused for lengths); makes T005 green
- [x] T009 [P] Add typed detour API clients in `apps/admin/src/features/routes/routesApi.ts`: `listDetours(directionId)`, `createDetour(directionId, body: CreateDetourBody)`, `updateDetour(detourId, patch: UpdateDetourBody)`, `softDeleteDetour(detourId)` — envelope-unwrapped via the existing api client, bodies typed from `@komyuter/shared` schemas (contract: `contracts/admin-detours-api.md`)
- [x] T010 [P] Add React Query integration: `routeKeys.detours(directionId, detourId?)` in `apps/admin/src/lib/queryKeys.ts` (pattern `queryKeys.ts:9-11`) + detour queries/mutations (`useDetoursQuery`, `useCreateDetour`, `useUpdateDetour`, `useSoftDeleteDetour`) in `apps/admin/src/features/routes/useRouteQueries.ts`; mutations invalidate the detours key on success

**Checkpoint**: Foundation ready — `pnpm --filter server typecheck && pnpm --filter server test` and `pnpm --filter admin test` green; user story implementation can begin.

---

## Phase 3: User Story 1 - Plot a detour from the main route (Priority: P1) 🎯 MVP

**Goal**: From a Direction with a plotted base path, the Administrator starts **Add alternative route**, snaps entry/exit onto the base polyline (correct travel order), draws a road-followed loop, saves atomically — and the Detour survives a reload, rendered with a distinct style.

**Independent Test** (spec US1): Open a Direction with a plotted base path, mark entry and exit, draw an alternative loop, save, and confirm the Detour appears nested under the Direction after a reload — no other capability required (SC-001/002/003/009/010).

### Tests for User Story 1 (write FIRST — red)

- [x] T011 [P] [US1] Write RED admin unit tests in `apps/admin/src/tests/detour-store.test.ts` for the planning store: entry/exit snap via `projectPointOnPolyline` with visible snap result, out-of-order pair sets a refusal state with swap action, degenerate loop refused, save gate blocks before any HTTP call — run `pnpm --filter admin test`, confirm FAIL before store implementation

### Implementation for User Story 1

- [x] T012 [US1] Add the **Add alternative route** action to `apps/admin/src/features/routes/PlotActionBar.tsx`: opens detour mode on the open Direction; when the Direction has no base polyline the action is disabled with a clear explanation (FR-001; SC-009)
- [x] T013 [US1] Implement the detour planning store in `apps/admin/src/features/detours/detourStore.ts` (zustand, mirroring `apps/admin/src/lib/plottingStore.ts`): `mode` (new/edit), entry/exit placement using `projectPointOnPolyline`, waypoints, loop via `bindSnapFetcher` → `snapPreview` (`routesApi.ts:198-207`), client save gate (order FR-004, degenerate FR-005), history hook points for US4; makes T011 green
- [x] T014 [US1] Build `apps/admin/src/features/detours/DetourEditor.tsx`: mode banner naming the owning Direction ("Plotting detour for Direction X" — FR-002), map click → entry/exit placement with the snapped result shown (FR-003/020), travel-order indicator + **swap** action (FR-004), degenerate-loop refusal with explanation (FR-005), Save action wired to the gate
- [x] T015 [US1] Implement loop drawing in the editor: road-followed path `[entry, ...waypoints, exit]` via `snapPreview`; straight-line fallback + visible warning when road-following is unavailable or token missing — MUST never block finishing/saving (FR-006/FR-009; SC-003)
- [x] T016 [US1] Implement the atomic save pipeline: map draft → `createDetourSchema` payload (label, entry/exit as Point GeoJSON, `detour_polyline` as LineString, `additional_distance_meters` computed exactly via the foundational helpers, `commuter_instruction`), `createDetour` POST, success toast + query invalidation; on failure keep the editor open + toast the reason (FR-007/018; SC-001)
- [x] T017 [US1] Render committed Detours on the map: add kind `"detour"` layer handling in `apps/admin/src/features/routes/map/RouteLines.tsx` (+ `apps/admin/src/features/detours/DetourLayer.tsx` if cleaner), distinct dash/color tokens in `apps/admin/src/features/routes/map/constants.ts` (signal amber reserved; DESIGN.md), composed path = base minus replaced segment plus loop; entry/exit/loop visible after reload (FR-012/020; SC-002/004/013)

**Checkpoint**: At this point, User Story 1 is fully functional and testable independently (MVP).

---

## Phase 4: User Story 2 - Describe the detour precisely (Priority: P2)

**Goal**: The Detour gains its identity and rider-facing content — auto label, required commuter instruction, optional driver instruction, exact additional distance, and notable stops (existing Stops only).

**Independent Test** (spec US2): Open an existing (or freshly drawn) Detour editor, fill in/change label, commuter instruction, driver instruction, and notable-stop marking, save, confirm every value persists unchanged after reload (SC-005/006).

### Tests for User Story 2 (write FIRST — red)

- [x] T018 [P] [US2] Write RED admin unit tests in `apps/admin/src/tests/detour-describe.test.ts`: auto-label sequence ("Detour 1", "Detour 2", … in creation order within the Direction), required-field gate (label / commuter instruction missing → blocked, message names the missing field), additional-distance exactness + recompute on loop change (loop length − replaced base segment, ≥ 0) — run `pnpm --filter admin test`, confirm FAIL before implementation

### Implementation for User Story 2

- [x] T019 [US2] Auto-generate the default label in creation order within the Direction in `apps/admin/src/features/detours/DetourEditor.tsx` (count of existing detours + 1); editable; non-empty enforced at save (FR-008; US2 AC1/2)
- [x] T020 [US2] Add instruction fields to the editor: `commuter_instruction` required with a blocking message naming the missing field; `driver_instruction` optional (FR-009; US2 AC2)
- [x] T021 [US2] Display exact additional distance: `polylineDistanceMeters(loop) − polylineSegmentLength(base, entry.index, exit.index)`, read-only, recomputed on every loop redraw, ≥ 0, never hand-entered or rounded (FR-011/022; SC-005; US2 AC3/4)
- [x] T022 [US2] Build `apps/admin/src/features/detours/NotableStopPicker.tsx`: candidates = existing Stops of the owning Route's Directions, filtered by name search + ranked "near the loop" section (nearest by `coordsDistanceMeters`); add/remove; explicit **detour-only** flag default off; NO stop creation anywhere (FR-010; SC-006; clarification Q1)
- [x] T023 [US2] Persist everything atomically (label, both instructions, notable stops with flags, additional distance) in the single save; reload returns identical values (US2 AC6)

**Checkpoint**: User Stories 1 AND 2 both work independently.

---

## Phase 5: User Story 3 - Manage a direction's detours (Priority: P2)

**Goal**: Every Detour of the Direction is visible in one nested place; open into the editor, edit/re-plot, soft-remove, toggle active — without leaving the workspace; multiple Detours stay visually distinguishable.

**Independent Test** (spec US3): List the Detours of a Direction, open one in the editor, change its loop or text, save, and soft-delete another with a styled confirm — testable with two saved Detours alone (SC-008).

### Implementation for User Story 3

- [x] T024 [US3] Build `apps/admin/src/features/detours/DetourList.tsx`: nested **Detours** section under the Direction in the right property panel (labels + active state), fed by `useDetoursQuery`; includes loading / empty ("No detours yet") / error-with-retry states (FR-013/018; US3 AC1)
- [x] T025 [US3] Open a saved Detour into the editor prefilled: `listDetours` payload → store edit mode (entry, exit, loop, instructions, notable stops) with the base path shown as reference again (FR-013; US3 AC2)
- [x] T026 [US3] Implement edit-save: `updateDetour` PUT with changed loop or text (send only changed fields, patch semantics), single atomic action, invalidation, reload shows the updated Detour (US3 AC3; contract `contracts/admin-detours-api.md`)
- [x] T027 [US3] Soft remove: styled confirm (AlertDialog, matching workspace patterns) → `softDeleteDetour` → Detour disappears from map + list; other Detours unaffected; NO hard delete (FR-014; SC-008; US3 AC4)
- [x] T028 [US3] Active toggle in the list: `updateDetour(detourId, { is_active })` from the toggle, `is_active` sent ONLY here (never from the editor) (US3 AC1; research R10)
- [x] T029 [P] [US3] Per-Detour visual distinctness: palette cycling so multiple loops differ from each other AND from the base path, legible when overlapping/crossing; selection never conveyed by color alone (US3 AC5; FR-012; SC-004)

**Checkpoint**: All user stories so far independently functional.

---

## Phase 6: User Story 4 - Fix mistakes and keep work safe (Priority: P3)

**Goal**: Undo/Redo across every plot/edit action; unfinished Detours kept as 24h client drafts and offered on return; concurrent-save conflicts surfaced without losing local work.

**Independent Test** (spec US4): Undo and redo Detour-plotting steps (entry, exit, loop draw, text), confirm an unfinished Detour is offered for restore after navigating away, and see a clear message on a simulated save conflict (SC-007/011).

### Tests for User Story 4 (write FIRST — red)

- [x] T030 [P] [US4] Write RED admin unit tests in `apps/admin/src/tests/detour-draft.test.ts`: serialize → restore round-trip, 24h TTL expiry, key namespace `komyuter.draft.{routeId}.{directionId}.detours` (no collision with the base draft), `mode: new` vs `mode: edit` restoration — run `pnpm --filter admin test`, confirm FAIL before implementation

### Implementation for User Story 4

- [x] T031 [US4] Undo/Redo in `detourStore` (reuse the `plottingHistory` pattern from `apps/admin/src/lib/plottingStore.ts`): history entries for entry-placed, exit-placed, waypoint add/remove, loop drawn, field edited, notable-stop toggle; hotkeys + toolbar parity with the base editor (FR-015; SC-007)
- [x] T032 [US4] Implement `apps/admin/src/lib/detourDraft.ts`: `DetourDraftPayload` serialize/validate/restore with the namespaced key + 24h TTL (same expiry policy as `apps/admin/src/lib/draft.ts`); store writes persisted debounced; makes T030 green (FR-016)
- [ ] T033 [US4] Leave warning + restore-offer: warn before navigating away with unsaved changes; on return show the restore banner (Accept → reseed store; Dismiss → clear) — integrate in `apps/admin/src/features/routes/workspace/RouteWorkspaceProvider.tsx` alongside the existing draft flow (FR-016; SC-007; US4 AC2)
- [ ] T034 [US4] Conflict surface: map save 409/ApiError onto the existing conflict notice plate + "load latest" reseed; local work retained on dismiss (reuse the existing conflict handling in `apps/admin/src/features/routes/workspace/RouteWorkspaceProvider.tsx`); no new server versioning (documented in data-model.md) (FR-017; SC-011; US4 AC3)

**Checkpoint**: All four user stories independently functional.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Regression guards and quality gates affecting multiple stories.

- [x] T035 [P] FR-019/SC-012 guard: audit every Detour surface for travel-time estimate text (durations, ETA) — NONE permitted, distances only (ADR-0009)
- [x] T036 [P] FR-020/SC-013 guard: audit all detour GeoJSON construction (entry, exit, loop, export path) for `[lng, lat]` order; a swapped "ocean" point is release-blocking (ADR-0013)
- [x] T037 [P] FR-021/WCAG AA: keyboard-operability + contrast/focus-visibility pass on `DetourEditor`, `DetourList`, `NotableStopPicker`; shortcuts complement, never replace, visible controls
- [x] T038 [P] FR-018 audit: loading/empty/error states + retry paths verified for both list and editor across simulated failures
- [x] T039 Run the full quality-gate battery + quickstart.md scenarios 1–5 end-to-end: `pnpm lint && pnpm typecheck && pnpm format:check && pnpm --filter server typecheck && pnpm --filter server test && pnpm --filter admin test`
- [x] T040 Close out the feature: re-validate `specs/012-alternative-route-plotting/checklists/requirements.md` against the implemented spec, record completion, and note the deferred items (ADR-0012 activation triggers, restriction editor, per-row detour versioning)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories (FR-023 server gate, coordinate math, typed API clients are used by every story)
- **User Stories (Phase 3-6)**: All depend on Foundational completion; then prioritize P1 → P2 → P3 (sequential delivery) or run stories in parallel when staffed (see Parallel Opportunities)
- **Polish (Phase 7)**: Depends on all desired user stories being complete

### User Story Dependencies

- **User Story 1 (P1)**: No story dependencies — the MVP
- **User Story 2 (P2)**: Builds on US1's editor surface and save pipeline (adds fields/picker/distance to the same DetourEditor) — independently testable once US1 exists
- **User Story 3 (P2)**: Needs saved Detours (US1) and the list/editor plumbing; independent of US2's content fields (list shows label + active state only)
- **User Story 4 (P3)**: Extends the US1 planning store (history) and persists an already-existing editor (draft/conflict); independent of US2/US3 content surfaces

### Within Each User Story

- Tests (where included) MUST be written and FAIL before implementation (red-first)
- Pure helpers before store; store before UI; UI before wiring to server mutations
- Story complete (checkpoint passes) before moving to next priority

### Parallel Opportunities

- Phase 2: T003/T004/T005 (three red-test tracks) then T006/T007/T008/T009/T010 all `[P]` — server, coords, and API-client work touch disjoint files
- Phase 3: T012-T017 share the store/editor so run sequentially inside the story, EXCEPT T011 (store tests) which can start before T013
- Phase 4: T019/T020/T021 mostly disjoint from T022 (picker) — parallelizable after T018
- Phase 5: T024-T027/T028 sequential (list → open → edit/remove), T029 `[P]` map-layers work in parallel
- Phase 6: T031 (history) and T032 (draft serialization) disjoint files — parallel after T030
- Phase 7: All `[P]` audit tasks run in parallel; T039 is the integration gate

---

## Parallel Example: User Story 1

```bash
# Launch the red store tests before implementation:
Task: "T011 RED admin unit tests for the detour planning store in apps/admin/src/tests/detour-store.test.ts"

# Once T011 is red, implement the store, then the UI surface:
Task: "T013 detour planning store in apps/admin/src/features/detours/detourStore.ts"
Task: "T014 DetourEditor in apps/admin/src/features/detours/DetourEditor.tsx"
# …then loop drawing (T015), save pipeline (T016), map rendering (T017)
```

```bash
# Foundational parallel track (after Setup):
Task: "T003 RED server unit tests — assertDetourLoopEndpoints (validation.test.ts)"
Task: "T005 RED admin unit tests — projectPointOnPolyline/polylineSegmentLength (coords.test.ts)"
# each followed by its implementation:
Task: "T006 assertDetourLoopEndpoints in apps/server/src/domain/validation.ts"
Task: "T008 projection helpers in apps/admin/src/lib/coords.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (scaffold + env verification)
2. Complete Phase 2: Foundational (CRITICAL — FR-023 server gate + `projectPointOnPolyline` + API clients block everything)
3. Complete Phase 3: User Story 1 (entry/exit snap, road-followed loop, atomic save, distinct rendering, reload survival)
4. **STOP and VALIDATE**: run T039's quality gates + quickstart scenario 1; demo the MVP (matches spec SC-009 "Create a nested detour")

### Incremental Delivery

1. Setup + Foundational → foundation ready
2. User Story 1 → test independently → demo (MVP: plot + save + reload)
3. User Story 2 → test independently → demo (label, instructions, exact distance, notable stops)
4. User Story 3 → test independently → demo (list, edit, soft remove, multi-detour distinctness)
5. User Story 4 → test independently → demo (undo/redo, 24h draft restore, conflict plate)
6. Phase 7 polish + full validation; each story adds value without breaking previous ones

### Parallel Team Strategy (if staffed)

1. Team completes Setup + Foundational together (server track vs admin track split on T003/T005)
2. Once Foundational is done: Developer A = US1; Developer B = US3 (list/remove needs saved detours — pair with UI fixtures); Developer C = US2 content fields; Developer D = US4 safety behaviors
3. Stories integrate at each checkpoint (US2/US3/US4 all land on the same `DetourEditor`/`detourStore`, so merge conflicts are expected on those two files — keep strategies explicit)

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to a specific user story for traceability
- No new server endpoints, no schema changes, no `packages/shared` edits (clarified scope Q2; constitution III)
- All server work is TDD red-first against `apps/server/tests/`; admin pure-logic tests are red-first against `apps/admin/src/tests/`
- Geometry is `[lng, lat]` everywhere; `::geography` casts only if SQL distance math is ever added (this feature adds none — research R4)
- Commit after each task or logical group; conventional commits (`feat(admin): …`, `feat(server): …`, `test(server): …`)
- Stop at any checkpoint to validate the story independently
- Avoid: vague tasks, same-file conflicts, cross-story dependencies that break independence
