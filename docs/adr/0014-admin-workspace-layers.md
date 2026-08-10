# ADR-0014: Admin Route Workspace is desktop-only, three-layer, column-based (ACCEPTED)

The Route Workspace (`apps/admin/src/pages/RouteWorkspace.tsx`) started as floating overlay panels over a full-bleed MapLibre canvas. A design critique (2026-08-10) scored it 30/40 (Nielsen) with the layout as the weakest system: fixed-width absolutes collide below ~964px, the shell NavRail hover-expand swallows the route list, two banners share one top-center slot, and POI search is coupled to panel width by a magic number. We chose a structural rebuild instead of cosmetic patches:

## Desktop-only by declaration

The admin dashboard supports **desktop browsers only, minimum viewport 1024px**. There are **no responsive breakpoints and no touch design** — mouse-first workflows (hover as a first-class affordance, precise spatial interaction) are the product. Below the floor a single full-screen "wider window" plate (`NarrowWindowGate`) replaces the page; it guards the **map's** usable width (≥ 400px), not a viewport class, so it is one invariant check, not a responsive system.

Rationale: the map interactions, multilayered UI, and column layout would not translate to smaller screens without significant functional compromise; the constraint buys the freedom to optimize for the desk worker (the curator persona) and lets the geometry be fixed tokens rather than a breakpoint cascade. Desktop-only is **not** an accessibility waiver — keyboard paths, landmarks, and contrast rules still apply.

## Three layers

1. **Basemap** — one persistent MapLibre GL instance (ADR-0013), mounted once, **never unmounted or re-initialized** across states.
2. **Polyline Routes** — all route/stop/draft geometry as MapLibre layers on that single instance (never DOM, never a second canvas).
3. **Floating UI** — DOM plates above the canvas: left column (routes/stops nav, 240px), center column (the map region + per-state chrome: search top-left, status top-right, action bar bottom), right column (contextual properties, 336px), with 16px gutters ("plates on a white desk").

## Four states

`empty` (veil over warm canvas, columns collapsed) · `overview` (left column only, map maximal) · `focus` (map-clicked route → right metadata plate) · `edit` (full chrome + property panel). Derivation: `empty` = no routes; `edit` = plotting route open; `focus` = selection without edit; else `overview`. Transitions are decisive snaps (reduced-motion default), never tweens.

**Key invariant**: the right column has **one width** across focus/edit (content swaps, footprint never changes), so the GL canvas resizes at most twice in the whole journey (empty→overview, overview→focus) — and state changes never touch the GL lifecycle.

## Shell rail

The workspace **respects the admin's persisted `sidebarMode` preference**; the rail always _pushes_ layout on the workspace and never hover-expands over it (fixing the "rail swallows the route list" defect). The map-width gate absorbs the expanded-rail case.

## Non-goals

No mobile/tablet support; no second GL instance; no DOM-drawn polylines; no backend/shared changes; no change to the draft (24h TTL), undo/redo, snapping, or atomic-save behavior — those are re-homed, not re-designed. The Route Sign visual world (white plates, ≤4px corners, no shadows, signboard green-blue, signal amber) is unchanged.

Supersedes: the overlay-layout portion of `specs/007`'s implementation. Complements: ADR-0013 (map stack). Recorded with: `specs/008-admin-route-workspace-refactor/plan.md`.
