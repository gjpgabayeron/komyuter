import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  CoordinatePair,
  GeoLineString,
  SnappedPath,
  StopType,
} from "@komyuter/shared";
import { clearSelection, isStopSelected, selectStop } from "@/lib/selection";
import {
  bindSnapFetcher,
  cancelPendingSnap,
  draftMatchesBaseline,
  reorderStops,
  visibleStopsForLayers,
  type LayerVisibility,
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
    expect(isStopSelected(selectStop("stop-2"), "stop-1")).toBe(false);
  });
});

describe("plottingStore", () => {
  beforeEach(() => {
    usePlottingStore.getState().reset();
  });

  it("setHoveredStop drives the map↔sidebar hover highlight, reset clears it", () => {
    const { setHoveredStop } = usePlottingStore.getState();
    expect(usePlottingStore.getState().hoveredStopId).toBeNull();

    setHoveredStop("stop-abc");
    expect(usePlottingStore.getState().hoveredStopId).toBe("stop-abc");

    setHoveredStop(null);
    expect(usePlottingStore.getState().hoveredStopId).toBeNull();

    // A fresh route/reset must never carry a stale hover into the new route.
    setHoveredStop("stop-abc");
    usePlottingStore.getState().reset();
    expect(usePlottingStore.getState().hoveredStopId).toBeNull();
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
    setSelection(selectStop("stop-1"));
    setLayers({ routes: false });
    reset();
    const state = usePlottingStore.getState();
    expect(state.stops).toEqual([]);
    expect(state.polyline).toBeNull();
    expect(state.snap.status).toBe("idle");
    expect(state.selection).toEqual(clearSelection);
    expect(state.layers).toEqual({
      base: true,
      baseStyle: "default",
      baseOpacity: 1,
      markers: { terminal: true, major_stop: true, waiting_area: true },
      markerLabels: true,
      routes: true,
      detours: true,
      detourStops: true,
      detourStopLabels: true,
      detourNodes: true,
    });
    expect(state.history).toEqual({ past: [], future: [] });
  });

  it("new stops default to the Waiting Area type (Pasted #42)", () => {
    const { addStop } = usePlottingStore.getState();
    addStop([122.5, 10.6]);
    expect(usePlottingStore.getState().stops[0].type).toBe("waiting_area");
    expect(usePlottingStore.getState().stops[0].name).toBe("Stop 1");
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

  it("focusedRouteId is cleared when a route is opened", () => {
    const { setFocusedRouteId, openRoute } = usePlottingStore.getState();
    setFocusedRouteId("route-9");
    expect(usePlottingStore.getState().focusedRouteId).toBe("route-9");
    openRoute("route-1");
    expect(usePlottingStore.getState().focusedRouteId).toBeNull();
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

  it("reorderStops down-move needs target = index + 2 (insert-before semantics)", () => {
    // reorderStop inserts BEFORE the target row, so moving an item down one
    // slot requires passing index + 2; index + 1 is a no-op (T050 keyboard
    // reorder regression guard).
    expect(reorderStops(["A", "B", "C"], 0, 2)).toEqual(["B", "A", "C"]);
    expect(reorderStops(["A", "B", "C"], 0, 1)).toEqual(["A", "B", "C"]);
    expect(reorderStops(["A", "B", "C", "D"], 2, 4)).toEqual([
      "A",
      "B",
      "D",
      "C",
    ]);
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

  it("resolves a pending preview before save by firing it immediately", async () => {
    const fetcher = vi.fn(async (coordinates: CoordinatePair[]) =>
      snapResult(coordinates),
    );
    bindSnapFetcher(fetcher);
    const { addStop, resolvePendingSnap } = usePlottingStore.getState();
    addStop([122.5, 10.6]);
    addStop([122.51, 10.61]);
    // The debounced snap hasn't fired yet — resolving fires it NOW so the
    // save sees the committed path, and no stray fetch fires afterwards.
    await resolvePendingSnap();
    await vi.advanceTimersByTimeAsync(1000);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(usePlottingStore.getState().snap.status).toBe("applied");
    expect(usePlottingStore.getState().polyline?.coordinates).toEqual([
      [122.5, 10.6],
      [122.51, 10.61],
    ]);
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

describe("layer filtering (FR-016 product revision)", () => {
  const stop = (id: string, type: StopType) => ({
    id,
    name: id,
    type,
    location: [122.5, 10.6] as [number, number],
  });
  const allOn: LayerVisibility = {
    base: true,
    baseStyle: "default",
    baseOpacity: 1,
    markers: { terminal: true, major_stop: true, waiting_area: true },
    markerLabels: true,
    routes: true,
    detours: true,
    detourStops: true,
    detourStopLabels: true,
    detourNodes: true,
  };

  it("shows every stop type by default (Markers all on)", () => {
    const stops = [
      stop("t", "terminal"),
      stop("m", "major_stop"),
      stop("w", "waiting_area"),
    ];
    expect(visibleStopsForLayers(stops, allOn).map((s) => s.id)).toEqual([
      "t",
      "m",
      "w",
    ]);
  });

  it("hides only the toggled-off stop type", () => {
    const stops = [
      stop("t", "terminal"),
      stop("m", "major_stop"),
      stop("w", "waiting_area"),
    ];
    const layers: LayerVisibility = {
      ...allOn,
      markers: { ...allOn.markers, waiting_area: false },
    };
    expect(visibleStopsForLayers(stops, layers).map((s) => s.id)).toEqual([
      "t",
      "m",
    ]);
    // Turning another type off leaves the first hidden type hidden.
    const layers2: LayerVisibility = {
      ...allOn,
      markers: { ...allOn.markers, terminal: false, waiting_area: false },
    };
    expect(visibleStopsForLayers(stops, layers2).map((s) => s.id)).toEqual([
      "m",
    ]);
  });

  it("toggling one control affects only that control (setLayers merges)", () => {
    const { setLayers } = usePlottingStore.getState();
    setLayers({
      markers: {
        ...usePlottingStore.getState().layers.markers,
        terminal: false,
      },
    });
    let layers = usePlottingStore.getState().layers;
    expect(layers.markers.terminal).toBe(false);
    expect(layers.markers.major_stop).toBe(true); // untouched
    expect(layers.base).toBe(true);
    expect(layers.routes).toBe(true);
    setLayers({ base: false });
    layers = usePlottingStore.getState().layers;
    expect(layers.base).toBe(false);
    expect(layers.markers.terminal).toBe(false); // untouched
    expect(layers.routes).toBe(true); // untouched
    setLayers({ baseStyle: "3d", baseOpacity: 0.4 });
    layers = usePlottingStore.getState().layers;
    expect(layers.baseStyle).toBe("3d");
    expect(layers.baseOpacity).toBe(0.4);
  });
});

describe("loop closure (FR-004 / loop-close bug)", () => {
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

  it("sends the closing waypoint when the last stop sits near the first", async () => {
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
    const { addStop } = usePlottingStore.getState();
    addStop([122.5, 10.6]); // A
    addStop([122.51, 10.61]); // B
    await vi.advanceTimersByTimeAsync(SNAP_DEBOUNCE_MS);
    fetcher.mockClear();
    addStop([122.5, 10.601]); // C ≈ A (≈ 111 m) — within the close tolerance
    await vi.advanceTimersByTimeAsync(SNAP_DEBOUNCE_MS);
    const lastCall = fetcher.mock.calls[
      fetcher.mock.calls.length - 1
    ][0] as CoordinatePair[];
    // The closing waypoint (first stop re-appended) is sent so the snap closes.
    expect(lastCall[lastCall.length - 1]).toEqual([122.5, 10.6]);
    expect(lastCall).toHaveLength(4);
    bindSnapFetcher(null);
    vi.useRealTimers();
  });

  it("does NOT append the closing point for an open route", async () => {
    const fetcher = vi.fn(
      async (coordinates: CoordinatePair[]): Promise<SnappedPath> => ({
        polyline: { type: "LineString", coordinates },
        distanceMeters: 100,
        snapped: true,
        warning: null,
      }),
    );
    bindSnapFetcher(fetcher);
    const { addStop } = usePlottingStore.getState();
    addStop([122.5, 10.6]);
    addStop([122.51, 10.61]);
    await vi.advanceTimersByTimeAsync(SNAP_DEBOUNCE_MS);
    fetcher.mockClear();
    addStop([122.52, 10.62]); // C far from A — open route
    await vi.advanceTimersByTimeAsync(SNAP_DEBOUNCE_MS);
    const lastCall = fetcher.mock.calls[
      fetcher.mock.calls.length - 1
    ][0] as CoordinatePair[];
    expect(lastCall).toHaveLength(3);
  });
});

describe("connection edits preserve road geometry (loop/None bug)", () => {
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

  const roadFetcher = () =>
    vi.fn(async (coordinates: CoordinatePair[]): Promise<SnappedPath> => ({
      polyline: { type: "LineString", coordinates },
      distanceMeters: 100,
      snapped: true,
      warning: null,
    }));

  it("setting connected-to None keeps the road polyline and re-snaps the remaining chain", async () => {
    const fetcher = roadFetcher();
    bindSnapFetcher(fetcher);
    const { addStop, setStopLinks } = usePlottingStore.getState();
    addStop([122.5, 10.6]);
    addStop([122.51, 10.61]);
    addStop([122.52, 10.62]);
    await vi.advanceTimersByTimeAsync(SNAP_DEBOUNCE_MS);
    const road = usePlottingStore.getState().polyline;
    expect(road?.coordinates).toHaveLength(3);

    fetcher.mockClear();
    const b = usePlottingStore.getState().stops[1];
    setStopLinks(b.id, { from: null }); // disconnect A—B
    const after = usePlottingStore.getState();
    // The committed road-snapped path is PRESERVED (never swapped for a
    // straight derived line), the association is invalidated, and a re-snap
    // is requested for the remaining chain B—C.
    expect(after.polyline).toBe(road);
    expect(after.pathStopIds).toBeNull();
    await vi.advanceTimersByTimeAsync(SNAP_DEBOUNCE_MS);
    const lastCall = fetcher.mock.calls[
      fetcher.mock.calls.length - 1
    ][0] as CoordinatePair[];
    expect(lastCall).toEqual([
      [122.51, 10.61],
      [122.52, 10.62],
    ]);
    // The committed path's association must match the CHAIN waypoints
    // ([B, C] — the a→b edge was removed, so A is off-path), not all placed
    // stops — otherwise the save guard would permanently reject the route.
    const ids = usePlottingStore.getState().pathStopIds;
    expect(ids).toHaveLength(2);
  });

  it("closing a loop via connected-to re-snaps the chain order with the closing waypoint", async () => {
    const fetcher = roadFetcher();
    bindSnapFetcher(fetcher);
    const { addStop, setStopLinks } = usePlottingStore.getState();
    addStop([122.5, 10.6]); // A
    addStop([122.51, 10.61]); // B
    addStop([122.52, 10.62]); // C (far from A)
    await vi.advanceTimersByTimeAsync(SNAP_DEBOUNCE_MS);
    fetcher.mockClear();
    const c = usePlottingStore.getState().stops[2];
    setStopLinks(c.id, {
      to: c ? usePlottingStore.getState().stops[0].id : "",
    }); // C→A closes the loop
    await vi.advanceTimersByTimeAsync(SNAP_DEBOUNCE_MS);
    const lastCall = fetcher.mock.calls[
      fetcher.mock.calls.length - 1
    ][0] as CoordinatePair[];
    // Chain order A—B—C plus the closing waypoint back to A.
    expect(lastCall).toEqual([
      [122.5, 10.6],
      [122.51, 10.61],
      [122.52, 10.62],
      [122.5, 10.6],
    ]);
  });
  it("opening a loop via connected-to None removes ONLY the closure edge (user spec)", async () => {
    const fetcher = roadFetcher();
    bindSnapFetcher(fetcher);
    const { addStop, setStopLinks } = usePlottingStore.getState();
    addStop([122.5, 10.6]); // A
    addStop([122.51, 10.61]); // B
    addStop([122.52, 10.62]); // C
    await vi.advanceTimersByTimeAsync(SNAP_DEBOUNCE_MS);
    fetcher.mockClear();
    const c = usePlottingStore.getState().stops[2];
    // Close the loop (C's connected-to = A).
    setStopLinks(c.id, { to: usePlottingStore.getState().stops[0].id });
    await vi.advanceTimersByTimeAsync(SNAP_DEBOUNCE_MS);
    expect(usePlottingStore.getState().connections.length).toBe(3);
    fetcher.mockClear();
    // Open it: C's connected-to = None.
    setStopLinks(c.id, { to: null });
    await vi.advanceTimersByTimeAsync(SNAP_DEBOUNCE_MS);
    const opened = usePlottingStore.getState();
    // ONLY the C→A closure edge is gone; A→B and B→C are untouched.
    expect(opened.connections.map((e) => e.to === e.to && e.from)).toHaveLength(
      2,
    );
    const lastCall = fetcher.mock.calls[
      fetcher.mock.calls.length - 1
    ][0] as CoordinatePair[];
    // Linear A—B—C: the open chain, NO closing waypoint back to A.
    expect(lastCall).toEqual([
      [122.5, 10.6],
      [122.51, 10.61],
      [122.52, 10.62],
    ]);
  });

  it("adding a stop to a loop route keeps the chain order (no reversed snap)", async () => {
    const fetcher = roadFetcher();
    bindSnapFetcher(fetcher);
    const { setStops, setPolyline, addStop } = usePlottingStore.getState();
    const A = {
      id: "a",
      name: "A",
      type: "major_stop" as const,
      location: [122.5, 10.6] as [number, number],
    };
    const B = {
      id: "b",
      name: "B",
      type: "major_stop" as const,
      location: [122.51, 10.61] as [number, number],
    };
    const C = {
      id: "c",
      name: "C",
      type: "major_stop" as const,
      location: [122.52, 10.62] as [number, number],
    };
    const loop: GeoLineString = {
      type: "LineString",
      coordinates: [
        [122.5, 10.6],
        [122.51, 10.61],
        [122.52, 10.62],
        [122.5, 10.6],
      ],
    };
    setStops([A, B, C], loop);
    setPolyline(loop);
    expect(usePlottingStore.getState().connections).toHaveLength(3); // closed a-b b-c c-a

    fetcher.mockClear();
    addStop([122.53, 10.63]); // D — the OLD manual append corrupted the loop chain
    await vi.advanceTimersByTimeAsync(SNAP_DEBOUNCE_MS);
    const lastCall = fetcher.mock.calls[
      fetcher.mock.calls.length - 1
    ][0] as CoordinatePair[];
    // Correct order A,B,C,D + closing waypoint A — NOT reversed.
    expect(lastCall).toEqual([
      [122.5, 10.6],
      [122.51, 10.61],
      [122.52, 10.62],
      [122.53, 10.63],
      [122.5, 10.6],
    ]);
  });
});

describe("draft restore association race (rewired chain + stale path)", () => {
  beforeEach(() => {
    bindSnapFetcher(null);
    usePlottingStore.getState().reset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    bindSnapFetcher(null);
    usePlottingStore.getState().reset();
    vi.useRealTimers();
  });

  it("untrusts a stale pathStopIds that no longer matches the restored chain and re-snaps", async () => {
    const fetcher = vi.fn(
      async (coordinates: CoordinatePair[]): Promise<SnappedPath> => ({
        polyline: { type: "LineString", coordinates },
        distanceMeters: 100,
        snapped: true,
        warning: null,
      }),
    );
    bindSnapFetcher(fetcher);
    usePlottingStore.getState().restoreDraft({
      routeId: "r",
      directionId: "d",
      stops: [
        {
          id: "a",
          name: "A",
          type: "major_stop",
          location: [122.5, 10.6] as [number, number],
        },
        {
          id: "b",
          name: "B",
          type: "major_stop",
          location: [122.51, 10.61] as [number, number],
        },
        {
          id: "c",
          name: "C",
          type: "major_stop",
          location: [122.52, 10.62] as [number, number],
        },
      ],
      connections: [
        { id: "a-b", from: "a", to: "b" },
        { id: "b-c", from: "b", to: "c" },
      ],
      // Race snapshot: the polyline + association describe the PRE-edit chain
      // (A, B only) while the connections already carry the rewired chain.
      polyline: {
        type: "LineString",
        coordinates: [
          [122.5, 10.6] as [number, number],
          [122.51, 10.61] as [number, number],
        ],
      },
      pathStopIds: ["a", "b"],
      routeMeta: null,
      history: { past: [], future: [] },
    });
    // The stale association is NOT trusted — it doesn't match the restored
    // chain (A,B,C), so it is nulled and the save guard would block.
    expect(usePlottingStore.getState().pathStopIds).toBeNull();
    await vi.advanceTimersByTimeAsync(SNAP_DEBOUNCE_MS);
    // The re-snap fires for the restored chain and auto-commits a truthful
    // association covering all three stops — Save unblocks.
    expect(usePlottingStore.getState().pathStopIds).toEqual(["a", "b", "c"]);
  });

  it("resolvePendingSnap fires an awaiting pending snap so a quick save sees the rewired chain", async () => {
    const fetcher = vi.fn(
      async (coordinates: CoordinatePair[]): Promise<SnappedPath> => ({
        polyline: { type: "LineString", coordinates },
        distanceMeters: 100,
        snapped: true,
        warning: null,
      }),
    );
    bindSnapFetcher(fetcher);
    const { addStop, setStopLinks, resolvePendingSnap } =
      usePlottingStore.getState();
    addStop([122.5, 10.6]);
    addStop([122.51, 10.61]);
    addStop([122.52, 10.62]);
    await vi.advanceTimersByTimeAsync(SNAP_DEBOUNCE_MS); // commit the initial path
    const initial = usePlottingStore.getState().pathStopIds!;
    expect(fetcher).toHaveBeenCalledTimes(1);
    // Rewire A's "to" -> C (chain [A,C], B drops off). The re-snap is still
    // DEBOUNCED — a save at this instant must NOT cancel it (old behavior,
    // which blocked the save and left the draft out of sync).
    setStopLinks(initial[0], { to: initial[2] });
    expect(usePlottingStore.getState().pathStopIds).toBeNull();
    const snap = await resolvePendingSnap();
    expect(snap.snapped).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(usePlottingStore.getState().pathStopIds).toEqual([
      initial[0],
      initial[2],
    ]);
  });
});

describe("loop-end removal re-closes the chain", () => {
  beforeEach(() => {
    usePlottingStore.getState().reset();
  });

  it("removing the LAST stop of a closed loop reconnects prev→first", () => {
    const { setStops, removeStop } = usePlottingStore.getState();
    const A = {
      id: "a",
      name: "A",
      type: "major_stop" as const,
      location: [122.5, 10.6] as [number, number],
    };
    const B = {
      id: "b",
      name: "B",
      type: "major_stop" as const,
      location: [122.51, 10.61] as [number, number],
    };
    const C = {
      id: "c",
      name: "C",
      type: "major_stop" as const,
      location: [122.52, 10.62] as [number, number],
    };
    const D = {
      id: "d",
      name: "D",
      type: "major_stop" as const,
      location: [122.5, 10.605] as [number, number],
    };
    const loop: GeoLineString = {
      type: "LineString",
      coordinates: [
        [122.5, 10.6],
        [122.51, 10.61],
        [122.52, 10.62],
        [122.5, 10.6],
      ],
    };
    setStops([A, B, C, D], loop); // closed: a→b b→c c→d d→a
    expect(usePlottingStore.getState().connections).toHaveLength(4);
    removeStop("d");
    // The chain re-closes c→a (D was the last stop of the closed chain).
    const edges = usePlottingStore
      .getState()
      .connections.map((c) => `${c.from}->${c.to}`);
    expect(edges).toEqual(["a->b", "b->c", "c->a"]);
  });
});

describe("custom chain durability (no silent consecutive rebuild)", () => {
  beforeEach(() => {
    usePlottingStore.getState().reset();
  });

  const edgeKey = (c: { from: string; to: string }) => `${c.from}->${c.to}`;

  it("addStop appends to the chain's end; removeStop reconnects; undo restores exactly", () => {
    const { addStop, setStopLinks, removeStop, undo } =
      usePlottingStore.getState();
    addStop([122.5, 10.7]);
    addStop([122.51, 10.71]);
    addStop([122.52, 10.72]);
    const [A, B, C] = usePlottingStore.getState().stops.map((s) => s.id);
    // Build custom chain [A,C,B]: A.to=C, then B.from=C.
    setStopLinks(A, { to: C });
    setStopLinks(B, { from: C });
    let keys = usePlottingStore.getState().connections.map(edgeKey);
    expect(keys).toEqual([`${A}->${C}`, `${C}->${B}`]);
    expect(keys).not.toContain(`${A}->${B}`); // no a->b: not a consecutive rebuild
    // Adding D appends AFTER B (the chain's end) — the custom order survives.
    addStop([122.53, 10.73]);
    const D = usePlottingStore.getState().stops[3].id;
    keys = usePlottingStore.getState().connections.map(edgeKey);
    expect(keys).toEqual([`${A}->${C}`, `${C}->${B}`, `${B}->${D}`]);
    expect(keys).not.toContain(`${A}->${B}`);
    // Removing a MIDDLE stop reconnects its neighbours (skip it) — the custom
    // A→C prefix survives: [A,C,B,D] minus B → [A,C,D].
    removeStop(B);
    const keys2 = usePlottingStore.getState().connections.map(edgeKey);
    expect(keys2).toEqual([`${A}->${C}`, `${C}->${D}`]);
    // Undo restores the exact pre-removal chain.
    undo();
    expect(usePlottingStore.getState().connections).toHaveLength(3);
  });
});

describe("cache seed (Phase 2 — instant edit paint)", () => {
  const polyline = (): GeoLineString => ({
    type: "LineString",
    coordinates: [
      [122.5, 10.6],
      [122.51, 10.61],
      [122.52, 10.62],
    ],
  });
  const seed = {
    polyline: polyline(),
    stops: [
      {
        id: "s1",
        name: "Stop 1",
        type: "major_stop" as const,
        location: [122.5, 10.6] as [number, number],
      },
      {
        id: "s2",
        name: "Stop 2",
        type: "waiting_area" as const,
        location: [122.51, 10.61] as [number, number],
      },
      {
        id: "s3",
        name: "Stop 3",
        type: "terminal" as const,
        location: [122.52, 10.62] as [number, number],
      },
    ],
  };

  beforeEach(() => {
    usePlottingStore.getState().reset();
  });

  it("seedFromOverview populates stops + polyline + baseline with directionId null", () => {
    const store = usePlottingStore.getState();
    store.openRoute("route-1");
    usePlottingStore.getState().seedFromOverview(seed);
    const state = usePlottingStore.getState();
    expect(state.seedSource).toBe("cache");
    expect(state.stops.map((s) => s.id)).toEqual(["s1", "s2", "s3"]);
    expect(state.polyline?.coordinates).toHaveLength(3);
    expect(state.directionId).toBeNull();
    expect(state.draftDirty).toBe(false);
    expect(state.pathStopIds).toEqual(["s1", "s2", "s3"]);
    // The seeded state is the saved baseline — undo back to it hides Save.
    expect(state.savedBaseline?.stops.map((s) => s.id)).toEqual([
      "s1",
      "s2",
      "s3",
    ]);
    expect(state.savedBaseline?.polyline).toEqual(polyline());
  });

  it("seedFromOverview is a no-op when the draft already has stops", () => {
    const store = usePlottingStore.getState();
    store.openRoute("route-1");
    store.addStop([122.5, 10.6]);
    usePlottingStore.getState().seedFromOverview(seed);
    const state = usePlottingStore.getState();
    expect(state.seedSource).toBeNull();
    expect(state.stops).toHaveLength(1);
  });

  it("seedFromOverview is a no-op with no route open", () => {
    usePlottingStore.getState().seedFromOverview(seed);
    const state = usePlottingStore.getState();
    expect(state.seedSource).toBeNull();
    expect(state.stops).toEqual([]);
  });

  it("openRoute resets seedSource back to null", () => {
    const store = usePlottingStore.getState();
    store.openRoute("route-1");
    usePlottingStore.getState().seedFromOverview(seed);
    expect(usePlottingStore.getState().seedSource).toBe("cache");
    store.openRoute(null);
    expect(usePlottingStore.getState().seedSource).toBeNull();
  });

  it("reset() clears seedSource", () => {
    const store = usePlottingStore.getState();
    store.openRoute("route-1");
    usePlottingStore.getState().seedFromOverview(seed);
    store.reset();
    expect(usePlottingStore.getState().seedSource).toBeNull();
  });
});

describe("insertStopBetween (context-menu insert above/below)", () => {
  beforeEach(() => {
    usePlottingStore.getState().reset();
  });

  function seedStops() {
    const { setStops, addStop } = usePlottingStore.getState();
    setStops([], null);
    addStop([122.5, 10.6], "Alpha");
    addStop([122.51, 10.61], "Beta");
    addStop([122.52, 10.62], "Gamma");
  }

  it("anchoring on the predecessor places the new stop ABOVE the target (insert before)", () => {
    seedStops();
    const { stops } = usePlottingStore.getState();
    const target = stops[1]; // Beta
    const predecessor = stops[0]; // Alpha

    // Mirrors RouteList.insertBefore: anchor = predecessor, location = midpoint.
    usePlottingStore
      .getState()
      .insertStopBetween(predecessor.id, [
        (predecessor.location[0] + target.location[0]) / 2,
        (predecessor.location[1] + target.location[1]) / 2,
      ]);

    const after = usePlottingStore.getState().stops;
    expect(after.map((s) => s.name)).toEqual([
      "Alpha",
      "Stop 4",
      "Beta",
      "Gamma",
    ]);
    // The new stop is selected so it can be dragged into place.
    expect(usePlottingStore.getState().selection).toEqual({
      type: "stop",
      stopId: after[1].id,
    });
  });

  it("anchoring on the target places the new stop BELOW it (insert after)", () => {
    seedStops();
    const { stops } = usePlottingStore.getState();
    const target = stops[1]; // Beta
    const successor = stops[2]; // Gamma

    // Mirrors RouteList.insertAfter: anchor = target, location = midpoint.
    usePlottingStore
      .getState()
      .insertStopBetween(target.id, [
        (target.location[0] + successor.location[0]) / 2,
        (target.location[1] + successor.location[1]) / 2,
      ]);

    const after = usePlottingStore.getState().stops;
    expect(after.map((s) => s.name)).toEqual([
      "Alpha",
      "Beta",
      "Stop 4",
      "Gamma",
    ]);
  });
});
