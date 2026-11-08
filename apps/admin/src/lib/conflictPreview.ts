import type { GeoLineString } from "@komyuter/shared";
import {
  sameValue,
  type MergeAnchor,
  type MergeChoices,
  type MergeConflict,
  type MergeOutcome,
  type MergeSnapshot,
} from "./merge";

/**
 * The map preview of a Save Conflict (ADR-0020 §"Conflict preview").
 *
 * Pure: it turns the three snapshots and the merge outcome into what the map
 * should draw — paired markers for a Conflicting Stop, ghosts for a stop one
 * side deleted, order positions, and the two polylines. Nothing here is part
 * of the Draft or the save; closing the resolver throws it away.
 */

export type PreviewSide = "mine" | "theirs";
export type PreviewKind = "changed" | "common" | "removed";

export interface PreviewStop {
  id: string;
  side: PreviewSide;
  /** changed = the two sides differ; removed = ghost where one side deleted it. */
  kind: PreviewKind;
  name: string;
  location: [number, number];
  /** 1-based position in its own side's sequence. */
  order: number;
  /** Position on the other side, when the stop exists there too. */
  otherOrder: number | null;
  /** Part of an order conflict — draw the position badge. */
  orderConflict: boolean;
}

export interface ConflictPreview {
  stops: PreviewStop[];
  conflictIds: string[];
  minePolyline: GeoLineString | null;
  theirsPolyline: GeoLineString | null;
  bounds: [[number, number], [number, number]] | null;
}

function locationOf(anchor: MergeAnchor): [number, number] {
  const value = anchor.fields.location;
  if (Array.isArray(value) && value.length >= 2) {
    return [Number(value[0]), Number(value[1])];
  }
  return [0, 0];
}

function nameOf(anchor: MergeAnchor): string {
  const name = anchor.fields.name;
  return typeof name === "string" && name.length > 0 ? name : "Stop";
}

/** The ids a conflict is about (meta and order excepted). */
export function conflictStopIds(outcome: MergeOutcome): string[] {
  const ids = new Set<string>();
  for (const conflict of outcome.conflicts) {
    if (conflict.kind === "field" && conflict.anchorId !== "__meta__") {
      ids.add(conflict.anchorId);
    } else if (conflict.kind === "delete-modify") {
      ids.add(conflict.anchorId);
    }
  }
  return [...ids];
}

function orderConflictIds(outcome: MergeOutcome): Set<string> {
  const ids = new Set<string>();
  for (const conflict of outcome.conflicts) {
    if (conflict.kind === "order") {
      for (const id of [...conflict.order.mine, ...conflict.order.theirs]) {
        ids.add(id);
      }
    }
  }
  return ids;
}

export function buildConflictPreview(
  outcome: MergeOutcome,
  mine: readonly MergeAnchor[],
  theirs: readonly MergeAnchor[],
  minePolyline: GeoLineString | null,
  theirsPolyline: GeoLineString | null,
): ConflictPreview {
  const mineById = new Map(mine.map((anchor) => [anchor.id, anchor]));
  const theirsById = new Map(theirs.map((anchor) => [anchor.id, anchor]));
  const mineOrder = new Map(
    mine.map((anchor, index) => [anchor.id, index + 1]),
  );
  const theirsOrder = new Map(
    theirs.map((anchor, index) => [anchor.id, index + 1]),
  );
  const orderIds = orderConflictIds(outcome);
  const conflictIds = conflictStopIds(outcome);

  const stops: PreviewStop[] = [];
  const push = (
    side: PreviewSide,
    anchor: MergeAnchor | undefined,
    order: number | null,
    otherOrder: number | null,
    kind: PreviewKind,
    fallback?: MergeAnchor,
  ) => {
    const subject = anchor ?? fallback;
    if (!subject) return;
    stops.push({
      id: subject.id,
      side,
      kind,
      name: nameOf(subject),
      location: locationOf(anchor ?? fallback!),
      order: order ?? 0,
      otherOrder,
      orderConflict: orderIds.has(subject.id),
    });
  };

  for (const id of conflictIds) {
    const m = mineById.get(id);
    const t = theirsById.get(id);
    if (m && t) {
      const changed = !sameValue(m.fields, t.fields);
      push(
        "mine",
        m,
        mineOrder.get(id) ?? null,
        theirsOrder.get(id) ?? null,
        changed ? "changed" : "common",
      );
      push(
        "theirs",
        t,
        theirsOrder.get(id) ?? null,
        mineOrder.get(id) ?? null,
        changed ? "changed" : "common",
      );
    } else if (m) {
      // Theirs deleted it; the ghost sits where the stop still is on my side.
      push("mine", m, mineOrder.get(id) ?? null, null, "changed");
      push("theirs", undefined, null, mineOrder.get(id) ?? null, "removed", m);
    } else if (t) {
      push("theirs", t, theirsOrder.get(id) ?? null, null, "changed");
      push("mine", undefined, null, theirsOrder.get(id) ?? null, "removed", t);
    }
  }

  // Order-conflicted stops that are not otherwise field-conflicted still need
  // their positions shown, so the sequence disagreement is legible.
  for (const id of orderIds) {
    if (stops.some((stop) => stop.id === id)) continue;
    const m = mineById.get(id);
    const t = theirsById.get(id);
    push(
      "mine",
      m,
      mineOrder.get(id) ?? null,
      theirsOrder.get(id) ?? null,
      "common",
    );
    push(
      "theirs",
      t,
      theirsOrder.get(id) ?? null,
      mineOrder.get(id) ?? null,
      "common",
    );
  }

  const longs = stops.map((stop) => stop.location[0]);
  const lats = stops.map((stop) => stop.location[1]);
  const bounds: ConflictPreview["bounds"] =
    stops.length === 0
      ? null
      : [
          [Math.min(...longs) - 0.003, Math.min(...lats) - 0.003],
          [Math.max(...longs) + 0.003, Math.max(...lats) + 0.003],
        ];

  return {
    stops,
    conflictIds: [...new Set([...conflictIds, ...orderIds])].sort(),
    minePolyline,
    theirsPolyline,
    bounds,
  };
}

export interface MergeSummary {
  added: number;
  removed: number;
  moved: number;
  renamed: number;
  retyped: number;
  routeFields: number;
  total: number;
}

/** What the whole save changed, across both sides. Feeds the sheet's summary. */
export function summarizeMerge(
  base: MergeSnapshot,
  mine: MergeSnapshot,
  theirs: MergeSnapshot,
): MergeSummary {
  const baseById = new Map(base.anchors.map((anchor) => [anchor.id, anchor]));
  const mineById = new Map(mine.anchors.map((anchor) => [anchor.id, anchor]));
  const theirsById = new Map(
    theirs.anchors.map((anchor) => [anchor.id, anchor]),
  );
  const ids = new Set([
    ...baseById.keys(),
    ...mineById.keys(),
    ...theirsById.keys(),
  ]);

  const summary: MergeSummary = {
    added: 0,
    removed: 0,
    moved: 0,
    renamed: 0,
    retyped: 0,
    routeFields: 0,
    total: 0,
  };

  for (const id of ids) {
    const b = baseById.get(id);
    const m = mineById.get(id);
    const t = theirsById.get(id);

    if (!b && (m || t)) {
      summary.added += 1;
      continue;
    }
    if (b && !m && !t) {
      summary.removed += 1;
      continue;
    }
    if (b && (!m || !t)) {
      // Deleted by one side. The deletion stands only when the surviving side
      // is untouched; a delete-versus-edit is a conflict, not a removal.
      const survivor = m ?? t;
      if (survivor && sameValue(survivor.fields, b.fields))
        summary.removed += 1;
      continue;
    }
    if (b && m && t) {
      if (
        !sameValue(m.fields.location, b.fields.location) ||
        !sameValue(t.fields.location, b.fields.location)
      ) {
        summary.moved += 1;
      }
      if (
        !sameValue(m.fields.name, b.fields.name) ||
        !sameValue(t.fields.name, b.fields.name)
      ) {
        summary.renamed += 1;
      }
      if (
        !sameValue(m.fields.type, b.fields.type) ||
        !sameValue(t.fields.type, b.fields.type)
      ) {
        summary.retyped += 1;
      }
    }
  }

  const metaKeys = new Set([
    ...Object.keys(base.meta ?? {}),
    ...Object.keys(mine.meta ?? {}),
    ...Object.keys(theirs.meta ?? {}),
  ]);
  for (const key of metaKeys) {
    if (!sameValue((mine.meta ?? {})[key], (theirs.meta ?? {})[key])) {
      summary.routeFields += 1;
    }
  }

  summary.total =
    summary.added +
    summary.removed +
    summary.moved +
    summary.renamed +
    summary.retyped +
    summary.routeFields;
  return summary;
}

export interface ConflictGroup {
  anchorId: string;
  label: string;
  conflicts: MergeConflict[];
}
export interface ConflictGroups {
  stops: ConflictGroup[];
  meta: MergeConflict[];
  order: MergeConflict[];
}

function anchorName(outcome: MergeOutcome, anchorId: string): string {
  const anchor = outcome.anchors.find((candidate) => candidate.id === anchorId);
  return anchor ? nameOf(anchor) : "Stop";
}

export type EntryDecision = "mine" | "theirs" | "mixed" | null;

function entryConflicts(
  entry: ChangeEntry,
  conflicts: readonly MergeConflict[],
): MergeConflict[] {
  if (entry.kind === "stop") {
    return conflicts.filter(
      (conflict) =>
        conflict.kind !== "order" && conflict.anchorId === entry.key,
    );
  }
  if (entry.kind === "meta") {
    return conflicts.filter(
      (conflict) =>
        conflict.kind === "field" && conflict.anchorId === "__meta__",
    );
  }
  return conflicts.filter((conflict) => conflict.kind === "order");
}

/** Whether a list row is settled — the tick in the left column. */
export function entryDecided(
  entry: ChangeEntry,
  conflicts: readonly MergeConflict[],
  choices: MergeChoices,
): boolean {
  if (entry.state === "merged") return true;
  return entryConflicts(entry, conflicts).every((conflict) =>
    Boolean(choices[conflict.id]),
  );
}

/** Which side a settled row kept, for short "Decided · Mine" copy. */
export function entryDecision(
  entry: ChangeEntry,
  conflicts: readonly MergeConflict[],
  choices: MergeChoices,
): EntryDecision {
  const sides = new Set(
    entryConflicts(entry, conflicts).map((conflict) => choices[conflict.id]),
  );
  if (sides.size === 0) return null;
  if (sides.size > 1) return "mixed";
  return [...sides][0] ?? null;
}

/** The resolver list, grouped by stop (ADR-0020: a batch, not a field list). */
export function groupConflicts(outcome: MergeOutcome): ConflictGroups {
  const byAnchor = new Map<string, ConflictGroup>();
  const groups: ConflictGroups = { stops: [], meta: [], order: [] };

  for (const conflict of outcome.conflicts) {
    if (conflict.kind === "order") {
      groups.order.push(conflict);
      continue;
    }
    if (conflict.kind === "field" && conflict.anchorId === "__meta__") {
      groups.meta.push(conflict);
      continue;
    }
    const group = byAnchor.get(conflict.anchorId) ?? {
      anchorId: conflict.anchorId,
      label:
        conflict.kind === "delete-modify"
          ? nameOf(conflict.surviving)
          : anchorName(outcome, conflict.anchorId),
      conflicts: [],
    };
    group.conflicts.push(conflict);
    byAnchor.set(conflict.anchorId, group);
  }

  groups.stops = [...byAnchor.values()];
  return groups;
}

/**
 * The merge result is the content; the polyline is derived from it (ADR-0020
 * §6). A resolved stop list whose positions differ from the base makes the
 * saved path stale — the workspace re-snaps instead of choosing a line.
 */
export function mergeInvalidatesPath(
  base: MergeSnapshot,
  merged: MergeSnapshot,
): boolean {
  const baseById = new Map(base.anchors.map((anchor) => [anchor.id, anchor]));
  const mergedById = new Map(
    merged.anchors.map((anchor) => [anchor.id, anchor]),
  );
  if (baseById.size !== mergedById.size) return true;
  for (const [id, anchor] of mergedById) {
    const before = baseById.get(id);
    if (!before) return true;
    if (!sameValue(before.fields.location, anchor.fields.location)) return true;
  }
  return false;
}

export interface ChangeEntry {
  key: string;
  kind: "stop" | "meta" | "order";
  label: string;
  /** decision = the plotter must choose; merged = applied automatically. */
  state: "decision" | "merged";
  conflictCount: number;
  /** Human labels of the fields that changed, for the detail pane. */
  fields: string[];
}

const STOP_FIELD_LABELS: Record<string, string> = {
  name: "Name",
  type: "Type",
  location: "Position",
  is_guaranteed_service: "Guaranteed service",
  landmark_hint: "Landmark",
  notes: "Notes",
};

const META_FIELD_LABELS: Record<string, string> = {
  name: "Name",
  shortName: "Short name",
  color: "Colour",
  isActive: "Active",
  fareConfigId: "Fare configuration",
};

/**
 * Every change in the batch, not only the conflicts — the left column of the
 * resolver. Conflicting rows are `decision`; rows the merge already settled are
 * `merged`, so the plotter can tell at a glance that nothing was lost.
 */
export function listChanges(
  base: MergeSnapshot,
  mine: MergeSnapshot,
  theirs: MergeSnapshot,
  outcome: MergeOutcome,
): ChangeEntry[] {
  const entries: ChangeEntry[] = [];
  const baseById = new Map(base.anchors.map((anchor) => [anchor.id, anchor]));
  const mineById = new Map(mine.anchors.map((anchor) => [anchor.id, anchor]));
  const theirsById = new Map(
    theirs.anchors.map((anchor) => [anchor.id, anchor]),
  );

  const conflictByAnchor = new Map<string, number>();
  const orderIds = new Set<string>();
  let metaConflicts = 0;
  for (const conflict of outcome.conflicts) {
    if (conflict.kind === "field") {
      if (conflict.anchorId === "__meta__") metaConflicts += 1;
      else {
        conflictByAnchor.set(
          conflict.anchorId,
          (conflictByAnchor.get(conflict.anchorId) ?? 0) + 1,
        );
      }
    } else if (conflict.kind === "delete-modify") {
      conflictByAnchor.set(
        conflict.anchorId,
        (conflictByAnchor.get(conflict.anchorId) ?? 0) + 1,
      );
    } else {
      for (const id of [...conflict.order.mine, ...conflict.order.theirs]) {
        orderIds.add(id);
      }
    }
  }

  const ids = new Set([
    ...baseById.keys(),
    ...mineById.keys(),
    ...theirsById.keys(),
  ]);
  const ordered = [
    ...mine.anchors.map((anchor) => anchor.id),
    ...[...ids].filter((id) => !mineById.has(id)).sort(),
  ];

  for (const id of ordered) {
    const b = baseById.get(id);
    const m = mineById.get(id);
    const t = theirsById.get(id);
    const fields = new Set<string>();

    for (const field of Object.keys(STOP_FIELD_LABELS)) {
      const baseValue = b?.fields[field];
      const mineValue = m?.fields[field];
      const theirsValue = t?.fields[field];
      const changed =
        !sameValue(mineValue, theirsValue) ||
        (b !== undefined &&
          (!sameValue(mineValue, baseValue) ||
            !sameValue(theirsValue, baseValue)));
      if (changed) fields.add(STOP_FIELD_LABELS[field]);
    }
    if (orderIds.has(id)) fields.add("Order");

    const conflictCount = conflictByAnchor.get(id) ?? 0;
    if (fields.size === 0 && conflictCount === 0) continue;

    const subject = m ?? t;
    entries.push({
      key: id,
      kind: "stop",
      label: subject ? nameOf(subject) : "Stop",
      state: conflictCount > 0 || orderIds.has(id) ? "decision" : "merged",
      conflictCount: conflictCount + (orderIds.has(id) ? 1 : 0),
      fields: [...fields],
    });
  }

  const metaKeys = new Set([
    ...Object.keys(base.meta ?? {}),
    ...Object.keys(mine.meta ?? {}),
    ...Object.keys(theirs.meta ?? {}),
  ]);
  const metaFields = [...metaKeys].filter(
    (key) =>
      !sameValue((mine.meta ?? {})[key], (theirs.meta ?? {})[key]) ||
      !sameValue((mine.meta ?? {})[key], (base.meta ?? {})[key]) ||
      !sameValue((theirs.meta ?? {})[key], (base.meta ?? {})[key]),
  );
  if (metaFields.length > 0 || metaConflicts > 0) {
    entries.push({
      key: "meta",
      kind: "meta",
      label: "Route details",
      state: metaConflicts > 0 ? "decision" : "merged",
      conflictCount: metaConflicts,
      fields: metaFields.map((key) => META_FIELD_LABELS[key] ?? key),
    });
  }

  if (orderIds.size > 0) {
    entries.push({
      key: "order",
      kind: "order",
      label: "Stop order",
      state: "decision",
      conflictCount: 1,
      fields: ["Order"],
    });
  }

  return entries;
}
