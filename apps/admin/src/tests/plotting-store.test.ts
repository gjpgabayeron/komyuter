import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  CoordinatePair,
  GeoLineString,
  SnappedPath,
} from "@komyuter/shared";
import {
  clearSelection,
  isStopSelected,
  selectPolyline,
  selectStop,
} from "@/lib/selection";
import {
  bindSnapFetcher,
  cancelPendingSnap,
  draftMatchesBaseline,
  reorderStops,
  SNAP_DEBOUNCE_MS,
  usePlottingStore,
} from "@/lib/plottingStore";
describe("selection helpers", () => {
  it("selectStop creates a stop selection", () => {
    expect(selectStop("stop-1")).toEqual({ type: "stop", stopId: "stop-1" });
  });

  it("isStopSelected matches only the same stop", () => {
    const selection = selectStop("stop-1");
    expect(isStopSelected(selection, "stop-1")).toBe(true);
    expect(isStopSelected(selection, "stop-2")).toBe(false);
    expect(isStopSelected(clearSelection, "stop-1")).toBe(false);
    expect(isStopSelected(selectPolyline, "stop-1")).toBe(false);
  });
});

describe("plottingStore", () => {
  beforeEach(() => {
    usePlottingStore.getState().reset();
  });

  it("addStop appends a draft stop with an auto-default name (FR-028)", () => {
    const { addStop } = usePlottingStore.getState();
    addStop([122.5, 10.6]);
    addStop([122.51, 10.61], "Port");
    const { stops } = usePlottingStore.getState();
    expect(stops).toHaveLength(2);
    expect(stops[0].name).toBe("Stop 1");
    expect(stops[1].name).toBe("Port");
    expect(stops[0].location).toEqual([122.5, 10.6]);
  });

  it("removeStop drops the stop and clears its selection", () => {
    const { addStop, setSelection, removeStop } = usePlottingStore.getState();
    addStop([122.5, 10.6]);
    const stopId = usePlottingStore.getState().stops[0].id;
    setSelection({ type: "stop", stopId });
    removeStop(stopId);
    expect(usePlottingStore.getState().stops).toHaveLength(0);
    expect(usePlottingStore.getState().selection).toEqual(clearSelection);
  });

  it("removeStop re-requests the snap preview for the new sequence", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn(
      async (coordinates: CoordinatePair[]): Promise<SnappedPath> => ({
        polyline: { type: "LineString", coordinates },
        distanceMeters: 100,
        snapped: true,
        warning: null,
      }),
    );
    bindSnapFetcher(fetcher);
    const { addStop, removeStop } = usePlottingStore.getState();
    addStop([122.5, 10.6], "A");
    addStop([122.51, 10.61], "B");
    addStop([122.52, 10.62], "C");
    await vi.advanceTimersByTimeAsync(SNAP_DEBOUNCE_MS);
    fetcher.mockClear();
    const middleId = usePlottingStore.getState().stops[1].id;
    removeStop(middleId);
    expect(usePlottingStore.getState().stops.map((s) => s.name)).toEqual([
      "A",
      "C",
    ]);
    await vi.advanceTimersByTimeAsync(SNAP_DEBOUNCE_MS);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith([
      [122.5, 10.6],
      [122.52, 10.62],
    ]);
    vi.useRealTimers();
  });

  it("moveStop updates a stop location in place", () => {
    const { addStop, moveStop } = usePlottingStore.getState();
    addStop([122.5, 10.6]);
    const stopId = usePlottingStore.getState().stops[0].id;
    moveStop(stopId, [122.55, 10.65]);
    expect(usePlottingStore.getState().stops[0].location).toEqual([
      122.55, 10.65,
    ]);
  });

  it("setSnap merges partial snap state", () => {
    const { setSnap } = usePlottingStore.getState();
    setSnap({ status: "pending" });
    setSnap({ snapped: true });
    const { snap } = usePlottingStore.getState();
    expect(snap.status).toBe("pending");
    expect(snap.snapped).toBe(true);
    expect(snap.polyline).toBeNull();
  });

  it("reset clears everything to the initial state", () => {
    const { addStop, setPolyline, setSelection, setSnap, setLayers, reset } =
      usePlottingStore.getState();
    addStop([122.5, 10.6]);
    setPolyline({ type: "LineString", coordinates: [[122.5, 10.6]] });
    setSnap({ status: "applied" });
    setSelection(selectPolyline);
    setLayers({ stops: false });
    reset();
    const state = usePlottingStore.getState();
    expect(state.stops).toEqual([]);
    expect(state.polyline).toBeNull();
    expect(state.snap.status).toBe("idle");
    expect(state.selection).toEqual(clearSelection);
    expect(state.layers).toEqual({ base: true, stops: true });
    expect(state.history).toEqual({ past: [], future: [] });
  });

  it("requestFit increments the fit counter", () => {
    const before = usePlottingStore.getState().fitCounter;
    usePlottingStore.getState().requestFit();
    expect(usePlottingStore.getState().fitCounter).toBe(before + 1);
  });

  it("openRoute clears the draft and requests a fit", () => {
    const { addStop, setSelection, openRoute } = usePlottingStore.getState();
    addStop([122.5, 10.6]);
    setSelection(selectStop("anything"));
    const before = usePlottingStore.getState().fitCounter;
    openRoute("route-1");
    const state = usePlottingStore.getState();
    expect(state.routeId).toBe("route-1");
    expect(state.stops).toEqual([]);
    expect(state.selection).toEqual(clearSelection);
    expect(state.fitCounter).toBe(before + 1);
  });

  it("openRoute(null) clears the route without requesting a fit", () => {
    const before = usePlottingStore.getState().fitCounter;
    usePlottingStore.getState().openRoute(null);
    expect(usePlottingStore.getState().routeId).toBeNull();
    expect(usePlottingStore.getState().fitCounter).toBe(before);
  });

  it("setPoi places and clears the temporary POI marker", () => {
    expect(usePlottingStore.getState().poi).toBeNull();
    usePlottingStore.getState().setPoi([122.5645, 10.6922]);
    expect(usePlottingStore.getState().poi).toEqual([122.5645, 10.6922]);
    usePlottingStore.getState().setPoi(null);
    expect(usePlottingStore.getState().poi).toBeNull();
  });

  it("placing a stop, selecting a stop, or opening a route clears the POI marker", () => {
    const { addStop, setPoi } = usePlottingStore.getState();
    setPoi([122.5645, 10.6922]);
    addStop([122.5, 10.6]);
    expect(usePlottingStore.getState().poi).toBeNull();

    setPoi([122.5645, 10.6922]);
    usePlottingStore.getState().setSelection({ type: "stop", stopId: "x" });
    expect(usePlottingStore.getState().poi).toBeNull();

    setPoi([122.5645, 10.6922]);
    usePlottingStore.getState().openRoute("route-1");
    expect(usePlottingStore.getState().poi).toBeNull();
  });

  it("defaults to the select tool and setTool switches it", () => {
    expect(usePlottingStore.getState().tool).toBe("select");
    usePlottingStore.getState().setTool("add");
    expect(usePlottingStore.getState().tool).toBe("add");
  });

  it("routeMeta merges patches and openRoute clears it", () => {
    expect(usePlottingStore.getState().routeMeta).toBeNull();
    const { setRouteMeta, openRoute } = usePlottingStore.getState();
    openRoute("route-1");
    setRouteMeta({
      name: "A",
      shortName: "B",
      color: "#000000",
      isActive: true,
      fareConfigId: null,
    });
    setRouteMeta({ name: "Renamed" });
    const meta = usePlottingStore.getState().routeMeta;
    expect(meta?.name).toBe("Renamed");
    expect(meta?.shortName).toBe("B");
    openRoute("route-2");
    expect(usePlottingStore.getState().routeMeta).toBeNull();
  });

  it("draft mutations mark the draft dirty; openRoute clears it", () => {
    const { addStop, openRoute } = usePlottingStore.getState();
    expect(usePlottingStore.getState().draftDirty).toBe(false);
    addStop([122.5, 10.6]);
    expect(usePlottingStore.getState().draftDirty).toBe(true);
    openRoute("route-1");
    expect(usePlottingStore.getState().draftDirty).toBe(false);
  });

  it("setSaving toggles the save lock", () => {
    expect(usePlottingStore.getState().saving).toBe(false);
    usePlottingStore.getState().setSaving(true);
    expect(usePlottingStore.getState().saving).toBe(true);
    usePlottingStore.getState().setSaving(false);
    expect(usePlottingStore.getState().saving).toBe(false);
  });

  it("overviewRouteId is cleared when a route is opened", () => {
    const { setOverviewRouteId, openRoute } = usePlottingStore.getState();
    setOverviewRouteId("route-9");
    expect(usePlottingStore.getState().overviewRouteId).toBe("route-9");
    openRoute("route-1");
    expect(usePlottingStore.getState().overviewRouteId).toBeNull();
  });

  it("updateStop merges name, type, and notes into the draft stop", () => {
    const { addStop, updateStop } = usePlottingStore.getState();
    addStop([122.5, 10.6]);
    const stopId = usePlottingStore.getState().stops[0].id;
    updateStop(stopId, {
      name: "City Hall",
      type: "terminal",
      notes: "near the plaza",
    });
    const stop = usePlottingStore.getState().stops[0];
    expect(stop.name).toBe("City Hall");
    expect(stop.type).toBe("terminal");
    expect(stop.notes).toBe("near the plaza");
  });

  it("updateStop location change re-requests the debounced snap preview", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn(
      async (coordinates: CoordinatePair[]): Promise<SnappedPath> => ({
        polyline: { type: "LineString", coordinates },
        distanceMeters: 100,
        snapped: true,
        warning: null,
      }),
    );
    bindSnapFetcher(fetcher);
    const { addStop, updateStop } = usePlottingStore.getState();
    addStop([122.5, 10.6]);
    addStop([122.51, 10.61]);
    await vi.advanceTimersByTimeAsync(SNAP_DEBOUNCE_MS);
    fetcher.mockClear();
    updateStop(usePlottingStore.getState().stops[0].id, {
      location: [122.505, 10.605],
    });
    await vi.advanceTimersByTimeAsync(SNAP_DEBOUNCE_MS);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith([
      [122.505, 10.605],
      [122.51, 10.61],
    ]);
    vi.useRealTimers();
  });

  it("reorderStops moves an item to the target row position", () => {
    expect(reorderStops(["A", "B", "C", "D"], 0, 3)).toEqual([
      "B",
      "C",
      "A",
      "D",
    ]);
    expect(reorderStops(["A", "B", "C", "D"], 3, 0)).toEqual([
      "D",
      "A",
      "B",
      "C",
    ]);
    expect(reorderStops(["A", "B", "C"], 0, 0)).toEqual(["A", "B", "C"]);
  });

  it("reorderStop reorders the draft and re-requests the snap preview", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn(
      async (coordinates: CoordinatePair[]): Promise<SnappedPath> => ({
        polyline: { type: "LineString", coordinates },
        distanceMeters: 100,
        snapped: true,
        warning: null,
      }),
    );
    bindSnapFetcher(fetcher);
    const { addStop, reorderStop } = usePlottingStore.getState();
    addStop([122.5, 10.6], "A");
    addStop([122.51, 10.61], "B");
    addStop([122.52, 10.62], "C");
    await vi.advanceTimersByTimeAsync(SNAP_DEBOUNCE_MS);
    fetcher.mockClear();
    reorderStop(0, 2);
    expect(usePlottingStore.getState().stops.map((s) => s.name)).toEqual([
      "B",
      "A",
      "C",
    ]);
    await vi.advanceTimersByTimeAsync(SNAP_DEBOUNCE_MS);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith([
      [122.51, 10.61],
      [122.5, 10.6],
      [122.52, 10.62],
    ]);
    vi.useRealTimers();
  });
});

describe("snap-preview orchestration (FR-008/FR-009/FR-028)", () => {
  const snapResult = (coordinates: CoordinatePair[]): SnappedPath => ({
    polyline: { type: "LineString", coordinates },
    distanceMeters: 1234,
    snapped: true,
    warning: null,
  });

  beforeEach(() => {
    vi.useFakeTimers();
    usePlottingStore.getState().reset();
  });

  afterEach(() => {
    cancelPendingSnap();
    bindSnapFetcher(null);
    usePlottingStore.getState().reset();
    vi.useRealTimers();
  });

  it("debounces the snap request 500 ms after the last placement", async () => {
    const fetcher = vi.fn(async (coordinates: CoordinatePair[]) =>
      snapResult(coordinates),
    );
    bindSnapFetcher(fetcher);
    const { addStop } = usePlottingStore.getState();
    addStop([122.5, 10.6]);
    addStop([122.51, 10.61]);
    expect(fetcher).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(SNAP_DEBOUNCE_MS - 100);
    expect(fetcher).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(200);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith([
      [122.5, 10.6],
      [122.51, 10.61],
    ]);
  });

  it("stays idle with fewer than 2 stops", async () => {
    const fetcher = vi.fn();
    bindSnapFetcher(fetcher);
    usePlottingStore.getState().addStop([122.5, 10.6]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetcher).not.toHaveBeenCalled();
    expect(usePlottingStore.getState().snap.status).toBe("idle");
  });

  it("marks the snap pending while the request is in flight, then auto-commits", async () => {
    let resolve!: (value: SnappedPath) => void;
    const fetcher = vi.fn(
      () =>
        new Promise<SnappedPath>((r) => {
          resolve = r;
        }),
    );
    bindSnapFetcher(fetcher);
    const { addStop } = usePlottingStore.getState();
    addStop([122.5, 10.6]);
    addStop([122.51, 10.61]);
    await vi.advanceTimersByTimeAsync(SNAP_DEBOUNCE_MS);
    expect(usePlottingStore.getState().snap.status).toBe("pending");
    resolve(
      snapResult([
        [122.5, 10.6],
        [122.51, 10.61],
      ]),
    );
    await vi.advanceTimersByTimeAsync(0);
    const { polyline, snap } = usePlottingStore.getState();
    expect(snap.status).toBe("applied");
    expect(snap.polyline?.coordinates).toEqual([
      [122.5, 10.6],
      [122.51, 10.61],
    ]);
    expect(polyline?.coordinates).toEqual([
      [122.5, 10.6],
      [122.51, 10.61],
    ]);
    expect(snap.distanceMeters).toBe(1234);
  });

  it("auto-commits the road-snapped path when the response lands (no Apply)", async () => {
    const fetcher = vi.fn(async (coordinates: CoordinatePair[]) =>
      snapResult(coordinates),
    );
    bindSnapFetcher(fetcher);
    const { addStop } = usePlottingStore.getState();
    addStop([122.5, 10.6]);
    addStop([122.51, 10.61]);
    await vi.advanceTimersByTimeAsync(SNAP_DEBOUNCE_MS);
    const { polyline, snap } = usePlottingStore.getState();
    expect(snap.status).toBe("applied");
    expect(polyline?.coordinates).toEqual([
      [122.5, 10.6],
      [122.51, 10.61],
    ]);
  });

  it("never auto-commits a straight-line fallback (FR-009)", async () => {
    const fetcher = vi.fn(
      async (coordinates: CoordinatePair[]): Promise<SnappedPath> => ({
        // The fallback carries a polyline, but it is NOT road-snapped — it
        // must never become the committed route path.
        polyline: { type: "LineString", coordinates },
        distanceMeters: 0,
        snapped: false,
        warning: "no_token",
      }),
    );
    bindSnapFetcher(fetcher);
    const { addStop } = usePlottingStore.getState();
    addStop([122.5, 10.6]);
    addStop([122.51, 10.61]);
    await vi.advanceTimersByTimeAsync(SNAP_DEBOUNCE_MS);
    const { polyline, snap } = usePlottingStore.getState();
    expect(polyline).toBeNull();
    expect(snap.status).toBe("idle");
    expect(snap.snapped).toBe(false);
    expect(snap.warning).toBe("no_token");
  });

  it("resolves a pending preview before save (no fetch fires later)", async () => {
    const fetcher = vi.fn(async (coordinates: CoordinatePair[]) =>
      snapResult(coordinates),
    );
    bindSnapFetcher(fetcher);
    const { addStop, resolvePendingSnap } = usePlottingStore.getState();
    addStop([122.5, 10.6]);
    addStop([122.51, 10.61]);
    await resolvePendingSnap();
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetcher).not.toHaveBeenCalled();
    expect(usePlottingStore.getState().snap.status).toBe("idle");
  });

  it("each placement re-snaps and replaces the committed draft path", async () => {
    const fetcher = vi.fn(async (coordinates: CoordinatePair[]) =>
      snapResult(coordinates),
    );
    bindSnapFetcher(fetcher);
    const { addStop } = usePlottingStore.getState();
    addStop([122.5, 10.6]);
    addStop([122.51, 10.61]);
    await vi.advanceTimersByTimeAsync(SNAP_DEBOUNCE_MS);
    addStop([122.52, 10.62]);
    await vi.advanceTimersByTimeAsync(SNAP_DEBOUNCE_MS);
    expect(usePlottingStore.getState().polyline?.coordinates).toEqual([
      [122.5, 10.6],
      [122.51, 10.61],
      [122.52, 10.62],
    ]);
  });

  it("ignores a superseded in-flight response after another placement", async () => {
    const fetcher = vi.fn(async (coordinates: CoordinatePair[]) => {
      await new Promise((r) => setTimeout(r, 50));
      return snapResult(coordinates);
    });
    bindSnapFetcher(fetcher);
    const { addStop } = usePlottingStore.getState();
    addStop([122.5, 10.6]);
    addStop([122.51, 10.61]);
    await vi.advanceTimersByTimeAsync(SNAP_DEBOUNCE_MS); // request 1 in flight
    addStop([122.52, 10.62]); // schedules request 2 (debounced)
    await vi.advanceTimersByTimeAsync(100); // request 1 resolves late → ignored
    expect(usePlottingStore.getState().snap.status).toBe("pending");
    await vi.advanceTimersByTimeAsync(SNAP_DEBOUNCE_MS); // request 2 fires + resolves
    const { snap, polyline } = usePlottingStore.getState();
    expect(snap.status).toBe("applied");
    expect(polyline?.coordinates).toEqual([
      [122.5, 10.6],
      [122.51, 10.61],
      [122.52, 10.62],
    ]);
  });

  it("dragging a stop auto-commits the re-snapped path for the new position", async () => {
    const fetcher = vi.fn(async (coordinates: CoordinatePair[]) =>
      snapResult(coordinates),
    );
    bindSnapFetcher(fetcher);
    const { addStop, moveStop } = usePlottingStore.getState();
    addStop([122.5, 10.6], "A");
    addStop([122.51, 10.61], "B");
    await vi.advanceTimersByTimeAsync(SNAP_DEBOUNCE_MS); // committed path lands
    const stopId = usePlottingStore.getState().stops[0].id;
    moveStop(stopId, [122.55, 10.65]); // drag → new snap scheduled
    await vi.advanceTimersByTimeAsync(SNAP_DEBOUNCE_MS);
    const { snap, stops } = usePlottingStore.getState();
    expect(snap.status).toBe("applied");
    expect(stops[0].location).toEqual([122.55, 10.65]);
    // The committed path follows the dragged position (snapped with it).
    expect(usePlottingStore.getState().polyline?.coordinates).toEqual([
      [122.55, 10.65],
      [122.51, 10.61],
    ]);
  });
});

describe("undo/redo history wiring (FR-013)", () => {
  beforeEach(() => {
    usePlottingStore.getState().reset();
  });

  it("addStop pushes stop_placed; undo removes the stop; redo restores it", () => {
    const { addStop, undo, redo } = usePlottingStore.getState();
    addStop([122.5, 10.7]);
    addStop([122.51, 10.71]);
    expect(usePlottingStore.getState().stops).toHaveLength(2);
    undo();
    expect(usePlottingStore.getState().stops).toHaveLength(1);
    expect(usePlottingStore.getState().stops[0].location).toEqual([
      122.5, 10.7,
    ]);
    redo();
    expect(usePlottingStore.getState().stops).toHaveLength(2);
    expect(usePlottingStore.getState().history.past).toHaveLength(2);
  });

  it("clearHistory empties the stack (save clears it)", () => {
    const { addStop, clearHistory } = usePlottingStore.getState();
    addStop([122.5, 10.7]);
    addStop([122.51, 10.71]);
    clearHistory();
    expect(usePlottingStore.getState().history.past).toHaveLength(0);
    expect(usePlottingStore.getState().history.future).toHaveLength(0);
  });

  it("removeStop records stop_deleted; undo restores the stop and reconnects the chain", () => {
    const { addStop, removeStop, undo } = usePlottingStore.getState();
    addStop([122.5, 10.7]);
    addStop([122.51, 10.71]);
    addStop([122.52, 10.72]);
    const middle = usePlottingStore.getState().stops[1].id;
    removeStop(middle);
    expect(usePlottingStore.getState().stops).toHaveLength(2);
    expect(usePlottingStore.getState().connections).toHaveLength(1);
    undo();
    expect(usePlottingStore.getState().stops).toHaveLength(3);
    expect(usePlottingStore.getState().connections).toHaveLength(2);
  });

  it("moveStop records stop_dragged; undo restores the previous position", () => {
    const { addStop, moveStop, undo } = usePlottingStore.getState();
    addStop([122.5, 10.7]);
    const id = usePlottingStore.getState().stops[0].id;
    moveStop(id, [122.6, 10.8]);
    expect(usePlottingStore.getState().stops[0].location).toEqual([
      122.6, 10.8,
    ]);
    undo();
    expect(usePlottingStore.getState().stops[0].location).toEqual([
      122.5, 10.7,
    ]);
    usePlottingStore.getState().redo();
    expect(usePlottingStore.getState().stops[0].location).toEqual([
      122.6, 10.8,
    ]);
  });

  it("one undo reverts a placement AND its auto-committed path together", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn(
      async (coordinates: CoordinatePair[]): Promise<SnappedPath> => ({
        polyline: { type: "LineString", coordinates },
        distanceMeters: 120,
        snapped: true,
        warning: null,
      }),
    );
    bindSnapFetcher(fetcher);
    const { addStop, undo, redo } = usePlottingStore.getState();
    addStop([122.5, 10.7]);
    addStop([122.51, 10.71]);
    await vi.advanceTimersByTimeAsync(SNAP_DEBOUNCE_MS); // 2-stop path auto-commits
    addStop([122.52, 10.72]);
    await vi.advanceTimersByTimeAsync(SNAP_DEBOUNCE_MS); // 3-stop path auto-commits
    expect(usePlottingStore.getState().polyline?.coordinates).toHaveLength(3);
    // The snap MERGED into the placement entry — one undo reverts the whole
    // addition (stop removed AND the path back to the 2-stop line).
    undo();
    const afterUndo = usePlottingStore.getState();
    expect(afterUndo.stops).toHaveLength(2);
    expect(afterUndo.polyline?.coordinates).toHaveLength(2);
    redo();
    const afterRedo = usePlottingStore.getState();
    expect(afterRedo.stops).toHaveLength(3);
    expect(afterRedo.polyline?.coordinates).toHaveLength(3);
    bindSnapFetcher(null);
    vi.useRealTimers();
  });

  it("pathStopIds tracks the stops each committed path was derived for", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn(
      async (coordinates: CoordinatePair[]): Promise<SnappedPath> => ({
        polyline: { type: "LineString", coordinates },
        distanceMeters: 100,
        snapped: true,
        warning: null,
      }),
    );
    bindSnapFetcher(fetcher);
    const { addStop, removeStop, undo } = usePlottingStore.getState();
    addStop([122.5, 10.6]);
    addStop([122.51, 10.61]);
    addStop([122.52, 10.62]);
    await vi.advanceTimersByTimeAsync(SNAP_DEBOUNCE_MS);
    const ids = usePlottingStore.getState().stops.map((s) => s.id);
    expect(usePlottingStore.getState().pathStopIds).toEqual(ids);

    removeStop(ids[1]); // delete B → auto-commit re-derives for [A, C]
    await vi.advanceTimersByTimeAsync(SNAP_DEBOUNCE_MS);
    expect(usePlottingStore.getState().pathStopIds).toEqual([ids[0], ids[2]]);

    // One undo pops the MERGED stop_deleted entry: B comes back AND the
    // path/association revert to the pre-delete state — no mismatched
    // intermediate to block on.
    undo();
    expect(usePlottingStore.getState().stops.map((s) => s.id)).toEqual(ids);
    expect(usePlottingStore.getState().pathStopIds).toEqual(ids);
    expect(usePlottingStore.getState().polyline?.coordinates).toHaveLength(3);
    bindSnapFetcher(null);
    vi.useRealTimers();
  });
});

describe("save-baseline dirty tracking (undo hides the save button)", () => {
  beforeEach(() => {
    usePlottingStore.getState().reset();
  });

  const baselineStop = (id: string) => ({
    id,
    name: `Stop ${id}`,
    type: "major_stop" as const,
    location: [122.5, 10.7] as [number, number],
  });
  const polyline = (): GeoLineString => ({
    type: "LineString",
    coordinates: [
      [122.5, 10.7],
      [122.51, 10.71],
    ],
  });

  it("is clean right after loading a route (baseline captured)", () => {
    const store = usePlottingStore.getState();
    store.setStops([baselineStop("a")]);
    store.setPolyline(polyline());
    store.captureSavedBaseline();
    expect(usePlottingStore.getState().draftDirty).toBe(false);
  });

  it("undo back to the baseline hides the unsaved state; redo restores it", () => {
    const store = usePlottingStore.getState();
    store.setStops([baselineStop("a")]);
    store.setPolyline(polyline());
    store.captureSavedBaseline();
    store.addStop([122.52, 10.72]);
    expect(usePlottingStore.getState().draftDirty).toBe(true);
    usePlottingStore.getState().undo();
    expect(usePlottingStore.getState().draftDirty).toBe(false);
    expect(usePlottingStore.getState().stops).toHaveLength(1);
    usePlottingStore.getState().redo();
    expect(usePlottingStore.getState().draftDirty).toBe(true);
    expect(usePlottingStore.getState().stops).toHaveLength(2);
  });

  it("undo keeps the unsaved state when other edits remain", () => {
    const store = usePlottingStore.getState();
    store.setStops([baselineStop("a")]);
    store.setPolyline(polyline());
    store.captureSavedBaseline();
    store.addStop([122.52, 10.72]); // b
    store.addStop([122.53, 10.73]); // c
    usePlottingStore.getState().undo(); // removes c; [a, b] still differs
    expect(usePlottingStore.getState().draftDirty).toBe(true);
    usePlottingStore.getState().undo(); // removes b; back to baseline [a]
    expect(usePlottingStore.getState().draftDirty).toBe(false);
  });

  it("an edit outside the history model stays dirty even after undo-all", () => {
    const store = usePlottingStore.getState();
    store.setStops([baselineStop("a"), baselineStop("b"), baselineStop("c")]);
    store.setPolyline(polyline());
    store.captureSavedBaseline();
    store.reorderStop(0, 2); // [b, c, a] — reorder records no history entry
    expect(usePlottingStore.getState().draftDirty).toBe(true);
    usePlottingStore.getState().undo(); // nothing to undo — must stay dirty
    expect(usePlottingStore.getState().draftDirty).toBe(true);
  });

  it("draftMatchesBaseline compares stops and polyline by value", () => {
    const baseline = {
      stops: [baselineStop("a")],
      polyline: polyline(),
    };
    const sameStops = [baselineStop("a")];
    const movedStop = [
      { ...baselineStop("a"), location: [122.9, 10.9] as [number, number] },
    ];
    const differentName = [{ ...baselineStop("a"), name: "Plaza" }];
    const differentPolyline: GeoLineString = {
      type: "LineString",
      coordinates: [
        [122.5, 10.7],
        [122.52, 10.72],
      ],
    };
    expect(draftMatchesBaseline(sameStops, polyline(), baseline)).toBe(true);
    expect(draftMatchesBaseline(movedStop, polyline(), baseline)).toBe(false);
    expect(draftMatchesBaseline(differentName, polyline(), baseline)).toBe(
      false,
    );
    expect(draftMatchesBaseline(sameStops, differentPolyline, baseline)).toBe(
      false,
    );
    expect(draftMatchesBaseline(sameStops, polyline(), null)).toBe(false);
  });
});

describe("merged first-commit undo (null previous path)", () => {
  beforeEach(() => {
    usePlottingStore.getState().reset();
  });
  it("undo of the first auto-committed placement clears the path entirely", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn(
      async (coordinates: CoordinatePair[]): Promise<SnappedPath> => ({
        polyline: { type: "LineString", coordinates },
        distanceMeters: 100,
        snapped: true,
        warning: null,
      }),
    );
    bindSnapFetcher(fetcher);
    const { addStop, undo } = usePlottingStore.getState();
    addStop([122.5, 10.6]);
    addStop([122.51, 10.61]);
    await vi.advanceTimersByTimeAsync(SNAP_DEBOUNCE_MS);
    const st = usePlottingStore.getState();
    expect(st.polyline?.coordinates).toHaveLength(2);
    expect(st.pathStopIds).toHaveLength(2);

    undo(); // merged stop_placed: remove the stop AND the path (first commit)
    const after = usePlottingStore.getState();
    expect(after.stops).toHaveLength(1);
    expect(after.polyline).toBeNull();
    expect(after.pathStopIds).toBeNull();
    bindSnapFetcher(null);
    vi.useRealTimers();
  });
});

describe("stop property + connection undo (stop_props_changed)", () => {
  beforeEach(() => {
    usePlottingStore.getState().reset();
  });

  it("undo/redo restores and re-applies a stop name edit", () => {
    const { addStop, updateStop, undo, redo } = usePlottingStore.getState();
    addStop([122.5, 10.6], "Original");
    const id = usePlottingStore.getState().stops[0].id;
    updateStop(id, { name: "Renamed" });
    expect(usePlottingStore.getState().stops[0].name).toBe("Renamed");
    undo();
    expect(usePlottingStore.getState().stops[0].name).toBe("Original");
    redo();
    expect(usePlottingStore.getState().stops[0].name).toBe("Renamed");
  });

  it("per-keystroke name edits coalesce into one undo step", () => {
    const { addStop, updateStop, undo } = usePlottingStore.getState();
    addStop([122.5, 10.6], "A");
    const id = usePlottingStore.getState().stops[0].id;
    updateStop(id, { name: "Ci" });
    updateStop(id, { name: "Cit" });
    updateStop(id, { name: "City" });
    expect(usePlottingStore.getState().history.past).toHaveLength(2); // place + coalesced name
    undo(); // one undo reverts the whole typing session
    expect(usePlottingStore.getState().stops[0].name).toBe("A");
  });

  it("undo of a connection dropdown change restores the previous chain AND path", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn(
      async (coordinates: CoordinatePair[]): Promise<SnappedPath> => ({
        polyline: { type: "LineString", coordinates },
        distanceMeters: 100,
        snapped: true,
        warning: null,
      }),
    );
    bindSnapFetcher(fetcher);
    const { addStop, setStopLinks, undo, redo } = usePlottingStore.getState();
    addStop([122.5, 10.6], "A");
    addStop([122.51, 10.61], "B");
    addStop([122.52, 10.62], "C");
    await vi.advanceTimersByTimeAsync(SNAP_DEBOUNCE_MS);
    const [a, , c] = usePlottingStore.getState().stops;
    const chainBefore = usePlottingStore.getState().connections.map((e) => ({
      ...e,
    }));
    const stopIds = usePlottingStore.getState().stops.map((s) => s.id);
    const roadBefore = usePlottingStore.getState().polyline;

    // Rewire C's "from" to A (was B) — a real structural change.
    setStopLinks(c.id, { from: a.id });
    await vi.advanceTimersByTimeAsync(SNAP_DEBOUNCE_MS);
    const chainAfter = usePlottingStore.getState().connections.map((e) => ({
      ...e,
    }));
    expect(chainAfter.map((e) => e.id)).not.toEqual(
      chainBefore.map((e) => e.id),
    );

    // ONE undo restores the previous connection relationship AND its path,
    // with a truthful path↔stop association (save guard must NOT false-block).
    undo();
    const undone = usePlottingStore.getState();
    expect(undone.connections.map((e) => e.id)).toEqual(
      chainBefore.map((e) => e.id),
    );
    expect(undone.polyline?.coordinates).toEqual(roadBefore?.coordinates);
    expect(undone.pathStopIds).toEqual(stopIds); // association restored truthfully
    expect(undone.draftDirty).toBe(true);
    // redo re-applies the new relationship.
    redo();
    const redone = usePlottingStore.getState();
    expect(redone.connections.map((e) => e.id)).toEqual(
      chainAfter.map((e) => e.id),
    );
    bindSnapFetcher(null);
    vi.useRealTimers();
  });
});
