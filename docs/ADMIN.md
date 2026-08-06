# ADMIN — Komyuter Admin Dashboard: Rebuild Guide & Feature Reference

**Purpose**: Self-contained handoff document for re-implementing the Komyuter admin dashboard from a clean branch. A fresh AI agent should be able to rebuild the admin from this document plus the existing source files, with no prior context and **no dependency on any `specs/` directory files** (which may not exist on a new branch). All requirements, success criteria, data-model, contracts, and task plans are inlined below.

**Scope**: Everything in `apps/admin` (frontend), the admin-facing surface of `apps/server` (the `/api/admin/*` Fastify API), and the shared types/schemas in `packages/shared`. It covers (a) what exists today, (b) the re-planned target scope, and (c) the map-stack decision (ADR-0013, MapLibre GL + Mapbox services).

**Branch strategy**: Create a fresh branch cut from the base branch (`main`/`dev`) so the git timeline is clean. Commit conventionally (`type(scope): description`, enforced by commitlint).

---

## 1. TL;DR — What the admin is

A **map-first web dashboard** for transit curators to maintain the Iloilo PUJ (public utility jeepney) dataset: routes, directions, stops, detours, restrictions, and fare configurations. React 18 + Vite + TypeScript (strict), MapLibre GL for the map, Mapbox services for snapping/geocoding (server-proxied), backend-proxied Supabase Auth (Fastify login/session endpoints, ADR-0006), and a Fastify admin API backed by Postgres/PostGIS (ADR-0013).

Two users exist in the product: **commuters** (mobile app, `apps/mobile`) and **administrators** (this dashboard). This document is only about the administrator surface.

---

## 2. Repo layout & how the admin fits in

```text
apps/admin/             # THIS document's focus — React 18 + Vite + TS admin dashboard
apps/server/            # Fastify v5 admin API (+ routing/detour-resolution engine)
apps/mobile/            # Expo commuter app (out of scope here)
packages/shared/        # @komyuter/shared — canonical domain types, zod schemas, fareCalculator
packages/ui/            # @repo/ui — shared UI primitives (largely unused by admin; admin has its own)
packages/typescript-config/ # @repo/typescript-config — strict shared TS configs
docs/                   # DESIGN.md, PRODUCT.md (design/product systems), CONTEXT.md (glossary), adr/
```

Key architectural rules (from the project constitution, mirrored in `AGENTS.md`):

- **Presentation-only where possible**: geometry, coordinates, route/direction/stop/detour/restriction data, and API behavior should not change for UI work.
- **Coordinate order `[lng, lat]` everywhere** now the sole format in the admin UI (ADR-0013 supersedes the old Leaflet exception in ADR-0007). A swapped pair puts stops in the ocean — the single most dangerous pitfall (ADR-0007).
- **No ETA anywhere** (ADR-0009) — navigation output is distances, fare, transfers, walk distance only.
- Two **Directions per Route** (ADR-0008); plot one base path and auto-derive the return (ADR-0011).
- `@komyuter/shared` owns `fareCalculator` and the canonical types — never reimplement fare or types.
- Strict TS via `@repo/typescript-config`; single root ESLint flat config; prettier `format:check`.
- Quality gates: `pnpm lint`, `pnpm typecheck`, `pnpm format:check`, `pnpm --filter admin test`, `pnpm --filter server typecheck`, `pnpm --filter server test`.

---

## 3. Technology stack

### Frontend (`apps/admin`)

| Concern       | Choice                                                                                                      | Notes                                                                                                    |
| ------------- | ----------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Framework     | React 18.3 + Vite 5 + TypeScript 5.5 (strict)                                                               | `@repo/typescript-config/vite.json`                                                                      |
| Routing       | `react-router-dom` 6                                                                                        | `/login`, `/` (Overview), `/routes` → workspace, `/routes/:routeId` → workspace, `/fares`, `/export`     |
| Data fetching | `@tanstack/react-query` 5                                                                                   | query hooks in `features/*/use*Queries.ts`; keys in `lib/queryKeys.ts`                                   |
| API client    | `axios` via `lib/api.ts`                                                                                    | envelope-aware, Bearer token, connection-banner + unauthorized handling                                  |
| Auth          | Backend-proxied: `features/auth/api.ts` → `POST /api/auth/login` + `GET /api/auth/me` on the Fastify server | Supabase Auth behind the server (ADR-0006), no DIY JWT; Bearer token kept in localStorage (`lib/api.ts`) |
| Map           | **MapLibre GL JS** via `react-map-gl` (maplibre entry)                                                      | Vector tiles when `MAPBOX_PUBLIC_TOKEN` set; falls back to OSM raster tiles (`lib/tiles.ts`)             |
| Geocoder      | **Mapbox Geocoding API**, proxied server-side                                                               | small search-input component calling `/api/admin/mapbox/geocode`                                         |
| Road snapping | **Mapbox Directions API** (`driving`), proxied server-side                                                  | `/api/admin/mapbox/directions`; full-path snap preview (ADR-0013)                                        |
| State (UI)    | `zustand`                                                                                                   | `lib/uiStore.ts` (nav rail toggle)                                                                       |
| Forms/UI      | `@base-ui/react` wrapped in `components/ui/*` (shadcn-style), `cva`/`clsx`/`tailwind-merge`                 | Route Sign grammar: ≤4px corners, no shadows, amber only for attention (no pill shapes)                  |
| Styling       | Tailwind CSS 4 + `@tailwindcss/postcss`                                                                     | brand tokens in the CSS entry                                                                            |
| Icons         | `lucide-react`                                                                                              |                                                                                                          |
| Toasts        | `sonner`                                                                                                    | toast helper wraps every mutation                                                                        |
| Drag reorder  | `@dnd-kit/core` + `@dnd-kit/sortable`                                                                       | stop reorder                                                                                             |
| Hotkeys       | `react-hotkeys-hook`                                                                                        | `mod+s` save, `mod+z` undo snap, `1`/`2` focus direction, `Tab` cycle stops                              |
| Drafts        | localStorage, 24h TTL, debounced                                                                            | draft helper + restore banner                                                                            |
| Tests         | Vitest (`pnpm --filter admin test`)                                                                         | unit tests in `apps/admin/src/tests/`                                                                    |
| Fonts         | Nunito (display) + Geist (body)                                                                             |                                                                                                          |

### Backend surface the admin uses (`apps/server`)

- Fastify v5, `@fastify/type-provider-zod`, drizzle-orm against Postgres/PostGIS, Supabase Auth guard.
- `buildApp({ db, supabase })` with `AppDeps`/`AppInstance` types in `src/api/app.ts`.
- Routes registered under `/api/admin/*`; admin auth guard on all admin CRUD.
- Envelope `{ success, data | error }`; error codes: `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `VALIDATION_ERROR`, `CONFLICT`, `INTERNAL`.
- Geometry read/write via `src/db/queries.ts` (`ST_GeomFromGeoJSON` / `ST_AsGeoJSON`); validation in `src/domain/validation.ts`; dataset export in `src/domain/export.ts`.
- **Mapbox proxy** (ADR-0013): `/api/admin/mapbox/*` endpoints forward Directions / Geocoding (and future Matching) to Mapbox using the server-side secret token, strip `duration` (ADR-0009), and keep the admin auth guard + envelope. Missing token → mock straight-line for snapping, empty for geocoding, with a logged warning.

### Shared (`packages/shared`)

- `types/domain.ts` — `Route`, `Direction`, `Stop` (type: `terminal|major_stop|waiting_area`), `NotableStop`, `Detour`, `Restriction` (reason: `no_stopping_zone|contraflow|pedestrian_hostile`; affects: `boarding|alighting|both`), `FareConfiguration`.
- `types/geometry.ts` — `CoordinatePair = [number, number]` (`[lng, lat]`), `GeoPoint`, `GeoLineString`.
- `schemas/domain.ts` — zod schemas mirroring the types (`routeIdSchema` = lowercase slug).
- `fareCalculator` (`calculateFare`, `applyDiscount`) — the LTFRB formula, single source.

---

## 4. Data model (inlined)

### Entities

| Entity                | Key fields                                                                                                                                                                                                                                                                      | Notes                                                                                                                      |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| **Route**             | `route_id` (slug), `name`, `short_name`, `color`, `is_active`, `fare_config_id`, timestamps                                                                                                                                                                                     | The list rows + editing target.                                                                                            |
| **Direction**         | `direction_id`, `route_id`, `label`, `base_polyline` (LineString), `origin_stop_id`, `destination_stop_id`, `is_active`                                                                                                                                                         | Two per Route; admin plots one base path and the return is auto-derived (ADR-0011).                                        |
| **Stop**              | `stop_id`, `direction_id`, `name`, `stop_order` (unique per direction), `type`, `location` (Point), `is_guaranteed_service`, `ar_marker_enabled`, `landmark_hint`, `notes`, `is_active`                                                                                         | Chronological order; connected to the polyline. `Terminals` layer = `type="terminal"`.                                     |
| **Detour**            | `detour_id`, `direction_id`, `label`, `entry` (Point), `exit` (Point), `detour_polyline` (LineString), `additional_distance_meters`, `commuter_instruction`, `driver_instruction`, `notable_stops`, `is_active`, **`active_timeframes`** (new), **`condition`** (new, optional) | Nested under the parent route; created by start-stop/end-stop with auto-snapped polyline. Conditional triggers (ADR-0012). |
| **Restriction**       | `restriction_id`, `direction_id`, `from_coord_index`, `to_coord_index`, `reason`, `affects`, `note`, `is_active`                                                                                                                                                                | Index range on the polyline. No-stop segments reuse it with `affects = both`.                                              |
| **FareConfiguration** | `fare_config_id`, `label`, `base_fare`, `base_distance_km`, `rate_per_km`, `student_discount_pct`, `senior_discount_pct`, `is_default`, `is_active`                                                                                                                             | The fare type label on each route row.                                                                                     |

### Relationships

- `Route 1──* Direction` (exactly two per route; return auto-derived — ADR-0011).
- `Direction 1──* Stop` (ordered by `stop_order`, unique per direction).
- `Direction 1──* Detour` (direction-scoped; "nested under the parent route" is the UI structure, not a new relation).
- `Direction 1──* Restriction` (index ranges into the direction's `base_polyline`).
- `Route *──1 FareConfiguration` (via `fare_config_id`).

### Validation rules

- Route code is a lowercase slug.
- A plotted route **must start on a stop and end on a stop**; may end on the start stop (a loop).
- Stops are connected to the polyline (not floating points).
- Detour entry/exit map to selected stops; the detour polyline must have ≥ 2 snapped points.
- Detour conditional triggers: `active_timeframes` must be well-formed (day indices 0–6, valid `HH:MM` windows); invalid triggers are rejected and not persisted.
- Restriction indices refer to the current polyline; a stale range degrades gracefully and can be re-selected.

### Client-only workspace state (not persisted)

- **Selection** (none / stop / detour-stop / polyline) — drives the properties panel.
- **Active tool** (plot / add-alternative / add-restriction / select).
- **Plotting mode** (Automatic / Manual).
- **Undo/redo history**.
- **Layer visibility** (Stops / Terminals / Routes).
- **Working polyline** (draft) — persisted in localStorage, 24h TTL.
- **Snap state** (pending preview).
- **List filters** (status / fare type).

---

## 5. What's implemented today

### 5.1 Overview page (`/`, `routes/Overview.tsx` + `features/network/NetworkMap.tsx`)

- Map-first page: full-bleed `NetworkMap` (all route polylines + circle-marker stops), hover dimming of non-selected routes, click-to-open a route, a "counts plate" overlay (routes/directions/stops/active).
- `NetworkMap` consumes `lib/tiles.ts` (OSM Standard) and `features/network/networkApi.ts` (`GET /api/admin/network`).

### 5.2 Routes list → consolidated into the workspace

- The standalone `/routes` page is **redirected into the Route Workspace** (single surface).
- `features/routes/RouteList.tsx` is a compact presentational list: search input + filter icon (status popover), a **New route** button, rows showing name / code / status / fare-type badge, and per-row **Edit** + **More** (context menu: Edit route, Edit name, Modify status, Delete route). Wired to `RouteForm`, route update, and route delete with confirm dialogs + toasts.

### 5.3 Route Workspace (`routes/RouteWorkspace.tsx`) — the core surface

3-part layout:

- **Left sidebar (compact, `w-56`)**: when a route is active, shows the route's **ordered stops list** (`StopsEditor`) with an "All routes" back button; when no route is selected, shows the compact `RouteList`.
- **Main content**: headerless map (`RouteMap`); no-route empty state (blurred map + guidance + Create new route / Import JSON dataset); centered **floating action bar** (Plot route / Add alternative route / Add restriction).
- **Right sidebar**: contextual **properties panel** (`PropertiesPanel`) shown only when a stop, detour stop, or polyline is selected; renders the matching editor.

Key behaviors implemented:

- **One-base-path plotting** (ADR-0011): single connected base path; on save the return Direction's polyline is auto-derived (reversed) and remains distinct + editable.
- **Plot click auto-creates a stop**: clicking in plot mode places a stop (persisted when a direction is selected; materialized from the draft when the direction is created). Draft stops render as numbered markers during plotting.
- **Full-path road snap with preview/Apply/Revert**: `RouteMap` routes the whole polyline via the proxied Mapbox Directions endpoint (`/api/admin/mapbox/directions`), draws a dashed preview, and the workspace commits or reverts — one-way detours explicit before committing (ADR-0013).
- **Stops draggable anytime**; dragging persists the new position.
- **Distinct stop-type shapes**: terminal = square, major stop = circle, waiting area = diamond.
- **Detours**: created by picking a **start stop** and an **end stop**; the detour polyline is auto-snapped between them; nested under the parent route.
- **Restrictions**: selected by a polyline portion, stored as index ranges.
- **Drafts, confirm dialogs, toasts, navigation guards, snap preview/undo** all preserved.
- **Geocoder** on the map search bar (Mapbox Geocoding via the proxy; OSM/Nominatim removed under ADR-0013).

### 5.4 Fares (`/fares`, `routes/Fares.tsx` + `features/fares/`)

- List + create/edit fare configurations; exactly-one-default enforcement; guarded fare-config delete.

### 5.5 Export (`/export`, `routes/Export.tsx` + export helper)

- Downloads the full dataset as JSON from `GET /api/admin/export/dataset`.

### 5.6 Auth & shell

- `App.tsx`: `AuthProvider` → `QueryClientProvider` → `BrowserRouter` (`AppRoutes`) → `Toaster`. No `ConnectionBanner` at root — it lives inside `AppShell`.
- `RequireAuth` wraps the shell routes: unauthenticated → `<Navigate to="/login" state={{ returnTo }}>`; after sign-in `Login` redirects back via `getReturnPath` (deep-link return, SC-004).
- `AppShell`: skip-to-content link (`#main-content`), `ConnectionBanner` (browser offline, SC-006), `NavRail` (collapsible Overview/Routes/Fares/Export; three modes expanded/collapsed/hover via `lib/uiStore.ts`), `Header` (page title + user menu with sign-out).
- Sign-in flow (`components/auth/AuthForm`): calls backend `POST /api/auth/login`; on 401 shows a non-technical inline error + toast; success toast "Signed in" fired from `Login`. Session token stored in `localStorage` by `lib/api.ts`; `/me` re-validates on boot (ADR-0006, backend-proxied — no `supabase-js` in the admin app).
- Accessibility (WCAG AA, FR-013): visible focus rings on every control (brand `--ring` color ≥3:1), skip link, keyboard-operable menus (Base UI), WCAG AA token contrast. Validated with an automated axe scan (0 violations) and a numeric contrast audit of the token palette (text ≥4.5:1, focus ≥3:1).

### 5.7 Pure helpers (tested)

- Coordinate helpers: pure `[lng,lat]` utilities incl. `nearestCoordIndex` (restriction picking). The Leaflet `[lat,lng]` converters were removed under ADR-0013 (MapLibre uses `[lng,lat]` natively).
- Selection→properties-panel tool mapping (pure).
- Stop-type→shape mapping (pure).
- Tile config (`lib/tiles.ts`): Mapbox vector tiles when token present, OSM raster fallback.
- Draft helper, API client, toast helper, query keys, UI store, `cn` util.

---

## 6. Re-planned scope — the target state for the rebuild

This is the intended end-state. Implement all of it on the rebuild.

### 6.1 Smart route plotting — dual modes + snap + undo/redo

- **UI toggle** selecting **Automatic** (click → stop + instant road-snapped connecting line) or **Manual** (drop all stops first, then a **Connect** action links them in placement order into the route loop).
- **Full-path snap with preview/Apply/Revert** (already implemented).
- **Undo/Redo** for stop placement, deletions, and snap applications.
- Route must start/end on a stop (loop allowed).

### 6.2 Layered workspace

- Independent **Stops**, **Terminals**, and **Routes** map layers, each with a visibility toggle.
- **Terminals is a sub-filter of Stops** by `type = "terminal"` — no new data.
- Client-side visibility only.

### 6.3 Detour conditional triggers — SERVER WORK

- `Detour` gains `active_timeframes?: ActiveTimeframe[]` and `condition?: string | null`.
- `ActiveTimeframe = { days: number[] (0–6), start_time: "HH:MM", end_time: "HH:MM" }`.
- Validation in `@komyuter/shared` (single source); admin API create/update/read; server-side **active-detour resolution** at request time (apply ADR-0008 replacement for active detours).
- **Never** emit travel-time estimates (ADR-0009).

### 6.4 No-stop loading/unloading segments

- Reuse the **Restriction** entity with `affects = both`. No new entity.

### 6.5 Explicitly out of scope

- **Vehicle-specific restricted zones** and **multi-vehicle-type routing** (dropped).
- **Predictive travel-time adjustment / ETA** (dropped; ADR-0009 retained).

---

## 7. Functional Requirements (FR-001 … FR-029)

- **FR-001**: The Route Workspace MUST present a 3-part layout: a compact left sidebar (route list), the main map editor, and a right-side properties panel.
- **FR-002**: The left sidebar MUST be compact (narrower than the current route workspace sidebar).
- **FR-003**: The left sidebar header MUST be a row containing a search bar and a filter icon on the right, with a "New route" button directly below it; the card-style header UI on route edit MUST be removed.
- **FR-004**: Below the left sidebar header, the full list of routes MUST be shown; each route row MUST display route name, route code, status, and fare type.
- **FR-005**: Each route row MUST offer **Edit** and **More** actions; the **More** context menu MUST offer _Edit route_, _Edit name_, _Modify status_, and _Delete route_.
- **FR-006**: The map route editor MUST have no header bar above the map (the map fills the main column).
- **FR-007**: When no route is selected, the main content MUST show a blurred map background with guidance text ("Pick a route from the list, or create a new one to plot stops and configure a distance-based fare matrix.") and buttons **Create new route** and **Import a JSON dataset**.
- **FR-008**: When there is no active route to edit, the right sidebar MUST be completely hidden.
- **FR-009**: The right sidebar MUST be a contextual properties panel that appears only when an element (stop, detour stop, or polyline route) is active for editing and MUST show the tools appropriate to that element.
- **FR-010**: A floating action bar centered below the map MUST provide: **Plot route** (adding stops), **Add alternative route** (start at an existing stop, end at another existing stop), and **Add restriction** (select a portion of the polyline route).
- **FR-011**: Stops MUST be shown in the chronological order the administrator placed them (editable order preserved).
- **FR-012**: Each stop MUST be connected to the polyline route (not a floating point).
- **FR-013**: The polyline MUST snap to the road network as a **full-path route** (respecting one-ways), shown as a preview with **Apply/Revert**; no separate manual re-snap step remains.
- **FR-014**: The bidirectional base-path plot flow MUST be removed; the administrator plots the route as a single connected base path, and the return direction's polyline MUST be auto-derived from it and remain a distinct, freely editable Direction (ADR-0011).
- **FR-015**: The route MUST start on a stop and MUST end on a stop; it MAY end on the starting stop (a loop).
- **FR-016**: Alternate routes (detours) MUST be nested under the parent route in the workspace structure; an alternate route MUST be created by selecting a start stop (entry) and an end stop (exit), with its polyline auto-snapped between them (no hand-typed coordinates).
- **FR-017**: Different stop types MUST have unique visual indicators (different shapes).
- **FR-018**: Alternate (detour) routes MUST have a distinct visual style from the base route path.
- **FR-019**: The **Import a JSON dataset** button MUST be present in the empty state and MUST show a validation placeholder ("coming soon") when used; the actual import capability is out of scope.
- **FR-020**: All existing safety behaviors MUST be preserved: confirm dialogs on destructive/status changes, success/error toasts on mutations, draft persistence and navigation guards, and snap preview/undo.
- **FR-021**: The design MUST follow the established visual language (pill shapes, cerulean/amber meanings, pure white ground, no state conveyed by color alone).
- **FR-022**: The administrator MUST be able to choose between **Automatic** and **Manual** plotting modes via a UI toggle.
- **FR-023**: In **Automatic** mode, each placed stop MUST immediately draw a road-snapped connecting line from the previous stop.
- **FR-024**: In **Manual** mode, placed stops MUST show no connecting lines until a **Connect** action links them in placement order into the route loop.
- **FR-025**: The workspace MUST provide **Undo/Redo** for recent actions (stop placement, deletions, snap applications) across both plotting modes.
- **FR-026**: The map MUST expose independent **Stops**, **Terminals**, and **Routes** layers, each with a visibility toggle; **Terminals** MUST be a sub-filter of Stops by `type = "terminal"`.
- **FR-027**: A detour MUST support **conditional triggers** (timeframes/conditions) that define when it is active; the trigger MUST be persisted via the API and returned on read (server work required).
- **FR-028**: No-stop loading/unloading segments MUST be marked by selecting a portion of the polyline and MUST be stored using the existing **Restriction** entity with `affects = both`.
- **FR-029**: Conditional detour triggers MUST affect only which path is used (ADR-0008); the system MUST NOT display travel-time estimates (ADR-0009).

---

## 8. Success Criteria (SC-001 … SC-019)

- **SC-001**: 100% of reviewers (≥ 5) can find a specific route by name or code using search and open it in the editor without guidance.
- **SC-002**: 100% of route rows display route name, route code, status, and fare type simultaneously.
- **SC-003**: 100% of reviewers can perform all four **More** context-menu actions (Edit route, Edit name, Modify status, Delete route) without guidance.
- **SC-004**: With no route selected, the right sidebar is hidden; with a stop, detour stop, or polyline selected, the right sidebar appears with the matching tools — confirmed by 100% of reviewers.
- **SC-005**: 100% of reviewers correctly understand the no-route empty state (blurred map, guidance text, Create new route / Import JSON dataset buttons) and can trigger both buttons.
- **SC-006**: The map editor displays with no header bar, a centered floating action bar with all three actions, and the Stops/Terminals/Routes layer toggles — confirmed by 100% of reviewers.
- **SC-007**: 100% of reviewers can plot a multi-stop route and confirm the stops appear in the chronological order they placed them, with the route starting on a stop and ending on a stop (a loop ending on the start stop is allowed).
- **SC-008**: 100% of reviewers confirm the plotted polyline follows the road network via a full-path snap preview they can Apply or Revert.
- **SC-009**: 100% of reviewers can create an alternate route by selecting a start stop and an end stop, and it appears nested under the parent route.
- **SC-010**: 100% of reviewers can select a portion of a polyline and mark it as a no-stop loading/unloading segment (stored as a Restriction with `affects = both`).
- **SC-011**: ≥ 5 reviewers correctly identify each stop type by its unique shape on the map.
- **SC-012**: ≥ 5 reviewers can distinguish the alternate (detour) route from the base route path by visual style alone.
- **SC-013**: Existing safety behaviors (confirm dialogs, toasts, draft persistence, snap undo) show no regression in the redesigned workspace.
- **SC-014**: The **Import a JSON dataset** button is present in the empty state and shows a validation placeholder when used; no backend import is required.
- **SC-015**: 100% of reviewers can switch between Automatic and Manual plotting modes and complete a route in each.
- **SC-016**: 100% of reviewers can use Undo and Redo to reverse and reapply a stop placement, deletion, and snap application without starting over.
- **SC-017**: 100% of reviewers can toggle each of the Stops, Terminals, and Routes layers and confirm only that layer's data is shown/hidden.
- **SC-018**: 100% of reviewers can set a conditional trigger on a detour in the properties panel; a round-trip through the API persists and returns the trigger.
- **SC-019**: No displayed travel-time estimate is introduced anywhere (ADR-0009 regression guard).

---

## 9. Map stack decision (ADR-0013 — ACCEPTED)

**Decision**: Split renderer/services architecture:

- **Map renderer**: **MapLibre GL JS** (open-source, BSD-3) via `react-map-gl` (maplibre entry), used in both dev and prod.
- **Tiles**: Mapbox **vector tiles** when `MAPBOX_PUBLIC_TOKEN` is set; otherwise fall back to **OSM raster** tiles (`https://tile.openstreetmap.org/{z}/{x}/{y}.png`) with a "Dev Mode - No Mapbox Token" indicator.
- **Road snapping**: Mapbox **Directions API** (`driving` profile), proxied server-side.
- **Geocoding**: Mapbox **Geocoding API**, proxied server-side.
- **Future map-matching**: Mapbox **Matching API**, server-side only (does NOT affect the renderer choice).

**Why**: Mapbox is already the de-facto standard across the product — the mobile app uses `@rnmapbox/maps` (Mapbox GL), and the backend/PostGIS use GeoJSON `[lng, lat]` which Mapbox natively consumes. This decision keeps the admin renderer open-source while aligning its _services_ with the vendor the rest of the product already uses.

**Key constraints**:

- All Mapbox API calls MUST be proxied through the Fastify backend (`/api/admin/mapbox/*`) using a **server-side secret token**; the browser token (tiles) is restrictively scoped to the admin domain.
- `[lng, lat]` is the **sole** format in the admin UI — no conversion layer (supersedes ADR-0007's Leaflet rationale; the coordinate rule is retained/strengthened).
- `duration` from Directions is **stripped at the proxy** — never displayed (ADR-0009).
- Directions waypoint limit: 25 (`optimize=false`); longer routes chunk the preview request. Snap-preview calls are debounced 500ms; Map Matching is capped at 50/day/admin (soft).
- **Dev fallback**: missing tokens → mock straight-line snapping + empty geocoding + logged warning, so `pnpm dev` works without a Mapbox account.
- Supersedes ADR-0007 (the "no API key" justification); requires doc reconciliation in `AGENTS.md`, `CONTEXT.md`, `ADMIN.md`, and the constitution's spatial-constraints section.

> **Rebuild consequence**: use MapLibre GL + Mapbox services. Remove `leaflet`, `leaflet-control-geocoder`, `facilmap-client`; add `maplibre-gl` (+ optional `react-map-gl/maplibre`). The map search bar becomes a small component calling `/api/admin/mapbox/geocode`. Keep `lib/tiles.ts` as the single tile-source abstraction (vector vs raster fallback).

---

## 10. Recommended target architecture for the rebuild

### 10.1 File/folder structure (target)

```text
apps/admin/src/
├── app/                     # app shell: App, AppShell, NavRail, Header, router
├── pages/                   # one file per route: Overview, RouteWorkspace, Fares, Export, Login
├── features/
│   ├── auth/                # auth context, login
│   ├── network/             # NetworkMap + network API (Overview)
│   ├── routes/              # list, workspace, map, editors, queries, api
│   ├── fares/               # list/form + queries
│   └── export/              # export page + helper
├── lib/                     # pure/tested: coords, selection, stopShapes, plottingHistory, tiles, drafts, api, toast, queryKeys, uiStore, utils
├── components/
│   ├── ui/                  # base-ui wrappers (button, dialog, dropdown, select, ...)
│   └── shared/              # ConfirmDialog, StatusBadge, EmptyState, ErrorState, Loader, ConnectionBanner, DraftRestoreBanner, PageHeader
└── tests/                   # vitest unit tests
```

### 10.2 Key data flow (route workspace)

1. `RouteWorkspace` reads `:routeId`; queries route + directions.
2. Auto-selects the first direction; queries stops/detours/restrictions.
3. `RouteMap` renders tiles via `lib/tiles.ts` (Mapbox vector or OSM raster fallback), the direction polyline, stop markers (shapes), detours, restrictions, and the plotting/snap UI; emits selection + snap events.
4. `selection` (a `SelectionState`) drives `PropertiesPanel` visibility + tools.
5. Mutations via the route query hooks (axios → admin API), each wrapped in toast meta + cache invalidation (including the network query).
6. Drafts persist working polylines to localStorage; snap preview/undo via history.
7. Snap + geocoding calls go to the `/api/admin/mapbox/*` proxy (server token); `duration` is stripped server-side (ADR-0009).

### 10.3 Conventions to preserve (non-negotiables)

- Strict TS; single root ESLint; prettier `format:check`; Vitest for admin + server.
- `[lng, lat]` is the **sole** format in the admin UI — no conversion layer (ADR-0013 supersedes ADR-0007's Leaflet rationale; coordinate rule retained).
- No ETA (ADR-0009); no multi-vehicle routing; no vehicle-specific zones.
- Two Directions per route; one base path + auto-derived return (ADR-0011); detours replace base segment when active (ADR-0008).
- Detour trigger fields in `@komyuter/shared` only (ADR-0012).
- Brand: pill shapes, cerulean/amber meanings, pure white ground, no state by color alone (DESIGN.md/BRAND.md).
- `{ success, data | error }` envelope; admin auth guard on the API.

---

## 11. Known limitations & gotchas (rebuild checklist)

- **`[lng, lat]` order** — the sole format in the admin UI (MapLibre native); no conversion layer. Keep the pure `nearestCoordIndex` helper for restriction picking.
- **Restriction index ranges break on polyline edit** — restrictions are index-bound to the current polyline; a stale range must degrade gracefully.
- **Snapping/geocoding depend on the Mapbox proxy** — offline/slow or missing-token snap must be best-effort (mock straight-line / connection-banner fallback), never block placing the next point.
- **Draft persistence** must survive navigation/beforeunload (localStorage, 24h TTL).
- **Route update takes `{ routeId, body }`**; route code is immutable on edit; lowercase slug validation.
- **Base UI triggers use `render={<Button/>}`**, not `asChild` (the @base-ui wrappers do not support `asChild`).
- **Terminals = stops of `type="terminal"`** — a layer filter, never a new entity.
- **No displayed ETA** anywhere (ADR-0009) — `duration` is stripped at the Mapbox proxy, even with detour triggers.
- **Detour trigger validation** must live in `@komyuter/shared` and be reused by both the server validation and the admin form.
- **Server tests** require the local Supabase stack + `apps/server/.env`.
- **Mapbox tokens**: `MAPBOX_SECRET_TOKEN` (server proxy) and `MAPBOX_PUBLIC_TOKEN` (client tiles, domain-scoped); dev works without them via OSM-raster fallback + mock snap/geocode.

---

## 12. Suggested task plan (inlined; ~50 tasks across phases)

### Phase 1 — Setup

- Confirm baseline gates are green before changes (`pnpm lint`, `pnpm typecheck`, `pnpm format:check`, `pnpm --filter admin test`, `pnpm --filter server typecheck`, `pnpm --filter server test`); record the baseline.
- Confirm the ADR decisions (0006 auth, 0008 detours, 0009 no-ETA, 0011 one-base-path, 0012 detour triggers, 0013 MapLibre/Mapbox) are understood.

### Phase 2 — Foundational (blocks all stories)

- Pure helpers + tests: selection→tool mapping, stop-type→shape mapping, plotting undo/redo history.
- Server: extend `Detour` schema (active_timeframes/condition) in shared; add server tests first (TDD); implement validation; update the admin detour API; implement active-detour resolution.
- **Mapbox proxy (ADR-0013)**: add `/api/admin/mapbox/*` endpoints (directions, geocode) using the server secret token, strip `duration`, enforce the admin guard + envelope, provide mock straight-line/empty fallbacks when the token is missing.
- **Map renderer (ADR-0013)**: add `maplibre-gl` (+ `react-map-gl/maplibre`); `lib/tiles.ts` selects Mapbox vector tiles vs OSM raster fallback; replace the geocoder with a small search-input calling the proxy.
- Components: `PropertiesPanel`, `FloatingActionBar`, `LayerToggles`, `PlotModeToggle`, `UndoRedoBar`.

### Phase 3 — US1: compact route list (MVP)

- Compact `RouteList` (search + filter + New route + rows + Edit/More context menu).
- `More` context menu (Edit route / Edit name / Modify status / Delete route).
- Wire to `RouteForm` (edit / edit-name focus) and activate/deactivate flow.
- `/routes` renders the workspace (no `:routeId` → empty state); remove the standalone list page.
- Restructure `RouteWorkspace` into the 3-part layout.

### Phase 4 — US2: contextual properties panel

- `selection` state driving `PropertiesPanel`; refit stops/detours/restrictions editors as panel tools (detours include conditional-trigger fields; restrictions support `affects = both`); emit selection from the map.

### Phase 5 — US3: map-first editor + layers

- Headerless map; no-route empty state; import placeholder; floating action bar; layer toggles (Stops/Terminals/Routes).

### Phase 6 — US4: smart plotting

- Plot mode toggle (Automatic/Manual) + Connect; full-path snap preview/Apply/Revert; undo/redo; one-base-path plot + auto-derived return; start/end-on-stop enforcement.

### Phase 7 — US5: detours + no-stop segments

- Start-stop/end-stop detour creation; conditional-trigger editing; nest detours; no-stop segments via `affects = both`.

### Phase 8 — US6: distinct visuals

- Distinct stop-type shapes; distinct detour style; selection never by shape alone.

### Phase 9 — Polish

- Full gates; quickstart validation (SC-001…SC-019, ≥5 reviewers for the visual ones); scope check (only admin/server/shared touched); no-ETA regression; safety regression.

---

## 13. Reference index (source files, not specs)

| Topic                         | Where                                                                                                                              |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| This document                 | `docs/ADMIN.md`                                                                                                                    |
| Product strategy + voice      | `PRODUCT.md`                                                                                                                       |
| Design system (visual)        | `DESIGN.md`, `BRAND.md`                                                                                                            |
| Glossary (canonical terms)    | `docs/CONTEXT.md`                                                                                                                  |
| Decisions (ADRs)              | `docs/adr/0001…0013`                                                                                                               |
| Admin API client              | `apps/admin/src/features/routes/routesApi.ts`, `lib/api.ts`                                                                        |
| Server admin routes           | `apps/server/src/api/` (`routes`, `directions`, `stops`, `detours`, `restrictions`, `fare-configs`, `network`, `export`, `status`) |
| Shared domain types/schemas   | `packages/shared/src/types/domain.ts`, `schemas/domain.ts`                                                                         |
| Admin app entry + routes      | `apps/admin/src/App.tsx`, `apps/admin/src/routes/`                                                                                 |
| Admin components/features/lib | `apps/admin/src/{components,features,lib}/`                                                                                        |
| Admin unit tests              | `apps/admin/src/tests/`                                                                                                            |

---

## 14. Getting started (for the next agent)

1. Create a fresh branch from the base branch (`main`/`dev`).
2. `pnpm install` (workspace, `auto-install-peers = true`).
3. Read, in order: `docs/ADMIN.md` (this), `PRODUCT.md`, `DESIGN.md`, `BRAND.md`, `docs/CONTEXT.md`, `docs/adr/0006…0013`.
4. Bring up the local stack for the admin API (Supabase + `apps/server/.env`). Mapbox tokens are optional for dev (see §9).
5. Run the gates before starting: `pnpm lint`, `pnpm typecheck`, `pnpm format:check`, `pnpm --filter admin test`, `pnpm --filter server typecheck`, `pnpm --filter server test`.
6. Implement per the task plan in §12 (start Phase 2 — pure helpers + shared/server detour-trigger groundwork + Mapbox proxy). Commit conventionally after each task/logical group.

---

# Appendix A — Embedded shared domain types (`packages/shared/src/types/domain.ts`)

```ts
import type { GeoPoint, GeoLineString } from "./geometry";

export const STOP_TYPE_VALUES = [
  "terminal",
  "major_stop",
  "waiting_area",
] as const;
export type StopType = (typeof STOP_TYPE_VALUES)[number];

export const RESTRICTION_REASON_VALUES = [
  "no_stopping_zone",
  "contraflow",
  "pedestrian_hostile",
] as const;
export type RestrictionReason = (typeof RESTRICTION_REASON_VALUES)[number];

export const RESTRICTION_AFFECTS_VALUES = [
  "boarding",
  "alighting",
  "both",
] as const;
export type RestrictionAffects = (typeof RESTRICTION_AFFECTS_VALUES)[number];

export interface Route {
  route_id: string;
  name: string;
  short_name: string;
  color: string | null;
  is_active: boolean;
  fare_config_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Direction {
  direction_id: string;
  route_id: string;
  label: string;
  base_polyline: GeoLineString;
  origin_stop_id: string | null;
  destination_stop_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Stop {
  stop_id: string;
  direction_id: string;
  name: string;
  stop_order: number;
  type: StopType;
  location: GeoPoint;
  is_guaranteed_service: boolean;
  ar_marker_enabled: boolean;
  landmark_hint: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface NotableStop {
  stop_id: string;
  name: string;
  is_detour_only: boolean;
}

export interface Detour {
  detour_id: string;
  direction_id: string;
  label: string;
  entry: GeoPoint;
  exit: GeoPoint;
  detour_polyline: GeoLineString;
  additional_distance_meters: number | null;
  commuter_instruction: string;
  driver_instruction: string | null;
  notable_stops: NotableStop[];
  is_active: boolean;
  // ADR-0012 additions (re-planned scope):
  active_timeframes?: ActiveTimeframe[];
  condition?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ActiveTimeframe {
  days: number[]; // 0 (Sunday) .. 6 (Saturday)
  start_time: string; // "HH:MM" 24h
  end_time: string; // "HH:MM" 24h
}

export interface Restriction {
  restriction_id: string;
  direction_id: string;
  from_coord_index: number;
  to_coord_index: number;
  reason: RestrictionReason;
  affects: RestrictionAffects;
  note: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface FareConfiguration {
  fare_config_id: string;
  label: string;
  base_fare: number;
  base_distance_km: number;
  rate_per_km: number;
  student_discount_pct: number;
  senior_discount_pct: number;
  is_default: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}
```

# Appendix B — Embedded geometry types (`packages/shared/src/types/geometry.ts`)

```ts
export type CoordinatePair = [number, number]; // [lng, lat] everywhere (ADR-0007)
export interface GeoPoint {
  type: "Point";
  coordinates: CoordinatePair;
}
export interface GeoLineString {
  type: "LineString";
  coordinates: CoordinatePair[];
}
```

# Appendix C — Embedded zod schemas (`packages/shared/src/schemas/domain.ts`)

```ts
import { z } from "zod";
import { geoPointSchema, geoLineStringSchema } from "./geometry";

export const stopTypeSchema = z.enum([
  "terminal",
  "major_stop",
  "waiting_area",
]);
export const restrictionReasonSchema = z.enum([
  "no_stopping_zone",
  "contraflow",
  "pedestrian_hostile",
]);
export const restrictionAffectsSchema = z.enum([
  "boarding",
  "alighting",
  "both",
]);

export const notableStopSchema = z.object({
  stop_id: z.string().min(1),
  name: z.string().min(1),
  is_detour_only: z.boolean(),
});

export const routeIdSchema = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "route_id must be a lower-case slug");

export const createRouteSchema = z.object({
  route_id: routeIdSchema.optional(),
  name: z.string().min(1),
  short_name: z.string().min(1),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .nullable()
    .optional(),
  fare_config_id: z.string().min(1).nullable().optional(),
});
export const updateRouteSchema = createRouteSchema
  .partial()
  .extend({ is_active: z.boolean().optional() });

export const createStopSchema = z.object({
  name: z.string().min(1),
  type: stopTypeSchema,
  location: geoPointSchema,
  stop_order: z.number().int().min(1).optional(),
  is_guaranteed_service: z.boolean().optional(),
  landmark_hint: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

export const createDirectionSchema = z.object({
  label: z.string().min(1),
  base_polyline: geoLineStringSchema,
  origin_stop_id: z.string().min(1).nullable().optional(),
  destination_stop_id: z.string().min(1).nullable().optional(),
  stops: z.array(createStopSchema).optional(),
});
export const updateDirectionSchema = createDirectionSchema
  .partial()
  .extend({ is_active: z.boolean().optional() });

export const updateStopSchema = createStopSchema
  .partial()
  .extend({ is_active: z.boolean().optional() });

export const createDetourSchema = z.object({
  label: z.string().min(1),
  entry: geoPointSchema,
  exit: geoPointSchema,
  detour_polyline: geoLineStringSchema,
  additional_distance_meters: z.number().int().min(0).nullable().optional(),
  commuter_instruction: z.string().min(1),
  driver_instruction: z.string().nullable().optional(),
  notable_stops: z.array(notableStopSchema).optional(),
});
export const updateDetourSchema = createDetourSchema
  .partial()
  .extend({ is_active: z.boolean().optional() });
// ADR-0012: add activeTimeframeSchema { days: number[] (0-6), start_time/end_time: HH:MM } and
// condition: lowercase-slug string; reject invalid timeframes with VALIDATION_ERROR.

export const createRestrictionSchema = z.object({
  from_coord_index: z.number().int().min(0),
  to_coord_index: z.number().int().min(0),
  reason: restrictionReasonSchema,
  affects: restrictionAffectsSchema,
  note: z.string().nullable().optional(),
});
export const updateRestrictionSchema = createRestrictionSchema
  .partial()
  .extend({ is_active: z.boolean().optional() });

export const createFareConfigSchema = z.object({
  label: z.string().min(1),
  base_fare: z.number().nonnegative(),
  base_distance_km: z.number().nonnegative(),
  rate_per_km: z.number().nonnegative(),
  student_discount_pct: z.number().min(0).max(100),
  senior_discount_pct: z.number().min(0).max(100),
  is_default: z.boolean().optional(),
});
export const updateFareConfigSchema = createFareConfigSchema
  .partial()
  .extend({ is_active: z.boolean().optional() });
```

# Appendix D — Embedded fare calculator (`packages/shared/src/fares/fare-calculator.ts`)

```ts
export const FARE_DEFAULT_BASE_FARE = 13;
export const FARE_DEFAULT_BASE_DISTANCE_KM = 4;
export const FARE_DEFAULT_RATE_PER_KM = 1.8;
export const FARE_DEFAULT_STUDENT_DISCOUNT_PCT = 20;
export const FARE_DEFAULT_SENIOR_DISCOUNT_PCT = 20;

export interface CalculateFareInput {
  base_fare: number;
  base_distance_km: number;
  rate_per_km: number;
  distance_km: number;
}

export function calculateFare({
  base_fare,
  base_distance_km,
  rate_per_km,
  distance_km,
}: CalculateFareInput): number {
  return base_fare + Math.max(0, distance_km - base_distance_km) * rate_per_km;
}

export function applyDiscount(fare: number, discountPct: number): number {
  return fare * (1 - discountPct / 100);
}
```

> **Fare rule (ADR-0001)**: displayed fare is ALWAYS the exact per-leg total from `calculateFare`; the Dijkstra internal cost is base-on-board + marginal ₱1.80/km (deliberate, bounded overestimate — do not "fix" it into per-edge LTFRB).

# Appendix E — Embedded design tokens (`apps/admin/src/index.css`)

```css
:root {
  /* Hail-and-Ride Mark: pure white ground, two cerulean blues, amber only for attention */
  --background: 0 0% 100%;
  --foreground: 230 8% 24%;
  --card: 0 0% 100%;
  --card-foreground: 230 8% 24%;
  --popover: 0 0% 100%;
  --popover-foreground: 230 8% 24%;
  --primary: 208 57% 42%; /* deep cerulean — primary actions, active route */
  --primary-foreground: 0 0% 100%;
  --hail: 205 60% 56%; /* brand cerulean */
  --approach: 205 45% 78%; /* light cerulean */
  --secondary: 205 45% 78%;
  --secondary-foreground: 210 30% 20%;
  --muted: 220 8% 96%;
  --muted-foreground: 230 8% 40%;
  --accent: 205 45% 78%;
  --accent-foreground: 210 30% 20%;
  --destructive: 0 84.2% 60.2%; /* red — restriction bands */
  --destructive-foreground: 0 0% 100%;
  --success: 152 60% 40%;
  --success-foreground: 0 0% 100%;
  --warning: 38 92% 50%; /* amber — attention, detours */
  --warning-foreground: 38 80% 15%;
  --border: 228 8% 88%;
  --input: 228 8% 88%;
  --ring: 205 60% 56%;
  --radius: 12px; /* pill-friendly radius */

  /* Route corridor polyline colors */
  --route-blue: 221 83% 53%;
  --route-green: 152 60% 42%;
  --route-amber: 38 92% 50%;
  --route-purple: 262 70% 58%;
  --route-red: 0 72% 55%;
  --route-teal: 180 60% 40%;
}
```

Design rules: pill shapes, two cerulean blues carry identity, pure white ground, amber reserved for real attention only, no state conveyed by color alone (WCAG AA), Nunito display + Geist body.

# Appendix F — Embedded ADR summaries (decisions)

- **ADR-0001 — Fare on graph edges**: internal Dijkstra cost = one-time base ₱13 on boarding + marginal ₱1.80/km; displayed fare recomputed exactly per leg via `calculateFare`. Rejected: exact leg-aware Dijkstra and per-edge independent fare.
- **ADR-0002 — Normalization**: min-max per edge-type pool (distance/walk/fare/transfer), clamped to [0,1]; transfer-edge distance = 0.
- **ADR-0003 — Trace validity**: maximum-instantaneous-speed discriminator (reject max < 10 km/h or > 45 km/h), not average-speed window; duration > 3 min; coverage ≥ 60%.
- **ADR-0004 — Backend framework**: Fastify v5 (not Express); `@fastify/type-provider-zod`; Supabase Auth.
- **ADR-0005 — No Redis**: graph built in-memory and rebuilt eagerly on mutation (thesis scale is tiny).
- **ADR-0006 — Auth**: Supabase Auth; one admin role; commuter app anonymous with optional sign-in; admin CRUD gated by Supabase-signed token, commuter endpoints public.
- **ADR-0007 — Admin map is Leaflet**: not Mapbox GL (no API key); Leaflet is the one `[lat,lng]` exception, converted at the admin boundary by a single tested converter. **SUPERSEDED by ADR-0013** (MapLibre uses [lng,lat] natively; the Leaflet exception is gone, but the coordinate rule is retained).
- **ADR-0008 — Detour replacement**: an active detour REPLACES (not parallels) the base segment between its entry/exit nodes.
- **ADR-0009 — No ETA**: navigation response carries no duration — only distance, fare, transfer count, walk distance.
- **ADR-0010 — Single region**: one connected graph for Iloilo City Proper + Oton/Pavia/Leganes; no `city` column; multi-city is future work.
- **ADR-0011 — One base path, auto-derived return**: admin plots a single base path; the return Direction's polyline is auto-derived (reversed), remains distinct and editable; route must start/end on a stop (loop allowed).
- **ADR-0012 — Detour conditional triggers**: detours may carry `active_timeframes`/`condition` defining when active; active detours replace the base segment; NEVER emits travel-time estimates (ADR-0009 retained). Vehicle-specific zones + multi-vehicle routing dropped.
- **ADR-0013 - MapLibre GL + Mapbox services (ACCEPTED)**: renderer is MapLibre GL JS (BSD-3, via react-map-gl/maplibre); tiles are Mapbox vector (or OSM raster dev fallback); Directions + Geocoding proxied server-side; future Matching server-only. All Mapbox calls go through /api/admin/mapbox/* with a server secret token; duration stripped (ADR-0009); [lng,lat] is the sole format (supersedes ADR-0007's Leaflet rationale). Mobile already uses Mapbox (@rnmapbox/maps).

# Appendix G — Embedded admin API surface (`apps/server/src/api/*`, prefix `/api/admin`)

| Method | Path                                              | Purpose                                                                                            |
| ------ | ------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| GET    | `/api/admin/routes`                               | list routes                                                                                        |
| POST   | `/api/admin/routes`                               | create route                                                                                       |
| GET    | `/api/admin/routes/:routeId`                      | get route                                                                                          |
| PUT    | `/api/admin/routes/:routeId`                      | update route                                                                                       |
| DELETE | `/api/admin/routes/:routeId`                      | delete route (cascade)                                                                             |
| GET    | `/api/admin/routes/:routeId/directions`           | list directions for a route                                                                        |
| POST   | `/api/admin/routes/:routeId/directions`           | create direction                                                                                   |
| GET    | `/api/admin/directions/:directionId`              | get direction                                                                                      |
| PUT    | `/api/admin/directions/:directionId`              | update direction                                                                                   |
| DELETE | `/api/admin/directions/:directionId`              | delete direction (cascade)                                                                         |
| GET    | `/api/admin/directions/:directionId/stops`        | list stops for a direction                                                                         |
| POST   | `/api/admin/directions/:directionId/stops`        | create stop                                                                                        |
| PUT    | `/api/admin/stops/:stopId`                        | update stop                                                                                        |
| DELETE | `/api/admin/stops/:stopId`                        | delete stop                                                                                        |
| GET    | `/api/admin/directions/:directionId/detours`      | list detours                                                                                       |
| POST   | `/api/admin/directions/:directionId/detours`      | create detour                                                                                      |
| PUT    | `/api/admin/detours/:detourId`                    | update detour                                                                                      |
| DELETE | `/api/admin/detours/:detourId`                    | delete detour                                                                                      |
| GET    | `/api/admin/directions/:directionId/restrictions` | list restrictions                                                                                  |
| POST   | `/api/admin/directions/:directionId/restrictions` | create restriction                                                                                 |
| PUT    | `/api/admin/restrictions/:restrictionId`          | update restriction                                                                                 |
| DELETE | `/api/admin/restrictions/:restrictionId`          | delete restriction                                                                                 |
| GET    | `/api/admin/fare-configs`                         | list fare configurations                                                                           |
| GET    | `/api/admin/fare-configs/:fareConfigId`           | get fare configuration                                                                             |
| POST   | `/api/admin/fare-configs`                         | create fare configuration                                                                          |
| PUT    | `/api/admin/fare-configs/:fareConfigId`           | update fare configuration                                                                          |
| DELETE | `/api/admin/fare-configs/:fareConfigId`           | delete fare configuration                                                                          |
| GET    | `/api/admin/network`                              | network overview (routes/directions/stops/active counts)                                           |
| GET    | `/api/admin/export/dataset`                       | full dataset JSON export                                                                           |
| GET    | `/api/status`                                     | status/latency endpoint                                                                            |
| GET    | `/api/admin/mapbox/directions`                    | Mapbox Directions proxy (snapping); strips `duration`; mock straight-line when no token (ADR-0013) |
| GET    | `/api/admin/mapbox/geocode`                       | Mapbox Geocoding proxy; empty + warning when no token (ADR-0013)                                   |

**Envelope**: all responses are `{ success: true, data }` or `{ success: false, error: { code, message, details? } }`; codes `UNAUTHORIZED | FORBIDDEN | NOT_FOUND | VALIDATION_ERROR | CONFLICT | INTERNAL`. Admin routes require the Supabase admin token (`Authorization: Bearer <token>`).

**Fare configurations API semantics (feature 006, reconciled)**:

- `GET /api/admin/fare-configs` list rows carry `active_route_count` (count of active Routes referencing the config via `routes.fare_config_id`) in addition to the `FareConfiguration` fields; `active_route_count` exists only in the list serializer.
- `DELETE /api/admin/fare-configs/:fareConfigId` is a **soft deactivate** (`is_active = false`, never destroys). It returns `409 CONFLICT` when any active Route references the config ("Cannot deactivate fare configuration referenced by active Routes") or when it is the sole default config.
- `PUT /api/admin/fare-configs/:fareConfigId` returns `409 CONFLICT` when the update would leave an **inactive default** (FR-015: `is_default === true && is_active === false` — e.g. `{ is_active: false }` on the default, or `{ is_default: true }` on an inactive config) or would leave **zero defaults**.
- The admin UI mirrors these rules (delete disabled with explanatory label; inline "Reactivate before making default" check), but the guards live at the API boundary so direct API callers are protected too.

**Planned detour-trigger API change (ADR-0012)**: detour create/update bodies gain optional `active_timeframes` and `condition`; detour read responses include them; server resolves active detours at request time (replaces base segment when active, per ADR-0008).

# Appendix H — Embedded glossary (canonical terms)

- **Commuter**: a person who uses the mobile app to plan/execute a journey. _Avoid_: passenger, rider, user.
- **Route**: a single PUJ franchise — the full bidirectional entity comprising two directions, terminal stops, base polyline, detours, fare configuration. _Avoid_: line, corridor.
- **Stop**: a formal, admin-curated, named boarding/alighting point (terminal, major stop, or waiting area). Permanent graph node; AR marker target.
- **Boarding Point**: any position along a valid polyline where boarding/alighting may occur, including hail-and-ride non-stop positions. Derived, not stored.
- **Leg**: one ride on a single vehicle (boarding → alighting); the unit of fare computation.
- **Step**: one element of navigation output (walk, board, ride, alight, transfer).
- **Detour**: a demand-triggered, direction-specific loop that departs from and returns to the base polyline, serving stops not reachable on the base path. May carry conditional triggers (ADR-0012).
- **Restriction**: a portion of a route's polyline where boarding/alighting is not permitted; affects boarding-point eligibility only; never part of the transit graph. No-stop segments use `affects = both`.
- **Direction**: a directed service of a route ("To City Proper" / "To Calaparan"); own polyline + ordered stop list; graph edges run only in the direction of travel. In the workspace the admin plots one base path and the return is auto-derived (ADR-0011). _Avoid_: forward, reverse, inbound, outbound (as model entities).
- **Draft**: unsaved plotted changes to a direction's working polyline, kept in localStorage (24h TTL), client-only until explicitly saved.
- **Virtual Node / Board Edge**: request-time graph nodes/edges for hail-and-ride boarding at non-stop positions; never persisted.
- **Trace**: a recorded GPS ride submitted by a commuter, tagged with a route and direction.
- **Trust Score**: a route reliability metric from MHD trace comparison; informational badge only, never a Dijkstra weight.
- **Landmark**: a notable named orientation point rendered by the base map tiles; presentation-only, never part of the transit graph.

---

**End of ADMIN.md** — this document is self-contained; the appendices embed the shared types, schemas, fare formula, design tokens, ADR decisions, API surface, and glossary so an external agent (e.g. Deepseek Web Chat) can rebuild the admin without repo access.
