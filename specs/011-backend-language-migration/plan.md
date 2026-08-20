# Implementation Plan: Backend Language Migration — Navigation Engine Feasibility

**Branch**: `011-backend-language-migration` | **Date**: 2026-08-20 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/011-backend-language-migration/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

This feature does **not** migrate anything. It produces the evidence a later migration decision needs: a reproducible performance baseline of **three navigation workloads** — route optimization, polyline snapping, and detour pathfinding — implemented as identical reference microbenchmarks in **Node (the current stack)**, **Rust**, and **Go**, run back-to-back on a representative graph, aggregated into a **comparison matrix**, and sealed with a **decision ADR** (Principle II). It also delivers a **working proof-of-concept** of the single most performance-critical capability in the winning candidate, validated for correctness **and** behavior parity against the canonical `@komyuter/shared` route/fare logic (FR-010, Principle III). The rollout strategy (gradual single-service vs full rewrite) is deliberately **not** chosen here — it is a planning-time decision after the go/no-go gate (FR-013). **Grounding**: the current Fastify server is CRUD-only; no navigation pathfinding exists server-side, so the "current backend" baseline is a Node reference implementation of the workloads, not an existing user-facing endpoint.

**Project Type**: evaluation harness + decision ADR + native PoC (research-oriented; not a user-facing feature).

## Technical Context

**Language/Version**: **RESOLVED IN RESEARCH** — three reference implementations must be comparable: Node (TS, current stack, strict `@repo/typescript-config`), **Rust** (cargo 1.92 available in this environment), and **Go** (toolchain **not installed** in this environment — install is a prerequisite, see research). The winning language for the PoC/navigation service is the output of the study, not an input.

**Primary Dependencies**: `navbench/` harness: Node=TypeScript+Vite-less plain `tsc`/tsx; Rust=cargo (no heavy graph crate — hand-rolled priority queue for Dijkstra to keep the comparison attributable); Go=stdlib (container/heap). Optional real fixtures from the existing PostGIS dataset (drizzle schema in `apps/server/src/db/schema.ts`). No new runtime libraries that would bias the benchmark.

**Storage**: read-only reference to existing PostgreSQL/PostGIS domain data for optional real fixtures; primary fixtures are **deterministic synthetic** (documented generator) so benchmarks are reproducible without the local Supabase stack. No new persistent storage.

**Testing**: Rust `cargo test`, Go `go test`, Node Vitest. Parity oracles derived once from the canonical `@komyuter/shared` fare/route logic and reused by all three runtimes (FR-010).

**Target Platform**: local CLI benchmark binaries (Node/Rust/Go), cross-compilable to a Linux server. The product-facing navigation service is future work.

**Performance Goals**: navigation query served within **≤500 ms for 90% of queries** (reference target from `docs/CRITIQUE.md`); bounded, predictable peak memory (no GC outliers for Rust; documented GC behavior for Go/Node); comparable throughput at the target scale.

**Constraints**: solo developer, fixed thesis deadline; **no Redis** (ADR-0005); canonical route/fare logic **never silently redefined** (FR-010, Principle III) — any port validated against shared oracle; **zero regression** to the existing admin/server workflows (FR-011); results reproducible.

**Scale/Scope**: baseline graph modeled on 10–12 routes (planned, expandable to 25) → thousands of `stop_{stopId}_direction_{directionId}` nodes and transfer edges; three workloads × three runtimes; one PoC capability.

## Constitution Check

_GATE: Passed before Phase 0 research; re-checked after Phase 1 design._

| Principle                                                                                                                                                                                        | Status                                                                                                 |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| I — Shared-first, never reimplement: any route/fare port is a deliberate cross-language port; the canonical `@komyuter/shared` stays authoritative and is used as the **parity oracle** (FR-010) | ⚠️ justified deviation — see Complexity Tracking; guarded by parity tests, never a silent redefinition |
| II — Recorded Decisions Govern: the language/migration decision is written as an ADR **before** reliance, citing measured evidence (FR-006)                                                      | ✅ compliant                                                                                           |
| III — Canonical language & shared config: no tsconfig/eslint/config redefinition; new concepts (Navigation Workload, Parity Oracle) get `docs/CONTEXT.md` glossary entries                       | ✅ compliant — glossary task included                                                                  |
| IV — Canonical naming in docs & code: uses CONTEXT.md terms (Route, Direction, Stop, Detour, Boarding Point); harness terms added to glossary before use                                         | ✅ compliant                                                                                           |
| V — Measurable acceptance: every requirement ties to measurable SC-001…SC-007; figures are explicit, no vague adjectives                                                                         | ✅ compliant                                                                                           |
| VI — Test strategy: Vitest allowed; cargo/go test used for their own runtimes; parity oracles reused across runtimes (no new test framework)                                                     | ✅ compliant                                                                                           |

> Deviation I is the only justification; the ADR and parity guardrail keep the canonical source-of-truth safe. Compliance is re-checked after Phase 1.

## Project Structure

### Documentation (this feature)

```text
specs/011-backend-language-migration/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output — methodology, fixture/scale, toolchain prereqs (Go install), metrics, thresholds
├── data-model.md        # Phase 1 output — workload I/O, graph shape, benchmark result schema
├── quickstart.md        # Phase 1 output — how to run each runtime's harness and produce the comparison
├── contracts/           # Phase 1 output
│   ├── workloads.md         # the 3 workloads: input fixtures, expected-output schema, parity oracle contract
│   ├── benchmark-format.md  # the metrics JSON both runtimes emit for apples-to-apples aggregation
│   └── navigation-api.md    # the future internal navigation-service interface (extraction seam for gradual rollout)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
# Native/benchmark code lives OUTSIDE the pnpm/turbo workspace (turbo is JS-only;
# pnpm-workspace.yaml must NOT gain these dirs).
navbench/
├── node/            # TS reference impl of the 3 workloads (the "stay in Node" baseline) + parity oracle runner
├── rust/            # cargo bench harness: same 3 workloads (FR-003), owned priority-queue Dijkstra
├── go/              # go harness: same 3 workloads; stdlib only
├── fixtures/        # deterministic synthetic graph generator + reference inputs (checked in, reproducible)
└── results/         # emitted benchmark result JSON per runtime (gitignored? see research) → feed comparison matrix
# If the decision gate passes, the PoC service lands in a standalone binary at repo root
# (e.g. apps/nav-engine/ as a NON-pnpm workspace), implemented in the winning language.
```

**Structure Decision**: The evaluation harness is deliberately **outside** the turborepo so introducing Rust/Go tooling cannot disturb the pnpm workspace, ESLint flat config, or `pnpm lint`/`typecheck` gates (AGENTS + constitution). `navbench/` is the temporary harness; the eventual PoC service is a standalone binary so it stays independent of the JS build system either way. The chosen structure keeps the existing repo untouched except documentation and `docs/CONTEXT.md` glossary additions.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation                                                                          | Why Needed                                                                                                                                                         | Simpler Alternative Rejected Because                                                                                                                              |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dev. I — cross-language port of route/fare logic (Principle I "never reimplement") | A cross-language comparison requires the workloads to actually run in Rust/Go; the ported logic must exist to be benchmarked and to prove behavior parity (FR-010) | Skipping the port would make the benchmark fake the capability; the parity oracle keeps the canonical TS impl authoritative, so this is not a silent redefinition |
| New non-pnpm toolchain (Rust/Go) in repo                                           | The deliverable is an evidence-based candidate comparison; both candidates must run here                                                                           | Keeping it JS-only would pre-decide the outcome and defeat the feature's purpose                                                                                  |

---

## Phase 0: Research (output → `research.md`)

Research tasks (resolved in `research.md`):

- **R1 — Fixture/scale definition**: define the deterministic synthetic graph generator matching the 10–12 route → 25 route trajectory; node/edge cardinality targets; reproducibility contract (seed, format).
- **R2 — Workload definitions**: precise, implementable definitions of route optimization (multi-criteria Dijkstra on the route-expanded graph, ADR-0001 internal cost model), polyline snapping (candidate-geometry matching, CRITIQUE §3.1/§4), detour pathfinding (virtual-node detour injection, ADR/restriction model).
- **R3 — Parity oracle strategy**: how expected outputs are generated once from the canonical `@komyuter/shared` fare/route logic and consumed identically by Node/Rust/Go (FR-010).
- **R4 — Metrics & thresholds**: metric definitions (p50/p90/p99 latency, throughput, peak RSS), aggregation format, and the pass threshold (≤500 ms / 90th pct; aligned to `docs/CRITIQUE.md`).
- **R5 — Toolchain prerequisites**: Go install steps (not present in this environment); Rust already present; cross-compile notes; local-only validation.
- **R6 — Node baseline specifics**: since Fastify server is CRUD-only, define the Node "current stack" reference implementation of the 3 workloads; confirm no existing server code is modified (zero regression).
- **R7 — Structure/perf attribution**: why hand-rolled Dijkstra vs graph crates; how to keep the comparison attributable rather than library-throttled.

**Output**: `research.md` with every unknown resolved.

## Phase 1: Design & Contracts (output → `data-model.md`, `contracts/*`, `quickstart.md`)

- **data-model.md**: the three workloads' I/O shapes (input fixture schema, output/route-result schema), the graph representation (`stop_{stopId}_direction_{directionId}` nodes + edges per ADR-0001 internal cost), and the benchmark result schema (the JSON both runtimes emit).
- **contracts/workloads.md**: exact input fixtures and the **expected output schema** each runtime must produce; the parity oracle contract tying outputs to canonical shared logic.
- **contracts/benchmark-format.md**: the shared metrics JSON (p50/p90/p99, throughput, peak RSS, run count, env info) so the three runtimes aggregate identically into the comparison matrix.
- **contracts/navigation-api.md**: the future internal navigation-service interface — the extraction seam for a gradual single-service rollout (recorded for planning, not built here).
- **quickstart.md**: steps — generate fixtures → run Node/Rust/Go harnesses → aggregate results → build comparison matrix → (if gate passes) run PoC and validate parity.
- **Agent context**: update the `AGENTS.md` SPECKIT marker to point at this `plan.md`.

## Constitution Re-check

After research + design, the deviation (I) remains the only justification and the parity guardrail holds; therefore the gate **passes**. Final verdict: **PASSED** — 2026-08-20. All other principles ✅ as tabulated above.
