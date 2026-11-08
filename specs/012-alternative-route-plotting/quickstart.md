# Quickstart / Validation Guide: Alternative Route (Detour) Plotting — Phase 1

Runnable end-to-end validation for spec `012-alternative-route-plotting`. References the [detour CRUD contract](./contracts/admin-detours-api.md) and [data model](./data-model.md) instead of duplicating them. Implementation details live in `tasks.md` (Phase 2).

## Prerequisites

- Node ≥ 18, pnpm 8 (`packageManager: pnpm@8.15.6`), local Supabase stack running (`pnpm supabase start` — see `specs/001-local-supabase-backend/`).
- `apps/server/.env` present (DB + Supabase auth config; gitignored, auto-loaded by `src/config/env.ts`).
- `apps/admin/.env` with `VITE_MAPBOX_PUBLIC_TOKEN` (ADR-0016 — road-following snap needs it; without it the editor falls back to straight detour loops with a warning, FR-009).
- At least one **Route with a Direction whose base polyline is plotted** (produce via the base-path editor from spec-007, or reuse the seed data the `specs/001` integration suite prepares). A direction with no base polyline must show the "Add alternative route" action **disabled**.

## Setup & run

```bash
pnpm install          # workspace deps (auto-install-peers on)
pnpm dev              # turbo: admin SPA (http://localhost:5173) + server (http://localhost:8080)
```

Log in as an Administrator in the admin SPA (Supabase Auth, admin-gated CRUD — ADR-0006). Open the Routes workspace and select the seeded Route → Direction.

## Validation scenarios

### Scenario 1 — Plot and save a detour (US1, FR-005/010/011/013; SC-001, SC-004)

1. In the floating action bar press **Add alternative route**; the editor surface opens, the action is disabled for a direction without a base polyline.
2. Click near the base path for **entry** and **exit** — markers snap ON the polyline (projection, ≤30 m server tolerance); markers that are on the dotted base segment region draw an indication of the removed segment.
3. Add one or more waypoints; the **loop is road-followed** through `entry → … → exit` (uses the Mapbox snap proxy, same as base plotting; straight fallback + warning if the token is missing).
4. Auto-generated label is editable; enter a commuter instruction (required), optionally a driver instruction; the **additional distance is displayed read-only** and equals the exact loop length minus the replaced base segment.
5. **Save** → `POST /directions/:directionId/detours`; toast success; the detour appears in the **Detours** list; the loop renders dashed/distinct on the map with the replaced base segment removed; `pnpm --filter server test` still passes.

**Expect**: 201, one row in `detours`, `is_active = true`, `notable_stops = []`, list + map consistent after refetch.

### Scenario 2 — Notable stops from EXISTING stops only (US3, FR-006; SC-006)

1. In the editor open the notable-stop picker; search by name and pick a stop of the route; toggle **"notable only in this detour"**.
2. Save and reload — the stop persists with `{ stop_id, name, is_detour_only }`.
3. **Expect**: no stop-creation UI anywhere in the editor (Q1); any attempt to submit a non-existent `stop_id` is impossible from the UI (picker-only).

### Scenario 3 — Server rejects structural violations (US4, FR-023; SC-014)

Run against the existing endpoints (integration suite, red-first):

```bash
pnpm --filter server test
```

Cases: (a) `POST` whose `detour_polyline[0]` sits >30 m from `entry` → **422**, envelope error; (b) same for `detour_polyline[last]` vs `exit`; (c) degenerate loop `entry === exit` → **422**; (d) `PUT` changing only `detour_polyline` revalidates the same invariants; (e) `additional_distance_meters: -1` → 422 (existing zod). (f) travel-order swap (entry after exit along the base path) is refused **client-side** with a swap action, and no request leaves the browser (FR-004).

**Expect**: all server case tests red-first → green; UI never sends an FR-023-invalid payload, and when force-fed a 422 the editor keeps state and surfaces a toast.

### Scenario 4 — Undo/Redo, draft recovery, conflict, remove (US1/US2, FR-008/016/017/018; SC-003, SC-009, SC-012)

1. Place entry/exit, draw the loop, undo back to before placement, redo; hotkeys + toolbar parity with the base editor.
2. Close the tab mid-edit; reopen the workspace → **restore-offer banner**; accept → identical state (≤24 h draft, namespaced key); dismiss → cleared.
3. Force a save conflict (two tabs) → conflict notice plate + **load latest** reseeds; dismissing keeps draft.
4. Remove a detour from the list → styled confirm → soft delete (`is_active = false`); map layer disappears, row remains in DB.

**Expect**: no state is lost across reloads; destructive ops always confirm; soft-deleted detours never render.

### Scenario 5 — Quality gates (all commits)

```bash
pnpm lint && pnpm typecheck && pnpm format:check
pnpm --filter server test && pnpm --filter server typecheck
```

## Success criteria cross-check

References [SC-001…SC-014](./spec.md#success-criteria): SC-001/004 = Scenario 1; SC-006 = Scenario 2; SC-014 = Scenario 3; SC-003/009/012 = Scenario 4; SC-002/005/007/008/010/011/013 = editor affordances exercised in Scenario 1 (distinct styling, no-ETA output, exact distance, existing-stop sourcing, instruction requirements, save-block on invalid), verified by inspection in the same pass.
