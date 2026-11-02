import type { GeoLineString } from "@komyuter/shared";

/**
 * Three-way merge for a plotted Direction (ADR-0020 §3–5, ticket #54).
 *
 * Inputs are **base** (the snapshot the Draft was loaded from), **mine** (the
 * Draft) and **theirs** (the server's current state). A conflict exists
 * precisely because the base is stale and the client is holding it, so the
 * merge needs no server-side history.
 *
 * The merge unit is an ordered, id-carrying **anchor**: a Stop today, a
 * Waypoint once ADR-0028 lands. Adding a `via` kind is additive — the rules
 * never look at a kind.
 *
 * Two rules are absolute:
 * - the **polyline is never merged** — the outcome carries both sides and the
 *   plotter takes one;
 * - an **order conflict is never auto-resolved**.
 *
 * This module is pure: no React, no storage, no network.
 */

export type AnchorKind = "stop" | "via";

export interface MergeAnchor {
  id: string;
  kind: AnchorKind;
  /** The mergeable content of the anchor (name, type, coordinates, …). */
  fields: Record<string, unknown>;
  /** Who last wrote this side (ADR-0025 attribution). Never merged — it is
   *  context for the plotter, not content. */
  updatedBy?: string | null;
}

export interface MergePolyline {
  mine: GeoLineString | null;
  theirs: GeoLineString | null;
}

export interface MergeSnapshot {
  anchors: MergeAnchor[];
  /** Route-level descriptive fields (name, short name, colour, …). */
  meta?: Record<string, unknown> | null;
}

export type MergeConflict =
  | {
      kind: "field";
      id: string;
      anchorId: string;
      field: string;
      base: unknown;
      mine: unknown;
      theirs: unknown;
      /** The Account ids that wrote each side, when known. */
      mineBy?: string | null;
      theirsBy?: string | null;
    }
  | {
      kind: "delete-modify";
      id: string;
      anchorId: string;
      /** Which side deleted the anchor; the other side modified it. */
      deletedBy: "mine" | "theirs";
      surviving: MergeAnchor;
    }
  | {
      kind: "order";
      id: string;
      order: { mine: string[]; theirs: string[] };
    };

export interface MergeOutcome {
  /** Mine-preferred anchors; `resolveMerge` applies the plotter's choices. */
  anchors: MergeAnchor[];
  /** Mine-preferred Route metadata; `resolveMeta` applies the choices. */
  meta: Record<string, unknown> | null;
  conflicts: MergeConflict[];
  polyline: MergePolyline;
}

export type MergeChoices = Record<string, "mine" | "theirs">;

function stable(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "undefined";
  }
  if (Array.isArray(value)) {
    return `[${value.map(stable).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>).sort(
    ([a], [b]) => a.localeCompare(b),
  );
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`).join(",")}}`;
}

export function sameValue(a: unknown, b: unknown): boolean {
  return stable(a) === stable(b);
}

function sameAnchor(a: MergeAnchor | undefined, b: MergeAnchor | undefined) {
  if (!a || !b) return a === b;
  return sameValue(a.fields, b.fields);
}

function conflict(
  kind: "field",
  anchorId: string,
  field: string,
  base: unknown,
  mine: unknown,
  theirs: unknown,
  mineBy?: string | null,
  theirsBy?: string | null,
): MergeConflict {
  return {
    kind,
    id: `field:${anchorId}:${field}`,
    anchorId,
    field,
    base,
    mine,
    theirs,
    mineBy,
    theirsBy,
  };
}

/** Field-by-field merge of two versions of one anchor. */
function mergeFields(
  anchorId: string,
  base: MergeAnchor | undefined,
  mine: MergeAnchor,
  theirs: MergeAnchor,
  conflicts: MergeConflict[],
): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  const names = new Set([
    ...Object.keys(mine.fields),
    ...Object.keys(theirs.fields),
    ...Object.keys(base?.fields ?? {}),
  ]);

  for (const field of names) {
    const b = base?.fields[field];
    const m = mine.fields[field];
    const t = theirs.fields[field];

    if (sameValue(m, t)) {
      fields[field] = m;
      continue;
    }
    if (!base) {
      // Both sides added the anchor: a field only one side carries is not a
      // disagreement.
      if (m === undefined) {
        fields[field] = t;
        continue;
      }
      if (t === undefined) {
        fields[field] = m;
        continue;
      }
    }
    if (base && sameValue(m, b)) {
      fields[field] = t;
      continue;
    }
    if (base && sameValue(t, b)) {
      fields[field] = m;
      continue;
    }
    // Both sides changed this field differently (or both added it differently).
    fields[field] = m;
    conflicts.push(
      conflict(
        "field",
        anchorId,
        field,
        b,
        m,
        t,
        mine.updatedBy ?? null,
        theirs.updatedBy ?? null,
      ),
    );
  }

  return fields;
}

/** Whether any pair of surviving anchors is ordered differently. */
function orderDisagrees(mine: string[], theirs: string[]): boolean {
  const shared = new Set(mine.filter((id) => theirs.includes(id)));
  const mineOrder = mine.filter((id) => shared.has(id));
  const theirsOrder = theirs.filter((id) => shared.has(id));
  for (let i = 0; i < mineOrder.length; i++) {
    if (mineOrder[i] !== theirsOrder[i]) return true;
  }
  return false;
}

/**
 * Merges the three snapshots. `mine` decides ties and the resulting order;
 * every genuine disagreement is reported in `conflicts` and applied later by
 * `resolveMerge`.
 */
export function mergeSnapshots(
  base: MergeSnapshot,
  mine: MergeSnapshot,
  theirs: MergeSnapshot,
  polyline: MergePolyline,
): MergeOutcome {
  const baseById = new Map(base.anchors.map((a) => [a.id, a]));
  const mineById = new Map(mine.anchors.map((a) => [a.id, a]));
  const theirsById = new Map(theirs.anchors.map((a) => [a.id, a]));
  const ids = new Set([
    ...baseById.keys(),
    ...mineById.keys(),
    ...theirsById.keys(),
  ]);

  const conflicts: MergeConflict[] = [];
  const merged = new Map<string, MergeAnchor>();

  for (const id of ids) {
    const b = baseById.get(id);
    const m = mineById.get(id);
    const t = theirsById.get(id);

    if (m && t) {
      const fields = sameAnchor(m, t)
        ? m.fields
        : mergeFields(id, b, m, t, conflicts);
      merged.set(id, { ...m, fields });
      continue;
    }

    if (m && !t) {
      // Theirs deleted it. Untouched on my side means the deletion stands.
      if (!b) {
        merged.set(id, m);
        continue;
      }
      if (sameAnchor(b, m)) continue;
      conflicts.push({
        kind: "delete-modify",
        id: `delete:${id}`,
        anchorId: id,
        deletedBy: "theirs",
        surviving: m,
      });
      merged.set(id, m);
      continue;
    }

    if (!m && t) {
      // I deleted it. Untouched on their side means the deletion stands.
      if (!b) {
        merged.set(id, t);
        continue;
      }
      if (sameAnchor(b, t)) continue;
      conflicts.push({
        kind: "delete-modify",
        id: `delete:${id}`,
        anchorId: id,
        deletedBy: "mine",
        surviving: t,
      });
      merged.set(id, t);
      continue;
    }

    // Deleted on both sides — drop it (unless they added the same id and one
    // side removed it; then it is simply gone).
  }

  const mineOrder = mine.anchors
    .map((a) => a.id)
    .filter((id) => merged.has(id));
  const theirsOrder = theirs.anchors
    .map((a) => a.id)
    .filter((id) => merged.has(id));

  // Anchors only theirs carries are inserted after their nearest predecessor
  // that mine also knows, so nothing is dropped by using mine's order.
  const order = [...mineOrder];
  for (let index = 0; index < theirsOrder.length; index++) {
    const id = theirsOrder[index];
    if (order.includes(id)) continue;
    let at = 0;
    for (let back = index - 1; back >= 0; back--) {
      const found = order.indexOf(theirsOrder[back]);
      if (found >= 0) {
        at = found + 1;
        break;
      }
    }
    order.splice(at, 0, id);
  }

  // Anchors both carry that disagree are an order conflict the plotter must
  // settle; the merged order defaults to mine's.
  const anchors = order.map((id) => merged.get(id) as MergeAnchor);
  if (orderDisagrees(mineOrder, theirsOrder)) {
    conflicts.push({
      kind: "order",
      id: "order",
      order: { mine: mineOrder, theirs: theirsOrder },
    });
  }

  const meta = mergeMetaFields(base.meta, mine.meta, theirs.meta, conflicts);

  return {
    anchors,
    meta,
    conflicts,
    polyline: {
      mine: polyline.mine,
      theirs: polyline.theirs,
    },
  };
}

/** The chosen sequence, plus the other side's extras at their relative place —
 *  an order decision must not discard a stop the other side added. */
function orderWithExtras(chosen: string[], other: string[]): string[] {
  const order = [...chosen];
  for (let index = 0; index < other.length; index++) {
    const id = other[index];
    if (order.includes(id)) continue;
    let at = 0;
    for (let back = index - 1; back >= 0; back--) {
      const found = order.indexOf(other[back]);
      if (found >= 0) {
        at = found + 1;
        break;
      }
    }
    order.splice(at, 0, id);
  }
  return order;
}

/**
 * Applies the plotter's choices. Every conflict must be answered; an unanswered
 * conflict keeps the mine-preferred merge (never an invented answer).
 */
export function resolveMerge(
  outcome: MergeOutcome,
  choices: MergeChoices,
): MergeAnchor[] {
  // Clone so resolving twice from the same outcome cannot leak one choice into
  // the other.
  const byId = new Map(
    outcome.anchors.map((anchor) => [
      anchor.id,
      { ...anchor, fields: { ...anchor.fields } },
    ]),
  );
  let order: string[] | null = null;

  for (const conflict of outcome.conflicts) {
    const choice = choices[conflict.id] ?? "mine";

    if (conflict.kind === "field") {
      const anchor = byId.get(conflict.anchorId);
      if (anchor) {
        anchor.fields = {
          ...anchor.fields,
          [conflict.field]:
            choice === "theirs" ? conflict.theirs : conflict.mine,
        };
      }
      continue;
    }

    if (conflict.kind === "delete-modify") {
      // The chosen side is the side that kept the anchor; the other deleted it.
      const keep =
        choice === "theirs"
          ? conflict.deletedBy === "mine"
          : conflict.deletedBy === "theirs";
      if (keep) {
        byId.set(conflict.anchorId, conflict.surviving);
      } else {
        byId.delete(conflict.anchorId);
      }
      continue;
    }

    order =
      choice === "theirs"
        ? orderWithExtras(conflict.order.theirs, conflict.order.mine)
        : orderWithExtras(conflict.order.mine, conflict.order.theirs);
  }

  const ids = order ?? outcome.anchors.map((a) => a.id);
  return ids
    .map((id) => byId.get(id))
    .filter((anchor): anchor is MergeAnchor => anchor !== undefined);
}

/** Route metadata merges field by field, the same way an anchor does. */
function mergeMetaFields(
  base: Record<string, unknown> | null | undefined,
  mine: Record<string, unknown> | null | undefined,
  theirs: Record<string, unknown> | null | undefined,
  conflicts: MergeConflict[],
): Record<string, unknown> | null {
  if (!mine && !theirs) return null;
  const pseudo = (fields: Record<string, unknown> | null | undefined) => ({
    id: "__meta__",
    kind: "stop" as const,
    fields: fields ?? {},
  });
  return mergeFields(
    "__meta__",
    base ? pseudo(base) : undefined,
    pseudo(mine),
    pseudo(theirs),
    conflicts,
  );
}

export function resolveMeta(
  outcome: MergeOutcome,
  choices: MergeChoices,
): Record<string, unknown> | null {
  if (!outcome.meta) return null;
  const meta = { ...outcome.meta };
  for (const conflict of outcome.conflicts) {
    if (conflict.kind !== "field" || conflict.anchorId !== "__meta__") continue;
    meta[conflict.field] =
      (choices[conflict.id] ?? "mine") === "theirs"
        ? conflict.theirs
        : conflict.mine;
  }
  return meta;
}

/** Choices already made that still apply to a fresh set of conflicts. */
export function carryChoices(
  conflicts: readonly MergeConflict[],
  previous: MergeChoices,
): MergeChoices {
  const carried: MergeChoices = {};
  for (const conflict of conflicts) {
    const choice = previous[conflict.id];
    if (choice) carried[conflict.id] = choice;
  }
  return carried;
}

/** The polyline is never merged: the plotter takes one side (ADR-0020 §5). */
export function takePolyline(
  outcome: MergeOutcome,
  side: "mine" | "theirs",
): GeoLineString | null {
  return side === "theirs" ? outcome.polyline.theirs : outcome.polyline.mine;
}
