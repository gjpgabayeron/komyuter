# Contract: Workspace State Machine

**Part of [plan.md](../plan.md) · Branch `008-admin-route-workspace-refactor`**

The Route Workspace's mode is a **pure function** of existing plotting-store fields — no new persisted state, no new store. This contract is the single source of truth the implementation (`lib/plottingStore.ts`, `pages/RouteWorkspace.tsx`) and its unit tests must satisfy.

## 1. Types

```ts
type UiState = "empty" | "overview" | "focus" | "edit";

// plottingStore fields this derivation reads (existing + one new):
interface PlottingState {
  loaded: boolean; // routes have been fetched
  routes: Route[]; // existing
  routeId: string | null; // existing — an edit/plotting session is open
  focusedRouteId: string | null; // NEW — map selection without editing
}
```

## 2. The selector (pure, unit-testable)

```ts
function deriveUiState(s: PlottingState): UiState {
  if (s.loaded && s.routes.length === 0) return "empty";
  if (s.routeId !== null) return "edit";
  if (s.focusedRouteId !== null) return "focus";
  return "overview";
}
```

**Rules (test these):**

| #   | Input                                                              | Result                                                        |
| --- | ------------------------------------------------------------------ | ------------------------------------------------------------- |
| 1   | `loaded && routes.length === 0`                                    | `empty` — regardless of `routeId`/`focusedRouteId`            |
| 2   | `routes.length > 0 && routeId !== null`                            | `edit` — edit wins over focus                                 |
| 3   | `routes.length > 0 && routeId === null && focusedRouteId !== null` | `focus`                                                       |
| 4   | `routes.length > 0 && routeId === null && focusedRouteId === null` | `overview`                                                    |
| 5   | `!loaded`                                                          | `overview` (loading state; never `empty` before data arrives) |

## 3. Store-field contract for `focusedRouteId`

- Set on: map polyline click (selection without edit).
- Cleared on: entering `edit` (any route — `openRoute` clears focus/selection/tool), `focus→overview` (Esc/X/empty-map click), **leaving the editor** (Back/Esc → `edit→overview`, the clean idle slate), route deletion, and when the selected route no longer exists.
- Never persisted; never leaves the store.

## 4. Transition table (8 transitions — the orchestrator's contract)

| #   | From       | To         | Trigger                             | Side effects (must happen)                                                                                    |
| --- | ---------- | ---------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| T1  | `empty`    | `edit`     | CTA → New Route dialog → create     | Veil lifts; left column mounts; center chrome mounts; Add-stop active; camera unchanged                       |
| T2  | `overview` | `focus`    | Click polyline on map               | Right column mounts (FocusPlate); route framed (quick snap ≤ 400 ms); `focusedRouteId` set                    |
| T3  | `overview` | `edit`     | Click route item in left list       | Direct to edit — **list-click = act, map-click = peek** (FR-005); camera unchanged                            |
| T4  | `focus`    | `edit`     | "Edit route" on plate               | Right column swaps FocusPlate → EditPanel **in place**; center chrome mounts; no resize                       |
| T5  | `edit`     | `overview` | Back / Esc (dirty → styled confirm) | Right plate unmounts; center chrome unmounts; focus + selection + tool cleared (idle slate); camera unchanged |
| T6  | `focus`    | `overview` | Esc / X / click empty map           | Right plate unmounts; camera unchanged; `focusedRouteId` cleared                                              |
| T7  | `edit`     | `overview` | Save or discard                     | Route framed + highlighted in list; StatusBar shows success                                                   |
| T8  | `*`        | `empty`    | Last route deleted (styled confirm) | Columns unmount; veil remounts over warm canvas                                                               |

**Invariant**: exactly one of the four states is active at any time; every side effect in the table is applied atomically with the state change (no intermediate states — transitions are snaps, FR-006).

## 5. Keyboard contract (FR-008)

| Key          | State   | Behavior                                                                            |
| ------------ | ------- | ----------------------------------------------------------------------------------- |
| `Esc`        | `focus` | T6 — dismiss to overview                                                            |
| `Esc`        | `edit`  | T5 — back to overview (styled confirm if dirty; **never** `window.confirm`, FR-007) |
| `Enter`      | `empty` | activates the autofocused CTA                                                       |
| `Ctrl/Cmd+S` | `edit`  | save (preventDefault; no browser save dialog)                                       |

## 6. Validation notes (TDD)

- `deriveUiState` is pure — unit-test all 5 rules in `apps/admin/src/tests/` (node env) **before** wiring the orchestrator (red-first).
- The transition side effects are component-level; the pure contract to test is the selector + the table's state legality (no transition may produce an invalid state for its trigger context).
