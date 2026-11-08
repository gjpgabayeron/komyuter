# ADR-0017: Backend navigation runtime — keep Node CRUD, extract a language-agnostic native navigation service (DECIDED)

- **Status**: DECIDED — based on the feasibility study `specs/011-backend-language-migration/` and its navbench harness
- **Date**: 2026-08-20
- **Supersedes/refines**: aligns with ADR-0005 (No Redis) and the constitution's Principle I deviation guard (cross-language port + parity oracle). The CRITIQUE (`docs/CRITIQUE.md` §1.1.1) flagged Node single-threading for graph compute; this ADR records the evidence-driven response.

## Context

The admin backend (`apps/server`, Fastify v5) is CRUD-only: routes/stops/detours/restrictions/fares/export. Future server-side navigation (polyline snapping, detour pathfinding, route optimization) adds CPU-bound graph compute that CRITIQUE worried would strain Node's single-threaded event loop.

Per `specs/011-backend-language-migration/plan.md`, we compared **Node** (current + reference implementation), **Rust**, and **Go** on three workloads — `route_optimization`, `polyline_snapping`, `detour_pathfinding` — across four synthetic city-scale fixtures (`small` 67 stops … `rush` 1,605 stops / 240 directions). All three implement the **same canonical model** (`navbench/shared/model.js`; Rust/Go ported) with parity verified against a shared oracle (FR-010). Results: `navbench/results/comparison-matrix.json`.

### Measured p90 latency (ms), single-threaded

| workload \ runtime | node @large | rust @large | go @large | node @rush | rust @rush | go @rush |
| ------------------ | ----------- | ----------- | --------- | ---------- | ---------- | -------- |
| route_optimization | 23.2        | 52.9        | 21.3      | 44.3       | 74.7       | 30.1     |
| polyline_snapping  | 0.79        | 0.35        | 1.55      | 0.88       | 0.41       | 1.71     |
| detour_pathfinding | 57.9        | 104.1       | 41.3      | 81.5       | 134.4      | 58.2     |

- **Every runtime passes** the CRITIQUE/SC target of **≤500 ms p90** at every scale (worst is rust @rush = 134 ms).
- **All three runtimes are measured** (node v24.12.0, rustc 1.92.0, go1.27.0 on 2026-08-20; see `navbench/results/env-notes.md`).

### What the numbers mean (honest reading)

- `route_optimization` / `detour_pathfinding` are dominated by **string-keyed hash-map Dijkstra**. Here **Go is fastest** at every city scale (e.g. @rush 30.1 ms vs node 44.3 / rust 74.7 for routing); V8's `Map` beats this Rust port's `HashMap<String>`, but Go's optimized map/GC wins on the largest graphs.
- `polyline_snapping` is pure floating-point geometry (haversine + point-to-segment projection) with no hashing — **Rust is ~2× faster** than Node here; Go's snapping is slower than both (Rust's flat `Vec<Point>` + stack vectorization wins over Go's slice overhead).
- These are single-threaded per-query latencies. Under **concurrent CPU-bound load**, Node cannot use multiple cores (all nav work would serialize on the event loop), while Rust/Go parallelize; Go's goroutine work-stealing also spreads many small queries across cores more cheaply than Rust's per-request worker threads here. At thesis traffic volumes that headroom is unneeded today; it is the real reason to keep the seam, not a present emergency.

## Decision

1. **Keep the Node/Fastify server as-is for CRUD** — do not rewrite it; its code is CRUD-only and Node meets all navigation latency targets at city scale. No urgent migration.
2. **Define the seam, don't ship the service yet.** Adopt `specs/011-backend-language-migration/contracts/navigation-api.md` as the internal navigation-service contract. The server may call it (HTTP or in-process) later without changing its public API.
3. **When (and if) navigation is added as a load-bearing feature**, extract it into a **standalone native service**. Measured evidence now makes **Go the preferred first choice** for the Dijkstra-heavy route/detour hot path (Go @rush: route 30.1 ms, detour 58.2 ms — fastest of all three), with **Rust preferred for geometry-only snapping** (fastest at 0.41 ms @rush) and maintained as the alternative runtime (both ports already parity-verified in `navbench/go/` + `navbench/rust/`). Selection is re-evaluated on real database scale + concurrency, never on this synthetic harness alone.
4. **Parity is the contract.** Any ported fare/route logic must reproduce the canonical results verified by the `navbench` oracle (FR-010 / SC-005); a divergence is a port bug, not an excuse to change the model.

### Why not a full rewrite

- Solo developer on a fixed thesis deadline (assumption recorded in `spec.md`).
- Measured evidence: Node latency is acceptable; a rewrite's risk (parity, build toolchain, deployment) is not justified by the headroom it buys at this scale.
- CRUD backend + navigation are separable; extracting only the hot path gets the benefit without a rewrite.

### Why not pgRouting (from CRITIQUE's options)

pgRouting would move routing into Postgres. It conflicts with the canonical shared model (Realtime **costs/fares must stay in `@komyuter/shared`**), adds heavy DB extensions, and keeps CPU on a service we already pay to host. A small native service keeps the logic deployable and testable beside the existing Testcontainers-style local stack. (Not blocked; simply not preferred — see Non-goals.)

## Consequences

- **Positive**: the hot-path seam is documented and cheap to populate later; geometry work already has a faster native home; the CRUD server is untouched and stable.
- **Trade-off**: debutting/deploying a Rust binary adds a build step (cargo + cross-compile) not present today. Mitigated by keeping it optional and off the critical path.
- **Risk**: if navigation is never load-bearing, the native service is speculative — acceptable, because the seam is tiny and the model/parity already exist in the harness.
- **Go**: now the measured leader on route/detour; its parity-verified port is committed and its toolchain is installed — it is the leanest path to a fast native service. Rust remains best for pure geometry.
- **Documented**: full methodology, fixtures, workloads, and thresholds in `specs/011-backend-language-migration/`; timings in `navbench/`.

## Non-goals (explicit)

- No migration of the existing CRUD API to Rust/Go.
- No pgRouting adoption.
- No server-side pathfinding endpooints shipped in this feature (the PoC in `navbench/poc/` demonstrates the seam; the server still exposes CRUD only).
- No commitment to a fixed language: the decision leaves Rust/Go both installed-in-harness and re-open for the real-world benchmark.
