# Research & Decisions — Admin Route Workspace Refactor

**Phase 0 output for [plan.md](./plan.md) · Branch `008-admin-route-workspace-refactor`**

## Status

**No open unknowns.** The feature design was fully resolved before planning (ADR-0014 ACCEPTED; D1–D3 recorded; transition table and geometry fixed). This file records the decisions with rationale and alternatives — every "NEEDS CLARIFICATION" in the Technical Context resolved to zero. No further research required for `/speckit.tasks`.

---

## Decision: Map lifecycle — one persistent MapLibre GL instance, never re-initialized

- **Decision**: The GL instance is mounted once by `RouteMap.tsx` and survives all four states; state transitions only resize the canvas via ResizeObserver.
- **Rationale**: Preserves camera/zoom and loading state across mode switches (the page's core UX promise — "the map never flickers, reloads, or loses its place", FR-003); matches ADR-0013 (one map surface) and the spec's SC-002. MapLibre keeps center/zoom on container resize, so framing is cheap and lossless.
- **Alternatives considered**: unmount/remount per state (rejected — reload, flicker, camera loss); DOM overlay of a second map (rejected — two GL contexts, violates ADR-0013).
- **Where recorded**: ADR-0013, ADR-0014, spec FR-003 / SC-002, plan Phase 4 + Invariant 1.

## Decision: State machine — pure derived `uiState` selector over the existing zustand store

- **Decision**: `lib/plottingStore.ts` exposes a pure `uiState` selector (`empty | overview | focus | edit`) derived from existing fields (`routes.length`, `routeId`, new `focusedRouteId`), plus the transition table as the source of truth for the orchestrator.
- **Rationale**: Pure derivation over existing store fields is unit-testable with zero DOM/WebGL mocking (TDD, red-first); no new store or reducer library needed (zero new deps); the four states map 1:1 to the spec's FR-002 derivation rule.
- **Alternatives considered**: a new zustand store slice (rejected — splits state across two stores); a reducer/XState machine (rejected — new dependency, overkill for four states); derived-by-render heuristics in components (rejected — untestable, drift-prone).
- **Where recorded**: spec FR-002, plan Phase 2, [contracts/workspace-state-machine.md](./contracts/workspace-state-machine.md).

## Decision: Window-width gate — map-width invariant, not a viewport breakpoint

- **Decision**: `NarrowWindowGate` guards **map region width ≥ 400 px** (one `matchMedia` listener feeding a single invariant check), independent of the shell rail's expanded/collapsed state.
- **Rationale**: The rail is a persisted user preference (D1) that changes available width by ~64 px; a fixed viewport breakpoint would either allow a sub-400 px map (rail expanded) or block usable widths (rail collapsed). The map-width gate is the actual invariant the spec cares about (SC-001) and works for both rail states.
- **Alternatives considered**: Tailwind breakpoint classes (rejected — that is a responsive system; the feature is desktop-only by declaration, ADR-0014); a 1024 px viewport class (rejected — wrong invariant, see above).
- **Where recorded**: spec FR-001 / SC-001, ADR-0014, plan Phase 1 + Invariant 6.

## Decision: Canvas sizing — ResizeObserver on the center column

- **Decision**: The center column is observed; on resize, the GL canvas is resized (existing react-map-gl ResizeObserver path) — at most twice in the whole journey (`empty→overview`, `overview→focus`; `focus ⇄ edit` resizes nothing).
- **Rationale**: Gives MapLibre the exact pixel size without touching the GL lifecycle; bounded to two moments per spec (SC-002) so map content never reflows unexpectedly.
- **Alternatives considered**: fixed canvas + CSS scale (rejected — destroys hit-testing and labels); re-init on column mount (rejected — violates Invariant 1).
- **Where recorded**: spec Edge cases "Canvas resize moments", plan Architecture + Phase 4.

## Decision: Motion — instant snaps, reduced-motion default, veil fade ≤ 120 ms

- **Decision**: All state transitions are decisive mounts (no slide/tween); the only animation is the empty-veil fade ≤ 120 ms; framing snap ≤ 400 ms; everything gated behind `prefers-reduced-motion`.
- **Rationale**: Route Sign grammar is flat/no-motion (DESIGN.md); reduced-motion is the default rather than the exception; the spec's "instantly clear" criteria (FR-006) forbid lazy transitions.
- **Alternatives considered**: spring/slide transitions per column (rejected — violates Route Sign grammar and reduced-motion default); no fade on the veil (rejected — veil lift needs a tiny dissolve for legibility).
- **Where recorded**: spec FR-006, plan Invariant 4, `index.css` change in Phase 1.

## Decision: Draft/save behavior — preserved, not re-designed

- **Decision**: Draft (24 h TTL, debounced), undo/redo, snapping, `beforeunload` + `pushState` guards, atomic save, and `window.confirm` replacement are re-homed or upgraded in place only (FR-007, FR-010). Save status is visualized via a StatusBar dirty→saving→"Saved just now" machine.
- **Rationale**: Behavior freeze (spec FR-012) exists precisely because the safety net is user-tested and delicate; the refactor's job is presentation. The only behavioral upgrade is replacing `window.confirm` with the styled AlertDialog (critique P3) and surfacing save state (critique P2).
- **Alternatives considered**: re-architecting draft/save (rejected — out of scope, high risk, violates FR-010/FR-012); leaving save status invisible (rejected — critique P2 finding).
- **Where recorded**: spec FR-007 / FR-010 / FR-012, plan Phase 5 + Acceptance Criterion 4.

## Verified facts (code check, 2026-08-10)

| Fact                                                                                              | Verified | Source                                                                                                                                                                                                                                          |
| ------------------------------------------------------------------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ADR-0014 exists and is ACCEPTED; records "with: specs/008-admin-route-workspace-refactor/plan.md" | ✅       | `docs/adr/0014-admin-workspace-layers.md`                                                                                                                                                                                                       |
| All required deps already in `apps/admin` — zero new dependencies                                 | ✅       | `apps/admin/package.json`: `maplibre-gl@^5.24`, `react-map-gl@^8.1.2`, `zustand@^5`, `react-hotkeys-hook@^4`, `sonner@^2`, `lucide-react@^1.28`, `@tanstack/react-query@^5`, `@base-ui/react@^1.6`, `@tailwindcss/vite@^4.3.3`, `vitest@^2.1.9` |
| Admin test suite exists (node env, pure helpers) — new tests join it                              | ✅       | `apps/admin/src/tests/` — 17 files incl. `plotting-store.test.ts`, `plottingHistory.test.ts`, `routeColors.test.ts`, `sections.test.ts`, `overlap.test.ts`                                                                                      |
| Tailwind 4 via `@tailwindcss/vite` (not postcss plugin)                                           | ✅       | `apps/admin/package.json`                                                                                                                                                                                                                       |
| Map stack from spec 007 is live in `apps/admin` (007's "no map stack" note obsolete)              | ✅       | deps above + existing `RouteMap.tsx`/`RouteOverviewLayer.tsx`                                                                                                                                                                                   |

## Left to planning (deferred deliberately)

- **Performance/latency targets**: none added — zero new network requests; the only budgets are the snap timings above.
- **Save-failure behavior**: preserved as current behavior (sonner toast); no new error state in this refactor.
- **Observability/logging**: not introduced — a thesis admin app with zero new requests; revisit only if tasks.md surfaces a need.
