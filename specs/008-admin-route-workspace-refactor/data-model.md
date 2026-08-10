# Data Model — Admin Route Workspace Refactor

**Phase 1 output for [plan.md](./plan.md) · Branch `008-admin-route-workspace-refactor`**

## Bottom line

**This feature changes no persisted data.** There are no migrations, no API changes, no schema edits, and no new tables. The workspace reads the existing domain entities and _introduces no new entities_ — the only "model" this refactor adds is a **derived UI state machine** and a **fixed geometry token set**, both in-memory and presentational.

## 1. Existing domain entities (read-only references)

The workspace already loads and saves these through the existing plotting flow (`apps/admin/src/lib/` + `apps/admin/src/api/`); this refactor only _reads_ the same data the current page already has in hand.

| Entity                         | Source of truth                         | Used for                                                   | Changed?                                                |
| ------------------------------ | --------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------- |
| Route                          | loaded via API → `plottingStore.routes` | Left-column list, polyline layers, focus plate, edit panel | No                                                      |
| Direction (×2 per route)       | part of a route's payload               | Polyline rendering, stop ordering (ADR-0008)               | No                                                      |
| Stop                           | part of a direction's ordered stops     | Stop markers, stop list, stop editing context              | No                                                      |
| Draft (24 h TTL, localStorage) | existing draft module                   | Unsaved-state restore + `beforeunload` guard               | No (re-homed banner only)                               |
| `sidebarMode` (shell rail)     | `uiStore` (persisted)                   | Layout width decision (D1)                                 | No (now honored on the workspace instead of overridden) |

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

- `focusedRouteId` is the **only new store field** (in `lib/plottingStore.ts`): the id of the route selected on the map for inspection. It is cleared on entering `edit` of a different route, on `focus→overview`, and on route deletion.

**Transitions** (8, all via explicit triggers — full table with triggers and side effects in [contracts/workspace-state-machine.md](./contracts/workspace-state-machine.md)):

`empty→edit`, `overview→focus`, `overview→edit`, `focus→edit`, `edit→focus`, `focus→overview`, `edit→overview`, `*→empty`.

**State → DOM model** (what each state renders):

| State      | Left column (240) |           Center chrome            |                      Right column (336)                       |           Map            |
| ---------- | :---------------: | :--------------------------------: | :-----------------------------------------------------------: | :----------------------: |
| `empty`    |         —         |                 —                  |                               —                               |  full-bleed under veil   |
| `overview` |  RouteList (nav)  |                 —                  |                               —                               |         maximal          |
| `focus`    |  RouteList (nav)  |                 —                  |                          FocusPlate                           | framed to selected route |
| `edit`     | RouteList (stops) | Search · StatusBar · PlotActionBar | EditPanel (mini state machine: route/stop/direction contexts) |       same camera        |

## 3. Geometry token model

Fixed, declarative, no responsive system (spec FR-001; ADR-0014):

| Token         |                        Value | Role                                  |
| ------------- | ---------------------------: | ------------------------------------- |
| `gutter`      |                        16 px | white desk between plates             |
| `leftCol`     |                       240 px | constant across overview/focus/edit   |
| `rightCol`    |                       336 px | one width across focus and edit       |
| `centerCol`   | `100% − 240 − 336 − gutters` | the map region; never scrolls         |
| `rail`        |      persisted `sidebarMode` | pushes layout (D1)                    |
| `minMapWidth` |                       400 px | gate invariant (not a viewport class) |
| `minViewport` |                      1024 px | declared desktop floor                |

**Canvas resize moments in the whole journey: exactly two** — `empty→overview` (left column mounts) and `overview→focus` (right column mounts). `focus ⇄ edit` resizes nothing.

**Map-width arithmetic (rail collapsed, gutters only _between_ plates — no outer margins):**

- `overview`: map = viewport − 240 − 16 → at 1024 px: **768 px**
- `focus`: map = viewport − 240 − 336 − 2·16 → at 1024 px: **416 px** (floor), at 1440 px: **832 px**, at 1920 px: **1312 px** (REFACTOR.md reference figures)

The gate triggers on `centerCol < 400 px` regardless of rail state. With the rail collapsed, the map stays ≥ 416 px across the declared floor, so the gate only fires when the rail is expanded (or the viewport drops below the declared floor); that is correct — the **map width, not the viewport, is the invariant** (SC-001).

## 4. Non-goals (explicitly out of model scope)

- No new tables/columns/migrations; no API route changes; no shared-package changes.
- No persistence of `uiState`, `focusedRouteId`, or column geometry.
- No ETA data, no trust-score influence on layout (ADR-0009/ADR-0003 unaffected).
