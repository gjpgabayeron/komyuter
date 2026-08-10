# Contract: Layout Geometry & Column Components

**Part of [plan.md](../plan.md) · Branch `008-admin-route-workspace-refactor`**

Fixed geometry that makes collision impossible at the 1024 px floor. No responsive system — this table is the entire layout vocabulary (ADR-0014, spec FR-001).

## 1. Token table (single source of truth — export from `features/routes/workspace/geometry.ts`)

```ts
export const WORKSPACE_GEOMETRY = {
  gutter: 16, // px — white desk, only BETWEEN plates (no outer margins)
  leftCol: 240, // px — constant across overview/focus/edit
  rightCol: 336, // px — ONE width across focus and edit
  minMapWidth: 400, // px — gate invariant, not a viewport class
  minViewport: 1024, // px — declared desktop floor
} as const;
```

**Map-width formulas** (rail collapsed; `railW` = persisted shell-rail width):

| State            | Map width                                          |
| ---------------- | -------------------------------------------------- |
| `overview`       | `viewport − railW − leftCol − gutter`              |
| `focus` / `edit` | `viewport − railW − leftCol − rightCol − 2·gutter` |

Reference (rail collapsed): overview @ 1024 = **768**; focus @ 1024 = **416** (floor), @ 1440 = **832**, @ 1920 = **1312**.

## 2. Gate contract (`NarrowWindowGate`)

- One `matchMedia`-backed listener; recomputes the **map width** from the formula above (not a viewport class).
- Condition: `mapWidth < 400` → render the full-screen "wider window" plate; `mapWidth ≥ 400` → render children.
- Must work identically for both rail states (the expanded rail widens the trigger viewport — correct).
- Must not flash: initial paint honors the first measured width; only the empty-veil fade (≤ 120 ms) may animate on transitions through the gate.
- Children must not mount/unmount the GL instance when toggling (gate sits **outside** `RouteMap`).

## 3. Column contracts

### LeftColumn (240 px) — `<nav aria-label="Routes">`

| Property             | Contract                                                                         |
| -------------------- | -------------------------------------------------------------------------------- |
| Width                | fixed 240 px; internal scroll; never overlays the map                            |
| Content (`overview`) | route list — nav aid; item click → **edit** (T3); hover → map polyline highlight |
| Content (`edit`)     | route's stop list — reorder, insert-after affordance, active-stop highlight      |
| Mounts               | `overview`, `focus`, `edit`                                                      |
| Map interaction      | hover/locate actions must **not** steal `pointerdown` from the center column     |

### RightColumn (336 px)

| Property          | Contract                                                                                                                                 |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Width             | fixed 336 px — **identical in `focus` and `edit`** (content swap, no resize; Invariant 3)                                                |
| Content (`focus`) | FocusPlate — route metadata + "Edit route" CTA (→ T4) + close (→ T6)                                                                     |
| Content (`edit`)  | EditPanel — mini state machine: route / stop / direction contexts (existing `PropertiesPanel` content retitled); FareConfigSelect reused |
| Mounts            | `focus`, `edit`; **never** in `overview`/`empty`                                                                                         |

### CenterColumn (remainder)

| Property             | Contract                                                                                                                                                  |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sizing               | `remainder`; never scrolls; hosts the GL container                                                                                                        |
| Hit target           | one-hit region: no `stopPropagation` on `pointerdown`; `pointer-events: auto` opt-in **only** on search/status/action bars (Invariant 2)                  |
| Chrome (`edit` only) | PoiSearchBar (top-left of the column, anchored to the column edge — **no `left-86` magic number**, SC-008); StatusBar (top-right); PlotActionBar (bottom) |

## 4. Canvas contract (`RouteMap`)

- GL container = CenterColumn; sizing via ResizeObserver; MapLibre preserves center/zoom on resize.
- Exactly two resize moments in the whole journey: `empty→overview`, `overview→focus`; `focus ⇄ edit` resizes nothing.
- Never re-initialize the GL instance from any state transition (Invariant 1; SC-002).
- Polyline hover → route-name plate (mouse-first); click → focus selection (T2).

## 5. A11y contract (FR-009, not waived by desktop-only)

- Landmarks: `<nav aria-label="Routes">` (left), `<aside aria-label="Route properties">` (right); main map region landmarked.
- Focus management: on state transition, focus moves to the newly mounted plate's primary action; Esc returns focus per the keyboard contract; stop cycling is keyboard-reachable.
- Color: polyline dim ≥ 0.3 opacity with hover lift; stop chips ≥ 11–12 px; ≥ AA contrast on all plate text.

## 6. Validation notes (TDD)

- `mapWidth(viewport, railW, state)` is pure — unit-test the formulas and the `≥ 400` gate boundary (399/400/401) in `apps/admin/src/tests/`.
- The two-resize-moments invariant is verified by the SC-002 smoke check (canvas identity stable across transitions) — manual, listed in [quickstart.md](../quickstart.md).
