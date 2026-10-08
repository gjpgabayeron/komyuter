# ADR-0020: Concurrent-plotting safety — version stamp, three-way merge, polyline never merged (DECIDED)

- **Status**: DECIDED — the direction is agreed and recorded; implementation is milestone **M2c**
- **Date**: 2026-10-08
- **Supersedes/refines**: makes real the conflict machinery built in `specs/008-admin-route-workspace-refactor/`
  (the conflict plate and `LoadLatestDialog`), corrects the claim in `apps/admin/src/features/routes/routeCache.ts`
  that a save-time 409 guards write-write conflicts, and revises the single-slot **Draft** of
  `docs/CONTEXT.md`. Depends on ADR-0019, which is what makes several plotters possible.

## Context

The save path is a blind overwrite, and the interface says otherwise.

- `apps/server/src/api/directions.ts` updates the base direction with
  `.set({ label, base_polyline, direction_kind }).where(eq(direction_id, baseId))` — **no version
  precondition** — then `delete(stops).where(direction_id = baseId)` and re-inserts every stop with a
  freshly generated `uuidId("stop")`. `apps/server/src/api/routes.ts` has the same shape: it selects the
  row only to prove it exists, then updates unconditionally.
- The only 409 responses reachable on that path are **structural guards**, not concurrency checks:
  "Route … already has two active directions" (`directions.ts`), "Stop … is referenced as a direction
  terminal" (`domain/validation.ts`), and "Route … already exists" on create (`routes.ts`).
- The client nevertheless claims a concurrency check. `RouteWorkspaceProvider.tsx` reports
  "_Another Administrator edited this route. Your work is still here — reload to see the latest, or
  adjust and save again._" on any `CONFLICT`, and `LoadLatestDialog` offers to discard local edits in
  favour of the server's version. The message describes a capability the server does not have.
- Drafts are single-slot: "editing a second route overwrites the first draft" (`docs/ADMIN.md` §11).
- Because stop ids are regenerated on every save, anything the client remembers about a stop's identity
  is invalidated by a save.

This was tolerable while one person plotted. It stops being tolerable at M2a, when the milestone plan
deliberately enables several people to grow the seed dataset — and that dataset is itself the
deliverable of this phase, so its loss is both silent and unrecoverable.

## Decision

1. **Optimistic concurrency via a version stamp.** The route and direction save path carries the version
   the client read; a save whose base is stale is refused with `409`. Writes become "this exact
   predecessor, or nothing".
2. **The conflict copy must be true.** With a real precondition, the existing message and conflict plate
   describe what the server enforces. If any part of that wording overstates the check, the wording
   changes — the UI never claims a guarantee the server does not provide.
3. **Three-way merge, performed on the client.** Inputs are **base** (the snapshot the draft was loaded
   from), **mine** (the draft) and **theirs** (the server's current state). No server-side history is
   required: a conflict exists precisely because the base is stale, and the client is holding that base.
4. **Stop lists and metadata merge semantically.** Stops and their properties merge as sets and
   sequences; a conflicting **order** is surfaced and resolved by the plotter, never auto-resolved.
   Metadata conflicts resolve field by field.
5. **The polyline is never merged.** On a polyline conflict the plotter takes one side, and the
   workspace re-snaps only on request. Two independently snapped polylines have no meaningful merge —
   there is no geometry algebra that yields "the correct" combined path — and a plausible-looking
   invention silently corrupts route geometry, which is the same failure mode `docs/ADMIN.md` §11
   already warns about for the straight-line fallback.
6. **Drafts become per-user.** Each plotter gets their own draft storage, so two people on two routes
   cannot overwrite each other's work.
7. **A resolution is attributed.** The merged write is recorded against the Account that resolved it
   (using M2b's `updated_by`), so both contributors stay visible in the record.

## Alternatives considered

- **Two-way only** — keep-mine or take-theirs, which the existing plate and `LoadLatestDialog` already
  implement. Rejected: it forces a plotter to choose between losing their work and discarding someone
  else's, when the information needed to keep both is already present.
- **Server-side revision history** (a `direction_revisions` table holding geometry snapshots). This is
  the right shape for rollback, audit and merging across more than two divergent editors, and was
  rejected _for this decision only_: because the version stamp bounds divergence to one step at a time,
  the client's draft is always a valid ancestor, so a revisions table would be a larger surface than the
  conflict requires. Rollback and audit stay open as a separate future decision.
- **Advisory locking** — a lease on a Direction, visible in the UI. Rejected: it prevents collisions
  rather than resolving them, it needs stale-lease handling for a plotter who simply closes a tab, and it
  blocks the case that actually matters here — two people deliberately working on one Direction — rather
  than enabling it.
- **Deferring, and accepting last-write-wins for the seed-data phase.** Rejected: the seed dataset is the
  deliverable, and a lost plotting session leaves no trace.

## Consequences

- **Positive**: the interface stops overstating what it guarantees; a groupmate's session work survives a
  collision; and the polyline stays exact rather than merely plausible.
- **Trade-off**: a resolver surface and a version column are real work, and every mutating save path must
  send its base version. Per-user drafts also mean a single plotter can accumulate several drafts, so the
  single-slot restore banner has to become a list.
- **Risk**: a naive merge of the stop list can produce a plausible but **wrong stop order**. Order
  conflicts must be surfaced, never auto-resolved.
- **Risk**: the version stamp only helps if every mutating endpoint participates. One forgotten path
  silently returns to last-write-wins, so the check belongs in the shared save helper rather than being
  repeated per route.
- **Risk**: the resolver must cope with an entity that no longer exists — deleting a Stop another
  plotter is renaming is a legitimate conflict shape — so it must work on ids, never on positions.

## Non-goals (explicit)

- No server-side revision history, rollback or time travel.
- No real-time collaborative editing: no CRDT or operational transform, no live cursors, no presence.
- No geometry merging of any kind, for polylines or for detour loops.
- No change to the snapping proxy, and no change to the `[lng, lat]` rule (ADR-0013).
- No offline write queue: drafts stay client-local and are never sent to the server.
