# Contract — Atomic Direction Save (extended)

`POST /api/admin/routes/:routeId/directions` · `PUT /api/admin/directions/:directionId` (replace variant)

Envelope: `{ success, data | error }` · Auth: admin guard · Content-Type: `application/json`

## Purpose

Single atomic Save for the Route Plotting page (FR-027, SC-013): creates/replaces the **base Direction + its ordered Stops**, derives the **return Direction** (ADR-0011), all in **one DB transaction**. Either everything persists or nothing does.

This extends the existing endpoint (which previously inserted a direction then `Promise.all`'d stop inserts with **no transaction**). The legacy behavior is preserved: a POST **without** `stops` keeps the old plain-create path (no transaction, no derivation); a POST **with** `stops` uses the atomic path below.

## Request — POST (create pair)

Path: `POST /api/admin/routes/{route_id}/directions` where `route_id` matches `routeIdSchema` (lowercase slug).

Body (extends `createDirectionSchema`; `stops` now **required for the plotting path**, `label` required — the client auto-defaults it):

```jsonc
{
  // label REQUIRED — the client auto-defaults it (e.g. "To {destination stop name}");
  // the SERVER auto-derives only the RETURN label (FR-028)
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

- `stops` **required** (for the plotting path), **≥ 2** — array order + 1 becomes `stop_order`; any client-sent `stop_order` is ignored/normalized.
- `base_polyline.coordinates[0]` must be within ≈ 100 m of `stops[0].location` and `base_polyline.coordinates[last]` within ≈ 100 m of `stops[last].location` — the path must start and end on a stop (SC-009). A loop (first == last stop) is allowed (FR-004/FR-017).
- `origin_stop_id` / `destination_stop_id` are ignored/overwritten (derived from the first/last inserted stop).
- Route must have **fewer than 2 active directions** — the pair is guarded to exactly two (ADR-0008), otherwise `409 CONFLICT`.

## Request — PUT (replace pair)

Path: `PUT /api/admin/directions/{direction_id}` with the same body shape above (label, `base_polyline`, `stops` all required in replace mode).

Replaces the target direction's stops/polyline/label **and** re-derives its sibling (the other active direction on the route) as the mutual reverse, so the pair always stays consistent after resave (FR-027). If the route has no sibling yet (legacy single direction), one is created. Replacing a return direction is supported: it becomes the new base and the old base is re-derived.

## Response — 201 (POST) / 200 (PUT)

Flat base shape (backward compatible with the previous response) **plus** an additive `return_direction` key:

```jsonc
{
  "success": true,
  "data": {
    "direction_id": "…",
    "route_id": "…",
    "label": "To City Proper",
    "base_polyline": { "type": "LineString", "coordinates": ["…"] },
    "origin_stop_id": "…", // = first inserted stop
    "destination_stop_id": "…", // = last inserted stop
    "is_active": true,
    "created_at": "…",
    "updated_at": "…",
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
    "return_direction": {
      // same shape as the base; label auto-derived "To {base first stop name}";
      // base_polyline = base coordinates REVERSED;
      // stops = new rows, same name/type/location, order reversed (renumbered 1..n);
      // origin_stop_id / destination_stop_id = the return's OWN first/last stop
      //   rows (always resolvable inside its own stop list)
    },
  },
}
```

The client renders both directions immediately; no follow-up fetch needed.

## Errors

| Code                   | Condition                                                                                                                               |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `401 UNAUTHORIZED`     | not signed in                                                                                                                           |
| `404 NOT_FOUND`        | route / direction does not exist                                                                                                        |
| `422 VALIDATION_ERROR` | malformed body; < 2 stops; polyline < 2 coords; path not starting/ending on a stop (within ~100 m); PUT replace without `base_polyline` |
| `409 CONFLICT`         | POST with `stops` on a route that already has two active directions (ADR-0008)                                                          |
| `500 INTERNAL`         | transaction failure — **rolled back**, no partial state (SC-013)                                                                        |

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
