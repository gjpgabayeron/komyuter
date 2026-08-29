---
description: "Task list for route workspace quality of life"
---

# Tasks: Route Workspace Quality of Life

**Input**: Design documents from `/specs/013-route-workspace-qol/` — plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md

**Prerequisites**: plan.md (required), spec.md (user stories), research.md, data-model.md, contracts/

**Tests**: Guardrail tests ARE included (labels/colors source-audit, format, detour-store) — the contracts in `contracts/` commit to them as the SC-004/SC-007 enforcement mechanism (see research R2/R5, quickstart.md static gates). No server changes; `pnpm --filter server test` must stay green and is not modified.

**Organization**: Tasks are grouped by user story so each story can be implemented and tested independently.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1…US6) — Setup / Foundational / Polish phases carry no story label
- Include exact file paths in descriptions
- Paths are relative to repo root; all work is inside `apps/admin/src/`

## Path Conventions

- **Web app**: `apps/admin/src/` (features in `features/routes/`, `features/detours/`; shared UI in `components/shared/`; pure logic in `lib/`; tests in `src/tests/`)
- Design docs referenced live under `specs/013-route-workspace-qol/` (`contracts/ui-labels.md`, `contracts/ui-colors.md`, `contracts/ui-patterns.md`, `quickstart.md`)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: This is a standardization pass over an existing app — no scaffolding. Establish the green baseline and confirm the constraint of zero new dependencies (research R7).

- [x] T001 Run the repo gates to establish a green baseline (must not regress from here): `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm --filter admin test`; record results in the PR/commit message
- [x] T002 [P] Confirm zero new dependencies and Tailwind v4 `@theme` availability: verify `apps/admin/package.json` (no adds) and `apps/admin/src/index.css` (token utilities usable), per plan R7 / research.md

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The canonical arbiter module both US1 (save copy) and US2 (labels) consume. **âÅ¡Â Ã¯Â¸Â CRITICAL**: no user-story work may begin before T003/T004 are complete.

- [x] T003 Create `apps/admin/src/lib/labels.ts` — typed `LabelKey` union + `LABELS` registry seeded per `contracts/ui-labels.md` (`routeCode`, `shortName`, `color: "Color"`, `stops`, `sectionStops`, `detours: "Alternative routes"`, `lastUpdated`, `additionalDistance`, `commuterInstruction`, `driverInstruction`, `notableStops`, `searchStops`, `searchRoutes`) + `label(key)` helper + `SAVE_COPY` (`save.idle "Save changes"`, `save.saving "Saving…"`, `save.saved "Saved just now"`) + `conflict.*` keys (one shared wording for base and detour conflicts, FR-003)
- [x] T004 [P] Create `apps/admin/src/tests/labels.test.ts` — guardrail: every `LabelKey` the UI uses resolves, and no two keys map to the same string (enforces SC-004/FR-005); also assert the three `SAVE_COPY` strings are distinct

**Checkpoint**: Foundation ready — US1 and US2 can now be implemented.

---

## Phase 3: User Story 1 - Know exactly how to save, and what the workspace is doing (Priority: P1) Ã°Å¸Å½Â¯ MVP

**Goal**: Base-route edits and Detour edits present the same primary save control (same label and placement rule), same in-flight/success/conflict feedback, and `mod+s` is never silently ignored (FR-001…004).

**Independent Test**: Open a Direction in the base editor and a Detour; compare save control, label, in-flight/done feedback, and conflict recovery (spec US1 + quickstart rows 1 and 6); unit: `labels.test.ts` `SAVE_COPY` distinctness.

### Implementation for User Story 1

- [x] T005 [P] [US1] Create `apps/admin/src/components/shared/SaveButton.tsx` — one save affordance component: props for idle/saving state, label/text from `SAVE_COPY` in `apps/admin/src/lib/labels.ts`, disabled while in-flight, `aria-label` fallback
- [x] T006 [US1] Adopt `SaveButton` for the base editor's save control in `apps/admin/src/features/routes/workspace/RouteWorkspace.tsx` (icon-only button at ~:203-218): keep placement in the page chrome row, add the visible "Save changes" label, never two save-looking controls visible
- [x] T007 [P] [US1] Source the status plate copy in `apps/admin/src/features/routes/StatusBar.tsx` from `SAVE_COPY` (`Saving…` in-flight, `Saved just now` for the existing ~4 s success plate); both editors render through it
- [x] T008 [P] [US1] Detour editor in `apps/admin/src/features/detours/DetourGroup.tsx`: replace the "Save detour"/"Save changes" button with the shared `SaveButton` + `SAVE_COPY`, and route its conflict path through the shared conflict notice + `LoadLatestDialog` using `conflict.*` copy (FR-003)
- [x] T009 [US1] Correct the stale docstring in `apps/admin/src/features/routes/workspace/PlotActionBar.tsx` that claims the bar hosts the Save control (FR-014/US6#3 — status text must match existing controls)
- [x] T010 [US1] Bind `mod+s` in the Detour editor: `apps/admin/src/features/routes/workspace/RouteWorkspaceProvider.tsx` — remove the silent-disable path and comment (current ~:80-84); while the Detour editor is active, `mod+s` triggers the same detour save gate as the visible `SaveButton` (FR-004); base editor keeps its binding; focus mode stays a visible no-op
- [x] T011 [US1] Extend hotkey/dialog interception in `apps/admin/src/features/routes/workspace/RouteWorkspace.tsx` — generalize the existing Esc DOM-probe pattern (~:70-73) so any open dialog keeps focus and no shortcut reaches the underlying editor (US4 acceptance 5); depends on T006 (same file)

**Checkpoint**: US1 fully functional — one save model across both editors, independently testable (quickstart rows 1, 6).

---

## Phase 4: User Story 2 - One vocabulary, one label style (Priority: P1)

**Goal**: Every field label resolves through `labels.ts`; "Colour"â” ’"Color"; sections use `SectionLabel` and fields one `Label` size; counts use one badge style (FR-005…007).

**Independent Test**: Open new-route dialog, route properties, stops editor, and Detour properties; compare shared-field labels, heading/label styles, and count renderings (spec US2 + quickstart row 2).

### Implementation for User Story 2

- [x] T012 [P] [US2] `apps/admin/src/features/routes/properties/RouteGroup.tsx`: read labels via `label(key)` (Route code :79, Color :92 — fixes the "Colour" drift) and fix the validation copy "Not a valid color…" (:125) to canonical wording
- [x] T013 [P] [US2] `apps/admin/src/features/routes/dialogs/NewRouteDialog.tsx`: replace "Colour" (:123) and other field literals with `label(key)`
- [x] T014 [P] [US2] `apps/admin/src/features/routes/RouteList.tsx`: render section headings (stops sidebar, "Stops along this route") via the workspace `SectionLabel` component and registry strings — one heading style (FR-006)
- [x] T015 [P] [US2] `apps/admin/src/features/detours/DetourList.tsx` and `apps/admin/src/features/detours/DetourSidebar.tsx`: "Alternative routes" heading/labels via registry (canonical `detours` key; FR-019 keeps "Detour" as the entity term per CONTEXT.md)
- [x] T016 [P] [US2] `apps/admin/src/features/routes/properties/FocusPlate.tsx` and `apps/admin/src/features/routes/properties/StopGroup.tsx`: adopt `label(key)` and the single field-label style
- [x] T017 [US2] Sweep remaining surfaces for literal labels and the second heading size: `apps/admin/src/features/routes/properties/ConnectionSelect.tsx`, `apps/admin/src/features/routes/properties/StopEditor.tsx`, `apps/admin/src/features/routes/StatusBar.tsx`, `apps/admin/src/features/detours/DetourGroup.tsx` — sections â” ’ `SectionLabel`, fields â” ’ one `Label` size, search/placeholder wording per `searchStops`/`searchRoutes`

**Checkpoint**: US2 complete — vocabulary canonical and visually uniform (quickstart row 2 + `labels.test.ts`).

---

## Phase 5: User Story 3 - One set of list and panel states (Priority: P2)

**Goal**: One `loading | empty(action?) | error(onRetry) | loaded` treatment in every list/panel; absent values read "Not set", zeros read `0` (FR-008/009).

**Independent Test**: Trigger loading, empty, and load-failure in route list, stops sidebar, Detour list, and properties panel; verify identical treatment and that absent fields say "Not set" (spec US3 + quickstart rows 3-4).

### Implementation for User Story 3

- [x] T018 [P] [US3] Create `apps/admin/src/tests/format.test.ts` — `displayValue` cases: `null`/`undefined` â” ’ "Not set", `0` â” ’ `"0"`, strings/numbers pass through (guardrail for FR-009)
- [x] T019 [P] [US3] Add `displayValue(value)` to `apps/admin/src/lib/format.ts` (existing formatter home — shared, never reimplemented) per `contracts/ui-patterns.md` Ã‚Â§2
- [x] T020 [P] [US3] Create `apps/admin/src/components/shared/PanelState.tsx` — one component for `loading` (standard skeleton), `empty` (standard copy + optional action), `error` (standard wording + `onRetry`), `loaded` (children)
- [x] T021 [P] [US3] Adopt `PanelState` for the stops sidebar in `apps/admin/src/features/routes/RouteList.tsx` (replace the current `Skeleton` variant; empty â” ’ standard + meaningful action when one exists)
- [x] T022 [P] [US3] Adopt `PanelState` in `apps/admin/src/features/detours/DetourList.tsx` (explicit states â” ’ shared component; empty state action: "Add alternative route" when a Direction has no Detours)
- [x] T023 [P] [US3] Replace "—" fallbacks with `displayValue`/"Not set" in `apps/admin/src/features/routes/properties/FocusPlate.tsx` and `apps/admin/src/features/routes/properties/RouteGroup.tsx` (never a bare dash that doubles as loading)

**Checkpoint**: US3 complete — panel states uniform, absence vs loading distinguishable (quickstart rows 3-4).

---

## Phase 6: User Story 4 - Same interactions for the same kind of content (Priority: P2)

**Goal**: Detour stops reorder by drag and ArrowUp/ArrowDown exactly like base stops; keyboard shortcuts act on the active editor and are never silently ignored (FR-010/011).

**Independent Test**: Focus a Detour, drag and ArrowUp/ArrowDown its stops; repeat on base stops; compare. Press `mod+s` in base, Detour, and focus mode; observe consistent behavior (spec US4 + quickstart rows 5-6). `mod+s` wiring itself is US1 (T010).

### Implementation for User Story 4

- [x] T024 [P] [US4] Add reorder actions to `apps/admin/src/features/detours/detourStore.ts` — `moveDetourStop(index, direction)` and a drag-completion handler with the same semantics as base `moveStop`/drag reorder (`apps/admin/src/features/routes/RouteList.tsx:374-418` pattern); history via the existing detour history stack (cap 50)
- [x] T025 [P] [US4] Extend `apps/admin/src/tests/detour-store.test.ts` — reorder parity cases (move up/down, drag completion, history push/undo, index bounds) mirroring the base-store tests
- [x] T026 [US4] `apps/admin/src/features/detours/DetourStopGroup.tsx` (and its list rows in `DetourSidebar.tsx`): ArrowUp/ArrowDown + drag handle wired to the T024 actions; identical list-and-map result to base stops; depends on T024
- [x] T027 [US4] Keyboard parity sweep: verify detour-row focus/arrow behavior matches base rows, no keyboard trap, `esc` steps detour editor â” ’ route editor â” ’ focus as documented (FR-016, `contracts/ui-patterns.md` Ã‚Â§4)

**Checkpoint**: US4 complete — interaction parity everywhere (quickstart row 5).

---

## Phase 7: User Story 5 - One color source, no near-miss shades (Priority: P2)

**Goal**: Every fixed semantic color defined exactly once in `lib/colors.ts` and consumed — no raw hex or amber class strings; selection never color-alone (FR-012/013).

**Independent Test**: Render surfaces sharing a semantic color side by side and compare; identify a selected item with color muted (spec US5 + quickstart row 7 + `colors.test.ts` source audit green).

### Tests for User Story 5 âÅ¡Â Ã¯Â¸Â

> **NOTE: write this test FIRST — it must FAIL while duplications exist, then go GREEN as T029…T036 land.**

- [x] T028 [P] [US5] Create `apps/admin/src/tests/colors.test.ts` — source-audit test: walk `apps/admin/src`, fail on any raw `#1B6DB2`, `#0F172A`, or hardcoded `amber-600|700` string outside `apps/admin/src/lib/colors.ts` and its sanctioned export files (guardrail for SC-007, `contracts/ui-colors.md` Ã‚Â§1)

### Implementation for User Story 5

- [x] T029 [P] [US5] Create `apps/admin/src/lib/colors.ts` — `SEMANTIC_COLORS` registry (`activeRoute` `#1B6DB2`, `previewLine` `#FF5C00`, `attentionAmber` `#D97706`, `nodeInk` `#0F172A`, `detourColors` Ãƒ—4, `stopColors` Ãƒ—3) + `semanticColor(key)` helper; record the confirmed OKLCH equivalents in DESIGN.md frontmatter (DESIGN.md wins on visual values — `contracts/ui-colors.md`)
- [x] T030 [P] [US5] Re-home line tokens: `apps/admin/src/features/routes/map/constants.ts` re-exports `DRAFT_LINE`/`PREVIEW_LINE`/`DETOUR_COLORS`/`DETOUR_DRAFT_COLOR`+`detourColorFor` from `apps/admin/src/lib/colors.ts` (map-only constants stay); `apps/admin/src/lib/stopShapes.ts` imports `stopColors` (drop local hex)
- [x] T031 [P] [US5] Migrate the loop-badge hex in `apps/admin/src/features/routes/RouteList.tsx` (~:308,344) to `semanticColor("activeRoute")`
- [x] T032 [P] [US5] Migrate raw hex in `apps/admin/src/features/routes/RouteMap.tsx` (~:289,404,463 labels; ~:339,344 split/merge nodes) to tokens — leave the merge-marker interactivity decision to US6 (T039)
- [x] T033 [P] [US5] Migrate coalesce-default hex in `apps/admin/src/features/routes/RouteOverviewLayer.tsx` (~:137,142,281,293,333,460,541) to tokens
- [x] T034 [P] [US5] Migrate `apps/admin/src/lib/plottingStore.ts` (~~:152 initial meta color) and `apps/admin/src/features/routes/routeColors.ts` (`DEFAULT_ROUTE_COLOR` â” ’ `activeRoute`); fix the "HSL colour" comment (~~:24)
- [x] T035 [P] [US5] Amber class migration: declare token-backed utilities (e.g. `@theme` `--color-attentionAmber`) in `apps/admin/src/index.css`, then replace `amber-500/600/700/50` strings in `apps/admin/src/features/detours/DetourGroup.tsx` (~~:335,451), `apps/admin/src/features/routes/StatusBar.tsx` (~~:72,81), `apps/admin/src/features/routes/dialogs/NewRouteDialog.tsx` (~:163) — no class string re-encodes a hex (`contracts/ui-colors.md` Ã‚Â§2)
- [x] T036 [US5] Migrate literal-hex assertions in `apps/admin/src/tests/routeColors.test.ts` and `apps/admin/src/tests/overviewCache.test.ts` to registry values; `pnpm --filter admin test` must be fully green including the T028 source audit
- [x] T037 [US5] FR-013 audit: on every marker/label touched by this feature, selection/active state is confirmed by shape, border, or halo in addition to color (extend the existing `StopShape` shape+color convention)

**Checkpoint**: US5 complete — one color source, audit test green (quickstart row 7).

---

## Phase 8: User Story 6 - No dead or confusing controls; one confirmation pattern (Priority: P3)

**Goal**: Nothing looks clickable and does nothing; the "Import" control stays visibly disabled with a "Coming soon" reason; all five confirmations share one `ConfirmDialog` pattern (FR-014/015).

**Independent Test**: Inspect every marker/control for interactivity; open delete-stop, delete-Detour, delete-route, leave-with-unsaved, and save-conflict dialogs and compare structure (spec US6 + quickstart rows 8-9).

### Implementation for User Story 6

- [x] T038 [P] [US6] `apps/admin/src/features/routes/workspace/EmptyState.tsx`: keep the "Import" control, render it visibly disabled with the short reason "Coming soon" (per clarification 2026-08-29 — retained, never removed, never active-looking; `aria-disabled` for screen readers)
- [x] T039 [P] [US6] `apps/admin/src/features/routes/RouteMap.tsx`: resolve the dead Merge-icon marker (~~:504-508) — remove it or render it visibly non-interactive (FR-014, spec US6 acceptance 1); remove the "Pasted #42" spec-internal comment (~~:117)
- [x] T040 [P] [US6] Remove spec-internal comments "Pasted #43/#44" and "Pasted #34" in `apps/admin/src/features/routes/dialogs/NewRouteDialog.tsx` (~~:70) and `apps/admin/src/features/routes/RouteList.tsx` (~~:474-477)
- [x] T041 [P] [US6] `apps/admin/src/features/detours/DetourList.tsx`: render list counts in the same badge style as base surfaces (replace bare count spans ~:82-84 — spec US2 acceptance 3, FR-007)
- [x] T042 [P] [US6] Keep `apps/admin/src/lib/uiStore.ts` — grep confirmed LIVE consumers (`AppShell.tsx`, `NavRail.tsx` sidebar mode); not dead code, no removal
- [x] T043 [P] [US6] Create `apps/admin/src/components/shared/ConfirmDialog.tsx` — one AlertDialog-based shell: `title`, `message`, `confirmLabel`, `destructive?`, `onConfirm`, `onCancel`; identical Esc/focus-trap behavior in all uses (`contracts/ui-patterns.md` Ã‚Â§3)
- [x] T044 [P] [US6] Adopt `ConfirmDialog` in `apps/admin/src/features/routes/dialogs/LeaveConfirmDialog.tsx` (leave-with-unsaved; non-destructive variant)
- [x] T045 [P] [US6] Adopt `ConfirmDialog` (destructive) for the stop-delete dialog in `apps/admin/src/features/routes/properties/StopGroup.tsx` (~:57-76)
- [x] T046 [P] [US6] Adopt `ConfirmDialog` (destructive) for the route-delete dialog in `apps/admin/src/features/routes/RouteList.tsx` (~:668-675)
- [x] T047 [P] [US6] No detour-DELETE control exists in the current build (detour lifecycle = Active switch soft-deactivation; no destructive delete). Adding one is a new capability outside this QoL scope — `ConfirmDialog` is already adopted by ALL FOUR existing confirmation points (route delete, stop delete, leave-with-unsaved, save-conflict)
- [x] T048 [P] [US6] Adopt `ConfirmDialog` (non-destructive) for save-conflict recovery in `apps/admin/src/features/routes/dialogs/LoadLatestDialog.tsx` — same structural pattern as the rest (spec US6 acceptance 5)

**Checkpoint**: US6 complete — no dead affordances, one confirmation pattern (quickstart rows 8-9).

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: Repo-wide verification and final hygiene across all stories.

- [x] T049 Run all static gates: `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm --filter admin test`; also `pnpm --filter server test` (unchanged suite — requires the local Supabase stack + `apps/server/.env`; report if the stack is unavailable)
- [x] T050 Execute the full reviewer protocol in `specs/013-route-workspace-qol/quickstart.md` — rows 1-10 mapping SC-001…SC-010, including the keyboard-only run and the ADR-0013 `[lng, lat]` spot-check (any coordinate-order regression is release-blocking)
- [x] T051 [P] Dev-copy audit sweep across every touched file: no remaining "Colour", no stale docstrings referencing removed/moved controls, no duplicated literal labels or hex values
- [x] T052 Final self-review of the branch diff (`git diff feat/admin-qol`) against the plan: confirm each FR-001…FR-019 has a landing task and the Constitution gates recorded in `specs/013-route-workspace-qol/plan.md` still hold; update the plan's Complexity Tracking section if anything changed

**Checkpoint**: Feature complete — gates green, quickstart protocol passed.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Setup; **BLOCKS US1 and US2** (both consume `labels.ts`); T003/T004 are additive (new files) so do not disturb the baseline
- **User Stories (Phase 3+)**: US1, US3, US4, US5, US6 depend only on Foundational; US2 depends on Foundational (labels.ts) — no story blocks another
- **Polish (Phase 9)**: Depends on all desired stories being complete

### User Story Dependencies

- **US1 (P1)**: Foundational only — no story dependencies
- **US2 (P1)**: Foundational only
- **US3 (P2)**: Foundational only
- **US4 (P2)**: Foundational only (T010 from US1 delivers `mod+s`; do not duplicate)
- **US5 (P2)**: Foundational only
- **US6 (P3)**: Foundational only (T039 reuses the T032-migrated `RouteMap.tsx` tokens)

### Within Each User Story

- Guardrail tests (T018, T025, T028) are written with their implementation (T028 explicitly RED first)
- Registry/helper first (T003, T019, T024, T029, T043), then adoption (all later tasks in the same story)
- Story complete and independently testable before starting the next priority

### Shared-File Coordination (parallel-team warning)

These files are touched by more than one story — if parallel lanes are used, keep the stories below on the **same lane** or sequence them: `RouteList.tsx` (US2/3/5/6), `RouteMap.tsx` (US5/6), `NewRouteDialog.tsx` (US2/5/6), `DetourList.tsx` (US2/3/6), `DetourGroup.tsx` (US1/5), `StatusBar.tsx` (US1/5), `FocusPlate.tsx` (US2/3), `DetourSidebar.tsx` (US2/4). Single-developer sequential execution is the recommended default for this repo.

### Parallel Opportunities

- All Setup/Foundational tasks marked [P] run in parallel (new files only)
- Within a story, [P] tasks touch disjoint files and can run together (e.g., US5 migrations T031-T035, US6 dialog adoptions T044-T048)
- After Foundational, stories are independent — ideal lane splits: {US1, US5} + {US2, US4} + {US3, US6} keeps shared files on one lane each

---

## Parallel Example: User Story 5 (largest surface)

```bash
# Launch all color migrations together (disjoint files):
Task: "T029 Create lib/colors.ts registry"
Task: "T030 Re-home map/constants + stopShapes tokens"
Task: "T031 Migrate RouteList loop badge"
Task: "T032 Migrate RouteMap raw hex"
Task: "T033 Migrate RouteOverviewLayer defaults"
Task: "T034 Migrate plottingStore + routeColors"
Task: "T035 Migrate amber class strings via @theme"
```

## Parallel Example: User Story 6 (dialog adoptions)

```bash
# Launch all ConfirmDialog adoptions together (disjoint files):
Task: "T043 Create shared ConfirmDialog"
Task: "T044 Adopt LeaveConfirmDialog"
Task: "T045 Adopt stop-delete (StopGroup)"
Task: "T046 Adopt route-delete (RouteList)"
Task: "T047 Adopt detour-delete (DetourList/store)"
Task: "T048 Adopt LoadLatestDialog conflict recovery"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (baseline)
2. Complete Phase 2: Foundational (`labels.ts` — CRITICAL, blocks US1/US2)
3. Complete Phase 3: US1 — one save model, one status voice, live `mod+s`
4. **STOP and VALIDATE**: quickstart rows 1 and 6; demo if ready

### Incremental Delivery

1. Setup + Foundational â” ’ foundation ready (P1 stories unlocked)
2. Add US1 â” ’ validate â” ’ demo (MVP)
3. Add US2 â” ’ validate â” ’ demo (both P1 stories shipped)
4. Add US3, US4, US5 (P2, any order) â” ’ validate each independently
5. Add US6 (P3) â” ’ validate â” ’ full quickstart protocol (Phase 9)

### Parallel Team Strategy

1. Team completes Setup + Foundational together
2. Once Foundational is done, split lanes along the shared-file boundaries:
   - Lane A (US1 + US5): save model + color source — `DetourGroup.tsx`, `StatusBar.tsx`, `RouteMap.tsx` stay on one lane
   - Lane B (US2 + US4): vocabulary + interaction parity — `DetourSidebar.tsx` stays on one lane
   - Lane C (US3 + US6): panel states + confirmations — `DetourList.tsx`, `RouteList.tsx` sequential within lane
3. Stories integrate and validate independently; Phase 9 merge-verification

---

## Notes

- [P] tasks = different files, no dependencies; **do not** mark [P] across shared files (see Shared-File Coordination)
- [Story] label maps the task to its spec user story for traceability
- Commit after each task or logical group with conventional commits (`type(scope): description`)
- Verify `pnpm --filter admin test` green after T036; never commit with a red colors-source-audit
- The "Import" control is **retained and disabled** — do not remove or implement it (clarification 2026-08-29, FR-014)
- No ETA anywhere (ADR-0009); `[lng, lat]` preserved (ADR-0013); no server/shared-package/schema changes (spec Assumptions)
- If a capability is named during execution that the plan's Complexity Tracking did not see, stop and record it in `specs/013-route-workspace-qol/plan.md` before adding tasks
