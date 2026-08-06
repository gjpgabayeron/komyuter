# Contract — Atomic Direction Save (extended)

`POST /api/admin/routes/:routeId/directions`

Envelope: `{ success, data | error }` · Auth: admin guard · Content-Type: `application/json`

## Purpose

Single atomic Save for the Route Plotting page (FR-027, SC-013): creates the **base Direction + its ordered Stops**, derives the **return Direction** (ADR-0011), all in **one DB transaction**. Either everything persists or nothing does.

This extends the existing endpoint (currently inserts a direction then `Promise.all`s stop inserts with **no transaction** — the new behavior is the transaction + auto-derived return). The existing non-transactional path and the response shape for the plain create remain compatible.

## Request

Path: `POST /api/admin/routes/{route_id}/directions` where `route_id` matches `routeIdSchema` (lowercase slug).

Body (extends `createDirectionSchema`, `stops` now required, `label` optional):

```jsonc
{
  // label OPTIONAL — auto-generated when absent:
  //   base = "To {destination stop name}", return = "To {origin stop name}"
  "label": "To City Proper",
  "base_polyline": {
    "type": "LineString",
    "coordinates": [[122.5689, 10.6931], [122.5695, 10.6938], "…"], // [lng, lat], ≥ 2 coords
  },
  "stops": [
    {
      "name": "Stop 1", // required; client auto-defaults "Stop N" (FR-028)
      "type": "terminal", // "terminal" | "major_stop" | "waiting_area"
      "location": { "type": "Point", "coordinates": [122.5689, 10.6931] }, // [lng, lat]
      "is_guaranteed_service": false, // optional
      "landmark_hint": null, // optional
      "notes": null, // optional
    },
    "…",
  ],
}
```

- `stops` **required**, non-empty, ordered — array index + 1 becomes `stop_order`.
- `stop_order` inside each stop is ignored on this endpoint (derived from order).
- `base_polyline.coordinates[0]` must equal `stops[0].location` and `base_polyline.coordinates[last]` must equal `stops[last].location` (within tolerance ≈ 100 m) — the path must start and end on a stop; a loop (first == last stop) is allowed (FR-004/FR-017).
- `origin_stop_id` / `destination_stop_id` are ignored/overwritten (derived from first/last stop).

## Response — 200 OK

```jsonc
{
  "success": true,
  "data": {
    "direction": {
      "direction_id": "…",
      "route_id": "…",
      "label": "To City Proper",
      "base_polyline": { "type": "LineString", "coordinates": ["…"] },
      "origin_stop_id": "…",
      "destination_stop_id": "…",
      "is_active": true,
      "stops": [
        {
          "stop_id": "…",
          "direction_id": "…",
          "name": "Stop 1",
          "stop_order": 1,
          "type": "terminal",
          "location": { "type": "Point", "coordinates": ["…"] },
          "is_guaranteed_service": false,
          "landmark_hint": null,
          "notes": null,
          "is_active": true,
        },
      ],
    },
    "return_direction": {
      // label auto-generated "To {base first stop name}";
      // base_polyline = base coordinates REVERSED;
      // stops = new rows, same name/type/location, stop_order reversed (n…1);
      // origin_stop_id / destination_stop_id swapped
    },
  },
}
```

The client renders both directions immediately; no follow-up fetch needed.

## Errors

| Code                   | Condition                                                                                                   |
| ---------------------- | ----------------------------------------------------------------------------------------------------------- |
| `401 UNAUTHORIZED`     | not signed in                                                                                               |
| `404 NOT_FOUND`        | route does not exist                                                                                        |
| `422 VALIDATION_ERROR` | malformed body; < 2 stops; polyline < 2 coords; path not starting/ending on a stop; coordinate out of range |
| `409 CONFLICT`         | another Administrator concurrently modified this route (existing conflict semantics)                        |
| `500 INTERNAL`         | transaction failure — **rolled back**, no partial state (SC-013)                                            |

## Related (existing, unchanged) endpoints the page consumes

| Endpoint                                       | Use                                                             |
| ---------------------------------------------- | --------------------------------------------------------------- |
| `GET /api/admin/routes`                        | nav overlay route list (FR-002)                                 |
| `POST /api/admin/routes`                       | "Create new route" from empty state / New route dialog (FR-030) |
| `GET /api/admin/routes/:routeId`               | route meta for header                                           |
| `GET /api/admin/routes/:routeId/directions`    | load existing directions                                        |
| `GET /api/admin/directions/:directionId`       | load one direction                                              |
| `GET /api/admin/directions/:directionId/stops` | load ordered stops                                              |
| `PUT /api/admin/stops/:stopId`                 | stop name/type edits from the properties panel (FR-018/FR-028)  |
