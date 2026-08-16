# ADR-0015: Workspace floats plates over a full-bleed map backdrop (SUPERSEDES ADR-0014 layering)

**Status**: ACCEPTED (2026-08-11) · Supersedes the "three-column grid" part of [ADR-0014](./0014-admin-workspace-layers.md); the four-state model, desktop-only declaration, fixed geometry tokens, and the map-width gate survive unchanged.

## Context

ADR-0014 moved the workspace from floating overlay panels to a three-column CSS grid (240 | 16 | map | 16 | 336) so left/center/right could never overlap. The implementation (specs/008, phases 1–9) shipped that grid. On review, the owner chose to restore the overlay aesthetic: the map should span the full workspace as a seamless backdrop, with the left, center, and right plates floating above it — the center track becomes a transparent workspace whose empty areas pass mouse events through to the map.

This is a deliberate reversal of the critique's structural fix (the critique's P1 — "fixed-width panels collide below ~964px" — is guarded differently now, see Consequences).

## Decision (revised 2026-08-11 — hybrid: grid skeleton over the full-bleed map)

1. **The map is the backdrop.** One persistent MapLibre instance fills the workspace root (`absolute inset-0`, z-0), mounted once, never unmounted or re-initialized — the identity/camera invariant is _stronger_: with the map spanning the full workspace, the GL canvas never resizes at all (the two resize moments of ADR-0014 are gone).
2. **A three-column grid lays the plates out over the map** (`256 | 16 | transparent center | 16 | 336`): the left route/stops plate and the right properties/FocusPlate sit in **content-adaptive tracks** — each track's inner wrapper is a capped flex column (`flex max-h-full flex-col`) with the plate root `min-h-0`, so a short list renders a short plate with the map visible around it, while long content fills the workspace and scrolls internally (the plate's own `overflow-y-auto`). A 12 px inset inside the track keeps the floating look. The 16 px gutters and the inset padding are transparent — the map shows through and receives pointer events there.
3. **The center track is a transparent workspace**: `pointer-events: none` on the track (clicks fall through to the map — add-stop, drag-stop, polyline focus, empty-map deselect); only its floating chrome opts back in.
4. **Floating chrome is mirrored on the top row of the center track**: POI search at `top-3 left-3`, the status slot at `top-3 right-3` — same row, same height, same visual hierarchy (status indicator mirrors the search bar). The plot action bar and snap warning sit bottom-center of the track. All offsets resolve against the track — no magic numbers.
5. **Empty state** keeps the map visible: a single centered plate over the warm canvas (no full-cover veil); the plate is `pointer-events: auto` on a `pointer-events: none` overlay.
6. `MapProvider` is lifted to the workspace root, so the map-context consumers (overview layer, POI search) can render anywhere under it — including inside the center track.

## Consequences

- **The collision guard survives**: the geometry tokens still pin the plate widths, and `computeMapWidth(viewport, railW, mode)` now describes the **free map region** — the width of the center track between the plates (same formula, same reference figures 400/816/1296, same 400 px floor). The `NarrowWindowGate` still keys off that free region + the 1024 px viewport floor, so the plates can never overlap the map region below the floor — the critique's P1 defect is guarded by the grid AND the gate.
  - Note on the floor: the reference figures (400 @ 1024 …) are **workspace-width** math. At a literal 1024 px window the collapsed rail (48 px) leaves a 976 px workspace, so the focus free region is 976 − 624 = **352 < 400 and the gate correctly guards** — a real 1024 px window needs ~1056 px (collapsed rail) to use the focus layout. This is the documented consequence of the 400 px invariant (FR-004), not a bug.
- **SC-002 is trivially satisfied**: the map never resizes or remounts across any state.
- **Content-adaptive panels**: the plates hug their content up to the workspace height (capped flex column `flex max-h-full flex-col` with a `min-h-0` plate root inside the full-height grid track) — short route/stop lists show a compact plate with the map around it, and long lists fill the track and scroll internally, never cut off (the original requirement that motivated this revision).
- **No magic offsets**: the chrome anchors to the center track's own edges; the `left: 264` token offset and the `top-14` status placement are gone.
- Unchanged from ADR-0014: desktop-only ≥ 1024 px, four-state derivation, rail per-mode behavior (expanded docks/pushes, hover overlays — see ADR-0014 Shell rail), draft/undo/redo/save behavior freeze, Route Sign visual world, landmarks + keyboard contract.

## Where recorded

`specs/008-admin-route-workspace-refactor/plan.md` (geometry), `contracts/layout-geometry.md`, `quickstart.md` (SC-001/SC-002 wording), `spec.md` (SC-001), `tasks.md` (Phases 10–11).
