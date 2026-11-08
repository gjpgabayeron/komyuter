# Contract — Road Snapping Proxy

`GET /api/admin/mapbox/directions`

Envelope: `{ success, data | error }` · Auth: admin guard · Proxy of the **Mapbox Directions v5 API** (ADR-0013), server-side secret token, **`duration` never returned** (ADR-0009).

## Purpose

Full-path road-following preview for the plotted stops (FR-008): the client sends the placed stop coordinates, the server returns a road-snapped LineString the Administrator can Apply or Revert. Best-effort: any unavailability degrades to a straight line with `snapped: false` and **never blocks plotting** (FR-009).

## Request

`GET /api/admin/mapbox/directions?coordinates=<lng,lat;lng,lat;…>`

| Param         | Required | Rules                                                                                                        |
| ------------- | -------- | ------------------------------------------------------------------------------------------------------------ |
| `coordinates` | yes      | ≥ 2 pairs, `[lng,lat]`, semicolon-separated, each pair comma-separated (`122.5689,10.6931;122.5720,10.6950`) |

Fixed profile: `mapbox/driving`, `geometries=geojson`, `overview=full`, `steps=false`, `alternatives=false` (no turn-by-turn — no ETA, ADR-0009).

**Chunking**: Mapbox limits driving requests to **25 waypoints**. The server splits `coordinates` into ≤ 25-waypoint chunks, requests each chunk, and concatenates the LineStrings (dropping duplicate joint coordinates) into one continuous polyline.

## Response — 200 OK (success, incl. fallback)

```jsonc
{
  "success": true,
  "data": {
    "polyline": {
      "type": "LineString",
      "coordinates": [[122.5689, 10.6931], "…"], // [lng, lat], ≥ 2 coords, road-snapped
    },
    "distance_meters": 2340, // exact (FR-024); sum of chunk distances
    "snapped": true, // false → straight-line fallback (warning in UI)
    "warning": null, // "no_token" | "upstream_error" | null (for the UI warning text)
  },
}
```

- `snapped: true` — polyline follows roads, one-ways respected (Mapbox `driving`).
- `snapped: false` — mock straight-line between the coordinates; `warning` explains why. Client shows the FR-009 warning and continues.

## Fallback behavior (best-effort, FR-009)

| Condition                             | Behavior                                                                          |
| ------------------------------------- | --------------------------------------------------------------------------------- |
| `MAPBOX_SECRET_TOKEN` unset (dev)     | mock straight-line, `snapped: false`, `warning: "no_token"`, logged warning       |
| Upstream Mapbox error/timeout/4xx/5xx | mock straight-line, `snapped: false`, `warning: "upstream_error"`, logged warning |
| < 2 coordinates                       | `422 VALIDATION_ERROR` (client error — not a service failure)                     |

## Errors

| Code                   | Condition                                     |
| ---------------------- | --------------------------------------------- |
| `401 UNAUTHORIZED`     | not signed in                                 |
| `422 VALIDATION_ERROR` | malformed `coordinates` or fewer than 2 pairs |

There is deliberately **no** 5xx path for service failure — the proxy always degrades to the straight-line fallback so the plot flow is never blocked.

## Notes

- Shared schema (`packages/shared/src/schemas/mapbox.ts`) validates this response and is reused by the admin client.
- Server env: `MAPBOX_SECRET_TOKEN` (optional; absent → fallback). Client env: `MAPBOX_PUBLIC_TOKEN` (optional; vector tiles when present, OSM raster otherwise — `lib/tiles.ts`).
- The admin page calls this endpoint debounced (~500 ms) after each stop placement / drag, and on Apply commits the preview to the draft.
