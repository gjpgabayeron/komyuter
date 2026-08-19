import { describe, expect, it } from "vitest";
import type { CoordinatePair, GeoLineString } from "@komyuter/shared";
import type { DraftStop } from "@/lib/plottingStore";
import { edgeId } from "@/lib/connections";
import {
  canRedo,
  canUndo,
  coalesceDragEntry,
  coalescePropsEntry,
  emptyHistory,
  pushHistory,
  redoChanges,
  undoChanges,
  type DraftSlice,
  type HistoryEntry,
  type HistoryStack,
} from "@/lib/plottingHistory";

const L: CoordinatePair = [122.5, 10.7];

function stop(id: string, location: CoordinatePair = L): DraftStop {
  return { id, name: `Stop ${id}`, type: "major_stop", location };
}

function slice(overrides: Partial<DraftSlice> = {}): DraftSlice {
  return {
    stops: [],
    connections: [],
    polyline: null,
    ...overrides,
  };
}

describe("history stack (FR-013)", () => {
  it("emptyHistory starts empty and canUndo/canRedo reflect it", () => {
    const stack = emptyHistory();
    expect(stack).toEqual({ past: [], future: [] });
    expect(canUndo(stack)).toBe(false);
    expect(canRedo(stack)).toBe(false);
  });

  it("pushHistory appends to the past and clears the future", () => {
    const placed: HistoryEntry = {
      kind: "stop_placed",
      stop: stop("a"),
      index: 0,
    };
    const dragged: HistoryEntry = {
      kind: "stop_dragged",
      stopId: "a",
      from: L,
      to: [122.51, 10.71],
    };
    const s1 = pushHistory(emptyHistory(), placed);
    expect(canUndo(s1)).toBe(true);
    expect(canRedo(s1)).toBe(false);
    expect(s1.past).toEqual([placed]);

    // A new edit after an undo cuts the future branch.
    const branched: HistoryStack = { past: [placed], future: [dragged] };
    const s2 = pushHistory(branched, dragged);
    expect(s2.past).toEqual([placed, dragged]);
    expect(s2.future).toEqual([]);
  });
});

describe("undo/redo transitions", () => {
  it("undo of stop_placed removes the stop and re-links the chain; redo restores it", () => {
    const a = stop("a");
    const b = stop("b");
    const c = stop("c");
    const entry: HistoryEntry = { kind: "stop_placed", stop: b, index: 1 };
    const current = slice({
      stops: [a, b, c],
      connections: [
        { id: edgeId("a", "b"), from: "a", to: "b" },
        { id: edgeId("b", "c"), from: "b", to: "c" },
      ],
    });
    const undone = undoChanges(entry, current);
    expect(undone.stops.map((s) => s.id)).toEqual(["a", "c"]);
    expect(undone.connections.map((c) => c.id)).toEqual([edgeId("a", "c")]);

    const redone = redoChanges(entry, undone);
    expect(redone.stops.map((s) => s.id)).toEqual(["a", "b", "c"]);
    expect(redone.connections.map((c) => c.id)).toEqual([
      edgeId("a", "b"),
      edgeId("b", "c"),
    ]);
  });

  it("undo of a mid-sequence delete reconnects the chain and restores the stop", () => {
    const a = stop("a");
    const b = stop("b");
    const c = stop("c");
    // The chain after deleting b: a—c (removeStop re-links automatic mode).
    const entry: HistoryEntry = {
      kind: "stop_deleted",
      stop: b,
      index: 1,
      edges: [
        { id: edgeId("a", "b"), from: "a", to: "b" },
        { id: edgeId("b", "c"), from: "b", to: "c" },
      ],
    };
    const current = slice({
      stops: [a, c],
      connections: [{ id: edgeId("a", "c"), from: "a", to: "c" }],
    });
    const undone = undoChanges(entry, current);
    expect(undone.stops.map((s) => s.id)).toEqual(["a", "b", "c"]);
    expect(undone.connections.map((c) => c.id)).toEqual([
      edgeId("a", "b"),
      edgeId("b", "c"),
    ]);

    const redone = redoChanges(entry, undone);
    expect(redone.stops.map((s) => s.id)).toEqual(["a", "c"]);
    expect(redone.connections.map((c) => c.id)).toEqual([edgeId("a", "c")]);
  });

  it("stop_deleted undo restores the stop and re-links the chain", () => {
    const a = stop("a");
    const b = stop("b");
    const entry: HistoryEntry = {
      kind: "stop_deleted",
      stop: b,
      index: 1,
      edges: [{ id: edgeId("a", "b"), from: "a", to: "b" }],
    };
    const current = slice({ stops: [a] });
    const undone = undoChanges(entry, current);
    expect(undone.stops.map((s) => s.id)).toEqual(["a", "b"]);
    expect(undone.connections).toEqual([
      { id: edgeId("a", "b"), from: "a", to: "b" },
    ]);
  });

  it("undo/redo of stop_dragged restores and re-applies the position", () => {
    const from: CoordinatePair = [122.5, 10.7];
    const to: CoordinatePair = [122.51, 10.71];
    const entry: HistoryEntry = {
      kind: "stop_dragged",
      stopId: "b",
      from,
      to,
    };
    const current = slice({
      stops: [stop("a"), { ...stop("b"), location: to }],
    });
    const undone = undoChanges(entry, current);
    expect(undone.stops[1].location).toEqual(from);
    expect(redoChanges(entry, undone).stops[1].location).toEqual(to);
  });

  it("undo/redo of snap_applied restores and re-applies the polyline", () => {
    const previous: GeoLineString = {
      type: "LineString",
      coordinates: [
        [122.5, 10.7],
        [122.51, 10.71],
      ],
    };
    const applied: GeoLineString = {
      type: "LineString",
      coordinates: [
        [122.5, 10.7],
        [122.52, 10.72],
        [122.51, 10.71],
      ],
    };
    const entry: HistoryEntry = {
      kind: "snap_applied",
      previous,
      applied,
      stops: ["a", "b"],
      previousStops: null,
    };
    const current = slice({ polyline: applied });
    expect(undoChanges(entry, current).polyline).toEqual(previous);
    expect(redoChanges(entry, undoChanges(entry, current)).polyline).toEqual(
      applied,
    );
  });

  it("undo of a first snap application clears the polyline", () => {
    const applied: GeoLineString = {
      type: "LineString",
      coordinates: [
        [122.5, 10.7],
        [122.51, 10.71],
      ],
    };
    const entry: HistoryEntry = {
      kind: "snap_applied",
      previous: null,
      applied,
      stops: ["a", "b"],
      previousStops: null,
    };
    const undone = undoChanges(entry, slice({ polyline: applied }));
    expect(undone.polyline).toBeNull();
    expect(redoChanges(entry, undone).polyline).toEqual(applied);
  });
});

describe("merged snap entries (one undo reverts edit + path)", () => {
  const line = (coords: CoordinatePair[]): GeoLineString => ({
    type: "LineString",
    coordinates: coords,
  });
  const prevPath = line([
    [122.5, 10.7],
    [122.51, 10.71],
  ]);
  const newPath = line([
    [122.5, 10.7],
    [122.52, 10.72],
    [122.51, 10.71],
  ]);

  it("stop_placed undo removes the stop AND restores the previous path", () => {
    const entry: HistoryEntry = {
      kind: "stop_placed",
      stop: stop("b"),
      index: 1,
      path: newPath,
      previousPath: prevPath,
      stops: ["a", "b"],
      previousStops: ["a"],
    };
    const current = slice({ stops: [stop("a"), stop("b")], polyline: newPath });
    const undone = undoChanges(entry, current);
    expect(undone.stops.map((s) => s.id)).toEqual(["a"]);
    expect(undone.polyline).toEqual(prevPath);
    // redo re-applies the stop and the merged path
    const redone = redoChanges(entry, undone);
    expect(redone.stops.map((s) => s.id)).toEqual(["a", "b"]);
    expect(redone.polyline).toEqual(newPath);
  });

  it("stop_deleted undo restores the stop AND the previous path", () => {
    const entry: HistoryEntry = {
      kind: "stop_deleted",
      stop: stop("b"),
      index: 1,
      edges: [{ id: edgeId("a", "b"), from: "a", to: "b" }],
      path: newPath,
      previousPath: prevPath,
      stops: ["a", "b"],
      previousStops: ["a", "b"],
    };
    const current = slice({ stops: [stop("a")], polyline: newPath });
    const undone = undoChanges(entry, current);
    expect(undone.stops.map((s) => s.id)).toEqual(["a", "b"]);
    expect(undone.polyline).toEqual(prevPath);
  });

  it("unmerged entries leave the polyline untouched", () => {
    const entry: HistoryEntry = {
      kind: "stop_placed",
      stop: stop("b"),
      index: 1,
    };
    const current = slice({
      stops: [stop("a"), stop("b")],
      polyline: prevPath,
    });
    const undone = undoChanges(entry, current);
    expect(undone.polyline).toEqual(prevPath); // unchanged — no merged path
  });
});

describe("stop property + connection undo (stop_props_changed)", () => {
  const line = (coords: CoordinatePair[]): GeoLineString => ({
    type: "LineString",
    coordinates: coords,
  });

  it("undo/redo restores and re-applies a name edit", () => {
    const entry: HistoryEntry = {
      kind: "stop_props_changed",
      stopId: "b",
      before: { name: "Old" },
      after: { name: "New" },
    };
    const current = slice({
      stops: [{ ...stop("b"), name: "New" }],
    });
    const undone = undoChanges(entry, current);
    expect(undone.stops[0].name).toBe("Old");
    expect(redoChanges(entry, undone).stops[0].name).toBe("New");
  });

  it("undo/redo restores and re-applies a connection change with its path", () => {
    const roadBefore = line([
      [122.5, 10.7],
      [122.51, 10.71],
    ]);
    const roadAfter = line([
      [122.5, 10.7],
      [122.52, 10.72],
      [122.51, 10.71],
    ]);
    const edgeAB = { id: edgeId("a", "b"), from: "a", to: "b" };
    const edgeAC = { id: edgeId("a", "c"), from: "a", to: "c" };
    const entry: HistoryEntry = {
      kind: "stop_props_changed",
      stopId: "b",
      before: {},
      after: {},
      connectionsBefore: [edgeAB],
      connectionsAfter: [edgeAC],
      previousPath: roadBefore,
      path: roadAfter,
      stops: ["a", "b"],
      previousStops: ["a", "b"],
    };
    const current = slice({
      stops: [stop("a"), stop("b")],
      connections: [edgeAC],
      polyline: roadAfter,
    });
    const undone = undoChanges(entry, current);
    expect(undone.connections).toEqual([edgeAB]);
    expect(undone.polyline).toEqual(roadBefore);
    const redone = redoChanges(entry, undone);
    expect(redone.connections).toEqual([edgeAC]);
    expect(redone.polyline).toEqual(roadAfter);
  });

  it("coalesces consecutive property edits of the same stop into one entry", () => {
    const e1: HistoryEntry = {
      kind: "stop_props_changed",
      stopId: "b",
      before: { name: "Old" },
      after: { name: "New" },
    };
    const e2: HistoryEntry = {
      kind: "stop_props_changed",
      stopId: "b",
      before: { name: "New" },
      after: { name: "Newer" },
    };
    const stack = pushHistory(emptyHistory(), e1);
    const merged = coalescePropsEntry(stack, e2 as never);
    expect(merged.past).toHaveLength(1);
    const last = merged.past[0] as Extract<
      HistoryEntry,
      { kind: "stop_props_changed" }
    >;
    expect(last.before).toEqual({ name: "Old" }); // original value kept
    expect(last.after).toEqual({ name: "Newer" }); // final value wins
    // A different stop does NOT coalesce.
    const other = coalescePropsEntry(merged, {
      kind: "stop_props_changed",
      stopId: "c",
      before: {},
      after: { name: "X" },
    } as never);
    expect(other.past).toHaveLength(2);
  });

  it("coalesces consecutive drags of the same stop into one entry", () => {
    const d1: HistoryEntry = {
      kind: "stop_dragged",
      stopId: "b",
      from: [122.5, 10.7],
      to: [122.51, 10.71],
    };
    const d2: HistoryEntry = {
      kind: "stop_dragged",
      stopId: "b",
      from: [122.51, 10.71],
      to: [122.52, 10.72],
    };
    const stack = pushHistory(emptyHistory(), d1);
    const merged = coalesceDragEntry(stack, d2 as never);
    expect(merged.past).toHaveLength(1);
    const last = merged.past[0] as Extract<
      HistoryEntry,
      { kind: "stop_dragged" }
    >;
    expect(last.from).toEqual([122.5, 10.7]); // original position kept
    expect(last.to).toEqual([122.52, 10.72]); // final position wins
  });
});

it("coalesces edits to DIFFERENT fields in one session without losing data", () => {
  const e1: HistoryEntry = {
    kind: "stop_props_changed",
    stopId: "b",
    before: { name: "Old" },
    after: { name: "New" },
  };
  const e2: HistoryEntry = {
    kind: "stop_props_changed",
    stopId: "b",
    before: { type: "major_stop" },
    after: { type: "terminal" },
  };
  const stack = coalescePropsEntry(
    pushHistory(emptyHistory(), e1),
    e2 as never,
  );
  expect(stack.past).toHaveLength(1);
  const last = stack.past[0] as Extract<
    HistoryEntry,
    { kind: "stop_props_changed" }
  >;
  // Both fields' original and final values survive the merge.
  expect(last.before).toEqual({ name: "Old", type: "major_stop" });
  expect(last.after).toEqual({ name: "New", type: "terminal" });
});
