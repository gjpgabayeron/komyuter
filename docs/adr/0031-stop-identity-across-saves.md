# ADR-0031: Stop identity survives a save — upsert instead of replace (DECIDED)

- **Status**: DECIDED — implementation in milestone **M2c**
- **Date**: 2026-11-01
- **Refines**: ADR-0020 (its three-way merge works on ids, which today's save path destroys).
  **Unblocks**: ADR-0027 §9 (stable ids in a Dataset Version), ADR-0028 §10 (Stop Waypoints reference
  stops). **Relates to**: ADR-0011 (the return is derived), ADR-0025 (attribution).

## Context

The plotted save (`persistPlottedPair`) is a wholesale replace: it deletes every stop row of the
direction and re-inserts them with fresh `uuidId("stop")` values. Five consequences follow, and four of
them already block decided work.

- **A three-way merge cannot work.** ADR-0020 requires the resolver to work on ids and never on
  positions; after one save, the ids the draft remembers belong to rows that no longer exist.
- **Attribution is erased.** `createAttribution` stamps `created_by` on every insert, so each save
  reassigns "who added this stop" to whoever saved last — contradicting ADR-0025's rule that the
  creator is written once.
- **Version review would be unreadable.** Every publish diff would show every stop of every direction
  deleted and recreated on every save (ADR-0027 §9 names this as a prerequisite).
- **Waypoints would break.** ADR-0028's Stop Waypoints reference stops by id; regenerating the ids
  breaks the list the waypoint model exists to preserve (§10).
- **Terminal references churn.** `directions.origin_stop_id` / `destination_stop_id` point at rows that
  are replaced on every save, so the exported ids are unstable even when the route did not change.

The same is true of the derived return direction, which is rewritten from the base on every save
(ADR-0011).

## Decision

1. **A stop id is stable for the life of the stop.** The save payload carries an optional `stop_id` per
   stop. A stop the client has seen from the server sends its id; a stop the client has never saved
   omits it.

2. **The save upserts, scoped to the direction.** For each stop in the payload: update the row where
   `stop_id = ? AND direction_id = ?`; insert the rest; then delete the direction's rows whose ids are
   absent from the payload. `stop_order` still comes from array position.

3. **An id in the payload is honoured only when it can be.** An id matching a row of another direction
   is refused. An id matching nothing is treated as a new stop: the server names it and returns that
   id, so a draft that predates stable ids still saves once and adopts names afterwards. Nothing is
   silently reassigned across directions.

4. **The derived return is matched by derivation, not by position.** `stops.derived_from_stop_id`
   (nullable; `NULL` on base stops) records which base stop a return stop mirrors. On save the
   return's rows are matched through that link, updated in place, and only genuinely new base stops
   produce new return rows. Index matching is refused: inserting one stop in the middle of the base
   list would re-pair every row after it.

5. **Attribution follows what was written.** `created_by` is set on insert and never touched again;
   `updated_by` moves only on a row the save actually changed. A row sent back unchanged keeps both
   columns as they were.

6. **No client-chosen ids as authority.** The client may only echo ids the server issued; new rows are
   always named by the server, and the response returns every id so the client can adopt them.

## Alternatives considered

- **Keep the wholesale replace.** Rejected: it is the defect three decided ADRs depend on removing.
- **Merge on a content key** (normalized name plus coordinate proximity). Rejected: a rename looks like
  a delete plus an add, and a nudge looks like a move — precisely the plausible-but-wrong merge
  ADR-0020 forbids.
- **Match the return by mirrored index.** Rejected: no schema change, but one insertion re-pairs every
  row after it, which is a silent identity swap — the failure mode this ADR exists to prevent.
- **Let the client mint the canonical ids.** Rejected: ids would be client-controlled across Accounts
  and clients, and an accidental reuse becomes a cross-direction collision the server cannot tell from
  a forgery.
- **Soft-delete stops instead of removing them.** Rejected for now: `is_active` exists on stops, but an
  inactive row still occupies its order and the list; deletion is the honest representation of "this
  stop is gone", and a published snapshot keeps the history.

## Consequences

- **Positive**: ADR-0020's resolver can work on ids; ADR-0027's diff shows real changes; ADR-0028's
  Stop Waypoints can reference stable rows; per-stop authorship becomes truthful.
- **Positive**: terminal references stabilize, so exports and the mobile dataset stop churning.
- **Trade-off**: the save path grows a diff — one lookup plus update/insert/delete per stop — inside the
  existing transaction. It is a contained change to one function and the payload schema.
- **Trade-off**: one nullable column on `stops`. No data migration is needed: `NULL` already means
  "base stop", and return rows created before this ADR simply acquire their link on their next save.
- **Risk**: a client that sends an id it never received can collide a row. Mitigation: ids are honoured
  only when scoped to the direction, and a cross-direction id is refused.
- **Risk**: the merge's delete/modify conflict shape depends on ids surviving, which is only true from
  the first save after this lands.

## Non-goals (explicit)

- No stable ids for `detour_stops` in M2c; their save path keeps its current lifecycle (ADR-0020's
  scope decision).
- No client-minted ids, no id recycling, no soft-delete of stops.
- No change to `stop_order` derivation, to the `[lng, lat]` rule (ADR-0013), or to the derived return's
  geometry.
