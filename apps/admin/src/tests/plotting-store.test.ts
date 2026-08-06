import { beforeEach, describe, expect, it } from "vitest";
import {
  clearSelection,
  isStopSelected,
  selectPolyline,
  selectStop,
} from "@/lib/selection";
import { usePlottingStore } from "@/lib/plottingStore";

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
});
