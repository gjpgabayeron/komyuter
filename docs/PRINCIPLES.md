# PRINCIPLES.md — Komyuter project principles

The five principles below govern how this project is designed and built. They outlive any single
feature, and they are the tiebreaker of last resort: where a principle and a convenience disagree, the
principle wins.

**Provenance.** These principles were adopted on 2026-07-31 and last amended 2026-09-25, as the
_Komyuter Constitution_ (v1.1.0) under the SpecKit workflow that this repository has since retired.
They are reproduced here unchanged. The constitution's two other sections — the spatial/domain
constraints and the engineering quality gates — were **not** carried over, because `AGENTS.md`
already states them at the same level of detail and with the current commands; `AGENTS.md` is the live
source for those, not this file.

## Core principles

### I. Precision Is Trust

Every displayed value MUST be exact: fares, distances, walk meters, and transfer counts. Never
fabricate or estimate what the system does not know — in particular, **no ETA is ever shown**
([ADR-0009](adr/0009-no-eta.md)). Trust is earned by honest, legible statements about what the system
knows and what it does not (`PRODUCT.md`, Design Principle 1).

_Rationale:_ the thesis promise is a trustworthy transit tool; a fabricated, or rounded into
plausibility, number breaks that trust faster than any other defect.

### II. Recorded Decisions Govern

Significant architecture, domain, and routing decisions MUST be recorded in `docs/adr/` as ADRs before
they are relied upon. **Where any design doc contradicts a decision, the ADR wins.** Specs, plans,
contracts, and code MUST be reconciled with the ADRs and with `CONTEXT.md`.

_Rationale:_ the root design docs historically contradicted each other and the configuration; ADRs are
the single authoritative decision record and the tiebreaker.

### III. Shared, Never Reimplemented

Canonical logic MUST live in a shared package and be reused: `@komyuter/shared` owns `fareCalculator`
and the shared domain types. Shared configuration MUST be extended, not redefined (strict
`@repo/typescript-config`). Lint lives in one root ESLint flat config; per-package lint configs and
`@repo/eslint-config` MUST NOT be recreated.

_Rationale:_ the fare formula and glossary-driven types are consumed by the commuter app, the admin
dashboard, and the server; divergence between copies is a bug.

### IV. Canonical Language

Specs, plans, contracts, and code MUST use the canonical terms defined in `CONTEXT.md` and MUST
NOT use their listed synonyms (for example "Line" for Route, "Hail-and-ride point" for Boarding
Point, "user" for Commuter or Account). New concepts MUST be added to the glossary before use.

_Rationale:_ ambiguous transit vocabulary (passenger vs commuter, segment vs step) has repeatedly
caused modeling drift; one word must mean one thing.

### V. Measurable Deliverables

Every feature MUST be specified with measurable success criteria and independently testable user
stories. Vague adjectives ("robust", "intuitive", "fast") MUST be converted to metrics or explicit
targets. The product-level target is PSSUQ usability with a mean ≤ 3.0 across 25–30 respondents.

_Rationale:_ the system must be defensible at defense day; a claim that cannot be measured cannot be
validated.

## Governance

- These principles supersede ad-hoc practice. Where the root design docs disagree with them, the
  principles and the ADRs win.
- Responsibilities that the retired constitution assigned to itself are split as follows: `AGENTS.md`
  carries the runtime development conventions and the spatial/domain constraints; `docs/adr/` carries
  the decisions; `CONTEXT.md` is the authoritative glossary, and terms MUST be added there before
  use (Principle IV).
- **UI work MUST load `PRODUCT.md` and `DESIGN.md` first.** DESIGN wins on visual decisions, PRODUCT
  wins on strategic/voice decisions. The visual grammar is "The Route Sign" — flat enamel sign-plate
  surfaces, pure white ground, signboard green-blue plus signal amber, ≤ 4px corners, no shadows.
- Amendments MUST be documented here and versioned semantically:
  - **MAJOR** — backward-incompatible governance or principle removals/redefinitions.
  - **MINOR** — a new principle or section, or materially expanded guidance.
  - **PATCH** — clarification, wording, or non-semantic refinement.
- Amendments require a stated rationale, and — where behavior changes — a migration note for the
  affected workflow.
- Compliance review: every feature plan MUST pass a principles check before implementation, and the
  check MUST be re-run after design. Violations MUST be recorded with a simpler-alternative
  justification — a departure from a principle is allowed, but never a silent one.

**Version**: 1.1.0 | **Ratified**: 2026-07-31 | **Last Amended**: 2026-09-25
