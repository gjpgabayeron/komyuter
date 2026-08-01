# API Contract — Admin Backend

Base path: `/api`. All admin endpoints require `Authorization: Bearer <supabase_access_token>` and fail with `401` when the token is invalid/expired or `403` when the user is not in `admin_users` (spec FR-001).

## Response envelope (all endpoints)

```json
{ "success": true, "data": { } }
{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "..." } }
```

Error codes: `UNAUTHORIZED` (401), `FORBIDDEN` (403), `NOT_FOUND` (404), `VALIDATION_ERROR` (422), `CONFLICT` (409, e.g., referenced-stop deletion), `INTERNAL` (500).

## Conventions

- All geometry is GeoJSON, coordinates in **`[longitude, latitude]`** order — validated per pair on write.
- `DELETE` soft-deactivates (`is_active=false`); re-activation is `PATCH { "is_active": true }`. Hard delete is only permitted for entities with no dependents.
- Writes are validated before persist (spec FR-004). Conflict rule: last-write-wins.
- Request/response bodies are validated with zod schemas from `@komyuter/shared`.

## Endpoints

### Status

| Method | Path          | Auth | Description                           |
| ------ | ------------- | ---- | ------------------------------------- |
| GET    | `/api/status` | none | Health + dataset statistics (FR-012). |

Response `data`: `{ status: "ok", stats: { routes, directions, stops, detours, restrictions, fare_configs, dataset_updated_at } }`

### Routes

| Method | Path                         | Description                                                                                     |
| ------ | ---------------------------- | ----------------------------------------------------------------------------------------------- |
| GET    | `/api/admin/routes`          | List routes (summary: id, name, short_name, color, is_active, fare_config_id, direction count). |
| POST   | `/api/admin/routes`          | Create route. Body: `{ route_id?, name, short_name, color?, fare_config_id? }`                  |
| GET    | `/api/admin/routes/:routeId` | Full route incl. `directions[]` (each with `stops[]`, `detours[]`, `restrictions[]`).           |
| PUT    | `/api/admin/routes/:routeId` | Update route fields (and `is_active`).                                                          |
| DELETE | `/api/admin/routes/:routeId` | Deactivate route (soft).                                                                        |

### Directions (nested under a route)

| Method | Path                                    | Description                                                                                           |
| ------ | --------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| GET    | `/api/admin/routes/:routeId/directions` | List directions of a route.                                                                           |
| POST   | `/api/admin/routes/:routeId/directions` | Create direction. Body: `{ label, base_polyline: LineString, origin_stop_id?, destination_stop_id? }` |
| GET    | `/api/admin/directions/:directionId`    | Direction with ordered `stops[]`, `detours[]`, `restrictions[]`.                                      |
| PUT    | `/api/admin/directions/:directionId`    | Update (incl. `base_polyline` replacement).                                                           |
| DELETE | `/api/admin/directions/:directionId`    | Deactivate direction (soft).                                                                          |

### Stops (nested under a direction)

| Method | Path                                       | Description                                                                                                                                               |
| ------ | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/admin/directions/:directionId/stops` | Stops ordered by `stop_order`.                                                                                                                            |
| POST   | `/api/admin/directions/:directionId/stops` | Create stop. Body: `{ name, type, location: Point, stop_order?, is_guaranteed_service?, landmark_hint?, notes? }` (auto `stop_order` = max+1 if omitted). |
| PUT    | `/api/admin/stops/:stopId`                 | Update stop (incl. `stop_order` swap/reorder).                                                                                                            |
| DELETE | `/api/admin/stops/:stopId`                 | Deactivate; rejected with `CONFLICT` if referenced as a direction terminal (FR-004).                                                                      |

### Detours (nested under a direction)

| Method | Path                                         | Description                                                                                                                                                                |
| ------ | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/admin/directions/:directionId/detours` | List detours.                                                                                                                                                              |
| POST   | `/api/admin/directions/:directionId/detours` | Create. Body: `{ label, entry: Point, exit: Point, detour_polyline: LineString, additional_distance_meters?, commuter_instruction?, driver_instruction?, notable_stops? }` |
| PUT    | `/api/admin/detours/:detourId`               | Update.                                                                                                                                                                    |
| DELETE | `/api/admin/detours/:detourId`               | Deactivate (soft).                                                                                                                                                         |

### Restrictions (nested under a direction)

| Method | Path                                              | Description                                                                  |
| ------ | ------------------------------------------------- | ---------------------------------------------------------------------------- |
| GET    | `/api/admin/directions/:directionId/restrictions` | List restrictions.                                                           |
| POST   | `/api/admin/directions/:directionId/restrictions` | Create. Body: `{ from_coord_index, to_coord_index, reason, affects, note? }` |
| PUT    | `/api/admin/restrictions/:restrictionId`          | Update.                                                                      |
| DELETE | `/api/admin/restrictions/:restrictionId`          | Deactivate (soft).                                                           |

### Fare configurations

| Method | Path                                    | Description                                                                                                                |
| ------ | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/admin/fare-configs`               | List.                                                                                                                      |
| POST   | `/api/admin/fare-configs`               | Create. Body: `{ label, base_fare, base_distance_km, rate_per_km, student_discount_pct, senior_discount_pct, is_default }` |
| GET    | `/api/admin/fare-configs/:fareConfigId` | Read.                                                                                                                      |
| PUT    | `/api/admin/fare-configs/:fareConfigId` | Update (only one config may be `is_default`).                                                                              |
| DELETE | `/api/admin/fare-configs/:fareConfigId` | Deactivate; `CONFLICT` if referenced by a route and no default exists.                                                     |

### Export (spec FR-009/FR-010)

| Method | Path                        | Auth  | Description                                                                                                                                                                                                       |
| ------ | --------------------------- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/admin/export/dataset` | admin | Returns the full dataset JSON with `Content-Disposition: attachment; filename="komyuter-dataset.json"` and `Content-Type: application/json`. Empty dataset → valid empty document (`routes: []`), never an error. |

The downloaded file is standalone (no auth) — the Collaboratory script reads it from disk (spec Q3). Shape: `contracts/export-dataset.schema.json`.
