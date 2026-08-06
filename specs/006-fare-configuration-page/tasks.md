---
description: "Task list for the Fare Configuration Page feature"
---

# Tasks: Fare Configuration Page

**Input**: Design documents from `/specs/006-fare-configuration-page/`

**Prerequisites**: plan.md (required), spec.md (required for user stories), research.md, data-model.md, contracts/

**Tests**: REQUIRED for this feature — server integration tests FIRST per the repo TDD gate (AGENTS.md); admin unit tests for pure helpers per `contracts/fare-config-page-ui.md`.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- **Admin (SPA)**: `apps/admin/src/` — pages in `pages/`, feature logic in `features/fares/`, generated primitives in `components/ui/`, pure helpers tested in `src/tests/`
- **Server (Fastify)**: `apps/server/src/` + `apps/server/tests/integration/`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: UI primitives the form/dialog/table need, and the query-key factory both data layers use

- [x] T001 [P] Generate the Base UI primitives with the shadcn CLI in `apps/admin` (style `base-nova`, React 18): `pnpm dlx shadcn@latest add dialog alert-dialog switch table` — creates `apps/admin/src/components/ui/dialog.tsx`, `alert-dialog.tsx`, `switch.tsx`, `table.tsx`
- [x] T002 [P] Create the query key factory in `apps/admin/src/lib/queryKeys.ts` exporting `fareConfigKeys = { all: ["fare-configs"] as const }` (pattern per ADMIN.md §10.1)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The two server extensions (guarded by tests written FIRST) and the admin data layer (api module + react-query hooks) — everything the four user stories consume.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

### Server (TDD — tests FIRST, red before green)

- [x] T003 [P] Write the 8 FAILING integration tests in `apps/server/tests/integration/crud.test.ts` (reuse `helpers.ts` + `buildApp` + `auth()` + route-seeding pattern from the existing fare-configs coverage): (1) DELETE → `409 CONFLICT` when an active Route references the config, config stays active; (2) DELETE → `200` deactivated when only an inactive Route references it; (3) DELETE the sole default → `409` (regression); (4) GET list → `active_route_count` is 0 / 0 / 1 for unreferenced / inactive-referenced / active-referenced; (5) PUT `{ is_active: false }` on the default config → `409`, unchanged; (6) PUT `{ is_active: false, is_default: true }` on a non-default → `409`, unchanged; (7) PUT `{ is_default: true }` on an already-inactive config → `409` (FR-015 review finding); (8) PUT `{ is_active: false, is_default: false }` on the sole default → `409` (FR-005 review finding). Verify the non-regression tests FAIL before implementing T004
- [x] T004 Implement the server changes in `apps/server/src/api/fare-configs.ts` until T003 is green: (a) list serializer adds `active_route_count` (aggregate LEFT JOIN over `routes.fare_config_id = :id AND routes.is_active = true`); (b) DELETE handler checks `SELECT ... FROM routes WHERE fare_config_id = :id AND is_active = true LIMIT 1` before the last-default guard → `conflict("Cannot deactivate fare configuration referenced by active Routes")`; (c) PUT handler rejects (409 `CONFLICT`, "Cannot set the default fare configuration inactive; reactivate it or assign another default first.") when the update would leave `is_default === true && is_active === false` (`body.is_active === false` while `existing.is_default` or `body.is_default === true`)

### Admin data layer

- [x] T005 [P] Create the typed API client in `apps/admin/src/features/fares/api.ts` wrapping the envelope-aware axios client (`apps/admin/src/lib/api.ts`): `listFareConfigs()`, `createFareConfig(payload)`, `updateFareConfig(id, patch)`, `deactivateFareConfig(id)` — payloads typed with `createFareConfigSchema`/`updateFareConfigSchema` from `@komyuter/shared` (never reimplemented), responses typed with `FareConfiguration` (incl. `active_route_count`)
- [x] T006 Create the query hooks in `apps/admin/src/features/fares/queries.ts` (depends on T005 + T002): `useFareConfigsQuery` (key `fareConfigKeys.all`, `staleTime` 30 s per `lib/queryClient.ts`) and mutations `useCreateFareConfig` / `useUpdateFareConfig` / `useDeactivateFareConfig` — each invalidates `fareConfigKeys.all` on success and fires sonner success/error toasts (FR-008, FR-009)

**Checkpoint**: Foundation ready — server contract extended and guarded (tests green), admin data layer complete. User story implementation can now begin.

---

## Phase 3: User Story 1 - See all fare configurations at a glance (Priority: P1) 🎯 MVP

**Goal**: The Fares section shows every fare configuration — label, base fare, base distance, rate/km, student/senior discounts, default indicator, active status — with loading/error/empty states.

**Independent Test**: Open the Fares section, see all stored configurations with exact values, identify the default by text — no other capability required (quickstart scenario 1).

### Tests for User Story 1 (unit — pure helpers, red before green)

- [x] T007 [P] [US1] Write the FAILING unit tests in `apps/admin/src/tests/fare-format.test.ts` (contract `fare-config-page-ui.md`): `formatPeso` (13 → "₱13", 13.5 → "₱13.50", exact two decimals when fractional), `formatKm` (1–2 decimals), `formatPct` (integer %) — exactness per SC-007. Verify they FAIL before T008
- [x] T008 [US1] Implement `apps/admin/src/features/fares/format.ts` (`formatPeso` / `formatKm` / `formatPct`) until T007 is green

### Implementation for User Story 1

- [x] T009 [US1] Create `apps/admin/src/features/fares/FareConfigTable.tsx` (depends on T008): semantic `<table>` (shadcn `table`, `thead` with `scope="col"`); columns Label (with **Default** text badge), Status (**Active**/**Inactive** text badge — FR-012, never color alone), Base fare (`formatPeso`), Base distance (`formatKm`), Rate/km (`formatPeso` + "/km"), Student/Senior (`formatPct`); row Actions column (Edit/Delete icon buttons with `aria-label`s — Delete disabled state implemented in US4, stub disabled for `is_default || active_route_count > 0` with explanatory label); deactivated rows visually muted but fully readable
- [x] T010 [US1] Rewrite `apps/admin/src/pages/Fares.tsx` (depends on T009): page composition driven by `useFareConfigsQuery` with four states — Loading (skeleton rows, existing `skeleton` primitive), Error (message + Retry → refetch, no partial data, FR-010), Empty ("No fare configurations yet" + call to create, existing `empty` primitive), Loaded (`FareConfigTable`); header keeps the shell-provided "Fares" title and gains a **New fare configuration** primary button (wired in US2)

**Checkpoint**: US1 fully functional — the Fares section lists configurations with exact values, states, and a11y badges.

---

## Phase 4: User Story 2 - Create a fare configuration (Priority: P1)

**Goal**: The Administrator creates a configuration through a validated form; it appears in the list with exact values.

**Independent Test**: Create a configuration with valid values and immediately see it appear in the list — testable with the list alone (quickstart scenarios 2–4).

### Tests for User Story 2 (unit — pure helpers, red before green)

- [x] T011 [P] [US2] Write the FAILING unit tests in `apps/admin/src/tests/fare-validation.test.ts` (contract `fare-config-page-ui.md`): label required (trimmed) and unique case-insensitive with self-exclusion on edit; negative fare/km/rate rejected; discounts 0 and 100 accepted, −1 and 101 rejected; NaN rejected; `is_default && !is_active` rejected. Verify they FAIL before T012
- [x] T012 [US2] Implement `apps/admin/src/features/fares/validation.ts` — `validateFareConfigForm(values, existing, selfId)` returning field errors — until T011 is green (depends on T011)

### Implementation for User Story 2

- [x] T013 [US2] Create `apps/admin/src/features/fares/FareConfigForm.tsx` (depends on T012): single create/edit dialog component (shadcn `dialog`, Base UI focus trap) — create mode prefills LTFRB defaults (₱13 / 4 km / ₱1.80 / 20% / 20%) and `is_active: true`; fields per contract (label, base fare `step=0.01`, base distance, rate/km, student %, senior %, Set as default `switch`) with `<label>` associations, inline errors via `aria-describedby`, block submit when `is_default && !is_active` ("Reactivate before making default", FR-015); submit disabled while pending (FR-014); on save → `useCreateFareConfig`, invalidate + success toast; on failure keep dialog open with values intact + error toast (FR-008); **Cancel** closes and discards
- [x] T014 [US2] Wire the **New fare configuration** button in `apps/admin/src/pages/Fares.tsx` to open `FareConfigForm` in create mode (depends on T013)

**Checkpoint**: US2 done — create works end-to-end: valid create appears in the list, invalid/duplicate rejected inline, exactly-one-default reflected.

---

## Phase 5: User Story 3 - Edit a fare configuration (Priority: P2)

**Goal**: The Administrator edits any field of an existing configuration (incl. active status and default); edits persist through the server and survive reload.

**Independent Test**: Open an existing configuration, change a parameter, save, confirm the change after reload — testable with the list alone (quickstart scenarios 5–6).

**Story dependency**: US3 reuses `FareConfigForm` from US2 (single component, both modes) — requires T013 to be complete.

### Implementation for User Story 3

- [x] T015 [US3] Extend `apps/admin/src/features/fares/FareConfigForm.tsx` for edit mode (depends on T013): prefill all fields incl. `is_default` and `is_active`; add the **Active** switch (edit only, toggling to inactive re-validates the default rule); submit via `useUpdateFareConfig`; surface server `CONFLICT` (inactive-default PUT rejection) as an honest error toast with the dialog open and values intact; reactivation path (inactive → toggle Active on → save)
- [x] T016 [US3] Wire the **Edit** row action in `apps/admin/src/features/fares/FareConfigTable.tsx` to open `FareConfigForm` in edit mode prefilled from the row (depends on T015)

**Checkpoint**: US3 done — edit works: prefill, save → list reflects new values + success toast, invalid edits rejected inline with previous values intact, reload persists, inactive default blocked (client inline + server 409).

---

## Phase 6: User Story 4 - Deactivate a fare configuration safely (Priority: P2)

**Goal**: Deactivation requires confirmation, soft-deactivates (never destroys), refuses the sole default and configurations referenced by active Routes.

**Independent Test**: Deactivate a non-default configuration after confirmation and see it marked inactive; the sole default and active-Route-referenced configurations cannot be deactivated — testable with the list alone (quickstart scenarios 7–10).

**Story dependency**: US4 uses `useDeactivateFareConfig` from T006 and the table Actions column from T009.

### Implementation for User Story 4

- [x] T017 [US4] Create `apps/admin/src/features/fares/DeleteFareConfigDialog.tsx` (depends on T006): shadcn `alert-dialog` — "Delete fare configuration '<label>'?" + "This deactivates the configuration; it can be reactivated later." + **Cancel**/**Delete**; on confirm → `useDeactivateFareConfig`, invalidate + success toast; server `CONFLICT`/`NOT_FOUND`/network → error toast, list unchanged, dialog closes (FR-008)
- [x] T018 [US4] Wire the **Delete** row action in `apps/admin/src/features/fares/FareConfigTable.tsx` (depends on T017 + T009): enabled only when `!is_default && active_route_count === 0`, otherwise disabled with explanatory label ("In use by N active route(s)" / "Default — cannot deactivate the last default"); clicking opens `DeleteFareConfigDialog`

**Checkpoint**: US4 done — guarded deactivation works: confirm dialog, soft-deactivate reflected in list, sole default + referenced configs blocked client-side, server 409 race surfaced honestly.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Verify the whole feature against the quality gates and quickstart, and keep the documented API surface honest.

- [ ] T019 Run all quality gates and fix any failures: `pnpm lint`, `pnpm typecheck`, `pnpm format:check`, `pnpm --filter admin test` (fare-validation + fare-format + existing), `pnpm --filter server test` (requires local Supabase stack + `apps/server/.env`)
- [ ] T020 Run the quickstart validation in `specs/006-fare-configuration-page/quickstart.md` scenarios 1–12 and fix any gaps: list, create (valid/invalid/duplicate), set-as-default, default-on-inactive, delete confirm / sole default / referenced (incl. API-race 409 via curl), save failure, a11y/design (keyboard, focus, WCAG AA contrast scan, text+color states, Route Sign grammar)
- [ ] T021 [P] Reconcile `docs/ADMIN.md` with the implemented API surface: note `active_route_count` in the fare-configs list response, the DELETE active-route guard, and the PUT inactive-default rejection (Constitution II — recorded decisions/reconciliation; no ADR change required)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories
- **User Stories (Phase 3+)**: All depend on Foundational completion
  - US1 (T007–T010) → US2 (T011–T014) → US3 (T015–T016) → US4 (T017–T018) in priority order
- **Polish (Phase 7)**: Depends on all user stories complete

### User Story Dependencies

- **US1 (P1)**: After Foundational — no story dependencies
- **US2 (P1)**: After Foundational — no story dependencies (parallelizable with US1 if staffed; shares `features/fares/` but different files)
- **US3 (P2)**: Depends on US2's `FareConfigForm` (edit mode reuses the create-mode component)
- **US4 (P2)**: Depends on Foundational queries (T006) + US1's table Actions column (T009)

### Within Each User Story

- Pure-helper tests (T007/T011) are written and FAIL before their implementation (T008/T012)
- Helpers before components; components before page wiring
- Story complete before moving to the next priority

### Parallel Opportunities

- T001 + T002 (Setup) in parallel
- T003 (server tests, red) + T005 (admin api.ts) in parallel; T004 after T003; T006 after T005
- US1 and US2 are fully parallelizable (different files) after Foundational — recommended for 2 staff
- T007/T011 (pure-helper tests) each run alone against their own new test file
- T019/T020/T021 in Polish: T021 independent of the gate runs

---

## Parallel Example: Foundational

```bash
# Launch the server TDD loop and the admin api module together:
Task: "T003 Write the 6 FAILING integration tests in apps/server/tests/integration/crud.test.ts"
Task: "T005 Create the typed API client in apps/admin/src/features/fares/api.ts"
# After T003 is red → T004 (implement server changes until green)
# After T005 → T006 (queries.ts)
```

## Parallel Example: User Stories 1 + 2

```bash
# Developer A (US1): T007 test → T008 format.ts → T009 table → T010 page
# Developer B (US2): T011 test → T012 validation.ts → T013 form create → T014 wire button
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup (shadcn primitives + query keys)
2. Complete Phase 2: Foundational (server guard TDD + admin data layer)
3. Complete Phase 3: US1 — the truthful list (MVP for this feature)
4. **STOP and VALIDATE**: open Fares, verify all configurations + default + states; run quickstart scenario 1
5. Deploy/demo if ready

### Incremental Delivery

1. Setup + Foundational → foundation ready (server contract guarded, data layer live)
2. Add US1 (list) → test → **MVP**
3. Add US2 (create) → test independently → deploy/demo
4. Add US3 (edit) → test independently → deploy/demo
5. Add US4 (guarded delete) → test independently → deploy/demo
6. Polish: gates + quickstart 1–12 + doc reconciliation

### Parallel Team Strategy

1. Team completes Setup + Foundational together (server TDD loop and admin data layer split)
2. Once Foundational is done:
   - Developer A: US1, then US4 (table Actions)
   - Developer B: US2, then US3 (form component)
3. Stories integrate at the `Fares.tsx` / `FareConfigTable.tsx` seams and are individually testable

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to the spec.md user story for traceability (US1–US4)
- Server tests MUST be red before T004 (AGENTS.md TDD gate); admin pure-helper tests red before T008/T012
- `@komyuter/shared` schemas/types are reused — never reimplemented (Constitution III)
- `active_route_count` only exists in the list serializer (contract `fare-configs-api.md`)
- Commit after each task or logical group; conventional commits `type(scope): description`
- Stop at any checkpoint to validate the story independently
- Avoid: vague tasks, same-file conflicts, cross-story dependencies that break independence
