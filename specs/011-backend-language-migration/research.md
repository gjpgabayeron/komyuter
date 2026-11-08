# Research: Backend Language Migration — Navigation Engine Feasibility

Phase 0 output. Resolves every technical unknown from the plan's Technical Context so the harness can be built. This is the **methodology** decision record; the actual measured comparison between Node/Rust/Go and the go/no-go are produced during implementation (tasks.md) and sealed in the decision ADR.

## R1 — Fixture & scale definition

**Decision**: A deterministic synthetic graph generator produces the benchmark fixtures, checked into `navbench/fixtures/`. A single JSON manifest defines nodes and edges.

**Rationale**: The real PostGIS dataset is small and not navigation-ready (no server pathfinding graph exists yet). Synthetic, deterministic fixtures make benchmarks reproducible on any machine without the local Supabase stack, and let us model the planned scale (10–12 routes) and the stretch target (25 routes) explicitly.

**Scale targets**:

- Baseline graph: 12 routes × 2 directions = 24 directions; each direction ~25–60 ordered stops; transfer edges between stops within 300 m walking reach (ADR-0002 transfer distance = 0). **Target ≈ 650–1,400 stop-nodes, roughly 8k–20k directed edges.**
- Stretch graph: 25 routes → re-run to validity-check the ≤500 ms threshold at scale.

**Alternatives considered**: (a) exporting live PostGIS data — rejected as primary because it's not navigation-shaped and not reproducible; kept as an optional secondary validation in `quickstart.md`. (b) single tiny graph — rejected: flatters results, fails the "representative scale" edge case.

**Reproducibility**: feature spec records the generator seed, the exact node/edge counts, and a `fixtures.sha256` so any reviewer can confirm the same inputs were used.

## R2 — Workload definitions

**Decision**: Three workloads, each with a single, precise definition so all three runtimes implement the same operation.

1. **Route optimization** — multi-criteria Dijkstra on the route-expanded graph. Cost model per ADR-0001: internal node cost = base on-board fare (₱13) + marginal ₱1.80/km; **not** per-edge LTFRB. Output = ordered route/transfer leg result (stops, transfers, walk distance, exact per-leg fare).
2. **Polyline snapping** — given a user GPS point (or partial trace), snap to the nearest on-network position across candidate direction polylines within the 25–50 m tolerance (CRITIQUE §4.1), resolving ambiguity deterministically (nearest; tie-break by route id).
3. **Detour pathfinding** — route optimization additionally injecting the detour-flagged stop/restricted segment as request-time virtual nodes + board edges (constitution: detours/restrictions model; ADR-0008 direction integrity), then re-running Dijkstra.

**Rationale**: These are exactly the workloads the spec names (FR-001) and the thesis expects to offload. Precise definitions make the Node/Rust/Go implementations comparable rather than divergent.

**Alternatives considered**: adding ETA/arrival prediction — rejected: **no ETA anywhere** (ADR-0009, Principle I).

## R3 — Parity oracle strategy

**Decision**: Expected outputs are generated **once** from the canonical `@komyuter/shared` route/fare logic and checked in as reference fixtures (the "parity oracle"). Every runtime (Node/Rust/Go) must reproduce the oracle's outputs exactly for the same inputs (FR-010).

**Rationale**: Guarantees behavior parity without re-deriving "truth" per runtime, and keeps `@komyuter/shared` authoritative (Principle III). Any divergence is a bug in the port, caught by the parity tests — never a silent redefinition.

**Alternatives considered**: independently re-deriving expected outputs in each runtime — rejected: creates competing truths and defeats the whole parity guarantee.

## R4 — Metrics & thresholds

**Decision**: Each runtime emits a metrics JSON (see `contracts/benchmark-format.md`) with p50/p90/p99 latency, throughput (queries/s), and peak RSS, from a fixed number of runs.

**Pass threshold**: **≤ 500 ms for at least the 90th percentile**, per `docs/CRITIQUE.md` recommendation ("Computation time: ≤500 ms for 90% of queries"); plus pathfinding **success rate ≥ 95%** and documented peak-RSS behavior. Any candidate failing the threshold is recorded as not viable at the tested scale.

**Rationale**: These are the thesis's own published targets; using them keeps success criteria measurable and defense-ready (SC-004).

**Alternatives considered**: inventing new latency goals — rejected; uses the already-agreed CRITIQUE figures.

## R5 — Toolchain prerequisites

**Decision**:

- **Node** — present (TS strict via `@repo/typescript-config`).
- **Rust** — present (cargo 1.92, rustc 1.92; confirmed in this environment).
- **Go** — **NOT installed in this environment** (confirmed: `go: not found`). Step 0 of the harness is installing Go (e.g. via the official tarball or winget/scoop) and recording the version in `respirations`/benchmark metadata. If Go cannot be installed, the study still completes the Node-vs-Rust comparison and clearly marks Go as "not measured," which is itself a finding for the comparison matrix (SC-002 allows explicit unmeasured criteria).

**Cross-compilation**: to confirm server-bound viability, each runtime is also built `linux/amd64` where the toolchain supports it; this is a release-blocking check, not a benchmark input.

**Rationale**: Reproducibility requires recording exact toolchain versions in benchmark metadata (part of `benchmark-format.md`).

## R6 — Node "current stack" baseline

**Decision**: Because the Fastify server is **CRUD-only** (no server-side pathfinding exists), the Node baseline is a **reference implementation** of the three workloads in TypeScript, representing "stay in the current stack." It uses the same algorithms as Rust/Go; it is a microbenchmark, not a user-facing endpoint.

**Rationale**: This is the only honest way to measure Node against Rust/Go for workloads that don't exist yet, and it keeps the "current backend" untouched (FR-011, zero regression).

**Alternatives considered**: benchmarking the existing admin CRUD routes as a proxy — rejected: not the workloads in question, would answer the wrong question.

## R7 — Structure & performance attribution

**Decision**: The Rust/Go harnesses are **hand-rolled** (owned binary-heap priority queue for Dijkstra; no heavy graph crate), keeping the comparison attributable to the language/runtime rather than to a library's implementation quality. Node reference uses plain data structures.

**Rationale**: If Rust used a highly-tuned graph crate and Node used naive code, the comparison would measure libraries, not languages. Hand-rolled keeps it apples-to-apples (FR-003).

**Alternatives considered**: pulling in `petgraph`/`gonum` — rejected for attribution purity at this feasibility stage; a crate-based build can be a follow-up if the gate passes.

---

## Consolidation

Every unknown from Technical Context is resolved above. The one environment risk is **Go availability** (R5): the harness degrades gracefully and records the gap rather than blocking the study. The decision itself (Rust vs Go, migrate vs not) is **deliberately not** resolved here — it is the feature's measured output, produced during implementation and sealed by the ADR (FR-006).
