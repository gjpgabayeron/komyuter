# Quickstart: Running the Navigation-Engine Feasibility Benchmark & PoC

Phase 1 output. A validation/run guide (not implementation). It maps runnable scenarios to spec SC-001…SC-007. Full build details belong in `tasks.md` (Phase 2, `/speckit.tasks`).

## Prerequisites

- Repo checkout of `specs/011-backend-language-migration/` artifacts plus `navbench/` (created during implementation).
- Toolchains: **Node** ≥ 20 (present), **Rust** — cargo 1.92 (present), **Go** — **not present in this environment; install it** (`go version` must succeed). Records versions per `contracts/benchmark-format.md` R5.
- The existing repo gates are unaffected: `pnpm lint`, `pnpm typecheck`, `pnpm format:check` still pass (no change to JS workspace).

## Scenario 1 — Baseline benchmark (SC-001)

1. Generate fixtures: `navbench/fixtures/generate.<ext> --scale baseline --seed 1337` → produces graph JSON + `fixtures.sha256`.
2. Generate the parity oracle from canonical `@komyuter/shared` logic → `navbench/fixtures/oracle/`.
3. Run the Node reference harness: `navbench/node` (TS) → `results/node/<ts>.bench.json`.
4. **Expected**: a reproducible baseline exists for each of the three workloads, with p50/p90/p99, throughput, and peak RSS.

## Scenario 2 — Candidate runtimes (SC-002, SC-004)

1. Build Rust: `cargo build --release` in `navbench/rust`; run → `results/rust/<ts>.bench.json`.
2. Build Go: `go build` in `navbench/go`; run → `results/go/<ts>.bench.json`. (If Go is unavailable, record "not measured" explicitly per SC-002.)
3. Run the aggregator: `navbench/aggregate` → writes the **comparison matrix** across the five criteria (FR-004).
4. **Expected**: candidates scored against Node on identical workloads; any unmeasured row explicitly flagged; **p90 ≤ 500 ms** for ≥ 90% of queries (success_rate ≥ 0.95) assessed per runtime (R4/CRITIQUE).

## Scenario 3 — Decision gate & ADR (SC-007, FR-006)

1. From the matrix, record a dated **go/no-go** and write the **decision ADR** citing the measured evidence (before reliance).
2. **Expected**: the recommendation is legible and tied to the matrix; rollout strategy (gradual vs full rewrite) is explicitly deferred (FR-013).

## Scenario 4 — Proof-of-concept (FR-008/009/010, SC-004/005)

1. In the winning candidate, build the PoC of the single most performance-critical capability (per R2 and `contracts/navigation-api.md`).
2. Run the parity tests against the oracle.
3. **Expected**: correct results on representative inputs; **p90 ≤ 500 ms**; **100% parity** with the canonical oracle (SC-005); peak RSS documented.

## Scenario 5 — No regression (FR-011, SC-006)

1. Run the existing server tests and admin workflows.
2. **Expected**: `pnpm --filter server test`, `pnpm --filter admin test`, `pnpm lint`, `pnpm typecheck` all pass — 0 regressions from the study.

## Optional validation

- Real-data secondary check: if the local Supabase stack is up, validate a handful of fixtures against the live PostGIS dataset (import via `apps/server/src/db/schema.ts` mapping) to confirm the synthetic fixtures represent reality. Not required for the decision.

## Reference

- Workload/parity contract → `contracts/workloads.md`
- Result format → `contracts/benchmark-format.md`
- Future service seam → `contracts/navigation-api.md`
- Domain shapes → `data-model.md`
