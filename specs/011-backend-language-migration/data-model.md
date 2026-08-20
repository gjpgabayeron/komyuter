# Data Model: Navigation Engine Benchmark & PoC

Phase 1 output. Derived from `spec.md` §Key Entities and `research.md` R1–R4. This models the **benchmark harness and PoC contract**, not a production persistence layer — the harness reads deterministic fixtures and emits benchmark result JSON. All coordinates use **`[longitude, latitude]`** order (hard invariant). No persistent storage is introduced.

## Conventions

- Everything is deterministic and versioned: fixtures carry a seed and a content hash so runs are reproducible (R1).
- The three runtimes (Node/Rust/Go) exchange identical JSON for inputs and outputs so results aggregate into one comparison matrix (R4, FR-003).
- Canonical terms from `docs/CONTEXT.md`; new harness terms (below) are added to the glossary before use (Principle IV).

## Entities

### Navigation Workload

- Represents: one of the three compute classes the study measures (spec §Key Entities).
- Attributes: `workload_id` (`route_optimization` | `polyline_snapping` | `detour_pathfinding`), `description` (canonical definition, R2).
- Validation: each workload has a precise, implementable definition so all runtimes do the same operation.

### Graph (fixture)

- Represents: the route-expanded directed graph the workloads run on (ADR-0001 / ADR-0008 model).
- Attributes:
  - `scale` (`baseline` 12 routes | `stretch` 25 routes)
  - `seed` (deterministic generator seed)
  - `nodes`: array of `{ id, stop_id, direction_id, lng, lat }` — ids in `stop_{stopId}_direction_{directionId}` form
  - `edges`: array of `{ from, to, type: distance|walk|fare|transfer, length_km, cost }` — internal cost per ADR-0001 (base on-board + ₱1.80/km); transfer edges have distance 0 (ADR-0002)
  - `hash` (fixtures.sha256)
- Validation: coordinate order `[lng, lat]`; a direction's nodes preserve its ordered stop list (never reverse a polyline for the return, ADR-0008); no `city` dimension (ADR-0010).

### Workload Input

- Represents: the request shape each runtime consumes for a workload.
- Attributes:
  - `route_optimization`: `{ origin: {lng, lat}, destination: {lng, lat}, profile: shortest|cheapest|least_transfers|balanced }` (weight vectors per CRITIQUE Table IV)
  - `polyline_snapping`: `{ point: {lng, lat}, tolerance_m: 25–50, candidates: [direction_id] }`
  - `detour_pathfinding`: route_optimization input **plus** `{ detour_stop_id | restricted_segment_id }` (request-time virtual nodes + board edges; never persisted, never in the graph cache)
- Validation: profile is one of the four; snapping tolerance in [25, 50] m; coordinate order `[lng, lat]` (a swapped pair puts stops in the ocean).

### Workload Output

- Represents: the expected-result schema every runtime must produce identically (parity oracle, R3).
- Attributes (route result, per ADR-0009 — distances, fare, transfers, walk only, **never ETA**):
  - `found` (boolean), `legs` [ordered: stops, route_id, direction_id], `transfers` (count), `walk_m` (total), `fare` (exact per-leg totals via canonical formula), `distance_km`.
  - Snapping output: `snapped: { direction_id, stop_id | position_on_polyline, distance_m }` or `null` if none within tolerance.
- Validation: `fare` must match the canonical `@komyuter/shared` `fareCalculator` oracle for the tested cases (FR-010, 100% parity on tested inputs); no fabricated/estimated values (Principle I).

### Parity Oracle

- Represents: the reference expected outputs generated once from canonical shared logic and checked in (R3).
- Attributes: `workload_id`, `input` (ref), `expected_output` (ref).
- Relationships: consumed identically by Node/Rust/Go; divergence is a port bug, never a redefinition (FR-010).

### Benchmark Result

- Represents: one runtime's measured output in exactly the shared `benchmark-format.md` schema (R4).
- Attributes: runtime, toolchain versions, run count, p50/p90/p99 latency, throughput (queries/s), peak RSS, graph scale, hash.
- Consumed by: the comparison matrix assembler → the decision ADR.

### Comparison Matrix (produced during implementation)

- Represents: every candidate scored against every criterion (FR-005, spec §Key Entities).
- Criteria: performance, resource-usage predictability, developer onboarding effort, ecosystem maturity, rewrite scope (FR-004). Any unmeasured criterion is explicitly marked (SC-002).

### Decision Record (ADR)

- Represents: the recorded architecture decision written before reliance (FR-006, Principle II).
- Specifically: **one ADR stating which candidate wins and whether migration is justified at the planned scale**, citing the comparison matrix; the rollout approach is deferred (FR-013).

### Proof-of-Concept Service

- Represents: the working implementation of the single most performance-critical capability in the winning candidate (FR-008/009), validated for correctness + parity (FR-010) — a standalone binary outside the pnpm workspace.

## State Transitions

- Feasibility lifecycle: fixtures generated → oracle generated → per-runtime run → results aggregated → comparison matrix → **decision gate (go/no-go)** → ADR → (if go) PoC built + parity-validated. The gate **always** produces a dated go/no-go with rationale (SC-007); it never silently proceeds.
