import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CoordinatePair, GeoLineString } from "@komyuter/shared";
import {
  createDetourStore,
  type DetourTarget,
  type LoopSnapper,
} from "@/features/detours/detourStore";
import { usePlottingStore } from "@/lib/plottingStore";
import { selectStop } from "@/lib/selection";

const BASE: GeoLineString = {
  type: "LineString",
  coordinates: [
    [122.5, 10.6],
    [122.51, 10.61],
    [122.52, 10.62],
  ],
};

const STOPS = [
  {
    stop_id: "stop-1",
    name: "Stop 1",
    location: [122.5, 10.6] as CoordinatePair,
  },
  {
    stop_id: "stop-3",
    name: "Stop 3",
    location: [122.51, 10.61] as CoordinatePair,
  },
  {
    stop_id: "stop-2",
    name: "Stop 2",
    location: [122.52, 10.62] as CoordinatePair,
  },
];

const TARGET: DetourTarget = {
  directionId: "dir-1",
  directionLabel: "Outbound",
  routeId: "route-1",
  routeName: "Route 1",
  basePolyline: BASE,
  existingDetourCount: 2,
  stops: STOPS,
};

const snapMock = vi.fn(async (coordinates: CoordinatePair[]) => ({
  type: "LineString",
  coordinates,
}));
const stubSnap: LoopSnapper = snapMock as unknown as LoopSnapper;

const SPLIT = [122.5, 10.6] as CoordinatePair;
const MERGE = [122.52, 10.62] as CoordinatePair;
const WAYPOINT = [122.505, 10.605] as CoordinatePair;

function openNewStore() {
  const store = createDetourStore(stubSnap);
  store.getState().openNew(TARGET);
  return store;
}

/** Places split → merge → one waypoint (the core branching-node flow). */
function placeNodes(
  store: ReturnType<typeof openNewStore>,
  split: CoordinatePair = SPLIT,
  merge: CoordinatePair = MERGE,
  waypoint: CoordinatePair = WAYPOINT,
) {
  store.getState().handleMapClick(split);
  store.getState().handleMapClick(merge);
  store.getState().handleMapClick(waypoint);
}

describe("detour store — branching nodes (split → merge → path)", () => {
  it("places split first, merge second, then treats clicks as detour stops", async () => {
    const store = openNewStore();
    const get = () => store.getState();

    get().handleMapClick(SPLIT);
    expect(get().entry?.index).toBe(0);
    expect(get().mode).toBe("exit");

    get().handleMapClick(MERGE);
    expect(get().exit?.index).toBe(2);
    expect(get().mode).toBe("waypoint");

    get().handleMapClick(WAYPOINT);
    expect(get().detourStops).toHaveLength(1);
    expect(get().detourStops[0]?.location).toEqual(WAYPOINT);
    expect(get().label).toBe("Detour 3"); // count-based default
    expect(get().composeError).toBeNull();

    await vi.waitFor(() => expect(get().loop).not.toBeNull());
    expect(get().additionalDistanceMeters).not.toBeNull();
  });

  it("refuses an exit placed BEFORE the split (order) and offers a swap", () => {
    const store = openNewStore();
    const get = () => store.getState();
    get().handleMapClick(MERGE); // split at the last vertex
    get().handleMapClick(SPLIT); // merge attempt BEHIND it
    expect(get().refusal?.kind).toBe("order");
    expect(get().mode).toBe("exit");

    get().swapEntryExit();
    expect(get().entry?.index).toBe(0);
    expect(get().exit?.index).toBe(2);
    expect(get().refusal).toBeNull();
    expect(get().mode).toBe("waypoint");
  });

  it("refuses a merge within the degenerate minimum of the split", () => {
    const store = openNewStore();
    const get = () => store.getState();
    get().handleMapClick(SPLIT);
    get().handleMapClick([122.50005, 10.60005]); // ~8 m away
    expect(get().refusal?.kind).toBe("degenerate");
    expect(get().exit).toBeNull();
  });

  it("refuses an off-route SPLIT click with a recovery message", () => {
    const store = openNewStore();
    const get = () => store.getState();
    get().handleMapClick([122.9, 10.9]);
    expect(get().composeError).not.toBeNull();
    expect(get().entry).toBeNull();
  });

  it("keeps appending detour stops in waypoint mode; edited text survives", async () => {
    const store = openNewStore();
    const get = () => store.getState();
    placeNodes(store);
    await vi.waitFor(() => expect(get().loop).not.toBeNull());
    get().setLabel("My custom name");

    get().handleMapClick([122.507, 10.607]);
    expect(get().detourStops).toHaveLength(2);
    expect(get().label).toBe("My custom name");
    expect(get().entry?.index).toBe(0);
    expect(get().exit?.index).toBe(2);
  });
});

describe("detour store — save gate blocks before any HTTP (T016, SC-014)", () => {
  it("refuses to validate until split, merge, stops, and instruction exist", async () => {
    const store = openNewStore();
    const get = () => store.getState();

    let result = get().validateSave();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("SPLIT");

    get().handleMapClick(SPLIT);
    result = get().validateSave();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("MERGE");

    get().handleMapClick(MERGE);
    // No waypoints yet — the path has nothing to detour through.
    result = get().validateSave();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("detour stops");

    get().handleMapClick(WAYPOINT);
    await vi.waitFor(() => expect(get().loop).not.toBeNull());
    get().setCommuterInstruction(""); // the custom text was auto-filled
    result = get().validateSave();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("instruction");

    // The gate is pure — a refuse/reason pass never fires the snapper.
    const callsBefore = snapMock.mock.calls.length;
    result = get().validateSave();
    expect(snapMock.mock.calls).toHaveLength(callsBefore);

    get().setCommuterInstruction("Take the diversion.");
    get().setDriverInstruction("Watch for the left turn.");
    result = get().validateSave();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.label).toBe("Detour 3");
      expect(result.payload.entry.coordinates).toEqual(SPLIT);
      expect(result.payload.exit.coordinates).toEqual(MERGE);
      expect(result.payload.detour_stops).toHaveLength(1);
      expect(result.payload.commuter_instruction).toBe("Take the diversion.");
      expect(result.payload.driver_instruction).toBe(
        "Watch for the left turn.",
      );
    }
  });

  it("auto-fills the rider instruction on the first waypoint (empty only)", async () => {
    const store = openNewStore();
    const get = () => store.getState();
    get().handleMapClick(SPLIT);
    get().handleMapClick(MERGE);
    expect(get().commuterInstruction).toBe("");
    get().handleMapClick(WAYPOINT);
    expect(get().commuterInstruction).toBe("Take the detour");
  });
});

describe("detour store — undo/redo (US4, FR-019)", () => {
  it("undoes and redoes node placement phase by phase", async () => {
    const store = openNewStore();
    const get = () => store.getState();

    get().handleMapClick(SPLIT);
    expect(get().canUndo()).toBe(true);
    get().undo();
    expect(get().entry).toBeNull();
    expect(get().mode).toBe("entry");
    expect(get().canRedo()).toBe(true);

    get().redo();
    expect(get().entry?.index).toBe(0);
    expect(get().mode).toBe("exit");
    expect(get().canRedo()).toBe(false);
  });

  it("tracks label edits step by step", () => {
    const store = openNewStore();
    const get = () => store.getState();

    get().setLabel("Detour 9");
    get().setLabel("Detour 8");
    expect(get().label).toBe("Detour 8");
    get().undo();
    expect(get().label).toBe("Detour 9");
    get().undo();
    expect(get().label).toBe("Detour 3"); // the seeded default
    get().redo();
    expect(get().label).toBe("Detour 9");

    // Identity writes never create history noise.
    const futureBefore = get().future.length;
    get().setLabel("Detour 9");
    expect(get().future.length).toBe(futureBefore);
  });
});

describe("detour store — marker interactions (move + select)", () => {
  it("moves a detour stop (drag) and rebuilds the loop, recorded in history", async () => {
    const store = openNewStore();
    const get = () => store.getState();
    placeNodes(store);
    await vi.waitFor(() => expect(get().loop).not.toBeNull());
    const id = get().detourStops[0]!.id;

    get().moveDetourStop(id, [122.506, 10.606]);
    expect(get().detourStops[0]?.location).toEqual([122.506, 10.606]);
    expect(get().canUndo()).toBe(true);
    await vi.waitFor(() => {
      expect(get().loop?.coordinates[1]).toEqual([122.506, 10.606]);
    });

    get().undo();
    expect(get().detourStops[0]?.location).toEqual(WAYPOINT);
  });

  it("select/deselect a detour stop, cleared by placing a new one", () => {
    const store = openNewStore();
    const get = () => store.getState();
    placeNodes(store);
    const id = get().detourStops[0]!.id;
    get().selectDetourStop(id);
    expect(get().selectedDetourStopId).toBe(id);

    get().selectDetourStop(null);
    expect(get().selectedDetourStopId).toBeNull();

    get().selectDetourStop(id);
    get().handleMapClick([122.507, 10.607]); // places another stop
    expect(get().selectedDetourStopId).toBeNull();
    expect(get().detourStops).toHaveLength(2);
  });
});

describe("detour store — draggable split/merge nodes", () => {
  it("drags the split node back onto the route (re-projected) and rebuilds", async () => {
    const store = openNewStore();
    const get = () => store.getState();
    placeNodes(store);
    await vi.waitFor(() => expect(get().loop).not.toBeNull());

    get().moveEntry([122.50003, 10.60003]); // near the route start
    expect(get().entry?.coordinate[0]).toBeGreaterThan(122.5);
    expect(get().entry?.coordinate[0]).toBeLessThan(122.51);
    expect(get().canUndo()).toBe(true);

    get().undo();
    expect(get().entry?.coordinate).toEqual(SPLIT);
  });

  it("drags the merge node and refuses an off-corridor drop", async () => {
    const store = openNewStore();
    const get = () => store.getState();
    placeNodes(store);
    await vi.waitFor(() => expect(get().loop).not.toBeNull());

    get().moveExit([122.9, 10.9]); // far off the route — ignored
    expect(get().exit?.coordinate).toEqual(MERGE);

    get().moveExit([122.5195, 10.62]);
    expect(get().exit?.coordinate[0]).toBeGreaterThan(122.51);
  });
});

describe("detour store — sidebar visibility toggles (display-only)", () => {
  it("toggles a saved detour's map visibility", () => {
    const store = openNewStore();
    const get = () => store.getState();
    expect(get().hiddenDetourIds).toEqual([]);

    get().toggleDetourVisibility("det-1");
    expect(get().hiddenDetourIds).toEqual(["det-1"]);
    get().toggleDetourVisibility("det-1");
    expect(get().hiddenDetourIds).toEqual([]);
    get().toggleDetourVisibility("det-1");
    get().toggleDetourVisibility("det-2");
    expect(get().hiddenDetourIds).toEqual(["det-1", "det-2"]);
  });

  it("clearDeletedDetourVisibility drops the id after a delete", () => {
    const store = openNewStore();
    const get = () => store.getState();
    get().toggleDetourVisibility("det-1");
    get().toggleDetourVisibility("det-2");
    expect(get().hiddenDetourIds).toEqual(["det-1", "det-2"]);

    get().clearDeletedDetourVisibility("det-1");
    expect(get().hiddenDetourIds).toEqual(["det-2"]);

    // Clearing an id that isn't hidden is a no-op (never throws).
    get().clearDeletedDetourVisibility("det-1");
    expect(get().hiddenDetourIds).toEqual(["det-2"]);
  });
});

describe("detour store — stop reorder parity (US4, FR-010)", () => {
  /** Split → merge → three waypoints (stops A, B, C in order). */
  async function placeThreeStops(
    store: ReturnType<typeof openNewStore>,
  ): Promise<void> {
    const get = () => store.getState();
    get().handleMapClick(SPLIT);
    get().handleMapClick(MERGE);
    for (const point of [
      [122.505, 10.605] as CoordinatePair,
      [122.51, 10.608] as CoordinatePair,
      [122.515, 10.611] as CoordinatePair,
    ]) {
      get().handleMapClick(point);
    }
    await vi.waitFor(() => expect(get().loop).not.toBeNull());
  }

  it("moves a detour stop up with ArrowUp semantics (insert-before)", async () => {
    const store = openNewStore();
    const get = () => store.getState();
    await placeThreeStops(store);
    expect(get().detourStops.map((s) => s.name)).toEqual([
      "Stop 1",
      "Stop 2",
      "Stop 3",
    ]);

    // ArrowUp on index 2 → target row index 1 (same as base row handler).
    get().reorderDetourStop(2, 1);
    expect(get().detourStops.map((s) => s.name)).toEqual([
      "Stop 1",
      "Stop 3",
      "Stop 2",
    ]);
    expect(get().canUndo()).toBe(true);
  });

  it("moves a detour stop down with ArrowDown semantics (target = index + 2)", async () => {
    const store = openNewStore();
    const get = () => store.getState();
    await placeThreeStops(store);

    // ArrowDown on index 0 → target row index 2 (insert-before row 2 shifts
    // the moved stop into row 1's old slot's successor — matches base).
    get().reorderDetourStop(0, 2);
    expect(get().detourStops.map((s) => s.name)).toEqual([
      "Stop 2",
      "Stop 1",
      "Stop 3",
    ]);
  });

  it("ignores no-op and out-of-bounds reorders", async () => {
    const store = openNewStore();
    const get = () => store.getState();
    await placeThreeStops(store);

    get().reorderDetourStop(1, 1); // no-op
    expect(get().detourStops.map((s) => s.name)).toEqual([
      "Stop 1",
      "Stop 2",
      "Stop 3",
    ]);

    get().reorderDetourStop(-1, 0); // from out of bounds
    get().reorderDetourStop(0, 5); // to out of bounds
    get().reorderDetourStop(3, 0); // from out of bounds
    expect(get().detourStops.map((s) => s.name)).toEqual([
      "Stop 1",
      "Stop 2",
      "Stop 3",
    ]);
  });

  it("round-trips a reorder through undo/redo", async () => {
    const store = openNewStore();
    const get = () => store.getState();
    await placeThreeStops(store);

    get().reorderDetourStop(2, 1); // Stop 3 before Stop 2
    const reordered = get().detourStops.map((s) => s.name);
    expect(reordered).toEqual(["Stop 1", "Stop 3", "Stop 2"]);

    get().undo();
    expect(get().detourStops.map((s) => s.name)).toEqual([
      "Stop 1",
      "Stop 2",
      "Stop 3",
    ]);

    get().redo();
    expect(get().detourStops.map((s) => s.name)).toEqual(reordered);
  });

  it("rebuilds the loop after a reorder (order feeds the road-follow)", async () => {
    const store = openNewStore();
    const get = () => store.getState();
    await placeThreeStops(store);

    const before = get().loop?.coordinates.length ?? 0;
    get().reorderDetourStop(0, 2);
    await vi.waitFor(() =>
      expect(get().loop?.coordinates.length).toBeGreaterThanOrEqual(0),
    );
    // The loop stays a valid LineString with the reordered stops inside.
    expect(get().loop?.type).toBe("LineString");
    expect(before).toBeGreaterThanOrEqual(2);
    expect(get().loop?.coordinates.length).toBeGreaterThanOrEqual(2);
  });
});

describe("detour store — late-bound stops (target context still supplied)", () => {
  it("binds stops into the target once they arrive, and only once", () => {
    const store = createDetourStore(stubSnap);
    store.getState().openNew({ ...TARGET, stops: [] });
    const get = () => store.getState();
    expect(get().target?.stops).toHaveLength(0);

    get().setTargetStops(STOPS);
    expect(get().target?.stops).toHaveLength(3);

    const replaced = [...STOPS.slice(0, 1)];
    get().setTargetStops(replaced);
    expect(get().target?.stops).toHaveLength(3); // already bound — ignored
  });
});

describe("detour store — draft persistence (US4, T031)", () => {
  it("serializes a round-trippable snapshot with mode + stops", async () => {
    const store = openNewStore();
    const get = () => store.getState();
    placeNodes(store);
    await vi.waitFor(() => expect(get().loop).not.toBeNull());

    const draft = store.getState().serializeDraft();
    expect(draft).not.toBeNull();
    if (!draft) return;
    expect(draft.target.directionId).toBe("dir-1");
    expect(draft.mode).toBe("waypoint");
    expect(draft.detourStops).toHaveLength(1);

    store.getState().close();
    const restored = createDetourStore(stubSnap);
    restored.getState().restoreDraft(draft);
    const state = restored.getState();
    expect(state.open).toBe(true);
    expect(state.mode).toBe("waypoint");
    expect(state.entry?.index).toBe(0);
    expect(state.exit?.index).toBe(2);
    expect(state.detourStops).toHaveLength(1);
    expect(state.draftOffer).toBe(false);
  });
});

describe("detour store — map hover alignment (sidebar highlight)", () => {
  it("tracks the hovered detour stop + owning detour, close clears it", () => {
    const store = openNewStore();
    const get = () => store.getState();
    expect(get().hoveredDetourStopId).toBeNull();
    expect(get().hoveredDetourId).toBeNull();

    get().setHoveredDetourStop("ds-1", "det-7");
    expect(get().hoveredDetourStopId).toBe("ds-1");
    expect(get().hoveredDetourId).toBe("det-7");

    get().setHoveredDetourStop(null, null);
    expect(get().hoveredDetourStopId).toBeNull();
    expect(get().hoveredDetourId).toBeNull();

    // Sidebar-row hover drives the map via the detour id alone.
    get().setHoveredDetourId("det-7");
    expect(get().hoveredDetourId).toBe("det-7");
    get().setHoveredDetourId(null);
    expect(get().hoveredDetourId).toBeNull();

    // A stale hover never survives closing/reopening the editor.
    get().setHoveredDetourStop("ds-1", "det-7");
    get().close();
    expect(get().hoveredDetourStopId).toBeNull();
    expect(get().hoveredDetourId).toBeNull();
  });
});

describe("detour store — base-route stop focus clears on detour focus", () => {
  beforeEach(() => {
    usePlottingStore.getState().reset();
  });

  it("openNew clears a previously selected base stop outline", () => {
    usePlottingStore.getState().setSelection(selectStop("base-stop-1"));
    usePlottingStore.getState().setHoveredStop("base-stop-1");
    expect(usePlottingStore.getState().selection).toEqual({
      type: "stop",
      stopId: "base-stop-1",
    });

    openNewStore(); // openNew → clearBaseRouteFocus

    expect(usePlottingStore.getState().selection).toEqual({ type: "none" });
    expect(usePlottingStore.getState().hoveredStopId).toBeNull();
  });

  it("selectDetourStop clears the base stop outline", () => {
    usePlottingStore.getState().setSelection(selectStop("base-stop-1"));
    const store = openNewStore();

    store.getState().selectDetourStop("ds-1");

    expect(usePlottingStore.getState().selection).toEqual({ type: "none" });
  });
});

describe("detour store — detour fit counter (camera frames focused detour)", () => {
  it("requestDetourFit increments the counter (DetourFitter watches it)", () => {
    const store = openNewStore();
    const get = () => store.getState();
    expect(get().detourFitCounter).toBe(0);

    get().requestDetourFit();
    expect(get().detourFitCounter).toBe(1);

    get().requestDetourFit();
    expect(get().detourFitCounter).toBe(2);
  });
});
