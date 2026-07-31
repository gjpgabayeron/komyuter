# Data Model: Admin Backend

Phase 1 output. Entities derived from `spec.md` §Key Entities and Requirements. All coordinates are stored and returned as GeoJSON in **`[longitude, latitude]`** order (hard invariant). Spatial columns are PostGIS `geometry(Point|LineString, 4326)`.

## Conventions

- IDs: server-generated, stable slugs (e.g., `calaparan-calumpang-iloilo-city`) for routes; generated IDs for directions/stops/detours/restrictions/fare configs. Unique across the whole dataset.
- States: every entity uses **active / inactive** (soft state). No hard deletes of referenced data.
- Envelope on all API responses: `{ success: true, data }` or `{ success: false, error: { code, message } }`.
- Canonical terms from `docs/CONTEXT.md`: Route, Direction, Stop, Detour, Restriction, Fare Configuration, Boarding Point (derived), Admin.

## Entities

### Admin (identity, not a CRUD entity)

- Represents: a recognized administrator via Supabase Auth (single role, ADR-0006).
- Attributes: `user_id` (uuid, PK, references `auth.users(id)`).
- Provisioning: exactly one row seeded by `supabase/seed.sql` (spec FR-016). No signup/invite.
- Gate: every `/api/admin/*` request → verify Supabase access token → `admin_users` lookup → else 401/403.

### Route

- Represents: a single PUJ franchise — the full bidirectional entity (CONTEXT.md).
- Attributes:
  - `route_id` (PK, slug)
  - `name` (text, not null)
  - `short_name` (text, not null)
  - `color` (text, hex string)
  - `is_active` (boolean, default true)
  - `fare_config_id` (FK → Fare Configuration, nullable; null ⇒ default fare parameters apply, FR-015)
  - `created_at`, `updated_at` (timestamps)
- Relationships: has exactly two Directions (one per service direction); references zero/one Fare Configuration.
- Validation: unique `route_id`; non-empty `name`/`short_name`; no `city` column (ADR-0010).
- State transitions: active ↔ inactive via update; **DELETE = deactivate** (soft). Hard delete only if the route has no directions (orphan check).

### Direction

- Represents: a directed service of a route — "To City Proper" / "To Calaparan" (CONTEXT.md). Own path geometry and ordered stop list; never derived from the other direction (FR-007, ADR-0008).
- Attributes:
  - `direction_id` (PK)
  - `route_id` (FK → Route, not null)
  - `label` (text, not null, e.g., "To City Proper")
  - `base_polyline` (geometry LineString 4326; stored via `ST_GeomFromGeoJSON`, served via `ST_AsGeoJSON`) — exactly one per direction
  - `origin_stop_id`, `destination_stop_id` (FK → Stop, nullable until stops exist) — terminals
  - `is_active` (boolean, default true)
  - `created_at`, `updated_at`
- Relationships: belongs to Route; owns ordered Stops, Detours, Restrictions.
- Validation: exactly one `base_polyline`; ordered **non-empty** stop list (FR-004/FR-007); direction's stops belong to this direction.

### Stop

- Represents: a formal, admin-curated, named boarding/alighting point on a direction (CONTEXT.md).
- Attributes:
  - `stop_id` (PK)
  - `direction_id` (FK → Direction, not null)
  - `name` (text, not null)
  - `stop_order` (integer, not null) — authoritative sequence within the direction; unique per direction
  - `type` (enum: `terminal` | `major_stop` | `waiting_area`)
  - `location` (geometry Point 4326)
  - `is_guaranteed_service` (boolean, default true)
  - `ar_marker_enabled` (boolean, default true — data retained for the AR feature later)
  - `landmark_hint`, `notes` (text, nullable)
- Relationships: belongs to one Direction; a physical stop served by both directions is modeled as a row in each direction's list (CONTEXT.md Direction).
- Validation: `stop_order` unique within direction; cannot be deleted while referenced as a Direction terminal or while listed in that direction's stop list (FR-004) — deactivation only.
- Reordering: updates apply last-write-wins per spec Q5; a reorder request must carry the full ordered list or a single `stop_order` swap.

### Detour

- Represents: a demand-triggered, direction-specific loop departing from and returning to the base path (CONTEXT.md).
- Attributes:
  - `detour_id` (PK)
  - `direction_id` (FK → Direction, not null)
  - `label` (text, not null)
  - `entry` (geometry Point 4326), `exit` (geometry Point 4326)
  - `detour_polyline` (geometry LineString 4326)
  - `additional_distance_meters` (integer, nullable)
  - `commuter_instruction` (text, e.g., "Tell the driver 'Super' before or upon boarding.")
  - `driver_instruction` (text, nullable)
  - `notable_stops` (JSONB: `[{ stop_id, name, is_detour_only }]`)
- Validation: `entry` and `exit` MUST lie on the direction's `base_polyline` (FR-004); detour geometry is valid LineString.
- Note: routing semantics (replacement, ADR-0008) are a later feature; this delivery only stores/validates/exports detours.

### Restriction

- Represents: a portion of a direction's path where boarding/alighting is not permitted (CONTEXT.md). Affects boarding-point eligibility only; never part of the graph.
- Attributes:
  - `restriction_id` (PK)
  - `direction_id` (FK → Direction, not null)
  - `from_coord_index`, `to_coord_index` (integer, not null) — indices into `base_polyline.coordinates`
  - `reason` (enum: `no_stopping_zone` | `contraflow` | `pedestrian_hostile`)
  - `affects` (enum: `boarding` | `alighting` | `both`)
  - `note` (text, nullable)
- Validation: `0 ≤ from ≤ to < coordinates.length` of the direction's base polyline; indices refer to the **current** polyline (reject if out of range after a polyline edit).

### Fare Configuration

- Represents: an editable record of fare parameters attached to routes (CONTEXT.md; BACKEND.md §5).
- Attributes:
  - `fare_config_id` (PK)
  - `label` (text, not null)
  - `base_fare` (numeric, default 13.00)
  - `base_distance_km` (numeric, default 4.0)
  - `rate_per_km` (numeric, default 1.80)
  - `student_discount_pct` (numeric, default 20)
  - `senior_discount_pct` (numeric, default 20)
  - `is_default` (boolean) — the config applied when a Route has no explicit `fare_config_id`
- Validation: numeric fields non-negative; exactly one row may be `is_default`.
- Note: the LTFRB formula itself is owned by `fareCalculator` in `@komyuter/shared` (later feature); this delivery only stores parameters.

## Relationships summary

```
Route 1──* Direction 1──* Stop (ordered by stop_order)
                │──* Detour
                │──* Restriction
Route *──0..1 Fare Configuration (is_default applies when null)
Admin (auth.users) 1──* admin_users (gate)
```

## Validation rules (spec FR-004, applied on write)

1. Deleting a Stop referenced by a Direction's terminal or stop list → rejected (`CONFLICT`), no data changed.
2. Direction saved with an empty stop list → rejected (`VALIDATION_ERROR`).
3. `base_polyline` / `detour_polyline` / `location` not valid geometry → rejected.
4. Detour `entry`/`exit` not on the direction's `base_polyline` → rejected.
5. Restriction indices out of range for the current polyline → rejected.
6. Any write with coordinate pairs in `[lat, lng]` order → rejected (the API only accepts GeoJSON `[lng, lat]`; order is validated per coordinate pair).
7. Conflict rule: last-write-wins; no version tracking (spec Q5).

## Export dataset (FR-009/FR-010)

Assembled from the tables above by `src/domain/export.ts` into a single JSON document. Shape and example in `contracts/export-dataset.schema.json`; types mirrored in `packages/shared/src/types/export-dataset.ts`. Geometry is embedded as GeoJSON (always `[lng, lat]`). Both active and inactive routes/directions are included with their `is_active` flags (spec US2 scenario 4). No navigation/arrival-time data is present.
