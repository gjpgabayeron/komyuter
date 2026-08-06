# Implementation Plan: Route Plotting Page

**Branch**: `007-route-plotting-page` | **Date**: 2026-08-06 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/007-route-plotting-page/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

The Route Plotting Page replaces the placeholder `RouteWorkspace` with a map-first surface where the Administrator draws a route's base path on the real road network: placing stops in order (Automatic or Manual mode), previewing the road-snapped polyline (Apply/Revert), dragging/repositioning stops, undoing/redoing edits, and saving **atomically** — one Save persists the base Direction + all Stops and auto-derives the return Direction (ADR-0011), per the clarified spec (FR-027, SC-013).

Verified against code, three capabilities the spec's FRs depend on **do not exist yet** and are therefore in this plan's scope (spec Assumption "adds no new server behavior" is corrected here):

1. **No map stack at all** in `apps/admin` (no map library installed; `RouteWorkspace.tsx:11-31` is a placeholder). This plan builds it per ADR-0013: **MapLibre GL JS + react-map-gl (maplibre entry)** with OSM-raster fallback tiles — `[lng, lat]` native, no conversion layer (the "Leaflet converter" in `AGENTS.md` never existed and must not be built; ADR-0013 supersedes ADR-0007).
2. **No road-snapping proxy** on the server (`/api/admin/mapbox/directions` does not exist; no `MAPBOX_*` env vars in `apps/server/src/config/env.ts`). Built per ADR-0013: server-proxied Mapbox Directions with `duration` stripped (ADR-0009), chunking at 25 waypoints, and a mock straight-line fallback when the token is unset (FR-009 dev-mode friendliness).
3. **No atomic save**: `POST /api/admin/routes/:routeId/directions` currently inserts the direction then `Promise.all`s stop inserts **without a transaction**. Extended to a transactional create of base Direction + Stops + auto-derived return Direction (FR-027/SC-013, ADR-0011).

Client-only plotting state (draft with 24h TTL in localStorage, undo/redo history, selection, layer toggles) is greenfield per the spec's Assumptions. All research decisions are recorded in [research.md](./research.md).

## Technical Context

**Language/Version**: TypeScript 5.5 (strict, `@repo/typescript-config/vite.json`) · React 18.3 · Vite 5.4 (admin) · Node 22 + Fastify v5 (server)

**Primary Dependencies**:

- Admin (new): `maplibre-gl@^6.2.0`, `react-map-gl@^8.1.2` (maplibre entry), `react-hotkeys-hook@^4`.
- Admin (existing, reused): `zustand`, `@tanstack/react-query` 5, `axios`, `sonner`, `@base-ui/react`, `zod` 4, Tailwind CSS 4 (`@tailwindcss/postcss`).
- Server (existing): Fastify v5 + `@fastify/type-provider-zod`, `drizzle-orm`, Postgres/PostGIS (global `fetch` for the Mapbox proxy — no new HTTP client).
- Shared (existing): `@komyuter/shared` zod schemas/types — extended additively (mapbox response schema).

**Storage**: PostgreSQL/PostGIS (existing `directions.base_polyline` LineString, `stops.location` Point — `src/db/queries.ts` `ST_GeomFromGeoJSON`/`ST_AsGeoJSON`); localStorage for the client-only Draft (24h TTL, never sent to the server).

**Testing**: Vitest — admin unit tests (`apps/admin/src/tests/`, node env, pure helpers only — no WebGL/jsdom mocking), server unit tests (`tests/unit/derive.test.ts`, `tests/unit/mapbox-proxy.test.ts` with stubbed fetch) + integration tests for the transactional save (require local Supabase stack + `apps/server/.env`, same discipline as `specs/001`). TDD: tests written first, red before implementation.

**Target Platform**: Desktop web (Chrome/Edge/Firefox current evergreen); the admin dashboard is desktop-only (spec Assumptions).

**Project Type**: Web application — one frontend feature (apps/admin) plus the minimal backend surface its FRs require (apps/server, packages/shared). No new workspace projects.

**Performance Goals**: snap-preview requests debounced 500 ms; >25-waypoint routes chunked server-side; plotting never blocks on the snapping service (best-effort, straight-line fallback); plot-and-save cycle under 5 minutes on first attempt (SC-012).

**Constraints**: `[lng, lat]` is the **sole** coordinate format (ADR-0013; no conversion layer); **no ETA anywhere** — the proxy strips `duration` (ADR-0009); Mapbox tokens optional in dev (OSM raster + mock snap fallback); API envelope `{ success, data | error }` with admin auth guard; Route Sign grammar (pure white ground, signboard green-blue + signal amber, ≤4px corners, no shadows, no state by color alone — FR-025/FR-019); strict TS via shared config; single root ESLint flat config; desktop-only; drafts expire after 24h.

**Scale/Scope**: Single region graph (Iloilo City Proper + Oton/Pavia/Leganes, ADR-0010); tens of routes; ~10–40 stops per direction; single Administrator user.

## Constitution Check

_GATE: Must pass before Phase 0 research. Re-check after Phase 1 design._

| #   | Principle                   | Verdict  | Evidence                                                                                                                                                                                                                                                                      |
| --- | --------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| I   | Precision Is Trust          | ✅ PASS  | Proxy strips `duration`; page displays no ETA (FR-021/FR-024, SC-010); displayed distances exact, never fabricated                                                                                                                                                            |
| II  | Recorded Decisions Govern   | ✅ PASS* | Implements ADR-0011 (base + auto-derived return), ADR-0013 (MapLibre + Mapbox proxy), ADR-0008, ADR-0009, ADR-0006. *ADR files 0011/0013 missing on disk — decisions live in ADMIN.md; write-the-ADR-files + stale-Leaflet reconciliation recorded as follow-up (research R6) |
| III | Shared, Never Reimplemented | ✅ PASS  | Extends existing `createDirectionSchema`/`createStopSchema`; new shared mapbox response schema reused by server + admin; strict TS config + root ESLint reused; no fare reimplementation                                                                                      |
| IV  | Canonical Language          | ✅ PASS  | Route/Direction/Stop/Administrator/Draft per CONTEXT.md; no synonyms introduced                                                                                                                                                                                               |
| V   | Measurable Deliverables     | ✅ PASS  | SC-001…SC-015 measurable; quickstart.md maps validation to SCs                                                                                                                                                                                                                |
| —   | Domain & Spatial            | ✅ PASS* | `[lng,lat]` sole format (MapLibre native — no converter, ADR-0013 supersedes ADR-0007); two directions per route; no ETA; envelope + auth guard. *Constitution/AGENTS.md stale "Leaflet exception (ADR-0007)" text superseded — doc reconciliation recorded (R6)              |
| —   | Engineering Workflow        | ✅ PASS  | Strict TS, root ESLint flat config, prettier `format:check`, commitlint; Vitest on admin + server; server tests first (TDD, specs/001 discipline)                                                                                                                             |
| —   | Design/Product systems      | ✅ PASS  | DESIGN.md/PRODUCT.md loaded for UI work; admin tokens already match Route Sign grammar (`index.css`); no new design system (FR-025)                                                                                                                                           |

**GATE: PASS** — no design violations. Two documentation-debt items (ADR files 0011/0013; stale Leaflet text in AGENTS.md/constitution) are tracked in Complexity Tracking as reconciliation tasks, not gate violations.

## Project Structure

### Documentation (this feature)

```text
specs/007-route-plotting-page/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
apps/admin/src/
├── features/
│   ├── auth/                      # existing — RequireAuth, session, api (unchanged)
│   ├── fares/                     # existing (unchanged)
│   └── routes/                    # NEW — the Route Plotting feature
│       ├── RouteWorkspace.tsx     # replaces pages/RouteWorkspace.tsx placeholder
│       ├── RouteMap.tsx           # MapLibre map (tiles via lib/tiles.ts), stops/polyline layers
│       ├── PlotActionBar.tsx      # centered floating bar: mode toggle, Connect, Apply/Revert, undo/redo
│       ├── LayerToggles.tsx       # Stops / Terminals / Routes visibility
│       ├── PropertiesPanel.tsx    # right-side contextual panel (stop + polyline editors)
│       ├── StopEditor.tsx         # name, type (terminal|major_stop|waiting_area), guarantee toggle
│       ├── PolylineEditor.tsx     # polyline props (exact length read-only, info)
│       ├── RouteList.tsx          # compact floating nav overlay: search + rows + New route
│       ├── NewRouteDialog.tsx     # minimal create-route form (POST /api/admin/routes)
│       ├── DraftRestoreBanner.tsx # restore / discard draft banner
│       ├── routesApi.ts           # axios → admin API (envelope-aware, existing lib/api.ts)
│       └── useRouteQueries.ts     # react-query hooks + queryKeys
├── lib/
│   ├── api.ts                     # existing envelope client (unchanged)
│   ├── queryKeys.ts               # existing + new plotting keys
│   ├── uiStore.ts                 # existing zustand store
│   ├── tiles.ts                   # NEW — OSM raster fallback / Mapbox vector (ADR-0013)
│   ├── coords.ts                  # NEW pure [lng,lat] helpers (equality, nearestCoordIndex)
│   ├── stopShapes.ts              # NEW pure stop-type → shape/color mapping (tested)
│   ├── selection.ts               # NEW pure SelectionState helpers (tested)
│   └── plottingStore.ts           # NEW zustand: mode, draft, undo/redo history, selection, layers
├── components/
│   ├── ui/                        # existing primitives (+ select/command if needed)
│   └── shared/                    # existing ConfirmDialog/Loader/etc. (reused)
└── tests/                         # vitest unit tests (node env)
    ├── coords.test.ts  stopShapes.test.ts  selection.test.ts
    └── plottingHistory.test.ts  draft.test.ts

apps/server/src/
├── api/
│   ├── mapbox.ts                  # NEW GET /api/admin/mapbox/directions (proxy + chunk + mock + strip duration)
│   ├── directions.ts              # EXTENDED POST /routes/:routeId/directions → transactional base+stops+derived return
│   └── index.ts                   # register mapbox routes under /api/admin
├── domain/
│   └── derive.ts                  # NEW pure: reverseDirection (polyline + stop order + labels) — unit-tested
├── config/env.ts                  # EXTENDED: MAPBOX_SECRET_TOKEN (optional)
└── tests/
    ├── unit/derive.test.ts        # NEW
    ├── unit/mapbox-proxy.test.ts  # NEW (stubbed fetch: strip duration, chunk concat, mock fallback)
    └── integration/plotting-save.test.ts  # NEW (transactional save + derived return; needs Supabase stack)

packages/shared/src/
├── schemas/
│   ├── mapbox.ts                  # NEW mapboxDirectionsResponseSchema (LineString + distance + snapped flag)
│   └── domain.ts                  # EXTENDED additively (e.g. stopsRequired variant for save)
└── types/
    └── mapbox.ts                  # NEW DirectionRequest / SnappedPath types (reused by admin + server)
```

**Structure Decision**: Monorepo workspace, no new projects. The feature spans the three existing packages exactly where their responsibilities live: UI state/map in `apps/admin` (features/routes + lib), the snapping proxy + atomic save + derivation in `apps/server`, and the shared request/response schemas in `packages/shared` (single source, reused by both sides — Principle III). Admin map components stay thin; all testable logic is extracted to pure helpers in `lib/` so the existing node-env Vitest setup needs no WebGL/jsdom mocking. Server logic follows the established `specs/001` pattern (`api/*.ts` + `domain/*.ts` + `db/queries.ts`, TDD-first).

## Complexity Tracking

> Fill ONLY if Constitution Check has violations that must be justified — here: scope expansion beyond "an admin page", justified by the spec's own FRs, and documentation-debt items that violate nothing but must be tracked.

| Item                                                                                                              | Why Needed                                                                                                                                                                                                                         | Simpler Alternative Rejected Because                                                                                                                                    |
| ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Server work inside an admin-page feature (Mapbox proxy + transactional atomic save + return-direction derivation) | Spec FR-008 (road following), FR-012/FR-027 + SC-013 (atomic save, derived return) are unmet by the current server (verified: no proxy, non-transactional direction insert). ADMIN.md §12 Phase 2 plans the proxy as foundational. | Client-side derivation + non-transactional POST calls → partial-save risk (violates SC-013), no road-following without a proxy (FR-008), and duplicated geometry logic. |
| MapLibre GL + Mapbox-services split (ADR-0013)                                                                    | Recorded ACCEPTED decision (ADMIN.md §9); `[lng,lat]` native, no conversion layer, dev-mode OSM fallback.                                                                                                                          | Leaflet per stale ADR-0007 → superseded decision; reintroduces `[lat,lng]` exception + a converter that never existed and is explicitly unnecessary.                    |
| Write ADR-0011/0013 files + reconcile stale Leaflet text in `AGENTS.md`/constitution                              | "Recorded Decisions Govern": decisions exist only inside ADMIN.md; the canonical ADR files are missing, and AGENTS.md/constitution still direct agents toward the superseded Leaflet/converter path.                               | Leaving docs stale → future agents (and the mobile/backend work) follow the wrong stack; cost is a small docs commit.                                                   |
| Spec Assumption correction: "consumes existing APIs, adds no new server behavior"                                 | Factually false against code; the plan's server additions implement the spec's own FRs, not new product scope.                                                                                                                     | Keeping the false assumption → tasks and reviewers mis-scope the work.                                                                                                  |
