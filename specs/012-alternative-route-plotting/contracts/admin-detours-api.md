# Contract: Detour CRUD (admin workspace ↔ server)

**Status**: Consumed as-is (existing endpoints, `apps/server/src/api/detours.ts`) + FR-023 additions.
**Envelope**: Every response is `{ success: true, data } | { success: false, error }` (central handler in `apps/server/src/api/app.ts`; error codes in `api/errors.ts`).
**Geometry**: All GeoJSON uses `[longitude, latitude]` (ADR-0013). Errors: `404` = missing direction/detour; `422` = zod `VALIDATION_ERROR` or FR-023 structural failure.
**Auth**: All four routes sit under `/api/admin` behind the Supabase admin guard — same as every admin route.

Also referenced unchanged: `snapPreview` → `GET /api/admin/mapbox/directions` (road-following proxy, 25-waypoint chunking) — see the base-path editor's contract; the detour editor consumes the same endpoint.

---

## GET `/api/admin/directions/:directionId/detours`

Lists detours for one Direction (soft-deleted ones excluded via `load_detours`).

```text
200 → { success: true, data: Detour[] }   // Detour shape below
404 → direction not found
```

## POST `/api/admin/directions/:directionId/detours`

Creates a detour anchored to the Direction's base polyline.

**Request body** (`createDetourSchema`, exact):

```jsonc
{
  "label": "Detour at Sto. Niño", // >= 1 char
  "entry": { "type": "Point", "coordinates": [120.977, 14.609] }, // must be <= 30 m from base polyline
  "exit": { "type": "Point", "coordinates": [120.981, 14.611] }, // must be <= 30 m from base polyline
  "detour_polyline": {
    "type": "LineString",
    "coordinates": [[120.977, 14.609], "...", [120.981, 14.611]],
  },
  "additional_distance_meters": 320, // optional, int >= 0, nullable
  "commuter_instruction": "Take the detour left past the church.", // >= 1 char
  "driver_instruction": null, // optional, nullable
  "notable_stops": [
    {
      "stop_id": "stop_abc",
      "name": "Sto. Niño Church",
      "is_detour_only": false,
    },
  ],
}
```

**Behavior**: `entry`/`exit` validated on the base polyline (`assertPointOnLine`, 30 m) — **existing**. Loop endpoints validated against `entry`/`exit` (`assertDetourLoopEndpoints`, 30 m; `entry ≠ exit`) — **NEW (FR-023)**. `is_active` is not accepted here (DB default `true`).

**Responses**: `201 { success, data: Detour }` | `404` direction missing | `422` any validation failure (payload shape, off-line point, loop-endpoint mismatch, degenerate loop).

## PUT `/api/admin/detours/:detourId`

Partial update of an existing detour.

**Request body** (`updateDetourSchema` = `createDetourSchema.partial() + { is_active? }`) — send only changed fields:

```jsonc
{
  "detour_polyline": { "...": "..." },
  "is_active": false,
  "commuter_instruction": "Updated copy.",
}
```

**Behavior**: When `entry`/`exit` supplied → re-validated on line (existing). When `detour_polyline`, `entry`, or `exit` supplied → **NEW (FR-023)**: loop endpoints must match the (possibly new) entry/exit within 30 m. `additional_distance_meters` still must be `>= 0`.

**Responses**: `200 { success, data: Detour }` | `404` | `422`.

## DELETE `/api/admin/detours/:detourId`

Soft-delete: sets `is_active = false` (row retained, hidden from commuter navigation).

**Responses**: `200 { success, data: { detour_id, is_active: false } }` | `404`.

---

## Detour data shape (as returned)

```jsonc
{
  "detour_id": "detour_…",
  "direction_id": "direction_…",
  "label": "Detour at Sto. Niño",
  "entry": { "type": "Point", "coordinates": [lng, lat] },
  "exit": { "type": "Point", "coordinates": [lng, lat] },
  "detour_polyline": { "type": "LineString", "coordinates": [[lng, lat], …] },
  "additional_distance_meters": 320,          // int | null
  "commuter_instruction": "…",
  "driver_instruction": null,                 // string | null
  "notable_stops": [ { "stop_id": "…", "name": "…", "is_detour_only": false } ],
  "is_active": true,
  "created_at": "…", "updated_at": "…"        // ISO
}
```

## Workspace-side consumption contract

- Typed clients in `features/routes/routesApi.ts` (extended): `listDetours(directionId)`, `createDetour(directionId, body)`, `updateDetour(detourId, patch)`, `softDeleteDetour(detourId)` — envelope-unwrapped via the existing api client.
- React Query keys extended at `queryKeys.ts` (pattern `routeKeys.detours(directionId, detourId?)`); mutations invalidate the direction's detour list on success.
- `is_active` is sent ONLY from the list's active toggle (PUT); the editor itself never sends it.
- Client pre-save gates (no request on failure): travel order (entry base-index < exit base-index), non-degenerate loop, endpoints ≈ entry/exit — mirroring server tolerances so a save that passes the gate is accepted by FR-023. Divergence surface = server 422 → surface as toast, keep editor open (SC-014).
