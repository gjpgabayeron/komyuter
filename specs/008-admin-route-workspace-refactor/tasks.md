---
description: "Task list for Admin Route Workspace Refactor"
---

# Tasks: Admin Route Workspace Refactor

**Input**: Design documents from `/specs/008-admin-route-workspace-refactor/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/, quickstart.md

**Tests**: TDD IS requested for pure helpers (spec SC-007 + plan: "tests written first, red before implementation"). Test tasks are included for the pure state-machine/geometry logic in the Foundational phase; UI behavior is validated via the manual quickstart matrix.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **App root**: `apps/admin/src/` — all app paths below are relative to this directory
- **Tests**: `apps/admin/src/tests/` (node env, pure helpers — no WebGL/jsdom mocking)
- **Gates**: `pnpm --filter admin lint` / `typecheck` / `test` / `build` (root ESLint flat config, shared strict tsconfig, vitest)
- Zero new dependencies — all required packages are already in `apps/admin/package.json` (verified in research.md)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Establish a verified baseline so regressions are attributable, and confirm the zero-new-deps decision

- [ ] T001 [P] Run baseline gates on apps/admin — `pnpm --filter admin lint`, `typecheck`, `test`, `build` — and record results (all must pass before any refactor work)
- [ ] T002 [P] Run `detect.mjs` on the current RouteWorkspace files and save the output as the SC-008 baseline oracle (compare against in the Polish phase)
- [ ] T003 Confirm the zero-new-dependencies decision from research.md against apps/admin/package.json and plan.md Technical Context; flag any discrepancy in plan.md

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The pure state machine, geometry tokens, gate, and column shell that EVERY user story mounts into

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [ ] T004 [P] Write FAILING tests for `WORKSPACE_GEOMETRY` tokens, `mapWidth()` formulas (overview/focus), and the gate boundary (399/400/401 px) per contracts/layout-geometry.md §1–2 in apps/admin/src/tests/workspaceGeometry.test.ts (TDD — red first)
- [ ] T005 [P] Write FAILING tests for `deriveUiState()` (all 5 rules) and the `focusedRouteId` lifecycle per contracts/workspace-state-machine.md §2–3 in apps/admin/src/tests/workspaceUiState.test.ts (TDD — red first)
- [ ] T006 Implement `WORKSPACE_GEOMETRY` (gutter 16 / leftCol 240 / rightCol 336 / minMapWidth 400 / minViewport 1024) and pure `mapWidth(viewport, railW, state)` in apps/admin/src/features/routes/workspace/geometry.ts (makes T004 green)
- [ ] T007 Implement `deriveUiState()` selector + `focusedRouteId` field per contracts/workspace-state-machine.md §2–3 in apps/admin/src/lib/plottingStore.ts (makes T005 green)
- [ ] T008 Implement `features/routes/NarrowWindowGate.tsx`: one matchMedia-backed listener; recomputes map width via `mapWidth` (NOT a viewport class); renders the full-screen "wider window" plate when `mapWidth < 400`; must not flash on first paint; sits OUTSIDE `RouteMap` so toggling never touches the GL instance (contracts/layout-geometry.md §2)
- [ ] T009 Implement `features/routes/workspace/WorkspaceColumns.tsx`: three-column shell with fixed tokens (240/336/remainder, 16 px gutters only BETWEEN plates), per-state column mounts, center column = one-hit-target region with no `stopPropagation` on `pointerdown` (contracts/layout-geometry.md §3)
- [ ] T010 Add `prefers-reduced-motion` guard for the veil fade (≤ 120 ms) and framing (≤ 400 ms) in apps/admin/src/index.css; fix `DialogFooter` `rounded-b-xl` → 4 px radius token (critique P3)

**Checkpoint**: Foundation ready — `workspaceUiState.test.ts` and `workspaceGeometry.test.ts` green, gate + shell render; user story implementation can begin

---

## Phase 3: User Story 1 - Browse, inspect, and edit routes on one stable map (Priority: P1) 🎯 MVP

**Goal**: The Route Workspace becomes the state-machine orchestrator: a left column lists routes (click = edit), map-polyline click opens a focus plate (click = inspect), the map never flickers, reloads, or loses its place, and columns never overlap ≥ 1024 px.

**Independent Test**: Open the workspace with seeded routes — browse the list, click a route in the list (edit), click a route on the map (focus plate), close the plate (Esc/X), and confirm the map never reloaded or shifted. No other capability required.

### Implementation for User Story 1

- [ ] T011 [US1] Rewrite `pages/RouteWorkspace.tsx` as the state-machine orchestrator: derive `uiState` from the store, render per-state column sets, delete the overlay-positioning absolutes (`left-3`/`right-3`/`z-*` panels)
- [ ] T012 [US1] Wire `overview→focus` (map polyline click → `focusedRouteId` set; right FocusPlate mounts; route framed ≤ 400 ms) and `focus→overview` (Esc / X / empty-map click; plate unmounts; camera unchanged) in `pages/RouteWorkspace.tsx`
- [ ] T013 [US1] Wire `overview→edit` (route list item click — "list-click = act"), `focus→edit` (Edit CTA), `edit→focus` (Back / Esc), and `edit→overview` (save / discard) in `pages/RouteWorkspace.tsx`
- [ ] T014 [P] [US1] Modify `lib/selection.ts`: map polyline click sets **focus** (metadata plate), not edit
- [ ] T015 [US1] Modify `features/routes/RouteMap.tsx`: GL container = center column; ResizeObserver sizing; camera preserved across the two resize moments (`empty→overview`, `overview→focus`); **never re-initialize the GL instance from any state transition** (plan Invariant 1)
- [ ] T016 [US1] Add polyline hover → route-name plate (mouse-first affordance) in `features/routes/RouteMap.tsx`
- [ ] T017 [US1] Modify `features/routes/RouteList.tsx`: LeftColumn overview variant — list = navigation aid (`<nav>`), item click = edit; internal scroll; never overlays the map
- [ ] T018 [US1] Modify `features/routes/PropertiesPanel.tsx`: add FocusPlate sub-state (route metadata + "Edit route" CTA + close); right column fixed at ONE width 336 px across focus and edit (content swap, no resize — plan Invariant 3)
- [ ] T019 [US1] Fix `features/routes/RouteOverviewLayer.tsx`: overview dim 0.15 → ≥ 0.3 opacity with hover lift; route names remain accessible via the left column + plate (not tooltip-only)
- [ ] T020 [US1] Bump stop label chips to ≥ 11–12 px in `lib/stopShapes.ts` / `features/routes/stopLabels.ts` (AA text legibility)
- [ ] T021 [US1] Run the SC-002 smoke check (manual, quickstart.md §2.2): GL canvas is the same DOM node across all four states; exactly two resize moments; camera preserved

**Checkpoint**: At this point, User Story 1 is fully functional and testable independently (MVP)

---

## Phase 4: User Story 2 - Create the first route from an empty workspace (Priority: P1)

**Goal**: Zero saved routes → calm "fresh board" veil over the warm map canvas with one autofocused create action; creating lifts the veil, mounts editing chrome, and makes stop-adding immediately active.

**Independent Test**: Reach the workspace with zero routes, see the veil + autofocused create action, create a route, and immediately place stops — no other capability required.

### Implementation for User Story 2

- [ ] T022 [US2] Rework `features/routes/EmptyState.tsx`: full-screen white veil over the warm canvas (Route Sign "fresh board"); CTA autofocused; subtle `backdrop-filter` blur only behind `@supports` with white-tint fallback; clarify the disabled Import JSON affordance (text + CTA per plan Phase 3)
- [ ] T023 [US2] Wire `empty→edit` in `pages/RouteWorkspace.tsx`: CTA → New Route dialog → create (Enter or click); veil lifts with NO camera jump; Add-stop immediately active
- [ ] T024 [US2] Wire `*→empty` in `pages/RouteWorkspace.tsx`: deleting the last remaining route (styled confirm) unmounts columns and remounts the veil over the warm canvas

**Checkpoint**: User Stories 1 AND 2 both work independently

---

## Phase 5: User Story 3 - Never lose work: the safety net is preserved (Priority: P1)

**Goal**: Debounced draft auto-save (24 h TTL), draft-restore banner, undo/redo, leave/reload guards, and one-atomic-action save behave **exactly as before** — re-homed, never re-designed (FR-010, FR-012).

**Independent Test**: Create an unsaved draft, leave, return, restore it; undo and redo edits; attempt to leave with unsaved changes and get the styled confirmation; save — comparing each step against the current page's behavior.

> **Note on the status slot**: the final banner host is the StatusBar built in US4 (T029–T030). If US3 is implemented before US4, mount the banner in a provisional slot at the top of the center chrome, then relocate it in T030. Copy stays unchanged either way.

### Implementation for User Story 3

- [ ] T025 [US3] Regression audit: confirm draft (24 h TTL, debounced), undo/redo, `beforeunload` + `pushState` guards, and atomic save are untouched in `lib/plottingStore.ts` + the draft module — NO behavior edits in this story
- [ ] T026 [US3] Re-home `features/routes/DraftRestoreBanner.tsx` into the status slot (provisional host until T030; copy unchanged — quickstart.md §2.4 scenario 1)
- [ ] T027 [US3] Replace every `window.confirm()` (load-latest, leave-navigation, dirty exits) with the styled AlertDialog in `pages/RouteWorkspace.tsx` — the browser's default dialog is never used (FR-007)
- [ ] T028 [US3] Verify the safety-net regression: restore brings the draft back exactly; undo/redo parity; atomic save persists direction + stops together (quickstart.md §2.4)

**Checkpoint**: Full safety-net regression passes on the new layout

---

## Phase 6: User Story 4 - Read workspace mode and save status at a glance (Priority: P2)

**Goal**: A status slot at the top of the editing chrome shows the save lifecycle (unsaved → saving → "Saved just now"); draft-restore and conflict notices share the slot one at a time, never stacking; the current mode is legible from the mounted chrome; POI search is anchored to the column edge, not a magic offset.

**Independent Test**: Make an edit and watch unsaved → saving → saved; force draft-restore and conflict conditions at once and confirm they never overlap; resize the window and confirm the search bar tracks the center column.

### Implementation for User Story 4

- [ ] T029 [US4] Create `features/routes/StatusBar.tsx`: status slot at the top-right of the center chrome (edit only) with the dirty → saving → "Saved just now" lifecycle
- [ ] T030 [US4] Move `DraftRestoreBanner.tsx` into the StatusBar slot; add the conflict notice; single-slot sequencing — draft-restore and conflict NEVER stack (spec US4 scenario 3)
- [ ] T031 [US4] On save complete, frame + highlight the saved route in the left list (`pages/RouteWorkspace.tsx` + `features/routes/RouteList.tsx` — spec US4 scenario 2)
- [ ] T032 [US4] Modify `features/routes/PoiSearchBar.tsx`: anchor to the center-column edge (DELETE the `left-86` magic number — critique P2 / SC-008); cap the results list height with internal scroll; replace the "out of sync" dev copy
- [ ] T033 [US4] Make mode legibility explicit in `features/routes/workspace/WorkspaceColumns.tsx`: overview / focus / edit are distinguishable from the chrome that is mounted

**Checkpoint**: User Stories 1–4 all work independently

---

## Phase 7: User Story 5 - Operate the workspace with keyboard and screen reader (Priority: P2)

**Goal**: Desktop-only does not waive accessibility — named regions announce the route list and properties plate, Esc dismisses/steps back, Ctrl/Cmd+S saves, the empty-state action autofocuses, and every hover affordance has a keyboard equivalent.

**Independent Test**: Complete the whole route-editing workflow using only the keyboard and confirm the two named regions via a screen reader.

### Implementation for User Story 5

- [ ] T034 [US5] Add landmarks: `<nav aria-label="Routes">` in `features/routes/RouteList.tsx`, `<aside aria-label="Route properties">` for the right plate in `features/routes/PropertiesPanel.tsx`, main map region in `pages/RouteWorkspace.tsx` (FR-009)
- [ ] T035 [US5] Focus management in `pages/RouteWorkspace.tsx`: on state transition, focus moves to the newly mounted plate's primary action; verify the full keyboard contract end-to-end — Esc in focus → overview, Esc in dirty edit → styled confirm, Ctrl/Cmd+S saves, CTA autofocus in empty (FR-008)
- [ ] T036 [US5] Add keyboard equivalents for every hover affordance — including keyboard-reachable stop cycling — in `features/routes/RouteList.tsx`, `features/routes/RouteMap.tsx`, `features/routes/PlotActionBar.tsx` (no hover-only traps)
- [ ] T037 [US5] Screen-reader verification pass (quickstart.md §2.6): named regions announced, every core action reachable

**Checkpoint**: User Stories 1–5 all work independently

---

## Phase 8: User Story 6 - Get clear, honest editing feedback (Priority: P3)

**Goal**: Add/Select mode is visibly indicated; invalid color values and empty stop names show inline validation hints instead of silent behavior; all copy is plain operational language.

**Independent Test**: Toggle Add vs Select and see the state; enter an invalid color and an empty stop name and see field-level hints; confirm no developer jargon remains visible.

### Implementation for User Story 6

- [ ] T038 [US6] Show Add/Select mode visibly in `features/routes/PlotActionBar.tsx` — the active mode is indicated, not implied (first-run "zero feedback" fix)
- [ ] T039 [US6] Invalid hex color → inline validation hint in `features/routes/PropertiesPanel.tsx` (no silent ignore — heuristic 5)
- [ ] T040 [US6] Empty stop name → inline hint prompting a name in `features/routes/PropertiesPanel.tsx`
- [ ] T041 [US6] Replace dev jargon copy — "MAPBOX_SECRET_TOKEN", "out of sync" — with plain operational language in `pages/RouteWorkspace.tsx` (and `features/routes/PoiSearchBar.tsx` if any remains after T032) (critique P3, heuristic 2)

**Checkpoint**: All six user stories independently functional

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Gate verification, regression oracle, and value fidelity across all stories

- [ ] T042 [P] Run `pnpm --filter admin lint` and `pnpm format:check` on changed files (root flat ESLint config; prettier semicolons + double quotes)
- [ ] T043 [P] Run `pnpm --filter admin typecheck` (strict, shared `@repo/typescript-config`)
- [ ] T044 [P] Run `pnpm --filter admin test` — all existing admin tests AND the new `workspaceUiState` / `workspaceGeometry` suites green (SC-007)
- [ ] T045 Run `pnpm --filter admin build` (production build passes)
- [ ] T046 Run the full quickstart.md validation matrix SC-001…SC-008 (manual, at 1024/1440/1920 px + rail expanded)
- [ ] T047 Run `detect.mjs` on the refactored files and diff against the T002 baseline — only the INTENDED findings may flip (layout collisions, rail swallow, banner collision, `left-86`, save status, a11y, copy, `window.confirm`); any new finding is a failure (SC-008)
- [ ] T048 Value fidelity check: stop names, colors, and distances render identically to the pre-refactor page (spec Edge Cases — nothing displayed changes meaning)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup — **BLOCKS all user stories** (state machine + geometry + gate + shell)
- **User Stories (Phase 3+)**: All depend on Foundational completion
  - US1 → US2 → US3 → US4 → US5 → US6 sequential order (single developer); parallel if staffed (see below)
- **Polish (Final Phase)**: Depends on all user stories complete

### User Story Dependencies

- **US1 (P1)**: After Foundational — no dependencies on other stories
- **US2 (P1)**: After US1 (rewrites the same `pages/RouteWorkspace.tsx` orchestrator)
- **US3 (P1)**: After US1 (needs the new chrome); T026's final host is US4's StatusBar (provisional slot until T030)
- **US4 (P2)**: After US1 (chrome mounts in edit) + US3 (banner exists to relocate); T030 depends on T029
- **US5 (P2)**: After US1 (components exist to landmark); T036 touches `PlotActionBar.tsx` again in US6 (sequential)
- **US6 (P3)**: After US1 + US4 (PropertiesPanel exists; PoiSearchBar copy interacts with T032)

### Within Each User Story

- Pure tests (T004/T005) MUST be written and FAIL before implementation (T006/T007)
- Core implementation before integration (orchestrator → transitions → content)
- Story complete (checkpoint passed) before moving to the next priority

### Parallel Opportunities

- All Setup tasks marked [P] can run in parallel (T001, T002, T003)
- Foundational: T004 + T005 (both red-test files, different files) in parallel; then T006 + T007 in parallel; then T008 + T009 + T010
- US1: T014 ([P], `lib/selection.ts`) can run in parallel with T011–T013 (`pages/RouteWorkspace.tsx`)
- Same-file tasks are sequential: all `RouteWorkspace.tsx` edits (T011, T012, T013, T023, T024, T027, T031, T035, T041), all `PropertiesPanel.tsx` edits (T018, T039, T040), both `RouteMap.tsx` edits (T015, T016)
- Polish: T042 + T043 + T044 in parallel, then T045, then manual T046–T048

---

## Parallel Example: User Story 1

```bash
# Launch the independent selection change together with the orchestrator rewrite:
Task: "Modify lib/selection.ts: map polyline click sets focus, not edit"            # T014
Task: "Rewrite pages/RouteWorkspace.tsx as the state-machine orchestrator"          # T011

# Map layer work after the orchestrator is stable (RouteMap → RouteOverviewLayer):
Task: "RouteMap.tsx: center-column GL container, ResizeObserver, camera preserved"  # T015
Task: "RouteOverviewLayer.tsx: dim >= 0.3 with hover lift"                          # T019
```

## Parallel Example: Foundational Phase

```bash
# Write both red test files together:
Task: "Failing workspaceGeometry tests (tokens, mapWidth, 399/400/401 gate)"        # T004
Task: "Failing workspaceUiState tests (5 deriveUiState rules, focusedRouteId)"      # T005

# Then implement both pure modules together:
Task: "WORKSPACE_GEOMETRY + mapWidth in features/routes/workspace/geometry.ts"       # T006
Task: "deriveUiState + focusedRouteId in lib/plottingStore.ts"                       # T007
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (baseline gates + detector oracle)
2. Complete Phase 2: Foundational (CRITICAL — blocks all stories)
3. Complete Phase 3: User Story 1 — with seeded routes, the workspace browses/inspects/edits on one stable map
4. **STOP and VALIDATE**: US1 independent test + quickstart §2.1–2.3 (SC-001, SC-002, SC-003)
5. Deploy/demo if ready

### Incremental Delivery

1. Setup + Foundational → foundation ready (pure state machine + gate + shell, tests green)
2. Add US1 → stable map + browse/inspect/edit → validate → demo (MVP!)
3. Add US2 → empty-state entry point → validate
4. Add US3 → safety net re-homed + styled confirms → validate (regression vs current behavior)
5. Add US4 → status lifecycle + banner sequencing + search re-anchor → validate
6. Add US5 → keyboard + screen-reader → validate
7. Add US6 → honest feedback + copy → validate
8. Polish → full gates + quickstart matrix + detector diff (SC-008)

### Parallel Team Strategy

With multiple developers:

1. Team completes Setup + Foundational together
2. Once Foundational is done:
   - Developer A: US1 (T011–T021) — the orchestrator + map
   - Developer B: after US1's T011: US2 empty state (T022) and US3 audit (T025)
   - Developer C: US4 StatusBar (T029–T030) once US1 lands the edit chrome
3. Stories integrate independently; same-file conflicts are avoided by the sequential numbering above

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Verify pure tests fail before implementing (T004/T005 red → T006/T007 green)
- Commit after each task or logical group (conventional commits, commitlint enforced)
- Stop at any checkpoint to validate the story independently
- Avoid: vague tasks, same-file conflicts, cross-story dependencies that break independence (US3→US4 StatusBar noted explicitly)
