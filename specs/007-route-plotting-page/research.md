# Research — Route Plotting Page

**Phase 0 output** · Sources: code (apps/admin, apps/server, packages/shared), `docs/ADMIN.md`, ADRs, spec. Every "NEEDS CLARIFICATION" from the Technical Context is resolved here.

## R1 — Map renderer: MapLibre GL JS via react-map-gl

- **Decision**: `maplibre-gl@^6.2.0` + `react-map-gl@^8.1.2` (maplibre entry), OSM raster fallback tiles.
- **Rationale**: ADR-0013 (recorded as ACCEPTED in `docs/ADMIN.md` §9) selects MapLibre GL JS, which consumes GeoJSON `[lng, lat]` natively — the sole coordinate format in the project. react-map-gl 8.1.2 peers with React ≥16.3 (we run React 18.3) and exports a dedicated `react-map-gl/maplibre` entry. The mobile app already uses the Mapbox GL family, keeping the renderer family consistent. OSM raster fallback (`https://tile.openstreetmap.org/{z}/{x}/{y}.png`) keeps `pnpm dev` working with no Mapbox account (ADR-0013 dev fallback).
- **Alternatives considered**: Leaflet + react-leaflet (ADR-0007) — superseded by ADR-0013; would reintroduce a `[lat, lng]` exception and a conversion layer the codebase never built. React-Map-GL mapbox entry — vendor-locked to Mapbox GL (no dev fallback tiles).
- **Code reality check**: `apps/admin` currently has **no map code at all** (no mapbox/maplibre/leaflet deps; `RouteWorkspace.tsx` is a placeholder; no `lib/tiles.ts`). The map stack is greenfield. The Leaflet converter module described in `AGENTS.md`/constitution **never existed** — with MapLibre it is not needed ([lng,lat] native). Constitution/AGENTS.md references to "Leaflet exception (ADR-0007)" are stale and must be reconciled (see R6).

## R2 — Road snapping: server-proxied Mapbox Directions API

- **Decision**: New Fastify proxy `GET /api/admin/mapbox/directions` calling Mapbox **Directions v5** (`driving`, `geometries=geojson&overview=full&steps=false&alternatives=false`) with the server-side `MAPBOX_SECRET_TOKEN`; response strips `duration` (ADR-0009) and returns the snapped `LineString` + `distance_meters`; when the token is missing/unset, returns a **mock straight-line** LineString with `snapped: false` and a logged warning.
- **Rationale**: ADR-0013 requires all Mapbox calls be proxied through `/api/admin/mapbox/*` using a server secret (never exposed to the browser); the proxy keeps one contract, enforces the admin auth guard + envelope, and owns the ADR-0009 duration strip. The mock fallback satisfies the spec's FR-009/FR-008 best-effort rule ("never block placing the next stop").
- **Alternatives considered**: client-side Mapbox call (violates ADR-0013 token rule); Mapbox Matching API (overkill, 50/day soft cap, needs trace points); OSRM self-host (new infra; out of scope — ADR-0005-style no-Redis discipline applies to adding infra).
- **Details pinned**: waypoint limit 25 per request (`optimize=false`); requests with >25 waypoints are **chunked** server-side and the LineStrings concatenated (joint coordinates deduplicated); snap-preview calls are debounced 500 ms client-side; `duration` is never returned. Coordinates are `lng,lat;lng,lat` per Mapbox. Token env name: `MAPBOX_SECRET_TOKEN` (server), `MAPBOX_PUBLIC_TOKEN` (client tiles — optional, dev uses OSM).

## R3 — Atomic save + return-direction derivation location

- **Decision**: Extend `POST /api/admin/routes/:routeId/directions` to (a) run inside a **DB transaction**, (b) create the base Direction + its ordered Stops, (c) **derive the return Direction** (ADR-0011) in the same transaction, and (d) return both directions with their stops.
- **Rationale**: The clarified spec (FR-027/SC-013) demands one atomic Save — "either the whole plotted direction is present or nothing of it is". The current handler inserts the direction then `Promise.all`s stop inserts **without a transaction** (verified: no `db.transaction` anywhere in apps/server), so a mid-save failure can leave a direction without stops. Server-side derivation keeps the geometry logic in one tested place, works for any client, and matches ADR-0011 ("on save the return Direction's polyline is auto-derived (reversed), remains distinct + editable").
- **Alternatives considered**: client-side derivation + two POST calls — non-atomic (violates SC-013), duplicates reversal logic, and the return direction could go missing between calls (violates FR-012). Derivation as a separate later endpoint — same atomicity problem.
- **Derivation rule** (ADR-0011 + ADR-0008): return polyline = base polyline coordinates reversed; return stops = new Stop records with the same name/type/location but `stop_order` reversed (Stops are direction-scoped, so the return Direction gets its own Stop rows); `origin_stop_id`/`destination_stop_id` swap. Never reuse the base polyline object.

## R4 — Direction label & origin/destination metadata

- **Decision**: Auto-generated on save. Base direction label = `To {destination stop name}` (e.g., "To SM City"); return label = `To {origin stop name}` (e.g., "To Calaparan"). `origin_stop_id` = first placed stop, `destination_stop_id` = last placed stop (reversed for return).
- **Rationale**: `createDirectionSchema` requires `label`; the spec's flow keeps plotting uninterrupted (no naming prompt at save — consistent with the FR-028 auto-default-name clarification). ADMIN.md's own examples use "To City Proper"/"To Calaparan" — the same convention.
- **Alternatives considered**: prompt for the label at save time (adds friction, contradicts the fast plot-and-save goal SC-012); leave label empty (schema requires min 1 char).

## R5 — Client-only plotting state: drafts, undo/redo, selection, layers

- **Decision**: All plotting state is client-only per the spec (Assumptions + FR-014):
  - **Draft**: localStorage, key `komyuter.draft.{routeId}.{directionId}`, JSON payload (stops, applied polyline, mode), **24h TTL** timestamp, debounced write (~500 ms), restore banner + explicit navigation guard (`beforeunload` + router-level confirm). Never sent to the server.
  - **Undo/redo**: command stack in the existing **zustand** store (`lib/uiStore.ts` pattern); entries: stop placed, stop deleted, stop dragged, snap applied. `mod+z`/`mod+shift+z` via **react-hotkeys-hook** (new dep, planned in ADMIN.md stack table).
  - **Selection**: `SelectionState` = none | stop | polyline — drives the right-side properties panel (FR-018).
  - **Layers**: Stops / Terminals / Routes visibility toggles — pure client filters; Terminals = `type === "terminal"` sub-filter (no new data).
- **Rationale**: Spec Assumptions mandate client-local drafts; zustand already exists in the app; pure helpers (draft serialize/validate, history push/undo, selection→tool mapping) are unit-tested in `src/tests/` without any map dependency.
- **Alternatives considered**: IndexedDB for drafts (overkill at this scale; localStorage ≤ ~5 MB is ample for tens of stops); Redux/reducer (new machinery; zustand is the established store).

## R6 — Doc reconciliation debt (recorded, not blocking)

- **Decision**: The plan implements ADR-0011 and ADR-0013 as recorded in `docs/ADMIN.md` (§4, §9, Appendix F). Follow-up task: write `docs/adr/0011-*.md` and `docs/adr/0013-*.md` files (currently only 0001–0010 exist on disk) and reconcile the stale "Leaflet exception / converter (ADR-0007)" text in `AGENTS.md` and the constitution's spatial-constraints section, which ADR-0013 supersedes.
- **Rationale**: "Recorded Decisions Govern" — the decisions exist (ADMIN.md embeds them as ACCEPTED) but the canonical ADR files are missing, which risks future agents following the stale Leaflet text (and building a converter that is explicitly unnecessary).
- **Note**: `AGENTS.md` also claims a tested converter + Leaflet in the admin — verified false against code; correcting docs is a small, safe cleanup.

## R7 — Version pinning (verified against npm registry 2026-08-06)

- `maplibre-gl@^6.2.0` (BSD-3, ESM, Node ≥16.14) — Vite 5 compatible.
- `react-map-gl@^8.1.2` (MIT, ESM; peer react ≥16.3, maplibre-gl ≥1.13; use the `react-map-gl/maplibre` entry).
- `react-hotkeys-hook@^4` (planned in ADMIN.md stack; React 18 compatible).
- Admin unit tests stay in the existing Vitest **node** env: map components are kept thin; all testable logic lives in pure helpers so no jsdom/WebGL mocking is needed.
