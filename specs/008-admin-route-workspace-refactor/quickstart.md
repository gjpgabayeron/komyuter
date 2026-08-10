# Quickstart — Validating the Admin Route Workspace Refactor

**Phase 1 output for [plan.md](./plan.md) · Branch `008-admin-route-workspace-refactor`**

This is a run/validation guide, not implementation. It proves the feature works end-to-end against the spec's measurable success criteria (SC-001…SC-008). Refer to [contracts/](./contracts/) and [data-model.md](./data-model.md) for the underlying contracts.

## Prerequisites

- pnpm workspace installed (`pnpm install` at repo root; `.npmrc` sets `auto-install-peers`).
- Backend running **if you want to exercise save/draft/conflict flows** (local Supabase stack + `apps/server/.env`, per AGENTS.md). Pure layout/state validation does **not** need the backend — seed a few routes via the API or use the existing dev fixture flow.
- Admin app dev server: `pnpm --filter admin dev`.

## 1. Automated gates (run first — must pass)

```bash
pnpm --filter admin lint        # root flat ESLint config
pnpm --filter admin typecheck   # tsc --noEmit (strict, shared config)
pnpm --filter admin test        # vitest run — existing 17 files + new pure-helper tests
pnpm --filter admin build       # production build
```

**New tests this feature adds** (TDD — written red-first, per [contracts/](./contracts/)):

- `deriveUiState` — all 5 rules in the selector contract.
- `mapWidth` — overview/focus formulas and the gate boundary (399 / 400 / 401 px).

Expected: all green; the detector (`detect.mjs` — see §4) stays at exit 0 on the refactored files, same as the baseline critique run.

## 2. Manual validation matrix

Run through the workspace in a desktop browser at **1024, 1440, and 1920 px** (rail collapsed) and with the **rail expanded**.

### 2.1 SC-001 — No collisions, map never below 400 px

1. At all three widths and both rail states: left column, center map, right column (when present) **never overlap** and never collide with the shell rail.
2. Focus state at 1024 px rail-collapsed: map = 416 px; rail-expanded: the **wider-window gate plate** appears instead of a < 400 px map.
3. Below 1024 px: the gate plate shows the "wider window" message and the workspace is unreachable. No partial layouts, no horizontal scroll.

### 2.2 SC-002 — One map, forever

Smoke check: with the DevTools console open, enter **empty → overview → focus → edit → focus → overview** and confirm:

- the GL canvas element is the **same DOM node** throughout (no remount, no flicker);
- camera (center/zoom) persists across `overview→focus→edit` and back;
- the canvas resizes at exactly two moments: `empty→overview` and `overview→focus` (`focus ⇄ edit` resizes nothing).

### 2.3 SC-003 — All eight transitions behave

Walk the full [transition table](../plan.md#transition-table): empty→edit (CTA), overview→focus (map click), overview→edit (list click), focus→edit (Edit CTA), edit→focus (Back/Esc), focus→overview (Esc/X/empty click), edit→overview (save/discard), *→empty (delete last route with styled confirm). Verify each trigger, each side effect, and that **no intermediate states** appear.

### 2.4 SC-004 — Safety net preserved (regression checklist)

Compare against current behavior, unchanged:

- Draft: edit a route, wait for the debounced draft, reload — restore banner appears in the StatusBar slot; 24 h TTL intact.
- Undo/redo: plotting history behaves exactly as before.
- Save: validation (empty stop names, invalid hex, LTFRB fare) and atomic save behave identically; conflict banner appears alone in the slot — **draft + conflict never stack**.
- `beforeunload` + `pushState` guards still protect dirty state.

### 2.5 SC-005 — Critique findings resolved

- No `window.confirm` anywhere (`Ctrl+Shift+F` in the workspace bundle); dirty exits use the styled AlertDialog.
- No "MAPBOX_SECRET_TOKEN"/"out of sync" copy remains.
- Save status is visible: unsaved → saving → "Saved just now" in the StatusBar.
- POI search is anchored to the center-column edge — resize the window and confirm the search bar tracks the column, not a fixed offset from the left.

### 2.6 SC-006 — Keyboard & a11y

- Esc in `focus` → overview; Esc in `edit` (dirty) → styled confirm, then back to `focus`; CTA autofocus in `empty`; `Ctrl/Cmd+S` saves.
- Landmarks: `<nav aria-label="Routes">` and `<aside aria-label="Route properties">` present; focus lands on the newly mounted plate's primary action.
- `prefers-reduced-motion: reduce` disables the veil fade; polyline dim ≥ 0.3 with hover lift; stop chips ≥ 11–12 px; text ≥ AA.

### 2.7 SC-007 — Gates green

§1 commands pass, including the new pure-helper tests.

### 2.8 SC-008 — Detector clean

Re-run `detect.mjs` on the refactored files (`RouteWorkspace.tsx`, new `workspace/*` components, `RouteList`, `PoiSearchBar`, `PropertiesPanel`, `RouteMap`, `RouteOverviewLayer`, `EmptyState`, `StatusBar`, `NarrowWindowGate`): exit 0, same as the baseline critique run.

## 3. Key scenarios (end-to-end story)

**The editing journey** — from the left list, click a route (T3 → edit directly). Plot/add stops with Add mode, watch the StatusBar flip unsaved→saving→"Saved just now". Press Esc — styled confirm since dirty → back to focus on the same route, highlight persists → Esc → overview, camera unchanged. This single journey exercises T3, T4→edit chrome, T5, T6 and SC-002/003/004/006 together.

**The peek journey** — in overview, click a route's polyline (T2): the FocusPlate mounts, the route frames in ≤ 400 ms, and the map keeps its place on dismiss (T6). This exercises the two-resize-moments invariant (SC-002).

**The empty start** — with no routes: veil over the warm canvas, autofocused CTA; create a route (T1) and confirm the veil lifts with no camera jump.

## 4. Detector note

`detect.mjs` (the heuristic detector used by the design critique) is the regression oracle for SC-008 — run it against the baseline critique output and diff: only the _intended_ findings (layout collisions, rail swallow, banner collision, `left-86`, save-status, a11y, copy, `window.confirm`) may flip; new findings are failures.

## 5. Out of scope for this guide

- Backend/API validation — zero changes here (presentation-only).
- Performance/latency measurement — zero new requests by design; only the snap budgets (§2.2/§2.6 timings) are asserted.
