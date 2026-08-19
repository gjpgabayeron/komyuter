# ADMIN — Komyuter Admin Dashboard: Feature Reference & Rebuild Guide

**Status:** this document is the single source of truth for what the admin dashboard IS, what it DOES, and what it is PLANNED to do. It is a handoff document: a new contributor can rebuild the dashboard from this file alone, and the "Planned / Upcoming" markers keep the roadmap honest.

**Document scope:** the dashboard's route workspace, routes/fares/export surfaces, server API, data model, and design decisions. The companion docs are:

- `docs/ADMIN.md` — this file.
- `docs/adr/*` — design decisions (see Appendix F).
- `specs/008-admin-route-workspace-refactor/` — the active spec (plan, tasks, contracts) behind the current workspace. The root `REFACTOR.md` is superseded by this spec's plan.

## 1. TL;DR

- **Product:** Komyuter's admin dashboard — a desktop web app for maintaining the Iloilo PUJ transit dataset (routes, stops, fares) and the map data that feeds the commuter app.
- **Current centerpiece:** a **map-first route workspace** with **four derived states** (empty / overview / focus / edit). Three fixed columns: left route/stops list (256 px), center full-bleed map (one persistent MapLibre GL instance), right properties panel (336 px). Floating plates sit over the map (ADR-0015).
- **Plotting model:** **single-mode "auto" plotting.** The `Select` / `Add` pointer-tool toggles; in Add mode, every stop placed in click order forms a **connection** to the previous stop (chain). The polyline is derived from the connection chain. No "Automatic vs Manual" mode switch — the previous design's Automatic/Manual split was superseded by this one chain-based model.
- **Snap:** debounced road-following via a Mapbox Directions proxy; snap auto-commits into undo history (no manual Apply/Revert — that is a deliberate re-design, see FR-013).
- **Safety net:** drafts (24 h local storage), undo/redo (5 history kinds), styled confirm dialogs, connection-banner + session-expiry handling, atomic save with conflict recovery.
- **Auth:** single admin account, email + password over `POST /api/auth/login`; token kept in `localStorage`; `GET /api/auth/me` re-validates on boot; global revocation on logout.
- **Design language:** The Route Sign — flat enamel sign-plate grammar, pure white ground, signboard green-blue + signal amber, ≤4 px corners, no shadows (see `DESIGN.md`, Appendix E).
- **Not yet built (roadmap):** detour + restriction **editing UI**, detour **conditional triggers** (server work, ADR-0012), no-stop segments, Mapbox geocoding proxy, shared fare calculator, Overview + Export pages (currently placeholders), dataset import. Each is marked `Planned` in the FR/SC tables and expanded in §6.

## 2. Repo layout & how the admin fits

```
komyuter/
├─ apps/
│  ├─ admin/            # THIS document's subject — React 18 + Vite 5 + TS dashboard
│  └─ server/           # Fastify v5 admin API (ADR-0004), TDD'd against local Supabase
├─ packages/
│  ├─ shared/           # @komyuter/shared — types + zod schemas shared by admin & server
│  ├─ ui/               # @repo/ui — shared UI kit (admin largely self-contained today)
│  ├─ eslint-config/    # @repo/eslint-config (removed; single root flat config — do not recreate)
│  └─ typescript-config/# @repo/typescript-config — strict shared tsconfig base
├─ docs/
│  ├─ ADMIN.md          # this file
│  └─ adr/              # design decisions (Appendix F)
├─ specs/               # per-feature specs; 008 = admin route workspace (current)
├─ supabase/            # local Supabase stack config (docker)
├─ DESIGN.md            # visual system — wins on visual decisions
└─ PRODUCT.md           # product strategy/voice — wins on strategic decisions
```

**Architectural rules that apply to the admin:**

1. **`[lng, lat]` coordinate order everywhere** — GeoJSON, PostGIS `ST_MakePoint`, MapLibre. There is **no conversion layer** (ADR-0013 superseded the old Leaflet exception). A swapped pair puts stops in the ocean.
2. **No ETA anywhere** — navigation output is distances, fare, transfers, walk distance only (ADR-0009). The mapbox proxy strips `duration`.
3. **Desktop-only** — the admin is a desktop app. Workspace width gates: right column hides below 1024 px viewport; the map keeps a ≥400 px floor (`WORKSPACE_GEOMETRY.minMapWidth`).
4. **One persistent MapLibre instance** — the map never unmounts or re-creates while the app runs (ADR-0013).
5. **Floating plates over a full-bleed map** — the left/right columns and the action bar are plates that float over the basemap; there is no solid header above the map (ADR-0015).
6. **Strict TypeScript, single root ESLint flat config** — extend `@repo/typescript-config`; never recreate per-package lint configs.
7. **API envelope** `{ success, data | error }` and `error` codes from `apps/server/src/api/errors.ts` — every admin call goes through `lib/api.ts`, which unwraps the envelope.
8. **Server is the authority** — the admin never computes its own fare or geometry truth that the server would disagree with (except ephemeral UI state like drafts and pending snap).

## 3. Technology stack

| Layer             | Choice                                                                     | Notes                                                                        |
| ----------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Framework         | React 18 + Vite 5 + TypeScript (strict)                                    | `apps/admin`, turbo-pipelined at root                                        |
| Router            | react-router v7 (declarative mode)                                         | `app/router.tsx`                                                             |
| Server state      | @tanstack/react-query v5                                                   | `useRoutesQuery`, `useRouteQuery`, `useDirectionQuery`, fare/network queries |
| UI primitives     | @base-ui/react                                                             | Menus, dialogs, dropdowns — headless, Route-Sign styled                      |
| Styling           | Tailwind CSS + `class-variance-authority` + `clsx`/`tailwind-merge` (`cn`) | tokens in `index.css` (oklch, Appendix E)                                    |
| Icons             | lucide-react                                                               |                                                                              |
| Map               | **maplibre-gl + react-map-gl v8** (ADR-0013)                               | one instance; vector styles from **OpenFreeMap** (OSM data, keyless)         |
| Tiles             | `lib/tiles.ts` — OpenFreeMap `bright` / `positron` / `liberty` styles      | no Mapbox token for tiles                                                    |
| Road snapping     | Mapbox Directions **via server proxy**                                     | `GET /api/admin/mapbox/directions`; duration stripped                        |
| POI search        | **client-side Nominatim** (`lib/poiSearch.ts`)                             | Mapbox Geocoding proxy is a planned swap (§6 R4)                             |
| Forms             | controlled React state + local validation                                  | fare + route/stop editors; no form library                                   |
| Reorder           | native HTML5 drag-and-drop                                                 | stop reorder in the edit column; no dnd-kit                                  |
| Keyboard          | react-hotkeys-hook                                                         | `mod+z` / `mod+shift+z`, `Esc`, `mod+s`                                      |
| Toasts            | sonner                                                                     |                                                                              |
| Client store      | zustand                                                                    | `plottingStore`, `uiStore` (sidebar mode)                                    |
| HTTP              | axios                                                                      | envelope unwrap, token header, session expiry, connection banner             |
| State persistence | localStorage                                                               | admin session token + route **drafts** (24 h TTL)                            |
| Tests             | Vitest (node env, no jsdom)                                                | 21 suites in `apps/admin/src/tests` (see §5.11)                              |
| Build             | `tsc && vite build`                                                        |                                                                              |

**Server surface (what the dashboard talks to):**

- Fastify v5 + `@fastify/type-provider-zod`, drizzle-orm on Postgres/PostGIS, Supabase Auth for the admin account.
- Auth: `POST /api/auth/login`, `GET /api/auth/me`, `POST /api/auth/logout` (outside the admin guard) — see Appendix G.
- Admin CRUD: routes (hard delete), directions/stops/detours/restrictions (soft delete via `is_active`), fare configs (soft deactivate + guards), dataset export, mapbox directions proxy.
- Envelope + error codes everywhere; origin guard (`ADMIN_ORIGINS`), login throttle (account + source blocks), security-events audit trail.
- Env vars (`apps/server/src/config/env.ts`): `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `PORT` (default 3000), `MAPBOX_SECRET_TOKEN` (optional — directions proxy falls back to mock), `ALLOW_DEV_CREDENTIAL` (default false), `ADMIN_ORIGINS`.

**Admin env:** `VITE_API_URL` (axios base; the Vite build injects a CSP for this origin — specs/009).

## 4. Data model

Full zod schemas live in `@komyuter/shared` (`schemas/domain.ts`) and the drizzle tables in `apps/server/src/db/schema.ts`. Summary:

### 4.1 Entities

| Entity              | Key fields                                                                                                                                                                                           | Notes                                                                                                                                                                  |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Route`             | `route_id` (slug), `name`, `short_name`, `color \| null`, `is_active`, `fare_config_id \| null`                                                                                                      | one route = two directions (base + return). **Delete = hard cascade**                                                                                                  |
| `Direction`         | `direction_id`, `route_id`, `label`, `base_polyline` (LineString), `origin_stop_id \| null`, `destination_stop_id \| null`                                                                           | DB row also carries `direction_kind` (`base`/`return`) to order loading; return is auto-derived (ADR-0011), never hand-drawn                                           |
| `Stop`              | `stop_id`, `direction_id`, `stop_order`, `name`, `type` (`terminal` / `major_stop` / `waiting_area`), `location` (Point), `is_guaranteed_service`, `ar_marker_enabled`, `landmark_hint`, `notes`     | soft delete via `is_active`; terminal rows are guarded (409 on delete)                                                                                                 |
| `Detour`            | `detour_id`, `direction_id`, `label`, `entry` (Point), `exit` (Point), `detour_polyline` (LineString), `additional_distance_meters`, `commuter_instruction`, `driver_instruction`, `notable_stops[]` | ADR-0008 replacement model — geometry entry/exit points + notable stops, NOT stop-id nesting. **UI not yet built — see §5.10, §6**                                     |
| `Restriction`       | `restriction_id`, `direction_id`, `from_coord_index`, `to_coord_index`, `reason` (`no_stopping_zone` / `contraflow` / `pedestrian_hostile`), `affects`, `note`                                       | a restriction is a **coordinate-index range** into the base polyline; `affects = boarding \| alighting \| both` (**no-stop segment** = `both`). Data-ready, UI unbuilt |
| `FareConfiguration` | `fare_config_id`, `label`, `base_fare`, `base_distance_km`, `rate_per_km`, `student_discount_pct`, `senior_discount_pct`, `is_default`                                                               | exactly one default at a time (server-enforced); DB row also has `is_active` (soft deactivate)                                                                         |

### 4.2 Validation rules (`apps/server/src/domain/validation.ts`)

- `route_id` is a **lowercase slug** (`^[a-z0-9]+(?:-[a-z0-9]+)*$`); route `name` and `short_name` required.
- Direction: `pathEndsOnStops` and `pathCoversStops` — the polyline must start/end on the first/last stop and pass every stop; `label` required.
- Stops: `name` required; `location` a `[lng, lat]` pair; `type` from the enum (`terminal` / `major_stop` / `waiting_area`); at least 2 stops to save a direction.
- Closed loops are legal (start == end stop).
- Numeric columns (fares, distances) are **string mode** in drizzle — handlers `Number()` them.

### 4.3 Client-only state (never persisted server-side)

- **Drafts** — in-progress plotted stops for a route, saved to `localStorage` (`komyuter.draft.*`, 24 h TTL).
- **Undo/redo history** — in-memory, per editing session.
- **Virtual snap state** — pending/auto-committed snap results; never sent as data, only as `GET .../mapbox/directions` requests.
- POI search results, map viewport/perspective, layer toggles — zustand UI state.

## 5. What's implemented today

### 5.1 App shell & auth

- **`/login`** — `AuthForm` with brand panel. Calls `POST /api/auth/login`; on success stores `access_token` in `localStorage` (`komyuter.admin.token`) and redirects to the saved return path.
- **`RequireAuth`** — blocks the four app sections while unauthenticated; on boot calls `GET /api/auth/me` to re-validate the token. A `401` anywhere clears the token, records the intended path (`getReturnPath`/`saveReturnPath`), and redirects with a "Your session expired" flag.
- **`AppShell`** — skip-to-content link, `ConnectionBanner` (shows when the API is unreachable), `NavRail` (Overview / Routes / Fares / Export; expanded ↔ collapsed ↔ hover via `uiStore.sidebarMode`), `Header` (section title + user menu + sign-out → `POST /api/auth/logout`, global revocation).
- `app.tsx` composition: `AuthProvider → QueryClientProvider → BrowserRouter → Toaster`.
- Server side of auth: unified denial message, ~250 ms fake delay, account-block after 5 failed attempts, source-IP block, `ALLOW_DEV_CREDENTIAL` dev gate, origin guard, security-events audit.

### 5.2 The Route Workspace — core surface (`pages/RouteWorkspace.tsx`)

The workspace is a **four-state machine** derived from (selection, draft):

| State      | When                        | What you see                                                                                                                                           |
| ---------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `empty`    | no route selected, no draft | left column list + **EmptyState veil** over the map (blurred basemap, guidance, **Create new route** + **Import JSON dataset** disabled "Coming soon") |
| `overview` | route selected              | left column = **route list**; map = **RouteOverviewLayer** (all routes' polylines, fade-in, click = act); **no right column**                          |
| `focus`    | route selected, not editing | map = single route polyline; right column = **FocusPlate** (read-only peek: "Edit route" button, "Plot route" button)                                  |
| `edit`     | editing route/stops         | left column = **ordered stops list**; map = editable plotting surface; right column = **route/stop editors**                                           |

- Layout: three fixed columns over a full-bleed map — left **256 px**, center transparent, right **336 px**, gutter 0 (12 px plate padding provides spacing), via a five-track grid (`workspace/WorkspaceColumns.tsx`, `WORKSPACE_GEOMETRY` in `workspace/geometry.ts`).
- **NarrowWindowGate**: viewport < 1024 px or map width < 400 px renders a centered guidance plate instead of the workspace.
- Data flows through `RouteWorkspaceProvider` (fetch route + directions + stops via react-query, drafts, save orchestration, conflict recovery) and `lib/plottingStore.ts` (zustand).

### 5.3 Route list (overview) & stops (edit) — left column

- **Overview variant** (`RouteList.tsx`): search input ("Search routes"), status filter (`SlidersHorizontal` — All / Active / Inactive), **New Route** button, then rows. Each row (`RouteRow.tsx`): name, Active/Inactive badge, direction count ("1 direction" / "Not plotted"), pencil (open/edit) and trash (delete → styled `AlertDialog` — hard delete warning). Skeleton + retry + empty states included.
- **Edit variant**: back button, route name + short code + Active/Inactive badge + **Active switch**, then the ordered **stops list**: drag to reorder (native HTML5 DnD), "insert after" affordance on hover, closed-loop badge, delete per stop; empty-stops guidance when nothing is plotted.

### 5.4 Plotting model: Select/Add, connections, snap, undo/redo, drafts, save

**Tool (`PlotActionBar` ToolToggle).** `Select` (default; click stop = select + fly) vs `Add` (every click places a stop; if a stop is already selected, the new stop is inserted after it). A placed stop gets a "focus" ring until deselected.

**Connections (`lib/connections.ts`).** In Add mode, every new stop is **connected to the previously placed stop** — a `from`/`to` pair. The polyline is derived from the chain of connections (`buildChainPath`). Stop reorder re-links connections; loop closure is allowed (FR-015). The chain model replaced the earlier "Automatic / Manual + Connect" design (FR-022/023/024 → superseded).

**Snap (`lib/plottingStore.ts` + `mapbox` proxy).** After a stop is placed/dragged, the derived polyline is snapped through `GET /api/admin/mapbox/directions` (debounced 300 ms). A successful snap **auto-commits into undo history** (merged with the triggering edit) — no manual Apply/Revert (deliberate re-design of FR-013). The straight-line fallback is **never committed**; it renders dashed with a warning. Statuses: `idle | pending | applied | no_token | upstream_error`; warning copy lives in the store.

**Undo/redo (`lib/plottingHistory.ts`).** Five history kinds: `stop_placed`, `stop_deleted`, `stop_dragged`, `stop_props_changed`, `snap_applied`. Coalescing for drag/props; reorder and connection-link edits are outside history. Hotkeys `mod+z` / `mod+shift+z`; bar buttons.

**Drafts (`lib/draft.ts`).** Editing state (stops, connections, tool) persists to `localStorage` (24 h TTL, 500 ms debounce). On revisit, a restore banner appears in the status slot ("Keep editing this draft?"). Saving/loading a route always reconciles against the server; a 409 (`version mismatch`) opens the styled **Load Latest** dialog that replaces the draft with server truth.

**Save (`RouteWorkspaceProvider`).** Save is **atomic** — `saveDirection` (`POST /api/admin/routes/:routeId/directions`) creates the base direction (label + base polyline + stops + origin/destination stop ids) and derives the return in one transaction; `replaceDirection` (`PUT /api/admin/directions/:directionId`) replaces and re-derives. Guards before save: ≥ 2 stops, polyline exists, `pathEndsOnStops`, `pathCoversStops`, sequence-consistent. The auto-generated label is "To <last stop>" (FR-012). `saveAll` = plot save + route meta patch + `requestFit` + "Saved just now" toast. Navigation is guarded with a patched `pushState` + `beforeunload`; styled `LeaveConfirm` / `LoadLatest` / `NavConfirm` / `NewRoute` dialogs replace `window.confirm` (FR-007/FR-020).

### 5.5 Properties panel — right column (`features/routes/properties/`)

- **FocusPlate** (focus state): read-only peek — name, code, color chip, active badge, direction count; "Edit route" and "Plot route" buttons. Never enters edit mode.
- **RouteGroup** (edit): route name, short code, color swatch.
- **StopGroup / StopEditor**: name, type select (`terminal` / `major_stop` / `waiting_area`), editable `[lng, lat]` inputs, **Connected from/to** dropdowns (the manual rewire affordance that replaced the old "Connect" action — FR-024 superseded; closed loops wrap around), guaranteed-service switch (hidden for `waiting_area`), landmark hint, notes.

### 5.6 Status bar, POI search, action bar, layers, empty state

- **`StatusBar`** (floating plate, bottom-center over the map): save lifecycle ("Saved just now" transient / "Saving…" / "Unsaved changes") **plus one contextual notice at a time** — priority: conflict > draft restore > draft restored.
- **`PoiSearchBar`** (floating pill, top-center): **client-side Nominatim** (`lib/poiSearch.ts`, 350 ms debounce, ≥ 3 chars, `buildNominatimUrl`/`parseNominatimResults`), result dropdown, "fly to + place stop at POI" (in Add tool). No Mapbox geocode today — R4.
- **`PlotActionBar`** (floating, left edge): ToolToggle ("Select stops" / "Add stops"), Undo/Redo, **LayerToggles**:
  - Basemap style radio (**Default** / **Minimalist** / **3D** → OpenFreeMap `bright` / `positron` / `liberty`) + opacity slider;
  - per-stop-type **marker checkboxes** (terminal, major stop, waiting area) + "Stop names" label toggle;
  - **Route visibility** switch.
- **`EmptyState`** veil: blurred basemap, "Plan the route" guidance, **Create new route** (focused), **Import JSON dataset** (disabled — "Coming soon" placeholder, FR-019).
- **`RouteMap`** (`features/routes/RouteMap.tsx` + `map/`): one persistent MapLibre instance; hover dimming; `RouteOverviewLayer` (overview), `RouteLines` (base/return/draft), stop shapes (terminal = square, major stop = circle, waiting area = amber diamond — selection is **never color-only**), fit-to-route, perspective controller (3D tilt), selection panner; `z-` stack constants in `map/constants.ts`.

### 5.7 Fares (`pages/Fares.tsx` + `features/fares/`)

- `FareConfigTable` — list of fare configs: name, base fare, base distance, rate per km, default badge, active state.
- `FareConfigForm` — create/edit with local validation (`validation.ts`: name/base/rate > 0, base distance ≥ 0, **exactly one default** enforced — `validateDefaultUnset`); currency formatting in `format.ts`.
- `DeleteFareConfigDialog` — styled confirm; server guards (cannot deactivate/delete a fare config that would leave no default, or one still in use by active routes).
- Server: full CRUD in `api/fare-configs.ts`, default enforcement + guards, react-query keys in `features/fares/queries.ts`.

### 5.8 Export (`pages/Export.tsx`)

- **Placeholder** — "Nothing to export yet — dataset export arrives in a later milestone."
- The **server endpoint is complete** (`GET /api/admin/export/dataset`, assembled in `apps/server/src/domain/export.ts` — routes, directions, stops, detours, restrictions, fare configs). Wiring the UI is R7.

### 5.9 Overview (`pages/Overview.tsx`)

- **Placeholder** — "Welcome to the network — Overview will show every route, direction, and stop across Iloilo. Route plotting arrives in a later milestone." A `NetworkMap`/network stats page is R6. (The read-only per-route overview you see in the workspace is `RouteOverviewLayer`, which is implemented.)

### 5.10 Detours & restrictions — backend complete, UI planned

- **Server:** full CRUD for both (`api/detours.ts`, `api/restrictions.ts`) against the local Supabase stack; zod schemas in `@komyuter/shared`; soft delete. **Detour** = entry/exit points + detour polyline + instructions + notable stops (ADR-0008); **Restriction** = a coordinate-index range of the base polyline with a `reason` (`no_stopping_zone` / `contraflow` / `pedestrian_hostile`) and `affects` (`boarding | alighting | both`).
- **Admin UI: none.** There is no "Add alternative route", no "Add restriction", no detour/restriction editor in the workspace. This is roadmap **R1** (data + API ready).
- **Conditional triggers** (`active_timeframes` / `condition`) are **not in the shared types or server** — that is roadmap **R2** (ADR-0012).

### 5.11 Pure helpers & tests

Pure logic lives in `lib/` and is unit-tested: `coords`, `connections`, `draft`, `plottingStore`, `plottingHistory`, `overlap`, `overviewCache`, `overviewFade`, `routeColors`, `sections`, `stopShapes`, `tiles`, `workspaceGeometry`, `workspaceUiState`, `poiSearch`, `session`, `sessionExpired`, `requireAuth`, `restore`, fare `format`/`validation`.

**Tests:** 21 Vitest suites in `apps/admin/src/tests` (node env). Quality gates: `pnpm lint`, `pnpm typecheck`, `pnpm format:check`, `pnpm --filter admin test`, plus the server gates (`pnpm --filter server typecheck`, `pnpm --filter server test` — the integration suite needs the local Supabase stack + `apps/server/.env`).

## 6. Roadmap — planned & upcoming

Everything below is **not yet implemented**. It is the documented intent so the team has a roadmap.

| ID     | Item                                                                                                                                                                                                                                                                                                                                                                                               | Status / dependency                            |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| **R1** | **Detour & restriction editing UI** in the workspace — "Add alternative route" and "Add restriction" actions (FR-010), detour editor with entry/exit points + instructions + notable stops (ADR-0008), restriction editor marking a polyline index range with reason + affects, auto-snapped detour geometry, distinct detour visual style (FR-016/FR-018). Data layer + server CRUD are **ready** | blocked on admin UI work only                  |
| **R2** | **Detour conditional triggers** — `active_timeframes` + `condition` on `Detour` (ADR-0012), added to shared types/schemas and `api/detours.ts`, plus **server-side active-detour resolution** at request time; triggers affect the path only (FR-027/FR-029)                                                                                                                                       | server + shared work                           |
| **R3** | **No-stop loading/unloading segments** — surface `Restriction.affects = both` (+ `reason = no_stopping_zone`) in the UI: select a polyline index range of a direction and mark it no-stop for boarding/alighting/both (FR-028)                                                                                                                                                                     | builds on R1; data/API ready                   |
| **R4** | **Mapbox Geocoding proxy** — replace client-side Nominatim with `/api/admin/mapbox/geocode` behind the same token/strip pattern as directions; keep the debounced pill UX                                                                                                                                                                                                                          | server + admin                                 |
| **R5** | **Shared fare calculator** — extract the LTFRB fare rule into `@komyuter/shared` (`fareCalculator`, ADR-0001) and consume it from the admin fare validators + the mobile app; today the rule exists only in admin `features/fares/format.ts`/`validation.ts` and the mobile side (Appendix D)                                                                                                      | refactor                                       |
| **R6** | **Overview / network page** — replace `pages/Overview.tsx` placeholder with a read-only network map (all routes) + stats                                                                                                                                                                                                                                                                           | new UI; `/routes/overview` data already exists |
| **R7** | **Export UI** — wire `pages/Export.tsx` to `GET /api/admin/export/dataset` (download + maybe copy-to-clipboard JSON)                                                                                                                                                                                                                                                                               | endpoint ready                                 |
| **R8** | **Dataset import** — replace the disabled "Import JSON dataset" placeholder in the empty state with a real import flow (validation + dry-run preview)                                                                                                                                                                                                                                              | later                                          |

**Superseded (no longer planned as specified):**

- **Automatic/Manual plotting modes + Connect action (FR-022/023/024)** — replaced by the single-mode chain model: Select/Add tool + consecutive-stop connections + manual rewire via "Connected from/to" (FR-012 FR text updated). This is now the intended design.
- **Mapbox vector tiles / OSM raster** — tiles are OpenFreeMap vector styles, keyless (ADR-0013, `lib/tiles.ts`).
- **Apply/Revert buttons on snap preview (old FR-013 shape)** — snap auto-commits; the old doc's step-by-step Apply/Revert flow was replaced.

**Out of scope (per ADR-0012/ADR-0009):** vehicle-specific restricted zones, multi-vehicle routing, ETA anywhere.

## 7. Functional requirements (with status)

Status: ✅ implemented · 🟡 partial · 🚧 planned · ⛔ superseded. "Planned" items are detailed in §6.

| FR     | Requirement                                                                        | Status                                                                                                                                        |
| ------ | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| FR-001 | Three-part layout: left sidebar, center map, right contextual panel                | ✅ — three-column four-state workspace (left 256 / map / right 336), ADR-0015                                                                 |
| FR-002 | Compact left sidebar                                                               | ✅ — 256 px fixed Plate column                                                                                                                |
| FR-003 | Sidebar header: search + filter + "New Route"                                      | ✅ — Search routes, status filter, New Route                                                                                                  |
| FR-004 | Route rows show name, code, status, fare type                                      | 🟡 — name + Active/Inactive + direction count; short code in edit header; fare type not shown on rows                                         |
| FR-005 | Row actions via Edit + More menu (Edit route / Edit name / Modify status / Delete) | ⛔ — replaced by inline pencil + trash (delete = styled confirm); status Active switch in edit header; name edited in right-column RouteGroup |
| FR-006 | No header above the map                                                            | ✅                                                                                                                                            |
| FR-007 | Empty state: blurred map, guidance, Create new route + Import JSON                 | ✅ — Import JSON disabled placeholder                                                                                                         |
| FR-008 | Right sidebar hidden when no route is active                                       | ✅ — derived state hides it in empty/overview                                                                                                 |
| FR-009 | Contextual properties panel                                                        | ✅ — FocusPlate / RouteGroup / StopGroup / StopEditor                                                                                         |
| FR-010 | Floating action bar: Plot route / Add alternative route / Add restriction          | 🟡 — bar exists (tool + undo/redo + layers); detour/restriction actions are **R1**                                                            |
| FR-011 | Stops in chronological order                                                       | ✅ — chain + reorder + insert-after                                                                                                           |
| FR-012 | Stops connected to the polyline                                                    | ✅ — `pathCoversStops` / `pathEndsOnStops`; auto label "To <last stop>"                                                                       |
| FR-013 | Full-path snap preview with Apply / Revert                                         | ✅ (re-designed) — debounced auto-commit snap; straight-line fallback never committed; warning states                                         |
| FR-014 | One base path; return auto-derived                                                 | ✅ — ADR-0011, `domain/derive.ts`                                                                                                             |
| FR-015 | Path starts/ends on a stop; closed loops allowed                                   | ✅                                                                                                                                            |
| FR-016 | Detours nested in a direction, entry/exit points, auto-snapped                     | 🚧 — **R1**                                                                                                                                   |
| FR-017 | Distinct stop shapes                                                               | ✅ — terminal square / major-stop circle / waiting-area amber diamond; selection never color-only                                             |
| FR-018 | Detour distinct visual style                                                       | 🚧 — **R1**                                                                                                                                   |
| FR-019 | Import JSON placeholder in empty state                                             | ✅ — disabled "Coming soon" (real import = **R8**)                                                                                            |
| FR-020 | Safety behaviors (drafts, styled confirms, toasts, undo)                           | ✅                                                                                                                                            |
| FR-021 | Design language: The Route Sign                                                    | ✅ — ≤4 px corners, no shadows, oklch tokens                                                                                                  |
| FR-022 | Plotting-mode toggle (Automatic / Manual)                                          | ⛔ — superseded by single-mode chain model (Select/Add)                                                                                       |
| FR-023 | Automatic mode: instant road-snapped line per click                                | 🟡 — folded into the chain model + debounced snap                                                                                             |
| FR-024 | Manual mode: place all stops, then "Connect"                                       | ⛔ — rewire via StopEditor "Connected from/to"                                                                                                |
| FR-025 | Undo / redo                                                                        | ✅ — 5 history kinds, coalescing, `mod+z`/`mod+shift+z`                                                                                       |
| FR-026 | Layer toggles: Stops / Terminals / Routes                                          | ✅ — per-stop-type markers (incl. terminal), route visibility, basemap style/opacity, marker labels (shape differs from the trio spec)        |
| FR-027 | Detour conditional triggers (server)                                               | 🚧 — **R2**, ADR-0012                                                                                                                         |
| FR-028 | No-stop loading/unloading segments                                                 | 🚧 — **R3** (`Restriction.affects = both`, `reason = no_stopping_zone`; data/API ready)                                                       |
| FR-029 | Triggers affect path only; no ETA                                                  | 🚧 — **R2/R3**; the no-ETA constraint already holds everywhere                                                                                |

## 8. Success criteria (with status)

| SC     | Criterion                                                          | Status                                                          |
| ------ | ------------------------------------------------------------------ | --------------------------------------------------------------- |
| SC-001 | Admin finds any route by name or code                              | ✅ — search + status filter                                     |
| SC-002 | Route rows show all four facts                                     | 🟡 — see FR-004                                                 |
| SC-003 | Four row actions (Edit route / Edit name / Modify status / Delete) | 🟡 — inline pencil/trash + Active switch + RouteGroup name edit |
| SC-004 | Right panel is contextual                                          | ✅                                                              |
| SC-005 | Empty state is understood                                          | ✅                                                              |
| SC-006 | Map editor: no header, action bar, all three actions               | 🟡 — bar present; two actions planned (**R1**)                  |
| SC-007 | Multi-stop route, chronological, start/end on stop, loop OK        | ✅                                                              |
| SC-008 | Full-path snap preview with Apply/Revert                           | ✅ — auto-commit variant (FR-013)                               |
| SC-009 | Create a nested detour                                             | 🚧 — **R1**                                                     |
| SC-010 | Create a no-stop segment                                           | 🚧 — **R3**                                                     |
| SC-011 | Stop shapes differ by type                                         | ✅                                                              |
| SC-012 | Detour visually distinct                                           | 🚧 — **R1**                                                     |
| SC-013 | Safety-net regression: nothing lost on refresh/crash               | ✅ — drafts + undo + conflict recovery                          |
| SC-014 | Import JSON placeholder present                                    | ✅ — **R8** for real import                                     |
| SC-015 | Automatic/Manual switch visible                                    | ⛔ — superseded design                                          |
| SC-016 | Undo/redo restores any edit                                        | ✅                                                              |
| SC-017 | Layer toggles hide/show each layer                                 | ✅                                                              |
| SC-018 | Conditional trigger round-trips server                             | 🚧 — **R2**                                                     |
| SC-019 | No ETA anywhere                                                    | ✅ — duration stripped at proxy; none displayed                 |

## 9. Map stack (ADR-0013 + today's reality)

- **Renderer:** MapLibre GL via react-map-gl v8. **One persistent instance** for the app lifetime (created once in `MapProvider`).
- **Tiles:** OpenFreeMap vector styles (`bright`, `positron`, `liberty`) — OSM data, **no key** (`lib/tiles.ts`). The old "Mapbox vector vs OSM raster" split is obsolete.
- **Directions proxy:** `GET /api/admin/mapbox/directions` (server, `api/mapbox.ts`) — takes ordered `[lng, lat]` coordinates, returns `SnappedPath` (`polyline`, `distanceMeters`, `snapped`, `warning`). **Duration is stripped** (ADR-0009). Requires `MAPBOX_SECRET_TOKEN`; without it the server returns a mock path so the UI degrades gracefully (warning banner, straight-line never committed).
- **Geocoding:** none server-side today; POI search is client-side Nominatim (R4 to replace with a Mapbox proxy).
- **Coordinate order:** `[lng, lat]` only — no conversion layer.

## 10. Architecture (current file map)

```
apps/admin/src/
├─ app/                  # app composition: AppShell, NavRail, Header, router, providers
│  ├─ app.tsx            # AuthProvider → QueryClientProvider → BrowserRouter → Toaster
│  ├─ router.tsx         # /login, / (Overview), /routes, /routes/:routeId, /fares, /export, 404
│  ├─ AppShell.tsx       # skip link, ConnectionBanner, NavRail, Header, Outlet
│  ├─ NavRail.tsx        # sections (Overview/Routes/Fares/Export), collapsed/hover modes
│  └─ Header.tsx         # section title, user menu, sign-out
├─ pages/
│  ├─ RouteWorkspace.tsx # the core surface — four-state machine (empty/overview/focus/edit)
│  ├─ Fares.tsx          # fares section (table + form + delete dialog)
│  ├─ Login.tsx          # auth form
│  ├─ Overview.tsx       # placeholder (R6)
│  ├─ Export.tsx         # placeholder (R7)
│  └─ NotFound.tsx
├─ features/
│  ├─ auth/              # AuthForm, RequireAuth, AuthProvider (context), api (login/me), session, sessionExpired, redirect, restore, BackendUnreachable
│  ├─ routes/            # THE workspace:
│  │  ├─ RouteWorkspace.tsx            # state derivation + orchestration
│  │  ├─ workspace/                     # WorkspaceColumns, RouteWorkspaceProvider, geometry, NarrowWindowGate
│  │  ├─ RouteList.tsx / RouteRow.tsx   # left column (overview + edit variants)
│  │  ├─ PropertiesPanel.tsx            # right column (FocusPlate / RouteGroup / StopGroup / StopEditor)
│  │  ├─ properties/                    # FocusPlate, RouteGroup, StopGroup, StopEditor, ConnectionSelect
│  │  ├─ StatusBar.tsx                  # save lifecycle + one contextual notice
│  │  ├─ PoiSearchBar.tsx               # Nominatim pill (debounced)
│  │  ├─ PlotActionBar.tsx              # ToolToggle, Undo/Redo, LayerToggles
│  │  ├─ EmptyState.tsx                 # veil: Create new route + Import JSON placeholder
│  │  ├─ stopLabels.ts                  # STOP_TYPE_LABELS (terminal / major stop / waiting area)
│  │  ├─ RouteMap.tsx + map/            # one MapLibre instance, RouteOverviewLayer, RouteLines, BasemapController, PerspectiveController, RouteFitter, SelectionPanner, constants
│  │  └─ routesApi.ts                   # admin → server calls (list/overview/create/get/patch/delete, directions, stops, snap)
│  ├─ fares/             # FareConfigTable, FareConfigForm, DeleteFareConfigDialog, api, queries, format, validation
│  └─ network/           # (planned for R6 — networkApi/NetworkMap not yet implemented)
├─ lib/
│  ├─ plottingStore.ts   # zustand: tool, stops, connections, polyline, snap state, layers, selection
│  ├─ connections.ts     # chain building, rewire, loop closure
│  ├─ plottingHistory.ts # undo/redo (5 kinds, coalescing)
│  ├─ draft.ts           # localStorage drafts (24 h TTL, 500 ms debounce)
│  ├─ coords.ts          # [lng, lat] math, segment helpers
│  ├─ stopShapes.ts      # type → shape/label mapping (selection never color-only)
│  ├─ overlap.ts         # draft-vs-saved stop matching
│  ├─ routeColors.ts     # palette + text-color contrast
│  ├─ tiles.ts           # OpenFreeMap styles
│  ├─ poiSearch.ts       # Nominatim URL builder + parser
│  ├─ uiStore.ts         # sidebar mode (expanded/collapsed/hover)
│  ├─ sections.ts        # nav sections registry
│  ├─ queryKeys.ts       # react-query keys
│  ├─ api.ts             # axios envelope client, token, connection banner, session expiry
│  ├─ toast.ts           # sonner helper
│  └─ utils.ts           # cn()
├─ tests/                # 21 Vitest suites (pure logic, node env)
└─ main.tsx, index.css   # entry; oklch tokens (Appendix E)
```

**Key flows:**

- _Boot:_ `App → RequireAuth → me() → AppShell → router → section`.
- _Edit route:_ `RouteList (open) → focus state (FocusPlate) → Edit → edit state → Add tool places stops → connections chain → debounced snap → drafts persist → Save = atomic PUT (stops + polyline + derived return) → conflict? LoadLatest`.
- _All API calls:_ `lib/api.ts` unwraps `{ success, data }`, maps error codes, sets the token header, detects `401` (session expiry) and network failure (ConnectionBanner).

## 11. Known limitations & gotchas

1. **`[lng, lat]` everywhere** — a swapped pair puts stops in the ocean; there is no converter (ADR-0013).
2. **No ETA** — do not "helpfully" surface `duration`; the proxy strips it (ADR-0009).
3. **Numeric columns are strings** in drizzle — `Number()` at the handler layer.
4. **Route delete is a hard cascade**; directions/stops/detours/restrictions/fare-configs are **soft** (except fare-config default/active guards). The delete confirm text must stay honest about this.
5. **One MapLibre instance** — never mount a second map; reset viewport/perspective rather than re-creating (ADR-0013).
6. **Workspace width gates** — right column hides < 1024 px; map floor 400 px; `NarrowWindowGate` owns the fallback UI.
7. **Snap straight-line fallback is never committed** — committing it would silently corrupt geometry; it renders dashed + warning.
8. **Undo does not cover reorder/link edits** — documented in `plottingHistory.ts`; keep it that way or extend deliberately.
9. **Drafts are single-slot** — editing a second route overwrites the first draft; the restore banner is the only recovery.
10. **Detours/restrictions have no UI yet** — the admin's `routesApi` does not call `detours`/`restrictions` endpoints; adding UI is R1.
11. **Server auth hardening** — login is throttled (5-failure account/source blocks) and origin-guarded (`ADMIN_ORIGINS`); do not bypass for local dev except via `ALLOW_DEV_CREDENTIAL`.
12. **`/routes/overview` is a reserved slug** — the overview endpoint coexists with `/routes/:routeId`; keep the guard.
13. **Fare configs: exactly one default** — enforced server-side; the form pre-validates `validateDefaultUnset`.
14. **Prettier** — this file is formatted by Prettier (`pnpm format:check`); keep tables/pipes Prettier-clean.

## 12. Roadmap task plan

Current workspace (ADR-0014/0015) is **done**. Remaining, in order:

1. **R1** Detour + restriction editing UI (workspace actions, nested editor, snapping, visual style) — FR-010/016/018, SC-009/010/012.
2. **R2** Detour conditional triggers: shared schemas + `api/detours.ts` + active-detour resolution — FR-027/029, SC-018 (ADR-0012).
3. **R3** No-stop segments UI on top of R1 — FR-028, SC-010.
4. **R4** Mapbox geocoding proxy replacing Nominatim.
5. **R5** Extract `fareCalculator` into `@komyuter/shared`; rewire admin + mobile.
6. **R6** Overview/network page (replace placeholder).
7. **R7** Export UI (endpoint ready).
8. **R8** Dataset import (replace placeholder).

Each roadmap item must land with its Vitest coverage + docs updated here (status flip from 🚧 to ✅).

## 13. Reference index

| Need                       | Where                                                                        |
| -------------------------- | ---------------------------------------------------------------------------- |
| Workspace spec / tasks     | `specs/008-admin-route-workspace-refactor/`                                  |
| Design decisions           | `docs/adr/` (Appendix F)                                                     |
| Shared types & zod schemas | `packages/shared/src/{types,schemas}/`                                       |
| DB schema (drizzle)        | `apps/server/src/db/schema.ts`                                               |
| Server routes              | `apps/server/src/api/*.ts`                                                   |
| Validation rules           | `apps/server/src/domain/validation.ts`                                       |
| Export assembler           | `apps/server/src/domain/export.ts`                                           |
| Env vars                   | `apps/server/src/config/env.ts`                                              |
| Admin API client           | `apps/admin/src/lib/api.ts`                                                  |
| Plotting store             | `apps/admin/src/lib/plottingStore.ts`                                        |
| History                    | `apps/admin/src/lib/plottingHistory.ts`                                      |
| Drafts                     | `apps/admin/src/lib/draft.ts`                                                |
| Design tokens              | `apps/admin/src/index.css` (Appendix E)                                      |
| Visual system              | `DESIGN.md`, `PRODUCT.md`, `apps/mobile/.impeccable/surfaces/apps-mobile.md` |

## 14. Getting started

```bash
pnpm install
# local Supabase (backend only): see specs/001-local-supabase-backend
cd apps/server && cp .env.example .env   # DATABASE_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ADMIN_EMAIL, ADMIN_PASSWORD, optional MAPBOX_SECRET_TOKEN
pnpm dev                                  # turbo: runs server + admin
```

Open `http://localhost:5173`, sign in with the admin credential. Without `MAPBOX_SECRET_TOKEN`, plotting works but snapping shows the degraded mock-path warning.

Quality gates before commit: `pnpm lint`, `pnpm typecheck`, `pnpm format:check`, `pnpm --filter admin test`, `pnpm --filter server typecheck`, `pnpm --filter server test` (integration suite needs the local stack up). Tests are written first per `specs/001-local-supabase-backend/tasks.md` (TDD: red before implementation).

---

## Appendix A — Domain types (`packages/shared/src/types/domain.ts`)

```ts
// Route/Stop/etc. as defined in packages/shared/src/types/domain.ts

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
  created_at: string;
  updated_at: string;
  // ADR-0012 additions (planned, R2 — NOT in the schema today):
  // active_timeframes: ActiveTimeframe[];  condition: Condition | null;
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
  created_at: string;
  updated_at: string;
}
```

## Appendix B — Geometry types (`packages/shared/src/types/geometry.ts`)

```ts
/** [lng, lat] — the only coordinate order in the system (ADR-0013). */
export type CoordinatePair = [number, number];

export interface GeoPoint {
  type: "Point";
  coordinates: CoordinatePair;
}

export interface GeoLineString {
  type: "LineString";
  coordinates: CoordinatePair[];
}
```

## Appendix C — Zod schemas (`packages/shared/src/schemas/`)

- `domain.ts`: `routeIdSchema` (lowercase slug), `createRouteSchema`, `updateRouteSchema`, `createDirectionSchema` (label + base polyline + origin/destination stop ids + stops), `updateDirectionSchema`, `createStopSchema`, `updateStopSchema`, `overviewStopSchema`, `overviewRouteSchema`, `overviewRoutesSchema`, `notableStopSchema`, `createDetourSchema` (entry/exit points + detour polyline + instructions + notable stops), `updateDetourSchema`, `createRestrictionSchema` (`from_coord_index`/`to_coord_index` + `reason` + `affects` + note), `updateRestrictionSchema`, `createFareConfigSchema`, `updateFareConfigSchema`, plus enums `stopTypeSchema` (`terminal`/`major_stop`/`waiting_area`), `restrictionReasonSchema`, `restrictionAffectsSchema`.
- `geometry.ts`: `coordinatePairSchema`, `geoPointSchema`, `geoLineStringSchema` — validate `[lng, lat]` and bounded coordinates.
- `envelope.ts`: `successResponseSchema`, `errorResponseSchema` — the `{ success, data | error }` wire contract.
- `export-dataset.ts`: `exportDatasetSchema` — the dataset export shape.
- `mapbox.ts`: `snapCoordinatesSchema`, `mapboxDirectionsResponseSchema` (wire), plus the `SnappedPath`/`SnapCoordinates` types in `types/mapbox.ts`.

**Planned (R2, ADR-0012):** `activeTimeframeSchema`, `conditionSchema` + their inclusion in `createDetourSchema`/`updateDetourSchema`.

## Appendix D — Fare rule (ADR-0001)

> **Note:** the shared `fareCalculator` does **not exist yet** (R5). Today the rule is implemented twice: admin formatters/validators in `apps/admin/src/features/fares/{format,validation}.ts` and the mobile side. The rule below is the single intended truth.

LTFRB fare formula (defaults ₱13 / 4 km / ₱1.80 per km; `student_discount_pct` and `senior_discount_pct` default 20):

```
fare = base_fare + max(0, dist_km - base_distance_km) × rate_per_km
discounted = fare × (1 - discount_rate)
```

- The **displayed** fare is always the exact per-leg total.
- The Dijkstra **internal** cost is base-on-board + marginal ₱1.80/km — deliberately NOT the per-edge LTFRB formula. Do not "fix" it.
- Planned: `@komyuter/shared` owns `fareCalculator` + shared types — reuse, never reimplement.

## Appendix E — Design tokens (`apps/admin/src/index.css`, Route Sign grammar)

- **Corners:** `--radius: 0.25rem` — **≤ 4 px**, flat enamel plates (the old "12 px pill-friendly" value is obsolete).
- **Color:** oklch tokens — `background` (pure white ground), `foreground`, `primary` (signboard green-blue), `signal` (amber), `destructive`, `border`, `muted`, `card`, `popover`, `sidebar`-family.
- **Type:** Geist Variable (body) + Baloo 2 Variable (display headings) — the Route Sign hand-painted lettering feel.
- **Elevation:** no shadows — separation via borders, whitespace, and plate fills only.
- **Icons:** lucide-react stroke style, consistent with the sign-plate linework.

## Appendix F — ADR index (`docs/adr/`)

| ADR  | Decision                                                                                     | Status                                              |
| ---- | -------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| 0001 | Fare-ranking cost = base-on-board + marginal ₱1.80/km                                        | live                                                |
| 0002 | Per-edge-type normalization, clamped [0,1]; transfer distance 0                              | live (routing)                                      |
| 0003 | Trace validity via max-speed discriminator (10–45 km/h)                                      | live (routing)                                      |
| 0004 | Backend framework = Fastify v5                                                               | live                                                |
| 0005 | No Redis — local Postgres state                                                              | live                                                |
| 0006 | Supabase Auth — admin-gated CRUD, anonymous commuter                                         | live                                                |
| 0007 | Admin Leaflet map                                                                            | **superseded by 0013** — never ship the Leaflet map |
| 0008 | Detour replacement model (data model)                                                        | live                                                |
| 0009 | No ETA anywhere                                                                              | live                                                |
| 0010 | Single-region dataset (Iloilo)                                                               | live                                                |
| 0011 | Auto-derived return direction (reverse of base)                                              | live                                                |
| 0012 | Detour conditional triggers — **planned** (requirements in this doc, §6 R2; no ADR file yet) | planned                                             |
| 0013 | Admin MapLibre + Mapbox directions proxy; `[lng, lat]`; one instance                         | live                                                |
| 0014 | Admin workspace layers (fixed 256/336 columns, full-bleed map)                               | live                                                |
| 0015 | Workspace floating plates over the map (five-track grid)                                     | live                                                |

## Appendix G — API surface (`apps/server/src/api/`)

All responses use the `{ success, data | error }` envelope; error codes in `api/errors.ts` (`VALIDATION_ERROR`, `NOT_FOUND`, `CONFLICT`, `UNAUTHORIZED`, `FORBIDDEN`, `RATE_LIMITED`, `INTERNAL`, `UPSTREAM_ERROR`, `BACKEND_UNREACHABLE`). Admin routes sit under `/api/admin` behind the Supabase auth guard.

**No guard:**

| Method | Path               | Notes                                                                               |
| ------ | ------------------ | ----------------------------------------------------------------------------------- |
| POST   | `/api/auth/login`  | `{ email, password }` → `{ access_token, user }`; unified denial, ~250 ms, throttle |
| GET    | `/api/auth/me`     | token → `user`                                                                      |
| POST   | `/api/auth/logout` | 204; global revocation                                                              |
| GET    | `/api/status`      | health/status                                                                       |

**Admin guard — routes:** `GET /api/admin/routes` (summary list) · `POST /api/admin/routes` · `GET /api/admin/routes/overview` (one-shot overview with polylines) · `GET /api/admin/routes/:routeId` · `PUT /api/admin/routes/:routeId` · `DELETE /api/admin/routes/:routeId` (hard cascade).

**Directions:** `GET /api/admin/routes/:routeId/directions` · `POST /api/admin/routes/:routeId/directions` (`plotted` or `legacy` mode) · `GET /api/admin/directions/:directionId` · `PUT /api/admin/directions/:directionId` (atomic save: stops + polyline + derived return) · `DELETE /api/admin/directions/:directionId` (soft).

**Stops:** `GET /api/admin/directions/:directionId/stops` · `POST /api/admin/directions/:directionId/stops` · `PUT /api/admin/stops/:stopId` · `DELETE /api/admin/stops/:stopId` (soft; terminal guard 409).

**Detours (UI = R1):** `GET/POST /api/admin/directions/:directionId/detours` · `PUT/DELETE /api/admin/detours/:detourId` (soft). Payload: label, entry/exit points, detour polyline, instructions, notable stops (ADR-0008).

**Restrictions (UI = R1):** `GET/POST /api/admin/directions/:directionId/restrictions` · `PUT/DELETE /api/admin/restrictions/:restrictionId` (soft). Payload: `from_coord_index`/`to_coord_index` range + `reason` + `affects` (incl. `both` = no-stop segment).

**Fare configs:** `GET /api/admin/fare-configs` · `GET /api/admin/fare-configs/:id` · `POST` · `PUT` · `DELETE` (soft deactivate with exactly-one-default and in-use guards).

**Export:** `GET /api/admin/export/dataset` (assembler in `domain/export.ts`; UI = R7).

**Mapbox:** `GET /api/admin/mapbox/directions` (snap proxy; `MAPBOX_SECRET_TOKEN`; duration stripped; mock fallback). **Geocode: planned (R4).**

**Cross-cutting:** login throttle (`throttle.ts`: account-block after 5 failures, source-block) · origin guard (`origin-guard.ts`: `ADMIN_ORIGINS`) · `security-events.ts` audit log.

## Appendix H — Glossary

- **Administrator** — the single admin account (Supabase Auth) that can edit the dataset; commuters are anonymous.
- **Route Sign** — the shared visual grammar of the admin + commuter app: flat enamel sign-plate, white ground, green-blue + amber, ≤ 4 px corners, no shadows.
- **Workspace state** — `empty` / `overview` / `focus` / `edit`, derived from (selection, draft).
- **Connection** — a `from`/`to` stop pair; the chain of connections produces the direction polyline.
- **Draft** — in-progress plotted stops persisted to `localStorage` (24 h TTL).
- **Snap** — road-following of the chain polyline via the Mapbox directions proxy; auto-committed into history.
- **Detour** — a nested alternative path for a direction, defined by entry/exit points + a detour polyline + commuter/driver instructions + notable stops (ADR-0008); data + API exist, UI planned (R1).
- **Restriction** — a **coordinate-index range** of a direction's base polyline with boarding/alighting rules (`reason` + `affects`); `affects = both` = no-stop segment (UI planned, R3).
- **Fare configuration** — a named LTFRB fare table; exactly one default.
- **Base / Return** — the two directions of a route; return is auto-derived from base (ADR-0011).
