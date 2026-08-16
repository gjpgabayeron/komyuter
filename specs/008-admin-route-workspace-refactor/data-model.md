# Data Model — Admin Route Workspace Refactor

**Phase 1 output for [plan.md](./plan.md) · Branch `008-admin-route-workspace-refactor`**

## Bottom line

**This feature changes no persisted data.** There are no migrations, no API changes, no schema edits, and no new tables. The workspace reads the existing domain entities and _introduces no new entities_ — the only "model" this refactor adds is a **derived UI state machine** and a **fixed geometry token set**, both in-memory and presentational.

## 1. Existing domain entities (read-only references)

The workspace already loads and saves these through the existing plotting flow (`apps/admin/src/lib/` + `apps/admin/src/api/`); this refactor only _reads_ the same data the current page already has in hand.

| Entity                         | Source of truth                         | Used for                                                                               | Changed?                                                |
| ------------------------------ | --------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Route                          | loaded via API → `plottingStore.routes` | Left-column list, polyline layers, focus plate, edit panel                             | No                                                      |
| Direction (×2 per route)       | part of a route's payload               | Polyline rendering, stop ordering (ADR-0008)                                           | No                                                      |
| Stop                           | part of a direction's ordered stops     | Stop markers, stop list, stop editing context                                          | No                                                      |
| Draft (24 h TTL, localStorage) | existing draft module                   | Unsaved-state restore + `beforeunload` guard                                           | No (re-homed banner only)                               |
| `sidebarMode` (shell rail)     | `uiStore` (persisted)                   | Layout width decision (D1, reversed 2026-08-16: expanded docks/pushes, hover overlays) | No (now honored on the workspace instead of overridden) |

Validation rules (LTFRB fare, stop name non-empty, coordinate format `[lng, lat]`) live in the existing save path and are **untouched** (FR-012 behavior freeze).

## 2. The workspace state machine (the only new "model")

**States** — `empty | overview | focus | edit` (canonical names per constitution Principle IV; spec FR-002).

**Derivation** — pure function over existing store fields, no new state storage:

```
uiState(routes, routeId, focusedRouteId) =
  empty    if routes.loaded && routes.length === 0
  edit     if routeId !== null                        // a plotting session is open
  focus    if focusedRouteId !== null                 // map selection, not editing
  overview otherwise
```

- `focusedRouteId` is the **only new store field** (in `lib/plottingStore.ts`): the id of the route selected on the map for inspection. It is cleared on entering `edit` (any route), on `focus→overview`, **on leaving the editor** (`edit→overview`, clean idle slate), and on route deletion.

**Transitions** (8, all via explicit triggers — full table with triggers and side effects in [contracts/workspace-state-machine.md](./contracts/workspace-state-machine.md)):

`empty→edit`, `overview→focus`, `overview→edit`, `focus→edit`, `edit→overview` (Back/Esc), `focus→overview`, `edit→overview` (save/discard), `*→empty`.

**State → DOM model** (what each state renders):

| State      | Left column (256) |           Center chrome            |                      Right column (336)                       |           Map            |
| ---------- | :---------------: | :--------------------------------: | :-----------------------------------------------------------: | :----------------------: |
| `empty`    |         —         |                 —                  |                               —                               |  full-bleed under veil   |
| `overview` |  RouteList (nav)  |                 —                  |                               —                               |         maximal          |
| `focus`    |  RouteList (nav)  |                 —                  |                          FocusPlate                           | framed to selected route |
| `edit`     | RouteList (stops) | Search · StatusBar · PlotActionBar | EditPanel (mini state machine: route/stop/direction contexts) |       same camera        |

## 3. Geometry token model

Fixed, declarative, no responsive system (spec FR-001; ADR-0014):

| Token         |                   Value | Role                                                                                   |
| ------------- | ----------------------: | -------------------------------------------------------------------------------------- |
| `gutter`      |                    0 px | no gutter track — the 12 px `p-3` column inset is the spacing (double-spacing avoided) |
| `leftCol`     |                  256 px | constant across overview/focus/edit                                                    |
| `rightCol`    |                  336 px | one width across focus and edit                                                        |
| `centerCol`   |      `100% − 256 − 336` | the FREE map region between the floating plates (ADR-0015); never scrolls              |
| `rail`        | persisted `sidebarMode` | expanded docks/pushes; collapsed icon-width; hover overlays (D1, reversed 2026-08-16)  |
| `minMapWidth` |                  400 px | gate invariant (not a viewport class)                                                  |
| `minViewport` |                 1024 px | declared desktop floor                                                                 |

**Canvas resize moments in the whole journey: zero** — the map spans the full workspace as a backdrop (ADR-0015), so plate mounting never changes the canvas size. (SC-002)

**Map-width arithmetic (rail collapsed, no gutter track — the 12 px `p-3` column inset is the spacing)** — these are **workspace-width** figures (the strip right of the 48 px shell rail):

- `overview`: region = viewport − 256 → at 1024 px: **768 px**
- `focus`: region = viewport − 256 − 336 → at 1024 px: **432 px**, at 1440 px: **848 px**, at 1920 px: **1328 px** (REFACTOR.md reference figures)

The gate triggers on `free region < 400 px` regardless of rail state. At a literal 1024 px window the collapsed rail leaves 976 px of workspace, so the focus region is 976 − 592 = **384 < 400 and the gate fires** — the effective floor is ~1024 px of workspace (collapsed rail) / ~1072 px of window. That is correct — the **free map region, not the viewport, is the invariant** (SC-001, FR-004).

## 4. Non-goals (explicitly out of model scope)

- No new tables/columns/migrations; no API route changes; no shared-package changes.
- No persistence of `uiState`, `focusedRouteId`, or column geometry.
- No ETA data, no trust-score influence on layout (ADR-0009/ADR-0003 unaffected).
