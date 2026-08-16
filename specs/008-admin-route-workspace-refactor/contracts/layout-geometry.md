# Contract: Layout Geometry & Floating Plates

**Part of [plan.md](../plan.md) · Branch `008-admin-route-workspace-refactor`**

> **Revision (ADR-0015)**: the plates now FLOAT over a full-bleed map backdrop
> instead of a three-column grid. The token table, the map-region formulas,
> and the gate are unchanged — they now describe the **free map region**
> between the floating plates. See [ADR-0015](../../docs/adr/0015-workspace-floating-plates-over-map.md).

Fixed geometry that makes collision impossible at the 1024 px floor. No responsive system — this table is the entire layout vocabulary (ADR-0014, ADR-0015, spec FR-001).

## 1. Token table (single source of truth — export from `features/routes/workspace/geometry.ts`)

```ts
export const WORKSPACE_GEOMETRY = {
  gutter: 0, // px — NO gutter track: the 12 px `p-3` inset padding on each column cell is the spacing (an extra gutter would double-space)
  leftCol: 256, // px — constant across overview/focus/edit (floating left plate)
  rightCol: 336, // px — ONE width across focus and edit (floating right plate)
  minMapWidth: 400, // px — gate invariant, not a viewport class
  minViewport: 1024, // px — declared desktop floor
} as const;
```

**Free-map-region formulas** (rail collapsed; `railW` = persisted shell-rail width). The map itself spans the whole workspace (ADR-0015); these compute the strip NOT covered by the floating plates — the region the user actually interacts with. Hover mode uses the **collapsed** figures: the rail overlays the workspace at `z-30` without changing its width, so the free region is unaffected by hover-expand.

| State            | Free map region                         |
| ---------------- | --------------------------------------- |
| `overview`       | `viewport − railW − leftCol`            |
| `focus` / `edit` | `viewport − railW − leftCol − rightCol` |

Reference (rail collapsed): overview @ 1024 = **768**; focus @ 1024 = **432**, @ 1440 = **848**, @ 1920 = **1328**. These are **workspace-width** figures (the strip right of the shell rail): at a literal 1024 px window the 48 px collapsed rail leaves 976 px of workspace, so the focus region is 384 and the gate guards — the floor is effectively ~1024 px of workspace with the rail collapsed, ~1072 px of window.

## 2. Gate contract (`NarrowWindowGate`)

- Self-measuring (`ResizeObserver` on its own wrapper) + one `matchMedia`-backed listener; recomputes the **free map region** from the formula above.
- Condition: `freeMapRegion < 400` OR below the 1024 px viewport floor → the full-window "wider window" plate covers the workspace; otherwise children render.
- Must work identically for both rail states (the expanded rail widens the trigger viewport — correct). Hover mode needs no special case: the rail overlays the content without changing workspace width, so the gate sees the collapsed-state geometry.
- Must not flash: initial paint honors the first measured width.
- Children (including the GL instance) stay **mounted under the plate** — the plate is an opaque overlay and the covered chrome is made `inert`; toggling never remounts or resizes the map (SC-002 holds even through the gate).

## 3. Plate contracts (grid over the full-bleed map — ADR-0015 revision)

### LeftPlate (256 px track) — `<nav aria-label="Routes">`

| Property             | Contract                                                                                                                                                                                                                                                                                                                                   |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Track                | fixed 256 px grid track, **full height** (the `minmax(0, 1fr)` row is the cap reference); the plate inside is **content-adaptive** — capped flex column `flex max-h-full flex-col` with a `min-h-0` plate root and a 12 px inset (floating look): short content renders a short plate, long content fills the track and scrolls internally |
| Content (`overview`) | route list — nav aid; item click → **edit** (T3); hover → map polyline highlight                                                                                                                                                                                                                                                           |
| Content (`edit`)     | route's stop list — reorder, insert-after affordance, active-stop highlight                                                                                                                                                                                                                                                                |
| Mounts               | `overview`, `focus`, `edit` (hidden in `empty`)                                                                                                                                                                                                                                                                                            |
| Map interaction      | only the plate face is `pointer-events: auto`; the track's inset padding passes clicks through to the map                                                                                                                                                                                                                                  |

### RightPlate (336 px track) — `<aside aria-label="Route properties">`

| Property          | Contract                                                                                                                                                                                                                                                       |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Track             | fixed 336 px grid track, **full height** (cap reference); plate inside is **content-adaptive** (capped flex column `flex max-h-full flex-col`, `min-h-0` plate root, inset 12 px) — **identical in `focus` and `edit`** (content swap, no resize; Invariant 3) |
| Content (`focus`) | FocusPlate — route metadata + "Edit route" CTA (→ T4) + close (→ T6)                                                                                                                                                                                           |
| Content (`edit`)  | EditPanel — route / stop contexts (existing `PropertiesPanel` content); FareConfigSelect reused                                                                                                                                                                |
| Mounts            | `focus`, `edit`; **never** in `overview`/`empty`                                                                                                                                                                                                               |

### Center track (transparent workspace)

| Property             | Contract                                                                                                                                                                                                                                                                            |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sizing               | `minmax(0, 1fr)` — the free map region (the gate's formula); `pointer-events: none` so clicks fall through to the map                                                                                                                                                               |
| Hit target           | the map receives every pointer event the plates don't cover — add-stop, drag-stop, polyline focus, empty-map deselect (no `stopPropagation` on `pointerdown`); the grid **container** is `pointer-events: none` (its box would otherwise swallow free-region clicks before the map) |
| Chrome (`edit` only) | **PoiSearchBar `top-3 left-3` + StatusBar `top-3 right-3` — mirrored on the same top row** (US4 requirement); PlotActionBar + snap warning bottom-center                                                                                                                            |
| Empty state          | single centered plate over the warm map (no full-cover veil); plate is `pointer-events: auto` on a `pointer-events: none` overlay                                                                                                                                                   |

## 4. Canvas contract (`RouteMap`)

- GL container = the full workspace; sizing via ResizeObserver; MapLibre preserves center/zoom on resize.
- **Zero resize moments**: the map spans the workspace in every state, so column mounting never changes the canvas size (SC-002 is trivially satisfied).
- Never re-initialize the GL instance from any state transition (Invariant 1; SC-002).
- Polyline hover → route-name plate (mouse-first); click → focus selection (T2).

## 5. A11y contract (FR-009, not waived by desktop-only)

- Landmarks: `<nav aria-label="Routes">` (left), `<aside aria-label="Route properties">` (right); main map region landmarked.
- Focus management: on state transition, focus moves to the newly mounted plate's primary action; Esc returns focus per the keyboard contract; stop cycling is keyboard-reachable.
- Color: polyline dim ≥ 0.3 opacity with hover lift; stop chips ≥ 11–12 px; ≥ AA contrast on all plate text.

## 6. Validation notes (TDD)

- `mapWidth(viewport, railW, state)` is pure — unit-test the formulas and the `≥ 400` gate boundary (399/400/401) in `apps/admin/src/tests/` (unchanged: the formulas describe the free region).
- The map-identity invariant is verified by the SC-002 smoke check (canvas identity stable across transitions) — manual, listed in [quickstart.md](../quickstart.md).
