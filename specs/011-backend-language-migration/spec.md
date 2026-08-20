# Feature Specification: Backend Language Migration — Navigation Engine Feasibility

**Feature Branch**: `011-backend-language-migration`

**Created**: 2026-08-20

**Status**: Draft

**Input**: User description: "Evaluate the feasibility and potential benefits of migrating our backend technology from Node.js to either Rust or Go. This is driven by performance/scalability goals and the need to reduce migration complexity when offloading the main navigation and route calculation logic to the server. Anticipated heavier computational workloads: real-time route optimization, polyline snapping, and detour pathfinding. Need a backend that handles these efficiently with predictable resource usage, while weighing onboarding, ecosystem maturity, and rewrite scope — and a judgment on whether the shift is justified at this stage, and whether a gradual migration or full rewrite is more advisable, plus risks."

## Context & Motivation

- Backend today is a Fastify (Node.js) admin API serving the administration dashboard and providing the shared API envelope `{ success, data | error }`.
- The thesis targets server-side navigation: the route-expanded graph, multi-criteria routing, polyline snapping, and detour pathfinding are the compute-heavy workloads that will eventually be served to the commuter app.
- `docs/CRITIQUE.md` §1.1.1 already flags Node.js's single-threaded model as a risk for CPU-intensive graph work and recommends a compute-suitable runtime (e.g. Rust, Go) **or** offloading pathfinding to the database layer. This feature is the structured response to that finding.
- This feature is intentionally a **feasibility study that produces evidence and a recorded decision**, plus a **working proof-of-concept** of one performance-critical navigation capability. It does **not** commit to a full migration; whether and how to migrate is decided by the study's decision gate and left to later planning.

## Clarifications

### Session 2026-08-20 (resolved)

- Q: Which language target? → **A: Rust AND Go are both evaluated side-by-side against the same workloads, and the choice is made from evidence**, not asserted in advance.
- Q: What should the feature produce? → **A: A feasibility study, a recorded ADR decision, and a working proof-of-concept of the navigation service.**
- Q: Which rollout strategy? → **A: Not decided in this spec — the decision gate records only whether migration is justified; the rollout approach (gradual single-service vs. full rewrite) is chosen at planning time after the feasibility result.**
- Q: Team/timeline constraints? → **A: Solo developer with a fixed thesis deadline.**

## User Scenarios & Testing

### User Story 1 - Understand the current bottleneck (Priority: P1)

The developer measures how the existing backend actually performs on the navigation-class workloads it will eventually serve: route optimization, polyline snapping, and detour pathfinding. This establishes the baseline that any migration must beat before it can be justified, and exposes whether the real constraint is the runtime, the graph size, or the database queries.

**Why this priority**: Every migration decision rests on knowing the current bottleneck. Without a measured baseline, the study would be guessing, and the whole feasibility effort loses its evidentiary basis.

**Independent Test**: Can be fully tested by running a repeatable benchmark against the current backend for each of the three workloads and confirming that baseline figures (latency, throughput, resource usage) are recorded and reproducible.

**Acceptance Scenarios**:

1. **Given** a representative dataset matching the planned graph scale, **When** the developer runs the baseline benchmark for each navigation workload, **Then** a reproducible figure for response time, throughput, and peak resource usage is produced per workload.
2. **Given** the baseline figures, **When** the study proceeds, **Then** every later comparison cites this baseline rather than assumptions.
3. **Given** the measured data, **When** the developer reflects on the results, **Then** the study can state whether the runtime is actually the bottleneck or whether another factor (graph size, query strategy) dominates.

---

### User Story 2 - Decide from evidence, not preference (Priority: P1)

The developer runs the same navigation workloads side-by-side across the candidate runtimes, records a single consistent comparison, and writes up a decision that is captured in the repository's architecture decision record before anyone relies on it. The write-up makes the trade-offs legible: performance, memory predictability, developer onboarding cost, ecosystem maturity, and rewrite scope.

**Why this priority**: Principle II (Recorded Decisions Govern) requires architecture decisions to be recorded before being relied upon. Selection of a backend runtime is exactly such a decision, and it must withstand scrutiny at thesis defense.

**Independent Test**: Can be fully tested by confirming that (a) a comparison matrix covering each candidate against the same criteria exists with evidence attached, and (b) a decision ADR is written and recorded, stating the recommendation and its rationale.

**Acceptance Scenarios**:

1. **Given** the baseline and each candidate measured on identical workloads, **When** the comparison is assembled, **Then** every candidate is scored against the same criteria (performance, resource predictability, onboarding effort, ecosystem maturity, rewrite scope).
2. **Given** the comparison, **When** a recommendation is reached, **Then** a decision ADR is written and recorded in the repository before the recommendation is acted upon.
3. **Given** the recorded ADR, **When** anyone later relies on the technology choice, **Then** they can cite a decision record rather than an informal preference.

---

### User Story 3 - Prove it works with a working prototype (Priority: P2)

The developer builds a working proof-of-concept of the most performance-critical navigation capability in a candidate runtime and demonstrates that it meets the feasibility targets for the real workloads, not just toy inputs. This converts the study from analysis into demonstrated capability.

**Why this priority**: A feasibility study is only convincing if the claimed capability is actually shown working. The PoC de-risks the decision by proving the hard part before committing.

**Independent Test**: Can be fully tested by running the PoC against representative inputs and confirming it produces correct navigation results within the stated performance targets.

**Acceptance Scenarios**:

1. **Given** representative navigation inputs, **When** the PoC runs, **Then** it produces correct results (a valid route/path) on each workload type.
2. **Given** the performance targets from the study, **When** the PoC is measured, **Then** it meets the targets (e.g. the response-time and success-rate figures).
3. **Given** the behavior parity requirement, **When** the PoC implements route/fare logic, **Then** its outputs match the existing canonical implementation's expected results.

---

### User Story 4 - No breakage while evaluating (Priority: P3)

Throughout the feasibility study and PoC, the existing backend and administration workflows keep working unchanged. The evaluation never forces a regression on the working system that a thesis defense depends on.

**Why this priority**: The evaluation is a side quest, not the product. The workers' existing admin CRUD, fare configuration, and navigable data must remain intact so the thesis remains demonstrable at any point.

**Independent Test**: Can be fully tested by running the existing admin workflows before and after the study and observing zero regressions.

**Acceptance Scenarios**:

1. **Given** the existing backend running, **When** the study and PoC occur, **Then** existing admin workflows (route/fare editing, export, map display) continue to work with zero regressions.
2. **Given** the shared, canonical route/fare definitions, **When** any logic is ported for the PoC, **Then** it is validated against the existing canonical implementation rather than silently redefined.

---

### Edge Cases

- The real bottleneck turns out not to be the runtime (e.g. it is the database query or graph size): the study must say so and the migration case weakens accordingly — the decision gate must reflect this, not force a rewrite.
- A candidate runtime is fast but imposes an onboarding cost the solo timeline cannot absorb: the comparison must make that trade-off explicit rather than burying it.
- The PoC meets performance but not correctness parity (route/fare results diverge from canonical): the PoC is not a pass until parity is confirmed.
- The baseline dataset is unrealistically small, flattering results: the baseline must use a representative graph scale and be reproducible, or the comparison is invalid.
- The performance target (e.g. response time) cannot be met by any candidate at the planned scale: the study records that finding and documents what scale/approach would be needed, rather than declaring migration a success.
- Evaluation consumes thesis time with no go/no-go outcome: the study must end at the decision gate with a clear, dated recommendation.

## Requirements

### Functional Requirements

- **FR-001**: The system MUST measure and record a reproducible performance baseline of the current backend for each navigation workload — route optimization, polyline snapping, and detour pathfinding — including response time, throughput, and peak resource usage.
- **FR-002**: The baseline MUST use a representative dataset at the planned graph scale, and the benchmark MUST be repeatable.
- **FR-003**: The study MUST evaluate two candidate runtimes side-by-side against the same navigation workloads and the same evaluation criteria.
- **FR-004**: The evaluation criteria MUST include performance, resource-usage predictability, developer onboarding effort, ecosystem maturity, and rewrite scope.
- **FR-005**: The study MUST produce a comparison matrix in which every candidate is scored against every criterion with supporting evidence.
- **FR-006**: Before any technology decision is relied upon, a decision ADR MUST be written and recorded in the repository stating the recommendation and its rationale (Principle II).
- **FR-007**: The feasibility study MUST end in a decision gate that states a clear go / no-go for migrating the navigation engine, with the rationale tied to the measured evidence.
- **FR-008**: The study MUST build a working proof-of-concept of at least the most performance-critical navigation capability, capable of producing correct results on representative inputs.
- **FR-009**: The proof-of-concept MUST meet the performance targets defined in the study (response-time and success-rate figures) when measured.
- **FR-010**: Any route or fare logic implemented in the proof-of-concept MUST produce results matching the existing canonical implementation (behavior parity); it MUST NOT silently redefine the canonical fare or route model.
- **FR-011**: The evaluation MUST NOT regress existing backend and administration workflows; all existing admin CRUD, fare configuration, export, and map workflows MUST continue to work.
- **FR-012**: The study MUST document anticipated risks of migration — onboarding cost, ecosystem gaps, and the scope of rewriting existing logic — alongside mitigations, matching the risk areas in `docs/CRITIQUE.md`.
- **FR-013**: Whether migration proceeds and the rollout approach (gradual single-service extraction vs. full rewrite) MUST be deferred to planning and decided only after the decision gate passes.

### Key Entities

- **Navigation Workload**: a class of compute-heavy operation the backend must serve — route optimization, polyline snapping, and detour pathfinding — each measured separately.
- **Performance Baseline**: the recorded, reproducible current-backend figures per workload used as the reference for all migration comparisons.
- **Technology Candidate**: a candidate runtime evaluated against the fixed criteria; at least two are compared.
- **Comparison Matrix**: the evidence-backed scoring of every candidate against every criterion.
- **Decision Record (ADR)**: the recorded architecture decision documenting the recommendation and rationale, written before the decision is relied upon.
- **Proof-of-Concept Service**: the working prototype of the most performance-critical navigation capability that demonstrates correctness, performance targets, and behavior parity.

## Success Criteria

### Measurable Outcomes

- **SC-001**: A reproducible baseline exists for each of the three navigation workloads (route optimization, polyline snapping, detour pathfinding) before any comparison is made.
- **SC-002**: The comparison matrix covers each candidate against all five criteria, each with attached evidence; any criterion left unmeasured is explicitly called out.
- **SC-003**: A decision ADR is written and recorded before the technology choice is relied upon, and it cites the measured evidence.
- **SC-004**: The proof-of-concept produces correct results on representative inputs and meets the study's performance targets — e.g. navigation queries served within the target response-time window for at least the stated success-rate share, per the figures the study defines (aligning with the `docs/CRITIQUE.md` recommendation of ≤500 ms for 90% of queries).
- **SC-005**: The proof-of-concept's route/fare outputs match the canonical implementation's expected results for the tested cases (behavior parity, 100% match).
- **SC-006**: Zero regressions in existing admin workflows during the study and proof-of-concept.
- **SC-007**: The study ends in a dated go/no-go decision with a clear rationale, and records the anticipated risks and mitigations.

## Assumptions

- Scope is the navigation-engine feasibility study, decision ADR, and a working proof-of-concept; the full backend is **not** being migrated by this feature.
- The developer is a **solo** contributor with a **fixed thesis deadline**; the study is weighted toward evidence that can be collected and defended in limited time.
- Two candidate runtimes are compared and the choice is made from evidence, per the resolved clarification.
- The rollout approach (gradual single-service extraction vs. full rewrite) is deliberately **not** decided here; the decision gate records only whether migration is justified, and the rollout is chosen at planning time.
- The `docs/CRITIQUE.md` performance target (≤500 ms for 90% of queries) is used as the reference feasibility target unless the study's baseline measurement justifies adjusting it; the study documents any adjustment.
- Canonical route and fare logic remains defined once and is validated, never redefined, in any proof-of-concept (Principle III).
- No Redis is introduced (ADR-0005); the study considers the runtime and database-layer options, not a new caching tier.
- The existing Node backend continues to run throughout; it is the subject of the baseline and the no-regression guard, not a casualty of the evaluation.
