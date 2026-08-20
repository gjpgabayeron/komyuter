# Contract: Future Navigation Service Interface (extraction seam)

Records the internal service boundary the navigation engine will eventually expose, so a gradual single-service rollout has a stable seam (FR-008, FR-013). This is a **target interface contract for planning** — it is **not** built by this feature.

## Rationale

This contract exists so the extraction (gradual) option is a matter of filling in an already-agreed boundary rather than redesigning at migration time. It addresses CRITIQUE §1.1.1 and reduces migration complexity, which is the feature's stated goal. It matches the existing API envelope `{ success, data | error }` and ADR-0009 output rules (distances/fare/transfers/walk only — **no ETA**).

## Request (internal POST, back-of-the-office boundary)

```jsonc
{
  "version": 1,
  "request_id": "<uuid>", // for tracing + throttling/rate-limit
  "origin": { "lng": 122.5, "lat": 10.7 }, // [longitude, latitude]
  "destination": { "lng": 122.55, "lat": 10.72 },
  "profile": "balanced", // shortest|cheapest|least_transfers|balanced
  "detour_scope_id": "<id> | null", // optional request-time detour/restriction
}
```

## Response

```jsonc
{
  "success": true,
  "data": {
    "found": true,
    "legs": [{ "route_id": "...", "direction_id": "...", "stop_ids": ["..."] }],
    "transfers": 1,
    "walk_m": 220,
    "distance_km": 8.4,
    "fare": { "total": 13.0, "legs": [13.0], "discounted": false },
    // NOTE: never an ETA (ADR-0009)
  },
}
```

Error (shared envelope): `{ "success": false, "error": { "code": "<error-code>", "message": "..." } }` per `apps/server/src/api/errors.ts`.

## Contract rules

- **Coordinate order**: `[lng, lat]` only.
- **Internal cost** is ADR-0001 (base on-board + ₱1.80/km); the **displayed** fare is exact per-leg totals via the canonical formula. Do not conflate the two (constitution).
- **No ETA** in any response (ADR-0009, Principle I).
- **Detour/restriction** handling is request-time only: virtual nodes + board edges; never persisted, never in the graph cache.
- **Hail-and-ride** boarding at non-stop positions uses request-time virtual nodes too (same rule).
- The canonical fare/route logic lives in `@komyuter/shared`; whatever runtime serves this boundary must validate parity against it (FR-010).
- This boundary is the target for a **gradual single-service extraction**: implement this interface behind a router and swap the Node in-process handler for the native service once the decision gate passes. A full rewrite would replace more than this boundary.

## Non-goals

- No ETA/arrival prediction, no real-time vehicle tracking, no Redis (ADR-0005), no persistence of virtual detour/hail-and-ride nodes.
