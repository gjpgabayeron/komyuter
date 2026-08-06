# Data Model — Route Plotting Page

Phase 1 output. Canonical source for entities, fields, validation, and state transitions used by the plotting feature. Server-persisted entities mirror the existing drizzle schema (`apps/server/src/db/schema.ts`) and `@komyuter/shared` types; client-only entities live in the admin app and are never sent to the server (spec Assumptions).

**Coordinate convention**: `[longitude, latitude]` everywhere (GeoJSON / PostGIS / MapLibre — ADR-0013). No conversion layer exists or will be built.

---

## 1. Server-persisted entities (existing schema, used by this feature)

### Route

Identifies the bidirectional service being plotted. Created via the existing `POST /api/admin/routes`.

| Field            | Type         | Notes                            |
| ---------------- | ------------ | -------------------------------- |
| `route_id`       | text PK      | lowercase slug (`routeIdSchema`) |
| `name`           | text         | required                         |
| `short_name`     | text         | required                         |
| `color`          | text \| null | `#rrggbb`                        |
| `fare_config_id` | text \| null | FK fare configurations           |
| `is_active`      | boolean      | soft delete flag                 |

One Route yields exactly **two** Directions (ADR-0008).

### Direction

A directed service: own polyline + own ordered stop list. The feature creates **both** Directions in one atomic save.

| Field                 | Type                       | Notes                                                                                                           |
| --------------------- | -------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `direction_id`        | text PK                    | generated server-side                                                                                           |
| `route_id`            | text FK                    | cascade                                                                                                         |
| `label`               | text                       | **auto-generated on save**: base = `To {destination stop name}`, return = `To {origin stop name}` (research R4) |
| `base_polyline`       | geometry(LineString, 4326) | the applied road-snapped path; return = base coordinates **reversed** (never reuse the base object — ADR-0008)  |
| `origin_stop_id`      | text \| null               | base: first placed stop; return: the base's last stop (swapped)                                                 |
| `destination_stop_id` | text \| null               | base: last placed stop; return: the base's first stop                                                           |
| `is_active`           | boolean                    | soft delete                                                                                                     |

### Stop

Direction-scoped boarding/alighting point; the return Direction gets its **own** Stop rows (same name/type/location, reversed `stop_order`).

| Field                   | Type                                          | Notes                                                                                                    |
| ----------------------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `stop_id`               | text PK                                       | generated server-side                                                                                    |
| `direction_id`          | text FK                                       |                                                                                                          |
| `name`                  | text                                          | required — client auto-defaults `"Stop N"` in placement order (FR-028), editable in the properties panel |
| `stop_order`            | int ≥ 1                                       | chronological order, unique per direction (enforced by application, not DB constraint today)             |
| `type`                  | enum `terminal \| major_stop \| waiting_area` | drives map shape: square / circle / diamond (FR-017, SC-006)                                             |
| `location`              | geometry(Point, 4326)                         | `[lng, lat]`                                                                                             |
| `is_guaranteed_service` | boolean                                       | default false                                                                                            |
| `landmark_hint`         | text \| null                                  |                                                                                                          |
| `notes`                 | text \| null                                  |                                                                                                          |
| `is_active`             | boolean                                       | soft delete                                                                                              |

> drizzle numeric columns are string-mode — handlers convert with `Number()` (existing server convention).

### Relationships & cardinality

- `Route 1──* Direction` — exactly two per route (ADR-0008)
- `Direction 1──* Stop` — ordered by `stop_order`
- A plotted route **must start and end on a stop**; ending on the start stop (a loop) is allowed (FR-017/FR-004)

---

## 2. Client-only entities (never persisted server-side)

### Draft

Unsaved working state of the plotted path (FR-014). Stored in `localStorage` under `komyuter.draft.{routeId}.{directionId}` with a **24h TTL** timestamp; debounced (~500 ms) writes; restored via banner; never sent to the server.

| Field                      | Type                      | Notes                                                                              |
| -------------------------- | ------------------------- | ---------------------------------------------------------------------------------- |
| `route_id`, `direction_id` | string                    | scope keys                                                                         |
| `mode`                     | `"automatic" \| "manual"` |                                                                                    |
| `stops`                    | `DraftStop[]`             | ordered placed stops: `{ id (client uuid), name, type, location: CoordinatePair }` |
| `polyline`                 | `GeoLineString \| null`   | applied snapped path                                                               |
| `snap`                     | `SnapState`               | preview pending/applied/reverted, `snapped: boolean`                               |
| `history`                  | `PlottingHistory`         | undo/redo stacks (command entries)                                                 |
| `saved_at` / `expires_at`  | ISO timestamps            | TTL enforcement                                                                    |

### PlottingMode

`"automatic" | "manual"` — toggle in the floating action bar (FR-005/FR-006).

### SelectionState

`none | { kind: "stop", stopId } | { kind: "polyline" }` — drives the right-side contextual panel (FR-018): shown only when non-none, hidden on `none`.

### LayerVisibility

`{ stops: boolean, terminals: boolean, routes: boolean }` — pure client-side filters; **Terminals is a sub-filter of Stops** by `type === "terminal"` (no new data, FR-022/FR-023, SC-007).

### SnapPreview

`{ polyline: GeoLineString, distance_meters: number, snapped: boolean }` — response of the Mapbox proxy; `snapped: false` signals the straight-line fallback (warning shown, FR-009).

### PlottingHistory (undo/redo)

Command stack in the zustand plotting store. Entries: `stop_placed`, `stop_deleted`, `stop_dragged`, `snap_applied`. Undo/redo invert the entry; `mod+z` / `mod+shift+z` hotkeys (FR-013, SC-004).

---

## 3. Validation rules (from spec FRs)

| Rule                                                           | Source                      | Enforced                                                                                                                   |
| -------------------------------------------------------------- | --------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Route code is a lowercase slug                                 | existing                    | server (shared schema)                                                                                                     |
| Path has ≥ 2 stops                                             | FR-004 (start+end on stops) | server save + client save-block                                                                                            |
| Path starts and ends on a stop; loop allowed                   | FR-004/FR-017               | server: first/last polyline coordinate within tolerance of first/last stop location; client blocks save with explanation   |
| Every stop connected to the polyline (no floating stops)       | FR-011/FR-017               | client by construction (snap routes through stop waypoints); server validates first/last; interior checked at preview time |
| `stop_order` unique + chronological per direction              | FR-010                      | server + client                                                                                                            |
| No unnamed stop at save time                                   | FR-028                      | client auto-defaults names at placement                                                                                    |
| No ETA displayed                                               | FR-021/ADR-0009             | proxy strips `duration`; UI renders none (SC-010)                                                                          |
| Draft expired (> 24h) → not offered, nothing silently restored | FR-014                      | client TTL check on load                                                                                                   |
| Save conflict (another Administrator editing same Route)       | spec edge case              | server `CONFLICT` → client conflict message, local work retained                                                           |

---

## 4. State transitions

```text
No route selected (FR-030 empty state)
        │  select / create Route (GET /api/admin/routes, POST /api/admin/routes)
        ▼
Loaded (existing stops+path rendered) ── enter plot mode ──▶ Plotting (draft active)
                                                              │  place stop (auto-default name, order preserved)
                                                              ▼
                                              Stops placed ── Automatic: preview requested (debounced 500 ms)
                                                              │  Manual: no lines until Connect
                                                              ▼
                                              Snap preview (snapped | straight-line fallback + warning)
                                                              │  Apply │ Revert
                                                              ▼
                                              Path applied (undoable) ── Save (mod+s) ──▶ VALIDATE
                                                                                          │  invalid: blocked + explanation
                                                                                          ▼
                                                          ATOMIC SAVE (POST /routes/:routeId/directions)
                                                          base Direction + base Stops ── derive ──▶ return Direction
                                                                  (one DB transaction — either all or nothing, SC-013)
                                                                                          │
                                                                                          ▼
                                                            Saved → draft cleared → reload shows both directions (SC-005)

Navigation away with unsaved changes ──▶ confirm guard; draft kept (localStorage, 24h TTL)
Draft offered on return → restore (continues history) or discard (clears draft key)
```
