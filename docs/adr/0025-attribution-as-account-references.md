# ADR-0025: Attribution — created_by and updated_by are Account references (DECIDED)

- **Status**: DECIDED
- **Date**: 2026-10-31
- **Refines**: **ADR-0019** (Roles and Accounts), whose consequences name attribution as the reason the
  dataset needs provenance. Implements the M2b deliverable "`created_by` / `updated_by` attribution on
  every entity".

## Context

M2a made the actor real: every request resolves an Account, and every mutation is authorized by a
Permission that Account holds. What the dataset still does not record is **who** performed the write. A
route plotted by three people is indistinguishable from one plotted by one, and "last updated" is a
timestamp with no author.

M2a's consequences call attribution the other half of the access model: Roles answer "who may change
this?", attribution answers "who did?". The milestone asks for it on every entity and its exit criterion
requires every route, direction, stop, detour and restriction to record a creator and a last writer.

Constraints:

- **Single tenant, single region** (ADR-0010). There is no per-resource ownership to model, and no
  multi-tenant join to worry about.
- **Accounts are deactivated, never deleted** (ADR-0019, M2b amendment). An Account reference is
  therefore durable in practice.
- **The server is the only writer.** The SPA is not a trust boundary, so the actor must come from the
  resolved guard identity, never from the request body.
- **The commuter export is a public contract.** Provenance is an admin-internal fact and must not leak
  into the dataset the mobile app consumes.

## Decision

1. **Seven entity tables gain `created_by` and `updated_by`.** `routes`, `directions`, `stops`,
   `detours`, `detour_stops`, `restrictions` and `fare_configs` each get two `uuid` columns referencing
   `admin_users(user_id)` with `ON DELETE SET NULL`. Roles and Accounts are not attributed: the Super
   Admin ownership property and the Audit-adjacent history of the access model are a different concern,
   and a second table of actors managing actors adds recursion without a consumer.
2. **Null means "not recorded".** Rows written before M2b keep both columns null and the UI reads them as
   "Not recorded". The migration does not backfill the owner: the database never observed those writes,
   and writing an actor it did not see would make the attribution field a guess. The M2b exit criterion
   is therefore stated for writes from M2b onward.
3. **The actor is stamped from the guard, never from input.** A shared write helper takes the resolved
   Account id; create sets both columns, update sets `updated_by` and leaves `created_by` alone.
4. **A direction save stamps what it writes.** The atomic plotted save writes the direction and its stop
   list in one transaction, so it stamps the direction and every stop row it writes. It does not touch
   the parent route's `updated_by` unless the route's own fields changed — editing a direction is not an
   edit of the Route entity.
5. **Responses carry `{ userId, name } | null`.** Names are resolved through the identity lookup the
   Accounts surface already uses, rather than joined per entity query. The wire never carries an email
   for attribution; the Accounts surface is where an identity is inspected in full.
6. **Attribution is not exported.** The dataset assembler and its schema keep their current shape. The
   commuter app has no use for it, and a field added to the export becomes a compatibility promise.

## Alternatives considered

- **Snapshot the actor's name and email on each row.** Survives any future deletion and shows who it was
  at the time, but duplicates identity across every row and turns a rename into a historical fork. Kept
  as a fallback if Accounts ever become deletable.
- **Reference plus snapshot.** Most faithful, but two sources of truth for one fact and double the write
  path, for a system whose Accounts are never removed.
- **A separate append-only audit log of every mutation.** Answers "who changed what, when, from what",
  which is a different and much larger product. Attribution is the last-writer summary, not history.
- **Backfill existing rows to the Super Admin.** Makes the seeded dataset look fully attributed, at the
  cost of asserting a fact the system did not record. Rejected: the honest reading is more useful than a
  complete-looking table.

## Consequences

- **Positive**: every write from M2b on has an author; the workspace can show provenance beside the
  values a reviewer is already looking at; deleting or deactivating an Account never orphans a row.
- **Trade-off**: displaying a name costs one identity lookup per response, and a missing identity
  (an auth user that no longer exists) degrades to the id rather than failing the request.
- **Risk**: `ON DELETE SET NULL` means a hard-deleted identity erases its attribution. That is accepted
  because the dashboard does not delete Accounts; if deletion ever ships, this decision is revisited
  with the snapshot alternative above.
- **Risk**: attribution is a claim about the actor, not about the content. It does not prove a route was
  plotted correctly, and must not be presented as review or approval.

## Non-goals (explicit)

- No per-field history, diffs, or "who changed this field".
- No audit of reads, exports, sign-ins or authorization failures beyond the existing Security Event log.
- No attribution on Roles or Accounts.
- No attribution in the commuter export dataset or the navigation contract.
- No backfill of rows that predate the columns.
