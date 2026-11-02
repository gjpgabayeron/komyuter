import { describe, expect, it } from "vitest";
import type { GeoLineString } from "@komyuter/shared";
import {
  carryChoices,
  mergeSnapshots,
  resolveMerge,
  resolveMeta,
  type MergeAnchor,
  type MergeSnapshot,
} from "../lib/merge";

const A: [number, number] = [122.5, 10.6];
const B: [number, number] = [122.52, 10.62];
const C: [number, number] = [122.54, 10.64];

function anchor(id: string, fields: Record<string, unknown> = {}): MergeAnchor {
  return { id, kind: "stop", fields: { name: id, ...fields } };
}

function snapshot(anchors: MergeAnchor[]): MergeSnapshot {
  return { anchors };
}

function line(coordinates: [number, number][]): GeoLineString {
  return { type: "LineString", coordinates };
}

const MINE_LINE = line([A, B]);
const THEIR_LINE = line([A, C]);

function merge(
  base: MergeAnchor[],
  mine: MergeAnchor[],
  theirs: MergeAnchor[],
) {
  return mergeSnapshots(snapshot(base), snapshot(mine), snapshot(theirs), {
    mine: MINE_LINE,
    theirs: THEIR_LINE,
  });
}

describe("three-way merge (ADR-0020)", () => {
  it("takes a one-sided change without a conflict", () => {
    const outcome = merge(
      [anchor("a"), anchor("b")],
      [anchor("a", { name: "A renamed" }), anchor("b")],
      [anchor("a"), anchor("b")],
    );

    expect(outcome.conflicts).toEqual([]);
    expect(outcome.anchors.map((a) => a.fields.name)).toEqual([
      "A renamed",
      "b",
    ]);
  });

  it("merges fields both sides changed differently", () => {
    const outcome = merge(
      [anchor("a", { name: "A", notes: "old" })],
      [anchor("a", { name: "A mine", notes: "old" })],
      [anchor("a", { name: "A", notes: "theirs" })],
    );

    expect(outcome.conflicts).toEqual([]);
    expect(outcome.anchors[0].fields).toMatchObject({
      name: "A mine",
      notes: "theirs",
    });
  });

  it("conflicts when both sides set the same field differently", () => {
    const outcome = merge(
      [anchor("a", { name: "A" })],
      [anchor("a", { name: "Mine" })],
      [anchor("a", { name: "Theirs" })],
    );

    expect(outcome.conflicts).toHaveLength(1);
    expect(outcome.conflicts[0]).toMatchObject({
      kind: "field",
      field: "name",
      mine: "Mine",
      theirs: "Theirs",
    });

    const mine = resolveMerge(outcome, { "field:a:name": "mine" });
    const theirs = resolveMerge(outcome, { "field:a:name": "theirs" });
    expect(mine[0].fields.name).toBe("Mine");
    expect(theirs[0].fields.name).toBe("Theirs");
  });

  it("deletes an anchor deleted on one side and untouched on the other", () => {
    const outcome = merge(
      [anchor("a"), anchor("b")],
      [anchor("a")],
      [anchor("a"), anchor("b")],
    );

    expect(outcome.conflicts).toEqual([]);
    expect(outcome.anchors.map((a) => a.id)).toEqual(["a"]);
  });

  it("conflicts on delete versus modify, and honours either choice", () => {
    const outcome = merge(
      [anchor("a", { name: "A" })],
      [anchor("a", { name: "A edited" })],
      [],
    );

    expect(outcome.conflicts).toHaveLength(1);
    expect(outcome.conflicts[0]).toMatchObject({
      kind: "delete-modify",
      deletedBy: "theirs",
    });

    const keepMine = resolveMerge(outcome, { "delete:a": "mine" });
    const takeTheirs = resolveMerge(outcome, { "delete:a": "theirs" });
    expect(keepMine.map((a) => a.id)).toEqual(["a"]);
    expect(takeTheirs).toEqual([]);
  });

  it("drops an anchor both sides deleted", () => {
    const outcome = merge(
      [anchor("a"), anchor("b")],
      [anchor("a")],
      [anchor("a")],
    );
    expect(outcome.anchors.map((a) => a.id)).toEqual(["a"]);
    expect(outcome.conflicts).toEqual([]);
  });

  it("merges an anchor both sides added", () => {
    const outcome = merge(
      [],
      [anchor("new", { name: "New", notes: "mine" })],
      [anchor("new", { name: "New", type: "terminal" })],
    );

    expect(outcome.conflicts).toEqual([]);
    expect(outcome.anchors[0].fields).toMatchObject({
      name: "New",
      notes: "mine",
      type: "terminal",
    });
  });

  it("surfaces a contradictory order instead of picking one", () => {
    const outcome = merge(
      [anchor("a"), anchor("b"), anchor("c")],
      [anchor("b"), anchor("a"), anchor("c")],
      [anchor("a"), anchor("b"), anchor("c")],
    );

    expect(outcome.conflicts).toHaveLength(1);
    expect(outcome.conflicts[0]).toMatchObject({ kind: "order" });
    expect(outcome.anchors.map((a) => a.id)).toEqual(["b", "a", "c"]);

    const theirs = resolveMerge(outcome, { order: "theirs" });
    expect(theirs.map((a) => a.id)).toEqual(["a", "b", "c"]);
  });

  it("does not report an order conflict when both sides agree", () => {
    const outcome = merge(
      [anchor("a"), anchor("b"), anchor("c")],
      [anchor("c"), anchor("a"), anchor("b")],
      [anchor("c"), anchor("a"), anchor("b")],
    );

    expect(outcome.conflicts).toEqual([]);
    expect(outcome.anchors.map((a) => a.id)).toEqual(["c", "a", "b"]);
  });

  it("carries both polylines as evidence, never as a decision", () => {
    const outcome = merge([anchor("a")], [anchor("a")], [anchor("a")]);

    expect(outcome.polyline.mine).toBe(MINE_LINE);
    expect(outcome.polyline.theirs).toBe(THEIR_LINE);
  });

  it("merges Route metadata field by field", () => {
    const outcome = mergeSnapshots(
      { anchors: [], meta: { name: "A", short_name: "A" } },
      { anchors: [], meta: { name: "Mine", short_name: "A" } },
      { anchors: [], meta: { name: "A", short_name: "Theirs" } },
      { mine: MINE_LINE, theirs: THEIR_LINE },
    );

    expect(outcome.conflicts).toEqual([]);
    expect(outcome.meta).toMatchObject({
      name: "Mine",
      short_name: "Theirs",
    });
  });

  it("conflicts on a metadata field both sides changed", () => {
    const outcome = mergeSnapshots(
      { anchors: [], meta: { name: "A" } },
      { anchors: [], meta: { name: "Mine" } },
      { anchors: [], meta: { name: "Theirs" } },
      { mine: MINE_LINE, theirs: THEIR_LINE },
    );

    expect(outcome.conflicts).toHaveLength(1);
    expect(
      resolveMeta(outcome, { "field:__meta__:name": "theirs" }),
    ).toMatchObject({ name: "Theirs" });
    expect(
      resolveMeta(outcome, { "field:__meta__:name": "mine" }),
    ).toMatchObject({ name: "Mine" });
  });

  it("carries a previous choice forward only where it still applies", () => {
    const outcome = merge(
      [anchor("a", { name: "A" })],
      [anchor("a", { name: "Mine" })],
      [anchor("a", { name: "Theirs" })],
    );
    const carried = carryChoices(outcome.conflicts, {
      "field:a:name": "theirs",
      "field:gone:name": "mine",
    });
    expect(carried).toEqual({ "field:a:name": "theirs" });
  });

  it("keeps a stop the other side added when resolving an order conflict", () => {
    const outcome = merge(
      [anchor("a"), anchor("b")],
      [anchor("b"), anchor("a")],
      [anchor("a"), anchor("b"), anchor("c")],
    );

    const resolved = resolveMerge(outcome, { order: "mine" });
    expect(resolved.map((entry) => entry.id)).toContain("c");
  });

  it("keeps every id that is not in conflict", () => {
    const outcome = merge(
      [anchor("a"), anchor("b"), anchor("c")],
      [anchor("a", { name: "A2" }), anchor("b"), anchor("c"), anchor("d")],
      [anchor("a"), anchor("b", { name: "B2" }), anchor("c"), anchor("e")],
    );

    const ids = outcome.anchors.map((a) => a.id).sort();
    expect(ids).toEqual(["a", "b", "c", "d", "e"]);
    expect(outcome.conflicts).toEqual([]);
  });
});
