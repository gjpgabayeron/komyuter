# navbench — backend navigation-runtime feasibility harness

Evidence base for **`docs/adr/0017-runtime-for-backend-navigation.md`** and
`specs/011-backend-language-migration/`. It compares **Node** (reference
implementation), **Rust**, and **Go** on the three workloads a future
server-side navigation service would run:

- `route_optimization` — multi-criteria Dijkstra on the route-expanded graph
- `polyline_snapping` — snap a point to the nearest on-network link (25–50 m)
- `detour_pathfinding` — route + request-time virtual restriction, re-run

Every runtime implements the **same canonical model** and is verified against a
shared parity oracle (`fixtures/oracle/*.json`). Any divergence is a port bug
(constitution Principle I + III; FR-010 / SC-005).

`navbench/` intentionally sits **outside** the pnpm workspace (`apps/*`,
`packages/*`) so that no toolchain here ever touches `pnpm install`/turbo. It is
standalone tooling, not part of the shipped app.

## Layout

```
navbench/
  fixtures/inputs/*.json      deterministic city-scale graphs (small..rush)
  fixtures/oracle/*.json      canonical expected outputs (checked in)
  shared/                     canonical model + workload/result schema (JS)
  oracle/generate-oracle.js   regenerates the oracle from the canonical model
  node/src, node/tests        Node reference impl + parity test + baseline
  rust/src, rust/tests        Rust port + parity test + benchmark
  go/                         Go port + parity test + benchmark (measured)
  poc/                        Rust PoC HTTP navigation service (the seam)
  aggregate/aggregate.js      builds results/comparison-matrix.json
  results/                    JSON timings + matrix (gitignored except notes)
```

## Prerequisites (research R5)

- Node ≥ 22 (tested on 24.12)
- Rust toolchain (tested on 1.92)
- Go toolchain (tested on go1.27.0 windows/amd64)

## Quickstart (validation scenarios in `specs/.../quickstart.md`)

```bash
# 1. Regenerate deterministic inputs + parity oracle (only if the model changed)
node fixtures/generate.js
node oracle/generate-oracle.js

# 2. Per-runtime parity (must be green before trusting any timing)
cd node && node --test tests/parity.test.js        # 4/4
cd ../rust && cargo test --release --test parity    # all scales

# 3. Benchmarks (one JSON per runtime+scale under results/)
cd node && node src/run.js                          # all scales
cd ../rust && for s in small medium large rush; do ./target/release/navbench_rust "$s"; done
cd ../go && go run . small                        # measured (go1.27.0)

# 4. Comparison matrix
node aggregate/aggregate.js      # -> results/comparison-matrix.json

# 5. PoC navigation service (US3)
cd poc && cargo run --release -- small
# POST /route {"origin":{...},"destination":{...}}  ;  POST /snap ; GET /health
```

## Decision rule

A runtime **passes** when `p90 ≤ 500 ms` and `success_rate ≥ 0.95` on every
scale. `success_rate` = completion within budget (found **or** a valid
not-found — both are correct product outputs). See the matrix JSON for the full
breakdown; see `docs/adr/0017` for the decision.

## Parity contract

Runtimes must reproduce the oracle's **navigational invariants** exactly:
`found`, `distance_km`, `transfers`, `walk_m`, `fare.total` (and snap
`direction_id`, `position_on_polyline`, `distance_m`). The exact leg-by-leg
decomposition among **equal-cost** alternative paths is deliberately **not**
part of parity; costs are generic so shortest-path invariants are stable.
