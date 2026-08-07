import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CoordinatePair, SnappedPath } from "@komyuter/shared";
import {
  clearSelection,
  isStopSelected,
  selectPolyline,
  selectStop,
} from "@/lib/selection";
import {
  bindSnapFetcher,
  cancelPendingSnap,
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

  it("marks the preview pending while the request is in flight, then preview", async () => {
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
    const { snap } = usePlottingStore.getState();
    expect(snap.status).toBe("preview");
    expect(snap.polyline?.coordinates).toEqual([
      [122.5, 10.6],
      [122.51, 10.61],
    ]);
    expect(snap.distanceMeters).toBe(1234);
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

  it("apply commits the preview to the draft polyline", async () => {
    const fetcher = vi.fn(async (coordinates: CoordinatePair[]) =>
      snapResult(coordinates),
    );
    bindSnapFetcher(fetcher);
    const { addStop } = usePlottingStore.getState();
    addStop([122.5, 10.6]);
    addStop([122.51, 10.61]);
    await vi.advanceTimersByTimeAsync(SNAP_DEBOUNCE_MS);
    expect(usePlottingStore.getState().polyline).toBeNull();
    usePlottingStore.getState().applySnapPreview();
    const { polyline, snap } = usePlottingStore.getState();
    expect(snap.status).toBe("applied");
    expect(polyline?.coordinates).toEqual([
      [122.5, 10.6],
      [122.51, 10.61],
    ]);
  });

  it("revert discards the preview and keeps the previously applied line", async () => {
    const fetcher = vi.fn(async (coordinates: CoordinatePair[]) =>
      snapResult(coordinates),
    );
    bindSnapFetcher(fetcher);
    const { addStop } = usePlottingStore.getState();
    addStop([122.5, 10.6]);
    addStop([122.51, 10.61]);
    await vi.advanceTimersByTimeAsync(SNAP_DEBOUNCE_MS);
    usePlottingStore.getState().applySnapPreview();
    addStop([122.52, 10.62]);
    await vi.advanceTimersByTimeAsync(SNAP_DEBOUNCE_MS);
    expect(usePlottingStore.getState().snap.status).toBe("preview");
    usePlottingStore.getState().revertSnapPreview();
    const { polyline, snap } = usePlottingStore.getState();
    expect(snap.status).toBe("reverted");
    expect(snap.polyline).toBeNull();
    expect(polyline?.coordinates).toEqual([
      [122.5, 10.6],
      [122.51, 10.61],
    ]);
  });

  it("ignores a superseded in-flight preview after another placement", async () => {
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
    const { snap } = usePlottingStore.getState();
    expect(snap.status).toBe("preview");
    expect(snap.polyline?.coordinates).toEqual([
      [122.5, 10.6],
      [122.51, 10.61],
      [122.52, 10.62],
    ]);
  });

  it("revert restores dragged stop positions to their pre-edit state", async () => {
    const fetcher = vi.fn(async (coordinates: CoordinatePair[]) =>
      snapResult(coordinates),
    );
    bindSnapFetcher(fetcher);
    const { addStop, moveStop, revertSnapPreview } =
      usePlottingStore.getState();
    addStop([122.5, 10.6], "A");
    addStop([122.51, 10.61], "B");
    await vi.advanceTimersByTimeAsync(SNAP_DEBOUNCE_MS); // preview from placement
    const stopId = usePlottingStore.getState().stops[0].id;
    moveStop(stopId, [122.55, 10.65]); // drag → new preview scheduled
    await vi.advanceTimersByTimeAsync(SNAP_DEBOUNCE_MS);
    expect(usePlottingStore.getState().snap.status).toBe("preview");
    expect(usePlottingStore.getState().stops[0].location).toEqual([
      122.55, 10.65,
    ]);
    revertSnapPreview();
    expect(usePlottingStore.getState().snap.status).toBe("reverted");
    expect(usePlottingStore.getState().stops[0].location).toEqual([
      122.5, 10.6,
    ]);
    expect(usePlottingStore.getState().previewBaseline).toBeNull();
  });

  it("apply commits the preview and clears the position baseline", async () => {
    const fetcher = vi.fn(async (coordinates: CoordinatePair[]) =>
      snapResult(coordinates),
    );
    bindSnapFetcher(fetcher);
    const { addStop, moveStop, applySnapPreview } = usePlottingStore.getState();
    addStop([122.5, 10.6], "A");
    addStop([122.51, 10.61], "B");
    await vi.advanceTimersByTimeAsync(SNAP_DEBOUNCE_MS);
    const stopId = usePlottingStore.getState().stops[0].id;
    moveStop(stopId, [122.55, 10.65]);
    await vi.advanceTimersByTimeAsync(SNAP_DEBOUNCE_MS);
    applySnapPreview();
    expect(usePlottingStore.getState().previewBaseline).toBeNull();
    expect(usePlottingStore.getState().stops[0].location).toEqual([
      122.55, 10.65,
    ]);
  });
});
