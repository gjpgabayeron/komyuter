# ADR-0034: A lossless dataset export (v1.2) (DECIDED)

- **Status**: DECIDED — implemented in M4 (ticket #72) and consumed by the seed path (#80) and
  `R8`'s import work in M5
- **Date**: 2026-11-08
- **Supersedes/refines**: refines the export contract recorded in
  `specs/001-local-supabase-backend/contracts/export-dataset.schema.json` (v1.1); that file stays as the
  historical record. No prior ADR owns the export payload.

## Context

The v1.1 export was designed as a hand-off document, not as a round-trip format. It omitted
`direction_kind` (which Direction of the pair is the base and which the auto-derived return),
`derived_from_stop_id` (the return-Stop identity ADR-0031 depends on), Stop `notes`, `ar_marker_enabled`
and `is_active` on every soft-deletable entity. Importing a v1.1 export therefore would not reproduce the
Working Set: the return Direction would become an ordinary Direction, soft-deleted rows would come back
active, and notes/AR intent would disappear.

M4 needs a faithful seed from staging, and M5's `R8` needs an import format that can round-trip the
dataset. The export is the one artifact both can share, so it has to carry the full Working Set.

## Decision

1. **Bump the export to v1.2** and add the missing fields:
   - `direction_kind: "base" | "return"` on each Direction;
   - `derived_from_stop_id`, `notes`, `ar_marker_enabled` and `is_active` on each Stop;
   - `is_active` on fare configurations, detours and restrictions.
2. **Keep the withdrawn trigger fields out.** `active_timeframes`, `condition` and `notable_stops` are
   legacy columns for a withdrawn feature; exporting them would promise behaviour the app no longer has.
3. **Validate the contract independently.** The server's export test validates against a checked-in v1.2
   JSON Schema fixture, not the shared zod schema the producer assembles from. A test that uses the
   producer's own schema proves only self-consistency.
4. **Make the import one-way and attribution explicit.** The import refuses a non-empty target, preserves
   ids and every field above, and attributes imported rows to the operator-named owner Account; it never
   copies auth identities between projects.

## Consequences

- **Positive**: a staging export can seed production without re-plotting, and M5's import has a format
  that can round-trip the Working Set. The return-Direction link and soft-delete state survive.
- **Trade-off**: v1.2 is a breaking contract change. Any external consumer of v1.1 must accept the new
  required fields. There is no in-repo consumer yet; the export endpoint is the only writer, and the
  admin export UI is M5 `R7`.
- **Trade-off**: the export now exposes `is_active` and internal identity fields. That is the point — a
  seed is not a commuter-facing document — but it makes the payload a closer mirror of the schema than
  the v1.1 design intended.
- **Risk**: the import bypasses the save path's invariants (version stamps, auto-derived return
  creation). It compensates by preserving the exported ids and `direction_kind`, refusing a non-empty
  target, and writing in one transaction; a partial or re-run seed is impossible.

## Alternatives considered

- **Keep v1.1 and infer the missing fields on import** (first Direction is base, return stops by order,
  all rows active). Rejected: silent domain corruption, and it breaks ADR-0031's identity link.
- **Read the staging database directly and bypass the export contract.** Rejected: it gives M5 `R8`
  nothing reusable and leaves the public export lossy.
- **Copy the whole database with `pg_dump`.** Rejected: it cannot carry Supabase auth identities, and it
  bypasses the application's geometry and reference handling.
