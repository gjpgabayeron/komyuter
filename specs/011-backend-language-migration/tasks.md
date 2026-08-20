---
description: "Task list for backend language migration feasibility study"
---

# Tasks: Backend Language Migration (Feasibility Study + PoC)

**Input**: Design documents from `/specs/011-backend-language-migration/`

**Prerequisites**: plan.md (required), spec.md (user stories), research.md (decisions), data-model.md (I/O + graph shape), contracts/ (workloads, benchmark-format, navigation-api), quickstart.md (validation scenarios)

**Tests**: Inclusion REQUIRED — spec.md requires testable parity (FR-010) and 100% behavior parity (SC-005), and SC-002 requires metrics for every runnable candidate. Parity tests are written FIRST and must FAIL before implementation (TDD, consistent with the server's red-before-implementation gate).

**Organization**: Tasks are grouped by user story so each story is implemented and validated independently.

**Scope guardrail**: This is a FEASIBILITY STUDY + benchmark harness + decision ADR + PoC — NOT a rewrite of the existing Fastify server. No production server code is modified. All harness code lives under the new top-level `navbench/` directory, which is intentionally OUTSIDE the pnpm workspace (`apps/*`, `packages/*`) so it is not pulled into `pnpm install` / turbo.

**Cross-language port note (Constitution Principle I)**: Porting the route/fare logic to candidate runtimes is a justified deviation; correctness is guarded by the parity oracle (FR-010 / SC-005), which is mandatory in this plan.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions (this feature)

- Harness root: `navbench/` at repo root (outside pnpm workspace)
  - `navbench/node/` — Node reference implementation
  - `navbench/rust/` — Rust harness (`cargo`)
  - `navbench/go/` — Go harness (`go`)
  - `navbench/poc/` — PoC navigation service (winning candidate)
  - `navbench/fixtures/` — deterministic input generators + reference inputs
  - `navbench/oracle/` — parity oracle generator + expected-output fixtures
  - `navbench/aggregate/` — result schema + comparison-matrix aggregator
  - `navbench/results/` — benchmark output JSON + reports (gitignored)
  - `navbench/shared/` — shared workload definitions + I/O TS types
  - `navbench/scripts/` — run/validation scripts
- Decision ADR: `docs/adr/0017-runtime-for-backend-navigation.md`
- Docs: `CONTEXT.md` (glossary), root `TECHSTACK.md` / `OVERVIEW.md`

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Scaffold the `navbench/` harness and verify the toolchain. Nothing here permutes the runtime decision; it just puts a clean, isolated workspace in place.

- [ ] T001 Create `navbench/` directory tree (`node/ rust/ go/ poc/ fixtures/ oracle/ aggregate/ results/ shared/ scripts/`) and add `navbench/results/` plus generated fixtures to `.gitignore`
- [ ] T002 [P] Initialize the Rust crate at `navbench/rust` via `cargo init` (package name `navbench-rust`); add serde/serde_json for fixture + result IO in `navbench/rust/Cargo.toml`
- [ ] T003 [P] Initialize the Go module at `navbench/go` via `go mod init komyuter/navbench/go`; ensure `encoding/json` stdlib only for now
- [ ] T004 [P] Initialize the Node reference package at `navbench/node` (package.json, TypeScript tsconfig, `tsx` for running TS) — NOT part of the root workspace, keep it standalone
- [ ] T005 [P] Verify the toolchain (node, cargo, go) and record versions + availability in `navbench/results/env-notes.md`; if `go` is unavailable, record `"go": "not measured"` (per research R5 — Go absence must not block; allowed by SC-002)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The deterministic fixtures, parity oracle, and result schema that EVERY story and EVERY runtime depends on. No user story can begin until this phase is complete.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [ ] T006 Build the deterministic graph fixture generator `navbench/fixtures/generate.ts` → writes `navbench/fixtures/inputs/{small,medium,large,rush}.json` (seeded RNG; fixed sizes per research R1; entities: routes with two direction polylines, ordered stop lists, fare configs `base_fare`/`base_dist_km`/`rate_per_km`)
- [ ] T007 Build the parity oracle generator `navbench/oracle/generate-oracle.ts` → writes expected-output fixtures `navbench/fixtures/oracle/*.json` for all three workloads; encode the canonical LTFRB fare formula `base_fare + max(0, dist_km - base_dist_km) × rate_per_km` per ADR-0001 (if `@komyuter/shared` later exposes a `fareCalculator`, import it here to avoid drift)
- [ ] T008 [P] Define shared workload I/O types + workload definitions in `navbench/shared/types.ts` and `navbench/shared/workloads.ts` from `contracts/workloads.md` (the three workloads + parity-oracle contract FR-010)
- [ ] T009 Define the benchmark-result JSON schema and an aggregator skeleton in `navbench/aggregate/schema.ts` and `navbench/aggregate/aggregate.ts` (consumes `navbench/results/*.json`, emits the comparison matrix) from `contracts/benchmark-format.md`

**Checkpoint**: Foundation ready — all three runtimes can be implemented against the same fixtures, oracle, and result schema.

---

## Phase 3: User Story 1 — Understand the bottleneck (Priority: P1) 🎯 MVP

**Goal**: Establish a reproducible, honest Node baseline for the three navigation workloads so there is an apples-to-apples reference to compare Rust/Go against (the server is CRUD-only today, so this baseline is a reference implementation, not an existing endpoint).

**Independent Test**: Running `navbench/node` runner at all four fixture sizes reproduces identical metrics JSON (deterministic seed) and every workload output equals the corresponding oracle fixture.

### Tests for User Story 1 (REQUIRED — parity, FR-010) ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T010 [P] [US1] Parity test `navbench/node/tests/parity.test.ts` asserting workload outputs === `navbench/fixtures/oracle/*.json` (run via `tsx --test`; must fail before workloads exist)

### Implementation for User Story 1

- [ ] T011 [US1] Implement the three Node reference workloads in `navbench/node/src/workloads/` (`graph.ts` Dijkstra on the two-direction graph, `snap.ts` polyline snapping in `[lng, lat]` order, `fare.ts` LTFRF fare batch)
- [ ] T012 [US1] Implement the Node benchmark runner `navbench/node/src/run.ts` (load a fixture, execute each workload N iterations, emit metrics JSON to `navbench/results/node-baseline-<size>.json`)
- [ ] T013 [US1] Build and record the Node baseline: run `navbench/node` at `small/medium/large/rush` and write `navbench/results/node-baseline-*.json` (SC-001/SC-002)

**Checkpoint**: A reproducible Node baseline exists; US1 works and validates independently. This is the MVP increment.

---

## Phase 4: User Story 2 — Decide from evidence (Priority: P1)

**Goal**: Build the Rust and Go harnesses, run them against the same fixtures, generate the comparison matrix, apply the go/no-go decision gate, and record the decision in an ADR.

**Independent Test**: `navbench/aggregate/aggregate.ts` produces a comparison matrix from the three runtimes' result JSON, and the go/no-go recommendation references explicit metric values vs the thresholds.

### Tests for User Story 2 (REQUIRED — parity, FR-010) ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T014 [P] [US2] Rust parity tests `navbench/rust/tests/parity.rs` asserting workload outputs === oracle fixtures (run via `cargo test`; must fail first)
- [ ] T015 [P] [US2] Go parity tests `navbench/go/parity_test.go` asserting workload outputs === oracle fixtures (run via `go test`; must fail first)

### Implementation for User Story 2

- [ ] T016 [US2] Implement the Rust workloads in `navbench/rust/src/{graph,snap,fare}.rs` mirroring the Node reference semantics
- [ ] T017 [US2] Implement the Rust runner `navbench/rust/src/main.rs` emitting `navbench/results/rust-<size>.json`
- [ ] T018 [US2] Run the Rust harness at all four fixture sizes → `navbench/results/rust-*.json` (requires T016/T017 green)
- [ ] T019 [US2] Implement the Go workloads in `navbench/go/{graph,snap,fare}.go` mirroring the Node reference semantics
- [ ] T020 [US2] Implement the Go runner `navbench/go/main.go` emitting `navbench/results/go-<size>.json`
- [ ] T021 [US2] Run the Go harness at all four fixture sizes → `navbench/results/go-*.json` (if `go` is unavailable, record `not measured` per R5/SC-002 and continue)
- [ ] T022 [US2] Finish the aggregator `navbench/aggregate/aggregate.ts` → generate the comparison matrix (per-workload metrics per runtime, normalized against the Node baseline, vs thresholds) from `contracts/benchmark-format.md`
- [ ] T023 [US2] Apply the decision gate (SC-003/SC-004): evaluate the matrix against thresholds and write the go/no-go recommendation to `navbench/results/recommendation.md` (if mid-study the evidence clearly favors one runtime, that selection is adopted)
- [ ] T024 [US2] Write the decision ADR `docs/adr/0017-runtime-for-backend-navigation.md` (decision, evidence/citations to `navbench/results/*`, tradeoffs, and gradual-single-service-extraction vs full-rewrite advice) per Constitution Principle II

**Checkpoint**: An evidence-backed runtime decision exists as an ADR; both candidate harnesses are parity-verified.

---

## Phase 5: User Story 3 — Prove it works with a working prototype (Priority: P2)

**Goal**: Build a working PoC of the navigation service in the winning candidate that meets the performance threshold and passes 100% behavior parity — demonstrating the `navigation-api.md` extraction seam.

**Independent Test**: The PoC service, run standalone, returns results identical to the oracle (100% parity) and meets the p95-latency + peak-RSS thresholds of SC-006 at rush-hour scale.

### Tests for User Story 3 (REQUIRED — 100% parity, SC-005) ⚠️

> **NOTE: Write these tests FIRST, ensure they FAIL before implementation**

- [ ] T025 [P] [US3] PoC parity tests asserting 100% parity vs `navbench/fixtures/oracle/*.json` for every `computeRoutes` case the PoC exposes (must fail first)

### Implementation for User Story 3

- [ ] T026 [US3] Scaffold the PoC navigation service in the winning candidate from T024 at `navbench/poc/` exposing the `contracts/navigation-api.md` seam (`computeRoutes` over a thin HTTP or CLI surface)
- [ ] T027 [US3] Implement the realtime route-optimization capability (the most perf-critical workload) at `rush` fixture scale in `navbench/poc/src`
- [ ] T028 [US3] Run the PoC performance threshold check: measure p95 latency + peak RSS against SC-006 thresholds and write `navbench/results/poc-*.json` (does NOT block the feasibility verdict if a threshold is missed — it informs the decision)
- [ ] T029 [US3] Demonstrate the extraction seam: run the PoC standalone via the `contracts/navigation-api.md` contract and document (in `navbench/README.md`) how it would extract/co-locate with the Fastify server as a separate service

**Checkpoint**: A working PoC meets thresholds and 100% parity; the extraction path is proven.

---

## Phase 6: User Story 4 — No breakage while evaluating (Priority: P3)

**Goal**: Confirm the study causes zero regressions to the production Node server / admin app and that the new terminology is recorded.

**Independent Test**: Existing server tests + static gates all pass on the current HEAD with `navbench/` present.

### Implementation for User Story 4

- [ ] T030 [US4] Run existing server regression: `pnpm --filter server test` (unit + integration) — zero failures (SC-007)
- [ ] T031 [P] [US4] Run static gates: `pnpm lint`, `pnpm typecheck`, `pnpm format:check` — zero regressions
- [ ] T032 [US4] Add new-term glossary entries to `CONTEXT.md` (e.g. candidate runtime, parity oracle, navbench, navigation service) per Constitution Principle IV

**Checkpoint**: Zero regressions confirmed; terminology captured.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Final validation, reproducibility, and documentation of the feasibility result.

- [ ] T033 [P] Run the `quickstart.md` validation: all 5 scenarios mapped to SC-001…SC-007 pass
- [ ] T034 [P] Finalize `navbench/README.md`: findings summary, reproducibility notes (seeded RNG, pinned toolchain versions recorded in `navbench/results/env-notes.md`), and link to `docs/adr/0017-*.md` + `navbench/results/recommendation.md`
- [ ] T035 Update root design docs (`TECHSTACK.md` / `OVERVIEW.md`) with a pointer to ADR-0017 and the feasibility-study status (no production code touched)

**Checkpoint**: The feasibility study is complete, reproducible, and documented; the decision ADR and PoC stand as the deliverable.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately.
- **Foundational (Phase 2)**: Depends on Setup completion — BLOCKS all user stories (shared fixtures/oracle/schema).
- **US1 (Phase 3)**: Depends on Foundational — baseline reference is reusable by US2.
- **US2 (Phase 4)**: Depends on Foundational + US1 baseline (normalization reference).
- **US3 (Phase 5)**: Depends on US2 (winning candidate from ADR T024).
- **US4 (Phase 6)**: Can run as soon as Foundational is done (it guards HEAD against the new dir); final no-breakage confirmation runs last.
- **Polish (Phase 7)**: Depends on all stories being complete.

### User Story Dependencies

- **US1 (P1)**: Baseline first — needed to normalize US2 metrics against it.
- **US2 (P1)**: Needs US1 baseline + Foundational; independently testable via its parity tests.
- **US3 (P2)**: Needs US2's decision (candidate) + Foundational oracle; independently testable via 100%-parity test.
- **US4 (P3)**: Near-independent; guards no regression, can run alongside other stories.

### Within Each User Story

- Parity tests FIRST and failing, before implementation (TDD — FR-010/SC-005).
- Workloads are implemented in the same order per runtime (graph → snap → fare) to keep oracle parity simple.
- Runner after workloads; run/measure after tests pass; ADR after results exist.

### Parallel Opportunities

- Phase 1 setup tasks T002/T003/T004/T005 (different runtimes/dirs).
- Phase 2 tasks T008/T009 (different files).
- US1 test T010 is parallel with nothing substantial (written first), but runner T012 is independent files.
- US2: Rust (T016/T017) and Go (T019/T020) are independent languages — fully parallelizable; parity tests T014/T015 parallel.
- US3: PoC parity test T025 written before impl.
- US4 T030 and T031 parallel (different commands/files).
- Polish T033/T034/T035 parallel.

---

## Parallel Example: User Story 2 (Rust + Go by different lanes)

```bash
# Lane A — Rust harness (own dir, no cross-deps):
Task: "Rust parity tests in navbench/rust/tests/parity.rs"
Task: "Rust workloads in navbench/rust/src/{graph,snap,fare}.rs"
Task: "Rust runner navbench/rust/src/main.rs"

# Lane B — Go harness (own dir, no cross-deps):
Task: "Go parity tests in navbench/go/parity_test.go"
Task: "Go workloads in navbench/go/{graph,snap,fare}.go"
Task: "Go runner navbench/go/main.go"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup.
2. Complete Phase 2: Foundational (CRITICAL — blocks all stories).
3. Complete Phase 3: US1 — establish the Node baseline.
4. **STOP and VALIDATE**: baseline reproducible + parity-green.

### Incremental Delivery

1. Complete Setup + Foundational → harness foundation ready.
2. US1 baseline → **MVP milestone** (bottleneck quantified).
3. US2 harnesses + matrix + ADR → **decision milestone**.
4. US3 PoC → **proof milestone** (works + meets threshold + parity).
5. US4 no-regression confirmation + Polish → **final**.
6. Each story adds evidence without touching the production Fastify server.

### Parallel Team Strategy

- Solo dev on a fixed thesis deadline: run phases sequentially, but use [P] lanes within a phase (e.g. scaffold Rust and Go together) to save wall-clock time. Go absence recorded as `not measured` rather than a blocker.

---

## Notes

- `navbench/` is deliberately outside the pnpm workspace (root `pnpm-workspace.yaml` only covers `apps/*` and `packages/*`), so the harness and any Go/Rust toolchains never interfere with `pnpm install` or turbo.
- All benchmark output and generated artifacts stay under `navbench/results/` (gitignored), keeping timings out of the repo; only generators, oracle fixtures, schemas, reports, and the ADR are committed.
- Do NOT modify any production server code (`apps/server`) — this is a study + PoC only.
- Do NOT commit directly — hand the user grouped `git add` commands for review and commit.
- Coordinate order is `[lng, lat]` everywhere in the polyline-snapping workload (ADR-0013).
- The displayed-fare / internal-cost distinction (ADR-0001) applies to the route-optimization workload: internal Dijkstra cost is base-on-board + marginal ₱1.80/km; the batch-fare workload applies the full LTFRB formula for output parity.
