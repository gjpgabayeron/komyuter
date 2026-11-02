import { describe, expect, it } from "vitest";
import {
  buildConflictPreview,
  conflictStopIds,
  entryDecided,
  entryDecision,
  groupConflicts,
  listChanges,
  mergeInvalidatesPath,
  summarizeMerge,
} from "../lib/conflictPreview";
import {
  carryChoices,
  mergeSnapshots,
  type MergeAnchor,
  type MergeSnapshot,
} from "../lib/merge";

const A: [number, number] = [122.5, 10.6];
const B: [number, number] = [122.52, 10.62];
const C: [number, number] = [122.54, 10.64];

function anchor(id: string, fields: Record<string, unknown> = {}): MergeAnchor {
  return {
    id,
    kind: "stop",
    fields: { name: id, location: A, type: "major_stop", ...fields },
  };
}

function snap(
  anchors: MergeAnchor[],
  meta: Record<string, unknown> | null = null,
): MergeSnapshot {
  return { anchors, meta };
}

function outcomeOf(
  base: MergeAnchor[],
  mine: MergeAnchor[],
  theirs: MergeAnchor[],
  meta: {
    base?: Record<string, unknown>;
    mine?: Record<string, unknown>;
    theirs?: Record<string, unknown>;
  } = {},
) {
  return mergeSnapshots(
    snap(base, meta.base ?? null),
    snap(mine, meta.mine ?? null),
    snap(theirs, meta.theirs ?? null),
    { mine: null, theirs: null },
  );
}

describe("conflict preview (ADR-0020 amendment)", () => {
  it("draws a changed stop twice, once per side", () => {
    const outcome = outcomeOf(
      [anchor("a")],
      [anchor("a", { name: "Mine" })],
      [anchor("a", { name: "Theirs" })],
    );

    const preview = buildConflictPreview(
      outcome,
      [anchor("a", { name: "Mine" })],
      [anchor("a", { name: "Theirs" })],
      null,
      null,
    );

    expect(conflictStopIds(outcome)).toEqual(["a"]);
    expect(preview.stops).toHaveLength(2);
    expect(preview.stops.map((stop) => stop.side)).toEqual(["mine", "theirs"]);
    expect(preview.stops.every((stop) => stop.kind === "changed")).toBe(true);
    expect(preview.stops.map((stop) => stop.name)).toEqual(["Mine", "Theirs"]);
    expect(preview.bounds).not.toBeNull();
  });

  it("puts a ghost where one side deleted a stop", () => {
    const outcome = outcomeOf(
      [anchor("a", { name: "A" })],
      [anchor("a", { name: "A edited" })],
      [],
    );

    const preview = buildConflictPreview(
      outcome,
      [anchor("a", { name: "A edited" })],
      [],
      null,
      null,
    );

    expect(preview.stops).toHaveLength(2);
    expect(preview.stops[1]).toMatchObject({
      side: "theirs",
      kind: "removed",
      name: "A edited",
    });
  });

  it("carries both positions for an order conflict", () => {
    const outcome = outcomeOf(
      [anchor("a"), anchor("b", { location: B })],
      [anchor("b", { location: B }), anchor("a")],
      [anchor("a"), anchor("b", { location: B })],
    );

    const mine = [anchor("b", { location: B }), anchor("a")];
    const theirs = [anchor("a"), anchor("b", { location: B })];
    const preview = buildConflictPreview(outcome, mine, theirs, null, null);

    expect(preview.conflictIds).toEqual(["a", "b"]);
    expect(preview.stops.some((stop) => stop.orderConflict)).toBe(true);
    const a = preview.stops.find(
      (stop) => stop.id === "a" && stop.side === "mine",
    );
    expect(a).toMatchObject({ order: 2, otherOrder: 1 });
  });

  it("carries both polylines, never a blend", () => {
    const mineLine = { type: "LineString" as const, coordinates: [A, B] };
    const theirsLine = { type: "LineString" as const, coordinates: [A, C] };
    const outcome = outcomeOf([anchor("a")], [anchor("a")], [anchor("a")]);
    const preview = buildConflictPreview(
      outcome,
      [anchor("a")],
      [anchor("a")],
      mineLine,
      theirsLine,
    );

    expect(preview.minePolyline).toBe(mineLine);
    expect(preview.theirsPolyline).toBe(theirsLine);
  });

  it("is empty when nothing conflicts", () => {
    const outcome = outcomeOf([anchor("a")], [anchor("a")], [anchor("a")]);
    const preview = buildConflictPreview(
      outcome,
      [anchor("a")],
      [anchor("a")],
      null,
      null,
    );

    expect(preview.stops).toEqual([]);
    expect(preview.bounds).toBeNull();
  });
});

describe("batch summary", () => {
  it("counts added, removed, moved, renamed and route fields", () => {
    const summary = summarizeMerge(
      snap([anchor("a"), anchor("b", { location: B }), anchor("gone")], {
        name: "Route",
        color: "#111111",
      }),
      snap(
        [
          anchor("a", { name: "Renamed" }),
          anchor("b", { location: C }),
          anchor("new"),
        ],
        {
          name: "Mine",
          color: "#111111",
        },
      ),
      snap([anchor("a"), anchor("b", { location: B })], {
        name: "Route",
        color: "#222222",
      }),
    );

    expect(summary).toMatchObject({
      added: 1,
      removed: 1,
      moved: 1,
      renamed: 1,
      retyped: 0,
      routeFields: 2,
    });
    expect(summary.total).toBe(6);
  });

  it("does not count a delete-versus-edit as a removal", () => {
    const summary = summarizeMerge(
      snap([anchor("a")]),
      snap([anchor("a", { name: "Edited" })]),
      snap([]),
    );

    expect(summary.removed).toBe(0);
    expect(summary.renamed).toBe(0);
  });
});

describe("the batch list (left column)", () => {
  it("lists every change, marking conflicting rows as decisions", () => {
    const base = [anchor("a"), anchor("b", { location: B })];
    const mine = [
      anchor("a", { name: "Mine" }),
      anchor("b", { location: C }),
      anchor("new"),
    ];
    const theirs = [
      anchor("a", { name: "Theirs" }),
      anchor("b", { location: B }),
    ];
    const outcome = mergeSnapshots(snap(base), snap(mine), snap(theirs), {
      mine: null,
      theirs: null,
    });

    const changes = listChanges(snap(base), snap(mine), snap(theirs), outcome);

    const byKey = new Map(changes.map((change) => [change.key, change]));
    expect(byKey.get("a")).toMatchObject({ state: "decision" });
    expect(byKey.get("b")).toMatchObject({
      state: "merged",
      fields: ["Position"],
    });
    expect(byKey.get("new")).toMatchObject({ state: "merged" });
  });

  it("re-snaps the path instead of offering it as a decision", () => {
    const base = [anchor("a", { location: A })];
    const moved = [anchor("a", { location: B })];
    const unchanged = [anchor("a", { location: A })];

    expect(mergeInvalidatesPath(snap(base), snap(unchanged))).toBe(false);
    expect(mergeInvalidatesPath(snap(base), snap(moved))).toBe(true);
    expect(
      mergeInvalidatesPath(snap(base), snap([...unchanged, anchor("new")])),
    ).toBe(true);

    // No list row is ever a path decision: the path is derived from the stops.
    const outcome = mergeSnapshots(snap(base), snap(moved), snap(unchanged), {
      mine: null,
      theirs: null,
    });
    const changes = listChanges(
      snap(base),
      snap(moved),
      snap(unchanged),
      outcome,
    );
    expect(
      changes.every((change) =>
        ["stop", "meta", "order"].includes(change.kind),
      ),
    ).toBe(true);
  });

  it("marks Route details and order with their own state", () => {
    const base = [anchor("a"), anchor("b", { location: B })];
    const mine = [anchor("b", { location: B }), anchor("a")];
    const theirs = [anchor("a"), anchor("b", { location: B })];
    const outcome = mergeSnapshots(
      snap(base, { name: "Route" }),
      snap(mine, { name: "Mine" }),
      snap(theirs, { name: "Theirs" }),
      { mine: null, theirs: null },
    );

    const changes = listChanges(
      snap(base, { name: "Route" }),
      snap(mine, { name: "Mine" }),
      snap(theirs, { name: "Theirs" }),
      outcome,
    );

    expect(changes.find((change) => change.key === "order")).toMatchObject({
      state: "decision",
    });
    expect(changes.find((change) => change.key === "meta")).toMatchObject({
      state: "decision",
      fields: ["Name"],
    });
  });
});

describe("list row decisions", () => {
  it("marks a stop decided only when every field is chosen", () => {
    const base = [anchor("a")];
    const mine = [anchor("a", { name: "Mine", notes: "mine" })];
    const theirs = [anchor("a", { name: "Theirs", notes: "theirs" })];
    const outcome = mergeSnapshots(snap(base), snap(mine), snap(theirs), {
      mine: null,
      theirs: null,
    });
    const entry = listChanges(
      snap(base),
      snap(mine),
      snap(theirs),
      outcome,
    ).find((candidate) => candidate.key === "a")!;

    expect(entryDecided(entry, outcome.conflicts, {})).toBe(false);
    expect(
      entryDecided(entry, outcome.conflicts, { "field:a:name": "mine" }),
    ).toBe(false);
    const all = {
      "field:a:name": "mine" as const,
      "field:a:notes": "theirs" as const,
    };
    expect(entryDecided(entry, outcome.conflicts, all)).toBe(true);
    expect(entryDecision(entry, outcome.conflicts, all)).toBe("mixed");
  });

  it("treats a merged row as decided, with no choice to make", () => {
    const base = [anchor("a", { location: A })];
    const mine = [anchor("a", { location: B })];
    const theirs = [anchor("a", { location: A })];
    const outcome = mergeSnapshots(snap(base), snap(mine), snap(theirs), {
      mine: null,
      theirs: null,
    });
    const entries = listChanges(snap(base), snap(mine), snap(theirs), outcome);

    const stop = entries.find((entry) => entry.key === "a")!;
    expect(entryDecided(stop, outcome.conflicts, {})).toBe(true);
    expect(entryDecision(stop, outcome.conflicts, {})).toBeNull();
  });
});

describe("resolver grouping", () => {
  it("groups field conflicts by stop and keeps meta and order apart", () => {
    const outcome = outcomeOf(
      [anchor("a"), anchor("b", { location: B })],
      [
        anchor("a", { name: "Mine", notes: "mine" }),
        anchor("b", { location: B }),
      ],
      [
        anchor("a", { name: "Theirs", notes: "theirs" }),
        anchor("b", { location: B }),
      ],
      {
        base: { name: "Route" },
        mine: { name: "Mine" },
        theirs: { name: "Theirs" },
      },
    );

    const groups = groupConflicts(outcome);
    expect(groups.stops).toHaveLength(1);
    expect(groups.stops[0].anchorId).toBe("a");
    expect(groups.stops[0].label).toBe("Mine");
    expect(groups.stops[0].conflicts).toHaveLength(2);
    expect(groups.meta).toHaveLength(1);
    expect(groups.order).toHaveLength(0);
  });

  it("carries previous choices only where they still apply", () => {
    const outcome = outcomeOf(
      [anchor("a")],
      [anchor("a", { name: "Mine" })],
      [anchor("a", { name: "Theirs" })],
    );

    expect(
      carryChoices(outcome.conflicts, {
        "field:a:name": "theirs",
        "field:gone:name": "mine",
      }),
    ).toEqual({ "field:a:name": "theirs" });
  });
});
