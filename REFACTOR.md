# Implementation Plan: Admin Route Workspace Refactor

**Branch**: `008-admin-route-workspace-refactor` | **Date**: 2026-08-10 | **Input**: Design critique of `apps/admin/src/pages/RouteWorkspace.tsx` (impeccable critique, 2026-08-10) + follow-up architecture decisions with the user

**Scope**: UI/structure refactor of the **existing, implemented** Route Workspace in `apps/admin`. No backend, no shared-package, no data-model changes. The current overlay-style page (floating panels over a full-bleed map) is replaced by a **three-layer, three-column, four-state** architecture. All plotting behavior, the draft safety net, undo/redo, snapping, and save logic are **preserved** — this plan changes structure and presentation, not function.

---

## Summary

The Route Workspace is rebuilt around three explicit layers and one persistent map:

1. **Basemap** — a single MapLibre GL instance, the constant of the page.
2. **Polyline Routes** — all route/stop/draft geometry as MapLibre layers on that instance (never DOM, never a second canvas).
3. **Floating UI** — DOM plates floating above: three columns (left: routes/stops nav · center: workspace + tools · right: contextual properties).

The page is driven by a **four-state machine** — `empty` / `overview` / `focus` / `edit` — where states mount/unmount column chrome over the same persistent map. The refactor is **desktop-only by declaration**: minimum viewport 1024px, no responsive breakpoints, no touch design, mouse-first with hover as a first-class affordance.

This plan is the consolidation of the critique findings and the architecture agreed in conversation: the state × column matrix, the transition table, the fixed geometry, and the invariants that make it work. File-level changes are listed per phase in [Project Structure](#project-structure).

### Why now

The critique scored the page 30/40 (Nielsen) with the layout as its weakest system: fixed-width absolute panels collide below ~964px; the global NavRail hover-expand swallows the route list; the draft-restore and conflict banners share one slot; POI search is coupled to panel width by a magic number; save feedback is under-communicated; a11y landmarks are missing. The layered/columned architecture resolves these structurally rather than cosmetically, and the desktop-only declaration retires the entire responsive problem class.

### Goals

- Map-first identity preserved and strengthened: the map is a single constant layer; chrome mounts around it, never over it.
- Four explicit states with a complete, guarded transition table.
- Fixed geometry tokens that make collision impossible at the 1024px floor.
- The critique's P1/P2 layout findings resolved by structure (columns), not patches.
- Zero regression of the draft/undo/save safety net (a critique strength).

### Non-goals (explicit anti-goals)

- **No mobile/tablet support, no breakpoints.** Below 1024px the page shows a single "wider window" gate plate; there is no responsive system.
- **No new map library, no second GL instance, no DOM-drawn polylines.** One MapLibre instance, forever.
- **No backend/shared changes.** Purely `apps/admin`.
- **No behavior changes to** snapping, draft persistence (24h TTL), undo/redo, atomic save, validation. These are preserved as-is and only _re-homed_ in the new structure.
- **No visual-world change.** The Route Sign grammar (white plates, signboard green-blue, signal amber, ≤4px corners, no shadows, reduced-motion default) is the incumbent world and remains binding.

---

## Technical Context

**Language/Version**: TypeScript 5.5 strict (`@repo/typescript-config/vite.json`) · React 18.3 · Vite 5.4 · Tailwind CSS 4 (`@tailwindcss/postcss`)

**Primary Dependencies** (all existing, none added): `maplibre-gl`, `react-map-gl` (maplibre entry), `zustand`, `@tanstack/react-query`, `sonner`, `lucide-react`, `react-hotkeys-hook`, shadcn-style `apps/admin/src/components/ui/*`.

**Testing**: Vitest on admin pure helpers (`apps/admin/src/tests/`, node env, no WebGL mocking). The state machine, geometry math, and gate logic are pure and unit-testable. Existing tests (`routeColors.test.ts`, etc.) must keep passing.

**Target Platform**: Desktop web only. Minimum viewport **1024px** (declared, not breakpointed). Mouse-first; keyboard paths still required (a11y is not waived by desktop-only).

**Constraints**: `[lng, lat]` sole coordinate format; no ETA anywhere; API envelope `{ success, data | error }`; strict TS; single root ESLint flat config; commitlint conventional commits; branch per spec.

---

## Constitution Check

| #   | Principle                   | Verdict  | Evidence                                                                                                                                                                                            |
| --- | --------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I   | Precision Is Trust          | ✅ PASS  | No ETA, no fabricated data touched; displayed distances unchanged.                                                                                                                                  |
| II  | Recorded Decisions Govern   | ✅ PASS* | This plan _is_ the record for the layout refactor. _Follow-up: write ADR for the desktop-only constraint and the three-layer/three-column architecture (ADR-0013 remains the map-stack authority)._ |
| III | Shared, Never Reimplemented | ✅ PASS  | Zero new deps; reuses plotting store, draft, snapping, save flow, Route Sign tokens.                                                                                                                |
| IV  | Canonical Language          | ✅ PASS  | States named `empty/overview/focus/edit`; Route/Direction/Stop/Administrator per CONTEXT.md; no new synonyms.                                                                                       |
| V   | Measurable Deliverables     | ✅ PASS  | Acceptance criteria per phase below; the state machine is a pure function over existing store fields.                                                                                               |
| —   | Domain & Spatial            | ✅ PASS  | One MapLibre instance (ADR-0013); `[lng,lat]`; layer model maps to GL layer stack, not DOM.                                                                                                         |
| —   | Engineering Workflow        | ✅ PASS  | TDD for pure helpers; strict TS; root ESLint; prettier `format:check`; server untouched (no server tests affected).                                                                                 |
| —   | Design/Product systems      | ✅ PASS  | DESIGN.md/PRODUCT.md loaded; incumbent Route Sign world preserved; no new design system.                                                                                                            |

---

## Architecture

### The three layers

```
┌────────────────────────────────────────────────────────────┐
│  LAYER 3 · FLOATING UI (DOM, above the canvas)             │
│  ┌──────────┐  ┌──────────────────────┐  ┌──────────────┐  │
│  │ LEFT 240 │  │  CENTER (remainder)  │  │ RIGHT 336    │  │
│  │ routes   │  │  chrome: search (TL) │  │ focus plate ⇄│  │
│  │ stops    │  │  status (TR)         │  │ property     │  │
│  │ search   │  │  action bar (B)     │  │ panel        │  │
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

- **Layer 1** is mounted once by `RouteMap.tsx` and never unmounted, never re-initialized, across all four states. State changes never touch the GL lifecycle.
- **Layer 2** is the GL layer stack (existing `RouteOverviewLayer.tsx`, draft/preview lines, `stopShapes` markers). Nothing route-shaped lives in DOM.
- **Layer 3** is DOM plates. Columns mount/unmount per state; the canvas is clipped to the center column, so column mounts change only the canvas _size_, never its identity or camera.

### The four states

| State      |      Left column       |       Center chrome        |      Right column       | Map behavior                                   |
| ---------- | :--------------------: | :------------------------: | :---------------------: | ---------------------------------------------- |
| `empty`    |           ✗            |             ✗              |            ✗            | Full-bleed behind the white veil (warm canvas) |
| `overview` | ✓ route list (nav aid) |             ✗              |            ✗            | Maximal — map is the board                     |
| `focus`    |           ✓            |             ✗              | ✓ narrow metadata plate | Framed to selected polyline                    |
| `edit`     |           ✓            | ✓ search · status · action |  ✓ full property panel  | Same camera; tools over edges                  |

Derivation rule (pure, unit-testable):

- `empty` = routes loaded && `routes.length === 0`
- `edit` = plotting route open (`routeId !== null`)
- `focus` = a route/stop selected on the map, not editing
- `overview` = neither of the above

### Transition table

All transitions are **snaps** (decisive mount, no slide/tween — Route Sign reduced-motion default). The only permitted animation is the empty-veil fade (≤120 ms).

| From       | To         | Trigger                             | Happens                                                                          |
| ---------- | ---------- | ----------------------------------- | -------------------------------------------------------------------------------- |
| `empty`    | `edit`     | CTA → New Route dialog → create     | Veil lifts; left column mounts; chrome mounts; Add-stop active; camera unchanged |
| `overview` | `focus`    | Click polyline on map               | Right metadata plate mounts; route framed (quick snap, ≤400 ms)                  |
| `overview` | `edit`     | Click route item in left list       | Direct to edit — **list-click = act, map-click = peek**                          |
| `focus`    | `edit`     | "Edit route" on plate               | Right column swaps content in place; chrome mounts; no resize                    |
| `edit`     | `focus`    | Back / Esc (dirty → styled confirm) | Right column swaps back; chrome unmounts; highlight persists                     |
| `focus`    | `overview` | Esc / X / click empty map           | Right plate unmounts; camera unchanged                                           |
| `edit`     | `overview` | Save or discard                     | Route framed + highlighted in list; success state shown                          |
| `*`        | `empty`    | Last route deleted (styled confirm) | Columns unmount; veil remounts over warm canvas                                  |

Keyboard: Esc dismisses in `focus`; Esc returns to `focus` in `edit` (styled confirm if dirty — never `window.confirm`); CTA autofocuses in `empty`; mod+s saves in `edit`.

### Geometry (fixed tokens)

| Token         |            Value | Notes                                                                                                                    |
| ------------- | ---------------: | ------------------------------------------------------------------------------------------------------------------------ |
| Gutter        |            16 px | white desk between plates                                                                                                |
| Left column   |           240 px | constant across overview/focus/edit                                                                                      |
| Right column  |           336 px | **one width across focus and edit** (content swap, no resize)                                                            |
| Center column |        remainder | the map region; never scrolls                                                                                            |
| Shell rail    |  user preference | `sidebarMode` from `uiStore` is honored; the rail **pushes** layout, never overlays (decision D1, see Open decisions)    |
| Floor         | 1024 px viewport | below → NarrowWindowGate plate; the gate guards **map width ≥ 400px**, not a viewport class (works for both rail states) |

Canvas resize moments in the whole journey: exactly two — `empty→overview` (left mounts) and `overview→focus` (right mounts). `focus ⇄ edit` resizes nothing. With the rail collapsed at 1024 px the map is ≥ 416 px (1440 px ≈ 832 px; 1920 px ≈ 1312 px). With the rail expanded, the map-width gate takes over: it appears whenever the map would fall below 400 px.

---

## Invariants (do not break)

1. **One GL instance, forever.** Never unmount, never re-init, never touch the GL lifecycle from a state transition. Container resize → ResizeObserver → canvas resize; MapLibre preserves center/zoom. Camera moves happen only on explicit framing (focus, save).
2. **The center column is a one-hit-target region.** Transparent, never scrolls, no `touch-action` override, no `stopPropagation` on `pointerdown`. The canvas is the default hit target; `pointer-events: auto` is opt-in **only** on search/status/action bars.
3. **Right column has one width** across focus/edit. Changing the panel's _content_, never its footprint.
4. **Reduced-motion snap.** Mounts are instant; no slide/tween; veil fade ≤120 ms; framing ≤400 ms. Gate any motion behind `prefers-reduced-motion`.
5. **Plate grammar.** White plates, 1px border, ≤4px corners, no shadows, 16px gutter. The map itself is a plate (white 1px border, square corners) — "plates on a white desk".
6. **No responsive system.** `min-width: 1024px` gate plate is the _only_ width behavior. No breakpoints, no sheets, no icon-rail collapses.
7. **A11y not waived by desktop-only.** Named landmarks (`<nav aria-label="Routes">`, `<aside aria-label="Route properties">`), keyboard paths (Esc, CTA autofocus, stop cycling), focus management, and ≥AA text sizes still apply.
8. **The safety net is sacred.** Draft (24h TTL, debounced), undo/redo, `beforeunload` + `pushState` guards, atomic save: re-homed, not re-designed.

---

## Project Structure

### Documentation (this feature)

- `specs/008-admin-route-workspace-refactor/plan.md` — this plan
- Follow-up (after user confirmation): `tasks.md` (task breakdown), ADR for desktop-only + three-layer architecture

### Source Code (repository root = `apps/admin/src`)

Conventions: `M` = modify · `A` = add · `D` = delete. Paths are relative to `apps/admin/src/` unless noted.

#### Phase 1 — Shell, gate, tokens

| Op  | File                                   | Change                                                                                                                                                                                       |
| --- | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M   | `app/AppShell.tsx`                     | Workspace route renders honoring the admin's persisted `sidebarMode` (no forcing); mounts the NarrowWindowGate.                                                                              |
| M   | `app/NavRail.tsx`                      | The rail always **pushes** layout on the workspace and never hover-expands over it — fixes critique P1 (rail swallowing the list) while respecting the admin's saved preference.             |
| A   | `features/routes/NarrowWindowGate.tsx` | Full-screen "wider window" plate; one `matchMedia` listener; guards **map width ≥ 400px** (works for both rail states), not a viewport class — one invariant check, not a responsive system. |
| M   | `lib/uiStore.ts`                       | Workspace reads the persisted `sidebarMode` as-is; no per-route override.                                                                                                                    |
| M   | `index.css`                            | Add `prefers-reduced-motion` guard; fix `DialogFooter` `rounded-b-xl` → 4px radius token (critique P3).                                                                                      |

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
| M   | `features/routes/EmptyState.tsx`         | Full-screen white veil over the warm canvas (Route Sign "fresh board"), subtle `backdrop-filter` blur only behind `@supports`, white tint fallback; CTA autofocus; text + CTA per critique (Import JSON disabled affordance clarified). |
| D   | `features/routes/OverviewRoutePanel.tsx` | Absorbed into the LeftColumn overview variant.                                                                                                                                                                                          |
| M   | `features/routes/FareConfigSelect.tsx`   | Reused unchanged inside EditPanel.                                                                                                                                                                                                      |

#### Phase 4 — Map layer (Layer 1 + 2)

| Op  | File                                                  | Change                                                                                                                                                                            |
| --- | ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M   | `features/routes/RouteMap.tsx`                        | GL container = center column; ResizeObserver sizing; camera preserved across the two resize moments; polyline hover → route name plate (mouse-first); no re-init on state change. |
| M   | `features/routes/RouteOverviewLayer.tsx`              | Fix 0.15 opacity dimming → ≥0.3 with hover lift (critique P3); keep route names accessible via the left column + plate (not tooltip-only).                                        |
| M   | `features/routes/stopLabels.ts` · `lib/stopShapes.ts` | Bump 10 px chips to ≥11–12 px where AA requires (critique Sam persona).                                                                                                           |

#### Phase 5 — Copy, consistency, polish

| Op  | File                                            | Change                                                                                                                  |
| --- | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| M   | `pages/RouteWorkspace.tsx` + `PoiSearchBar.tsx` | Replace dev jargon ("Add a MAPBOX_SECRET_TOKEN", "out of sync") with plain operational copy (critique P3, heuristic 2). |
| M   | `pages/RouteWorkspace.tsx`                      | Replace `window.confirm()` (load-latest, leave-navigation) with styled AlertDialog (critique P3, heuristic 4).          |
| M   | `features/routes/PropertiesPanel.tsx`           | Invalid-hex field feedback instead of silent ignore; empty stop-name validation hint (heuristic 5).                     |

---

## Complexity Tracking

- State machine: pure selector over existing store fields — low risk, unit-testable.
- GL lifecycle: the single highest-risk change is any accidental unmount/re-init; guarded by the Phase 4 invariant and a smoke check that the map canvas element identity is stable across all four states.
- Column mounts/unmounts: pure conditional render — low risk.
- No data, API, or schema changes — the refactor is entirely presentation.

---

## Acceptance Criteria

1. At 1024, 1440, and 1920 px (rail collapsed) the three columns never collide; the center map is ≥ 416 px at the floor. With the rail expanded, the map-width gate appears instead of letting the map drop below 400 px.
2. The GL canvas element identity and camera survive all four states and both resize moments.
3. All eight transitions in the table behave; Esc / mod+s / CTA autofocus work.
4. No `window.confirm` remains; no "MAPBOX_SECRET_TOKEN" copy remains; no banner stacking (draft + conflict never overlap).
5. Draft restore, undo/redo, save validation, and atomic save behave exactly as before (regression checklist against current behavior).
6. `pnpm --filter admin lint`, `pnpm --filter admin typecheck`, `pnpm --filter admin build` pass; existing admin tests pass; new pure-helper tests (state machine, geometry, gate) are written first and green.
7. Detector run (`detect.mjs`) on the refactored files stays clean (exit 0) — same as the baseline critique run.

---

## Resolved decisions

- **D1 — Shell rail**: respects the admin's persisted `sidebarMode` (user preference, decided 2026-08-10); the rail pushes layout, never overlays; the map-width gate absorbs the expanded-rail case.
- **D2 — ADR**: written — `docs/adr/0014-admin-workspace-layers.md` (desktop-only constraint + three-layer/three-column/four-state architecture).
- **D3 — Empty-veil blur**: white veil mandatory; subtle `backdrop-filter` blur only behind `@supports`, white-tint fallback on weak GPUs.
