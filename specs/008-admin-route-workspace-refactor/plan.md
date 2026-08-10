# Implementation Plan: Admin Route Workspace Refactor

**Branch**: `008-admin-route-workspace-refactor` | **Date**: 2026-08-10 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/008-admin-route-workspace-refactor/spec.md`

**Note**: This plan consolidates the design previously recorded in `REFACTOR.md` (repo root) — that working document is superseded by this file. Design decisions are recorded in [ADR-0014](../../docs/adr/0014-admin-workspace-layers.md) (already written, ACCEPTED) and complemented by [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), and [quickstart.md](./quickstart.md).

## Summary

The Route Workspace (`apps/admin/src/pages/RouteWorkspace.tsx`) — the map-first page where the Administrator plots and manages PUJ Routes — is rebuilt from overlay-style floating panels into a **three-layer, three-column, four-state** desktop workspace. The page is driven by a pure four-state machine — `empty` / `overview` / `focus` / `edit` — where state changes mount/unmount column chrome around **one persistent MapLibre GL instance** (ADR-0013) that is never re-initialized. The refactor is **desktop-only by declaration** (minimum viewport 1024 px, no responsive system), fixing the critique's layout findings (30/40 Nielsen: panel collisions below ~964 px, rail hover-expand swallowing the route list, banner collision, POI search coupled to panel width, under-communicated save status, missing a11y landmarks) **structurally** rather than cosmetically. All plotting behavior, the draft safety net (24 h TTL), undo/redo, snapping, and atomic save are **preserved as-is and re-homed** — presentation-only, zero backend/shared/data-model changes.

Verified against code:

1. **ADR-0014 is already written and ACCEPTED** — the desktop-only constraint and the three-layer/three-column/four-state architecture are recorded; `REFACTOR.md`'s "follow-up: write the ADR" line is stale and resolved. The only remaining follow-up is `tasks.md` (`/speckit.tasks`).
2. **All dependencies are already installed** in `apps/admin/package.json` — `maplibre-gl@^5.24`, `react-map-gl@^8.1.2` (maplibre entry), `zustand@^5`, `react-hotkeys-hook@^4`, `sonner@^2`, `lucide-react@^1.28`, `@tanstack/react-query@^5`, `@base-ui/react@^1.6` (shadcn-style `components/ui`), Tailwind CSS 4 via `@tailwindcss/vite@^4.3.3` (not the postcss plugin), `vitest@^2.1.9`. **Zero new dependencies.**
3. **The map stack from spec 007 exists** (the "no map stack" finding of 007's plan is now obsolete): the workspace already has a MapLibre instance; this plan preserves it, never re-initializes it.
4. **Admin pure-helper tests exist** at `apps/admin/src/tests/` (17 files incl. `plotting-store.test.ts`, `plottingHistory.test.ts`, `routeColors.test.ts`, `sections.test.ts`, `overlap.test.ts`) — new pure tests (state machine, geometry tokens, gate) join the same directory, node env, no WebGL mocking.

## Technical Context

**Language/Version**: TypeScript 5.5 (strict, `@repo/typescript-config/vite.json`) · React 18.3 · Vite 5.4 · Tailwind CSS 4 (`@tailwindcss/vite`)

**Primary Dependencies** (all existing, none added): `maplibre-gl@^5.24`, `react-map-gl@^8.1.2` (maplibre entry), `zustand@^5`, `@tanstack/react-query@^5`, `sonner@^2`, `lucide-react@^1.28`, `react-hotkeys-hook@^4`, `@base-ui/react@^1.6` (shadcn-style `apps/admin/src/components/ui/*`), `class-variance-authority`, `tailwind-merge`.

**Storage**: N/A — presentation-only. Existing stores are reused unchanged: `lib/plottingStore.ts` (zustand) gains a pure derived `uiState` selector + `focusedRouteId`; `lib/uiStore.ts` is read as-is (persisted `sidebarMode`). Draft persistence (localStorage, 24 h TTL) untouched.

**Testing**: Vitest (`pnpm --filter admin test` → `vitest run`) on admin pure helpers only (`apps/admin/src/tests/`, node env, no WebGL/jsdom mocking). TDD: the state-machine selector, geometry-token math, and gate logic are pure and unit-testable — tests written first, red before implementation. Existing 17 admin test files must keep passing.

**Target Platform**: Desktop web only. Minimum viewport **1024 px** (declared, not breakpointed); mouse-first, hover as a first-class affordance; keyboard paths still required (a11y is not waived by desktop-only — ADR-0014).

**Project Type**: Web application — single frontend feature in `apps/admin`. No backend, no shared-package, no new workspace projects.

**Performance Goals**: State transitions are instant snaps (no tween/slide; reduced-motion default); empty-veil fade ≤ 120 ms; focus framing ≤ 400 ms; the GL canvas resizes at most **twice** in the whole journey (`empty→overview`, `overview→focus`); `focus ⇄ edit` resizes nothing. No network/latency targets — zero new requests.

**Constraints**: `[lng, lat]` sole coordinate format (ADR-0013 — MapLibre native, no conversion layer); **no ETA anywhere** (ADR-0009); API envelope `{ success, data | error }` (untouched); strict TS via shared config; single root ESLint flat config; prettier `format:check`; commitlint conventional commits; **Route Sign grammar** binding (white plates, 1 px border, ≤ 4 px corners, no shadows, 16 px gutters — DESIGN.md); **one GL instance, forever** (never unmount/re-init from a state transition); center column is a one-hit-target region (no `stopPropagation` on `pointerdown`; `pointer-events: auto` opt-in only on search/status/action bars); right column has **one width** (336 px) across focus/edit.

**Scale/Scope**: Single Administrator; tens of routes; ~10–40 stops per direction; a handful of workspace files re-homed across 5 phases (see Project Structure).

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| #   | Principle                   | Verdict | Evidence                                                                                                                                                                                                   |
| --- | --------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I   | Precision Is Trust          | ✅ PASS | No ETA touched, no fabricated data; displayed distances/names/colors unchanged (FR-012); the refactor re-homes, never re-computes.                                                                         |
| II  | Recorded Decisions Govern   | ✅ PASS | ADR-0014 written and ACCEPTED (desktop-only + three-layer/three-column/four-state); ADR-0013 (map stack), ADR-0008, ADR-0009 binding; this plan is the companion record.                                   |
| III | Shared, Never Reimplemented | ✅ PASS | Zero new deps; reuses plotting store, draft, snapping, save flow, `components/ui`, Route Sign tokens; strict TS config + root ESLint reused.                                                               |
| IV  | Canonical Language          | ✅ PASS | States named `empty/overview/focus/edit`; Route/Direction/Stop/Administrator per CONTEXT.md; spec terminology normalized in clarify pass (no "browsing"/"inspection" synonyms remain).                     |
| V   | Measurable Deliverables     | ✅ PASS | SC-001…SC-008 measurable; acceptance criteria below; state machine is a pure function over existing store fields.                                                                                          |
| —   | Domain & Spatial            | ✅ PASS | One MapLibre instance (ADR-0013); `[lng,lat]`; layer model maps to the GL layer stack, not DOM; no spatial math changes.                                                                                   |
| —   | Engineering Workflow        | ✅ PASS | TDD for pure helpers; strict TS; root ESLint; prettier `format:check`; commitlint; server untouched (no server tests affected); gate commands `pnpm --filter admin lint` / `typecheck` / `build` / `test`. |
| —   | Design/Product systems      | ✅ PASS | DESIGN.md/PRODUCT.md loaded (see AGENTS.md); incumbent Route Sign world preserved; no new design system (FR-011).                                                                                          |

## Architecture

### The three layers

```
┌────────────────────────────────────────────────────────────┐
│  LAYER 3 · FLOATING UI (DOM, above the canvas)             │
│  ┌──────────┐  ┌──────────────────────┐  ┌──────────────┐  │
│  │ LEFT 240 │  │  CENTER (remainder)  │  │ RIGHT 336    │  │
│  │ routes   │  │  chrome: search (TL) │  │ focus plate ⇄│  │
│  │ stops    │  │  status (TR)         │  │ property     │  │
│  │ search   │  │  action bar (B)      │  │ panel        │  │
│  └──────────┘  └──────────────────────┘  └──────────────┘  │
│  16px gutter between all plates (white desk)               │
├────────────────────────────────────────────────────────────┤
│  LAYER 2 · POLYLINE ROUTES — MapLibre layers on the ONE    │
│  instance: base/draft/return polylines, stop markers,      │
│  overview dim layer, hover highlight                       │
├────────────────────────────────────────────────────────────┤
│  LAYER 1 · BASEMAP — one persistent MapLibre GL instance   │
└────────────────────────────────────────────────────────────┘
```

- **Layer 1** is mounted once by `RouteMap.tsx` and never unmounted or re-initialized across all four states. State changes never touch the GL lifecycle (container resize → ResizeObserver → canvas resize; MapLibre preserves center/zoom).
- **Layer 2** is the GL layer stack (existing `RouteOverviewLayer.tsx`, draft/preview lines, `stopShapes` markers). Nothing route-shaped lives in DOM.
- **Layer 3** is DOM plates. Columns mount/unmount per state; the canvas is clipped to the center column, so column mounts change only the canvas _size_, never its identity or camera.

### The four states

| State      |      Left column       |       Center chrome        |      Right column       | Map behavior                                   |
| ---------- | :--------------------: | :------------------------: | :---------------------: | ---------------------------------------------- |
| `empty`    |           ✗            |             ✗              |            ✗            | Full-bleed behind the white veil (warm canvas) |
| `overview` | ✓ route list (nav aid) |             ✗              |            ✗            | Maximal — map is the board                     |
| `focus`    |           ✓            |             ✗              | ✓ narrow metadata plate | Framed to selected polyline (≤ 400 ms snap)    |
| `edit`     |           ✓            | ✓ search · status · action |  ✓ full property panel  | Same camera; tools over edges                  |

Derivation rule (pure, unit-tested — see [contracts/workspace-state-machine.md](./contracts/workspace-state-machine.md)):

- `empty` = routes loaded && `routes.length === 0`
- `edit` = plotting route open (`routeId !== null`)
- `focus` = a route/stop selected on the map, not editing (`focusedRouteId !== null`)
- `overview` = neither of the above

### Transition table

All transitions are **snaps** (decisive mount, no slide/tween — Route Sign reduced-motion default). The only permitted animation is the empty-veil fade (≤ 120 ms).

| From       | To         | Trigger                             | Happens                                                                          |
| ---------- | ---------- | ----------------------------------- | -------------------------------------------------------------------------------- |
| `empty`    | `edit`     | CTA → New Route dialog → create     | Veil lifts; left column mounts; chrome mounts; Add-stop active; camera unchanged |
| `overview` | `focus`    | Click polyline on map               | Right metadata plate mounts; route framed (quick snap, ≤ 400 ms)                 |
| `overview` | `edit`     | Click route item in left list       | Direct to edit — **list-click = act, map-click = peek** (FR-005)                 |
| `focus`    | `edit`     | "Edit route" on plate               | Right column swaps content in place; chrome mounts; no resize                    |
| `edit`     | `focus`    | Back / Esc (dirty → styled confirm) | Right column swaps back; chrome unmounts; highlight persists                     |
| `focus`    | `overview` | Esc / X / click empty map           | Right plate unmounts; camera unchanged                                           |
| `edit`     | `overview` | Save or discard                     | Route framed + highlighted in list; success state shown                          |
| `*`        | `empty`    | Last route deleted (styled confirm) | Columns unmount; veil remounts over warm canvas                                  |

Keyboard (FR-008): Esc dismisses in `focus`; Esc returns to `focus` from `edit` (styled confirm if dirty — never `window.confirm`, FR-007); CTA autofocuses in `empty`; mod+s saves in `edit`.

### Geometry (fixed tokens)

| Token         |            Value | Notes                                                                                                                     |
| ------------- | ---------------: | ------------------------------------------------------------------------------------------------------------------------- |
| Gutter        |            16 px | white desk between plates                                                                                                 |
| Left column   |           240 px | constant across overview/focus/edit                                                                                       |
| Right column  |           336 px | **one width across focus and edit** (content swap, no resize)                                                             |
| Center column |        remainder | the map region; never scrolls                                                                                             |
| Shell rail    |  user preference | persisted `sidebarMode` honored; the rail **pushes** layout, never overlays (decision D1)                                 |
| Floor         | 1024 px viewport | below → NarrowWindowGate plate; the gate guards **map width ≥ 400 px**, not a viewport class (works for both rail states) |

Canvas resize moments in the whole journey: exactly two — `empty→overview` (left mounts) and `overview→focus` (right mounts). `focus ⇄ edit` resizes nothing. With the rail collapsed at 1024 px the map is ≥ 416 px (1440 px ≈ 832 px; 1920 px ≈ 1312 px). With the rail expanded, the map-width gate takes over whenever the map would fall below 400 px.

### Invariants (do not break)

1. **One GL instance, forever.** Never unmount, never re-init, never touch the GL lifecycle from a state transition. Container resize → ResizeObserver → canvas resize; MapLibre preserves center/zoom. Camera moves happen only on explicit framing (focus, save).
2. **The center column is a one-hit-target region.** Transparent, never scrolls, no `touch-action` override, no `stopPropagation` on `pointerdown`. The canvas is the default hit target; `pointer-events: auto` is opt-in **only** on search/status/action bars.
3. **Right column has one width** across focus/edit. Changing the panel's _content_, never its footprint.
4. **Reduced-motion snap.** Mounts are instant; no slide/tween; veil fade ≤ 120 ms; framing ≤ 400 ms. Gate any motion behind `prefers-reduced-motion`.
5. **Plate grammar.** White plates, 1 px border, ≤ 4 px corners, no shadows, 16 px gutter. The map itself is a plate (white 1 px border, square corners) — "plates on a white desk".
6. **No responsive system.** `min-width: 1024px` gate plate is the _only_ width behavior. No breakpoints, no sheets, no icon-rail collapses.
7. **A11y not waived by desktop-only.** Named landmarks (`<nav aria-label="Routes">`, `<aside aria-label="Route properties">`), keyboard paths (Esc, CTA autofocus, stop cycling), focus management, and ≥ AA text sizes still apply (FR-009).
8. **The safety net is sacred.** Draft (24 h TTL, debounced), undo/redo, `beforeunload` + `pushState` guards, atomic save: re-homed, not re-designed (FR-010).

## Project Structure

### Documentation (this feature)

```text
specs/008-admin-route-workspace-refactor/
├── spec.md              # Feature specification (/speckit.specify + /speckit.clarify output)
├── plan.md              # This file (/speckit.plan output)
├── research.md          # Phase 0 decisions record
├── data-model.md        # Phase 1: UI state model + geometry tokens (no data changes)
├── quickstart.md        # Phase 1: runnable validation guide
├── contracts/
│   ├── workspace-state-machine.md   # uiState selector + transition table contract
│   └── layout-geometry.md           # fixed tokens + gate invariant + column contracts
├── checklists/          # spec quality checklist
└── tasks.md             # Phase 2 output (/speckit.tasks command — NOT created here)
```

### Source Code (repository root = `apps/admin/src`)

Conventions: `M` = modify · `A` = add · `D` = delete. Paths are relative to `apps/admin/src/` unless noted.

#### Phase 1 — Shell, gate, tokens

| Op  | File                                   | Change                                                                                                                                                                                        |
| --- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M   | `app/AppShell.tsx`                     | Workspace route renders honoring the admin's persisted `sidebarMode` (no forcing); mounts the NarrowWindowGate.                                                                               |
| M   | `app/NavRail.tsx`                      | The rail always **pushes** layout on the workspace and never hover-expands over it — fixes critique P1 (rail swallowing the list) while respecting the saved preference.                      |
| A   | `features/routes/NarrowWindowGate.tsx` | Full-screen "wider window" plate; one `matchMedia` listener; guards **map width ≥ 400 px** (works for both rail states), not a viewport class — one invariant check, not a responsive system. |
| M   | `lib/uiStore.ts`                       | Workspace reads the persisted `sidebarMode` as-is; no per-route override.                                                                                                                     |
| M   | `index.css`                            | Add `prefers-reduced-motion` guard; fix `DialogFooter` `rounded-b-xl` → 4px radius token (critique P3).                                                                                       |

#### Phase 2 — State machine + layer ownership

| Op  | File                                             | Change                                                                                                                                                                                             |
| --- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M   | `pages/RouteWorkspace.tsx`                       | Becomes the state-machine orchestrator: derives `empty`, owns transitions and keyboard, renders per-state column set. Deletes the overlay-positioning absolutes (`left-3`/`right-3`/`z-*` panels). |
| M   | `lib/plottingStore.ts`                           | Add derived `uiState` selector (pure, unit-tested); add `focusedRouteId` (selection without edit).                                                                                                 |
| A   | `features/routes/workspace/WorkspaceColumns.tsx` | The three-column layout shell with fixed tokens (240/336/remainder, 16 px gutters), per-state mounts.                                                                                              |
| M   | `lib/selection.ts`                               | Map polyline click sets **focus** (metadata), not edit.                                                                                                                                            |

#### Phase 3 — Columns and chrome

| Op  | File                                     | Change                                                                                                                                                                                                                                  |
| --- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M   | `features/routes/RouteList.tsx`          | Becomes the LeftColumn content: `<nav aria-label="Routes">` landmark; overview variant (list = nav aid, click = edit) vs edit variant (stop list, reorder, insert-after affordance); internal scroll.                                   |
| M   | `features/routes/PoiSearchBar.tsx`       | Mounts only in `edit`; anchored to the center column edge — **deletes the `left-86` magic number** (critique P2); cap results list height with scroll.                                                                                  |
| A   | `features/routes/StatusBar.tsx`          | Top-right of center chrome in `edit`: dirty → saving → "Saved just now" state machine (critique P2); hosts the draft-restore and conflict banners in one slot (critique P2 banner collision).                                           |
| M   | `features/routes/PlotActionBar.tsx`      | Bottom-center chrome in `edit`; hover-first affordances; visible Add/Select mode state (fixes first-run "zero feedback" red flag); persistent save status reference.                                                                    |
| M   | `features/routes/PropertiesPanel.tsx`    | RightColumn content with two sub-states: **FocusPlate** (metadata + Edit CTA) and **EditPanel** (route / stop / direction contexts — the panel's own mini state machine). Retitle from generic "Properties".                            |
| M   | `features/routes/DraftRestoreBanner.tsx` | Relocated into the StatusBar slot; copy unchanged.                                                                                                                                                                                      |
| M   | `features/routes/EmptyState.tsx`         | Full-screen white veil over the warm canvas (Route Sign "fresh board"), subtle `backdrop-filter` blur only behind `@supports`, white-tint fallback; CTA autofocus; text + CTA per critique (Import JSON disabled affordance clarified). |
| D   | `features/routes/OverviewRoutePanel.tsx` | Absorbed into the LeftColumn overview variant.                                                                                                                                                                                          |
| M   | `features/routes/FareConfigSelect.tsx`   | Reused unchanged inside EditPanel.                                                                                                                                                                                                      |

#### Phase 4 — Map layer (Layer 1 + 2)

| Op  | File                                                  | Change                                                                                                                                                                            |
| --- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M   | `features/routes/RouteMap.tsx`                        | GL container = center column; ResizeObserver sizing; camera preserved across the two resize moments; polyline hover → route name plate (mouse-first); no re-init on state change. |
| M   | `features/routes/RouteOverviewLayer.tsx`              | Fix 0.15 opacity dimming → ≥ 0.3 with hover lift (critique P3); keep route names accessible via the left column + plate (not tooltip-only).                                       |
| M   | `features/routes/stopLabels.ts` · `lib/stopShapes.ts` | Bump 10 px chips to ≥ 11–12 px where AA requires (critique Sam persona).                                                                                                          |

#### Phase 5 — Copy, consistency, polish

| Op  | File                                            | Change                                                                                                                  |
| --- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| M   | `pages/RouteWorkspace.tsx` + `PoiSearchBar.tsx` | Replace dev jargon ("Add a MAPBOX_SECRET_TOKEN", "out of sync") with plain operational copy (critique P3, heuristic 2). |
| M   | `pages/RouteWorkspace.tsx`                      | Replace `window.confirm()` (load-latest, leave-navigation) with styled AlertDialog (critique P3, heuristic 4).          |
| M   | `features/routes/PropertiesPanel.tsx`           | Invalid-hex field feedback instead of silent ignore; empty stop-name validation hint (heuristic 5).                     |

**Structure Decision**: single existing project (`apps/admin`), no new workspace projects; new components land in `features/routes/` and `features/routes/workspace/`; the state machine is a pure selector in `lib/plottingStore.ts`; the gate is a self-contained component in `features/routes/`. This matches the existing `apps/admin` structure (no Option labels apply).

## Complexity Tracking

> No Constitution Check violations — this table records residual **risk**, not violations.

| Risk                                                                                            | Mitigation                                                                                                                        |
| ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| GL lifecycle: accidental unmount/re-init of the map on a state transition (highest-risk change) | Phase 4 invariant (one GL instance, forever) + smoke check that the map canvas identity is stable across all four states (SC-002) |
| State machine drift vs the transition table                                                     | `uiState` is a pure selector over existing store fields — unit-tested first (TDD), red before implementation                      |
| Regression of the draft/undo/save safety net                                                    | Behavior freeze (FR-010): re-homed only; regression checklist against current behavior (SC-004)                                   |
| Column mounts/unmounts                                                                          | Pure conditional render — low risk                                                                                                |
| No data, API, or schema changes                                                                 | Presentation-only by declaration (spec Assumptions)                                                                               |

## Acceptance Criteria

1. At 1024, 1440, and 1920 px (rail collapsed) the three columns never collide; the center map is ≥ 416 px at the floor. With the rail expanded, the map-width gate appears instead of letting the map drop below 400 px (SC-001).
2. The GL canvas element identity and camera survive all four states and both resize moments (SC-002).
3. All eight transitions in the table behave; Esc / mod+s / CTA autofocus work (SC-003).
4. No `window.confirm` remains; no "MAPBOX_SECRET_TOKEN" copy remains; no banner stacking (draft + conflict never overlap) (SC-005).
5. Draft restore, undo/redo, save validation, and atomic save behave exactly as before (regression checklist against current behavior) (SC-004).
6. `pnpm --filter admin lint`, `pnpm --filter admin typecheck`, `pnpm --filter admin build`, and `pnpm --filter admin test` pass; existing admin tests pass; new pure-helper tests (state machine, geometry, gate) are written first and green (SC-007).
7. Detector run (`detect.mjs`) on the refactored files stays clean (exit 0) — same as the baseline critique run.

## Resolved decisions

- **D1 — Shell rail**: respects the admin's persisted `sidebarMode` (user preference, decided 2026-08-10); the rail pushes layout, never overlays; the map-width gate absorbs the expanded-rail case.
- **D2 — ADR**: written — `docs/adr/0014-admin-workspace-layers.md` (desktop-only constraint + three-layer/three-column/four-state architecture). ACCEPTED; no further ADR work.
- **D3 — Empty-veil blur**: white veil mandatory; subtle `backdrop-filter` blur only behind `@supports`, white-tint fallback on weak GPUs.

## Follow-up (outside this plan)

- `tasks.md` — task breakdown, generated by `/speckit.tasks`.
- Update the surface brief / `.impeccable` if the refactor changes the admin surface notes (out of scope here).
