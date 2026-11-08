# Contract: Navigation Workloads & Parity Oracle

Establishes the exact input fixtures and expected-output schema that the Node, Rust, and Go harnesses must share (FR-003, FR-010). Backs `data-model.md` §Workload Input/Output and `research.md` R2/R3.

## Workload catalog

| workload_id          | Operation (canonical definition)                                                                         | Input                           | Output (must match oracle)                   |
| -------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------- | -------------------------------------------- |
| `route_optimization` | Multi-criteria Dijkstra on the route-expanded graph; internal cost base on-board + ₱1.80/km (ADR-0001)   | origin/dest ± profile           | route result (legs, transfers, walk_m, fare) |
| `polyline_snapping`  | Snap a given point to the nearest on-network position within 25–50 m tolerance, deterministic tie-break  | point ± tolerance ± candidates  | snapped stop/position or `null`              |
| `detour_pathfinding` | `route_optimization` plus request-time virtual nodes + board edges for a detour/restriction, then re-run | RO input ± detour/restricted id | route result (with detour honored)           |

## Input schema (shared JSON)

```jsonc
// WorkloadInput
{
  "workload_id": "route_optimization", // | "polyline_snapping" | "detour_pathfinding"
  "graph": { "scale": "baseline", "seed": 1337 }, // ref to checked-in fixture
  "request": {
    // route_optimization / detour_pathfinding:
    "origin": { "lng": 122.5, "lat": 10.7 }, // [longitude, latitude] ONLY
    "destination": { "lng": 122.55, "lat": 10.72 },
    "profile": "balanced", // shortest|cheapest|least_transfers|balanced
    // polyline_snapping only:
    "point": { "lng": 122.5, "lat": 10.7 },
    "tolerance_m": 30,
    "candidate_direction_ids": ["<slug>-1", "<slug>-2"],
    // detour_pathfinding only:
    "detour_stop_id": "<stop_id>", // XOR restricted_segment_id
    "restricted_segment_id": "<id>",
  },
}
```

**Invariants**: coordinates always `[lng, lat]`; a swapped pair puts stops in the ocean — the single most dangerous pitfall. `profile` is one of the four. Snapping tolerance ∈ [25, 50] m.

## Output schema (route result, shared JSON)

```jsonc
{
  "found": true, // false ⇒ no route; UI shows "no route" state
  "legs": [{ "route_id": "...", "direction_id": "...", "stop_ids": ["..."] }],
  "transfers": 1, // count of inter-route transfers
  "walk_m": 220, // total walk for transfers
  "distance_km": 8.4, // along-route distance
  "fare": { "total": 13.0, "legs": [13.0], "discounted": false }, // exact per-leg totals; NO ETA (ADR-0009)
}
```

**Snapping output**: `{ "direction_id": "...", "stop_id": "..." | "position_on_polyline": {"lng","lat"}, "distance_m": 12 }` or `null` when nothing is within tolerance.

## Parity oracle contract (R3, FR-010)

- Expected outputs are generated **once** from the canonical `@komyuter/shared` route/fare logic and checked in under `navbench/fixtures/oracle/` as `{input, expected_output}` pairs.
- Each runtime MUST reproduce `expected_output` **exactly** (fields compared semantically; fare compared to the cent) for every oracle case in its own test suite.
- A divergence is a **port bug** and blocks the benchmark; it is never resolved by changing the oracle or the canonical logic (Principle III).
- Success criterion: 100% parity on tested inputs (SC-005).
