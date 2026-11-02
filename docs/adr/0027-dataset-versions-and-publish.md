# ADR-0027: Dataset versions, proposals and publish — snapshots with a pointer (DECIDED)

- **Status**: DECIDED — implementation not started; depends on ADR-0020's version stamp (M2c)
- **Date**: 2026-10-30
- **Supersedes**: ADR-0020's non-goal "no server-side revision history, rollback or time travel". Its
  decisions 1–7 stand unchanged. **Relates to**: ADR-0021 (code releases are a separate axis),
  ADR-0018 (one service, one origin), ADR-0019 (the `dataset:publish` Permission).

## Context

Two different things are called "version" in this repository, and neither covers the admin's need.

**ADR-0021 versions code**, not data: `dev` → staging, `main` → production, one Supabase project per
environment. Data written in the admin is live in that environment's database the moment it is saved.
There is no proposal, no review, no rollback and no record of what changed.

**ADR-0020 versions one Direction for conflict resolution.** Its version stamp answers "is this save
based on the state I read?" — nothing more. It deliberately rejected server-side revision history and
rollback, because a revision table was a larger surface than a two-editor conflict required.

That rejection was correct for conflicts and wrong for publishing. Today a plot is live on save, the
save path deletes and re-inserts every stop with fresh ids, and a bad change can only be undone by
another manual edit. The user's requirement — propose changes without disrupting a deployed service —
has no mechanism at all.

The dataset itself makes the mechanism cheap: one region, tens of routes, a few megabytes. Full
snapshots are simpler and safer than per-entity revisions, and rollback becomes a pointer flip.

## Decision

1. **Four terms, four meanings.**
   - **Working Set** — the mutable tables the admin edits. Never read by commuters.
   - **Proposal** — an immutable snapshot offered for review. Never read by commuters.
   - **Dataset Version** — an immutable snapshot that has passed validation. Addressable by id.
   - **Published Dataset** — a per-environment pointer to the Dataset Version that readers use.

2. **A Dataset Version is a whole-dataset snapshot**, not a diff: routes, directions, stops, waypoints,
   detours, restrictions, fare configurations, the Service Area (ADR-0026), and the stable ids they
   reference. It records its parent, author, note, checksum and creation time. Versions are append-only;
   "delete" is recorded inside a snapshot as a tombstone, never as the destruction of history.

3. **Publish is one transaction: validate, then move the pointer.** Readers resolve the
   `published_dataset` row and see either the old version or the new one, never a mixture. Nothing is
   copied on publish, so it is O(1) and cannot half-succeed. The snapshot is taken **before** it is
   validated, never validated in the Working Set and copied afterwards, so a concurrent edit can never
   enter a version that was not checked with it.

4. **Rollback is publishing an older Dataset Version.** No special path, no restore tooling, no data
   copy. The same Permission and the same audit record apply.

5. **The publish gate is explicit and enumerated.** A Dataset Version may be published only when every
   check passes:
   - every stop lies inside the Service Area; every direction stays within its tolerance (ADR-0026);
   - every direction has at least two stops and a polyline that covers them;
   - every base direction has its derived return (ADR-0011), or a return that was edited after
     derivation;
   - every `manual` segment carries a reason and is visible in review (ADR-0028);
   - fare configurations resolve, and exactly one default remains;
   - no detour or restriction points at a missing or inactive entity;
   - every referenced stop has a stable id.

6. **Publishing is a Permission, not a Role.** `dataset:publish` is granted through ADR-0019's model and
   is distinct from editing. Publishing requires an explicit confirmation and a note. A second-person
   approval rule is deliberately not required initially; the model supports adding it without changing
   the snapshot design.

7. **Data publish and code Release stay separate.** ADR-0021 continues to govern code. A Dataset Version
   may be published to staging while production stays on the previous one, which is exactly the
   "propose without disrupting" property. Neither action triggers the other.

8. **Readers only ever see the Published Dataset.** The mobile app, the future navigation service and
   the export endpoint resolve through the pointer. Every response carries its `dataset_version`; the
   mobile app pins the version for a navigation session and refreshes between sessions; the routing
   graph is built and cached per Dataset Version, not mutated in place.

9. **Stable stop ids are a prerequisite (ADR-0031).** The current save path regenerates stop ids, so
   every publish would look like "all stops deleted and recreated" and every diff would be unreadable.
   Stop identity is fixed before version review is built.

10. **ADR-0020 still owns editing conflicts.** Its version stamp, three-way merge and "the polyline is
    never merged" rules remain. A Proposal whose parent is no longer published is refused with the same
    409 discipline, but a Proposal is not a conflict resolution mechanism and does not replace one.

## Alternatives considered

- **Per-direction revisions grouped into change sets.** The right shape for auditing one entity across
  many small edits; rejected as the publish unit because it needs a materialisation step to answer
  "what is served right now", and that step can half-fail. Whole-dataset snapshots make the read path
  trivial at a size where the storage cost is irrelevant.
- **Git-backed data (commits, branches, merges).** Rejected: it brings a DAG, merge semantics and
  developer vocabulary to a plotter's interface, and ADR-0020 already refuses geometry merging. The
  only capability needed is "offer this, then promote or revert".
- **A `draft` boolean on rows.** Rejected: it cannot express two simultaneous proposals, has no
  parentage, no diff and no rollback, and it would let a reader see a half-edited entity.
- **Publish by copying rows into a separate schema.** Workable, but it doubles the migration surface
  and makes rollback a second copy. The pointer achieves isolation with one row.
- **Event sourcing the whole dataset.** Rejected: overkill for this size, and it makes every read a
  projection instead of a query.

## Consequences

- **Positive**: a Proposal cannot affect a live service; rollback is instant; "what changed, by whom,
  when" becomes answerable; the dataset export doubles as a backup artifact.
- **Positive**: staging can carry a candidate dataset while production serves the last good one, without
  a second deployment mechanism.
- **Trade-off**: snapshot storage grows with every publish. At this dataset size it is negligible, and
  pruning is a later, separate decision.
- **Trade-off**: a diff/review surface is real work, and it is the part that makes versioning useful
  rather than decorative.
- **Risk**: the Working Set can drift from the last published snapshot while a Proposals sits unreviewed.
  Review must diff against the Proposal's parent and say so.
- **Risk**: a validation rule that is too strict blocks a legitimate publish at the worst moment. Every
  rule needs a message that names the offending entity and a way to inspect it on the map.
- **Risk**: readers caching an old version. `dataset_version` in every response, and a documented
  invalidation on the mobile side, are part of the feature, not an optimisation.

## Non-goals (explicit)

- No real-time collaboration: no CRDT, no operational transform, no presence, no live cursors.
- No branching or merging of datasets. Proposals are linear; a Proposal based on a stale parent is
  refused, not merged.
- No per-field time travel or an event log of individual edits. Version granularity is the dataset.
- No multi-tenant or multi-region datasets (ADR-0010).
- No automatic publish on code Release; the two axes remain independent.
