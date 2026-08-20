<!--
  SYNC IMPACT REPORT
  Version change: (template placeholders) → 1.0.0
  Modified principles: n/a — initial fill-in of template placeholders
  Added sections:
    - Core Principles (5: Precision Is Trust; Recorded Decisions Govern;
      Shared, Never Reimplemented; Canonical Language; Measurable Deliverables)
    - Additional Constraints: Domain & Spatial
    - Engineering Workflow & Quality Gates
    - Governance
  Removed sections: n/a
  Templates requiring updates:
    - .specify/templates/plan-template.md         ✅ no change (Constitution Check gates are
      populated per-plan from this file)
    - .specify/templates/spec-template.md         ✅ no change
    - .specify/templates/tasks-template.md        ✅ no change (tests remain optional per repo
      state; no test task defined)
    - .specify/templates/constitution-template.md ✅ no change (canonical template source)
  Follow-up TODOs:
    - TEST_STRATEGY: no test runner is configured in the repo (turbo.json defines no `test`).
      Decision required at planning time whether to adopt a runner; see Engineering Workflow
      section for the standing rule until then.
-->

# Komyuter Constitution

## Core Principles

### I. Precision Is Trust

Every displayed value MUST be exact: fares, distances, walk meters, and transfer counts.
Never fabricate or estimate what the system does not know — in particular, no ETA is ever
shown (ADR-0009). Trust is earned by honest, legible statements about what the system knows
and what it does not (PRODUCT.md, Design Principle 1).

Rationale: The thesis promise is a trustworthy transit tool; a fabricated or rounded-into-
plausibility number breaks that trust faster than any other defect.

### II. Recorded Decisions Govern

Significant architecture, domain, and routing decisions MUST be recorded in `docs/adr/` as
ADRs before they are relied upon. Where any design doc contradicts a decision, the ADR wins.
Specs, plans, contracts, and code MUST be reconciled with the ADRs and with `docs/CONTEXT.md`.

Rationale: The root design docs historically contradicted each other and the configuration;
ADRs are the single authoritative decision record and the tiebreaker.

### III. Shared, Never Reimplemented

Canonical logic MUST live in a shared package and be reused: `@komyuter/shared` owns
`fareCalculator` and the shared domain types. Shared configuration MUST be extended, not
redefined (strict `@repo/typescript-config`). Lint lives in one root ESLint flat config;
per-package lint configs and `@repo/eslint-config` MUST NOT be recreated.

Rationale: The fare formula and glossary-driven types are consumed by the commuter app, the
admin dashboard, and the server; divergence between copies is a bug.

### IV. Canonical Language

Specs, plans, contracts, and code MUST use the canonical terms defined in `docs/CONTEXT.md`
and MUST NOT use their listed synonyms (e.g., "Line" for Route, "Hail-and-ride point" for
Boarding Point, "user" for Commuter). New concepts MUST be added to the glossary before use.

Rationale: Ambiguous transit vocabulary (passenger vs commuter, segment vs step) has
repeatedly caused modeling drift; one word must mean one thing.

### V. Measurable Deliverables

Every feature MUST be specified with measurable success criteria and independently testable
user stories (spec-template). Vague adjectives ("robust", "intuitive", "fast") MUST be
converted to metrics or explicit targets. The product-level target is PSSUQ usability with a
mean ≤ 3.0 across 25–30 respondents.

Rationale: The system must be defensible at defense day; a claim that cannot be measured
cannot be validated.

## Additional Constraints: Domain & Spatial

- Spatial data uses coordinate order `[longitude, latitude]` everywhere (GeoJSON, PostGIS
  `ST_MakePoint`, MapLibre/Mapbox GL). `[lng, lat]` is the sole format in the admin UI —
  MapLibre consumes it natively, so there is no conversion layer (ADR-0013 supersedes
  ADR-0007's Leaflet exception). A swapped pair puts stops in the ocean — the single most
  dangerous pitfall in the project.
- Meter-based PostGIS distance math MUST cast `::geography`; raw geometry returns degrees.
- Fare is the LTFRB formula — `base_fare + max(0, dist_km - base_distance_km) * rate_per_km`
  (defaults ₱13 / 4 km / ₱1.80; 20% student/senior) — owned by `fareCalculator` in
  `@komyuter/shared`. The displayed fare is always the exact per-leg total; the Dijkstra
  internal cost is base-on-board plus marginal ₱1.80/km (ADR-0001). Never "fix" the internal
  cost into per-edge LTFRB fare.
- A route is modeled as two directions, each with its own polyline and ordered stop list
  (`stop_{stopId}_direction_{directionId}` nodes). Never reverse one polyline for the return
  trip (ADR-0008).
- Hail-and-ride boarding at non-stop positions uses request-time virtual nodes plus board
  edges; they never persist and never enter the graph cache.
- Edge-cost normalization is per-edge-type (distance/walk/fare/transfer pools), clamped to
  [0, 1]; transfer-edge distance is 0 (ADR-0002).
- Trust scoring (MHD) is informational only — never a Dijkstra weight (panel constraint).
  Trace validity uses a max-speed discriminator (10–45 km/h), not average speed (ADR-0003).
- No ETA is displayed anywhere; navigation output is distances, fare, transfers, and walk
  distance only (ADR-0009).
- AR is location-based Geo-AR (expo-camera + expo-sensors), shown only during walking or
  transfer segments — never during rides, never ARCore/ARKit.
- Authentication is Supabase Auth: admin-gated CRUD; commuter app anonymous with optional
  sign-in (ADR-0006). No DIY JWT.
- The API envelope is `{ success, data | error }`.
- One connected regional graph (Iloilo City Proper + Oton/Pavia/Leganes); no `city` column,
  no multi-tenant machinery (ADR-0010). Expansion to other cities is future work.
- No Redis (ADR-0005).

## Engineering Workflow & Quality Gates

- TypeScript is strict via `@repo/typescript-config`; extend shared configs, never redefine
  tsconfigs from scratch.
- ESLint is a single root flat config (`eslint.config.mjs`). Do not recreate
  `@repo/eslint-config` or any `.eslintrc.*` files.
- Prettier uses `.prettierrc.json` (semicolons, double quotes); the five root design docs are
  prettier-ignored.
- Quality gates: `pnpm lint`, `pnpm typecheck`, and `pnpm format:check` MUST pass before
  merge. `.husky/pre-commit` runs lint-staged (eslint + prettier --check, no auto-fix);
  `.husky/commit-msg` enforces conventional commits (`type(scope): description`).
- TEST_STRATEGY (amended 2026-07-31): a test runner (**Vitest**) is permitted for workspace
  apps; each app that defines tests contributes a `test` task to `turbo.json`. Rationale:
  success criteria SC-001–SC-008 in `specs/001-local-supabase-backend` demand automated
  verification that manual checks cannot prove on every change (Principle V). Migration note:
  this PATCH supersedes the earlier standing rule that no test task existed; earlier plans and
  docs that reference a missing `test` task are historical, not normative.
- UI work MUST load `PRODUCT.md` and `DESIGN.md` first; DESIGN wins on visual decisions,
  PRODUCT wins on strategic/voice decisions. The visual grammar is "The Route Sign" — flat
  enamel sign-plate surfaces, pure white ground, signboard green-blue plus signal amber,
  ≤ 4px corners, no shadows.
- Complexity beyond the plan MUST be justified in the plan's Complexity Tracking section;
  uncomplicated alternatives MUST be rejected with reasons.

## Governance

- This constitution supersedes ad-hoc practice. Where the root design docs disagree with it,
  this constitution and the ADRs win.
- Amendments MUST be documented here and versioned semantically:
  - MAJOR: backward-incompatible governance or principle removals/redefinitions.
  - MINOR: new principle or section, or materially expanded guidance.
  - PATCH: clarification, wording, or non-semantic refinement.
- Amendments require a stated rationale and, where behavior changes, a migration note for
  affected workflows (spec, plan, tasks).
- Compliance review: every plan's "Constitution Check" gate MUST pass before research
  (Phase 0) and MUST be re-checked after design (Phase 1). Violations MUST be recorded in the
  plan's Complexity Tracking with a simpler-alternative justification.
- Runtime development guidance lives in `AGENTS.md`; keep it reconciled with this
  constitution and the ADRs.
- `docs/CONTEXT.md` is the authoritative glossary; terms MUST be added there before use
  (Principle IV).

**Version**: 1.0.0 | **Ratified**: 2026-07-31 | **Last Amended**: 2026-07-31
