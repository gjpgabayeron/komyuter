import { describe, expect, it } from "vitest";
import type { GeoLineString } from "@komyuter/shared";
import type { DetourEntity } from "@/features/routes/routesApi";
import {
  createDetourStore,
  type DetourTarget,
  type LoopSnapper,
} from "@/features/detours/detourStore";

/**
 * Attribution on detours (ADR-0025, ticket #46). The Detour surface reads the
 * saved `editBaseline`, and the Detour Stop surface reads the draft stop; both
 * must carry the server's `{ userId, name } | null` so the panel and the stop
 * editor can render a name (or "Not recorded" for a row that predates the
 * columns). The pure seam here is the store's mapping of a saved detour into
 * its editable draft — it must not drop what the server returned.
 */

const BASE: GeoLineString = {
  type: "LineString",
  coordinates: [
    [122.5, 10.6],
    [122.51, 10.61],
    [122.52, 10.62],
  ],
};

const TARGET: DetourTarget = {
  directionId: "dir-1",
  directionLabel: "Outbound",
  routeId: "route-1",
  routeName: "Route 1",
  basePolyline: BASE,
  existingDetourCount: 1,
  stops: [
    { stop_id: "stop-1", name: "Terminal", location: [122.5, 10.6] },
    { stop_id: "stop-2", name: "Bridge", location: [122.52, 10.62] },
  ],
};

const echoSnap = (async (coordinates: [number, number][]) => ({
  type: "LineString" as const,
  coordinates,
})) as unknown as LoopSnapper;

const CREATOR = { userId: "user-owner", name: "Ada Reyes" };
const LAST_WRITER = { userId: "user-plotter", name: "Ben Cruz" };

/** A saved detour as the server returns it, with Attribution on the detour and
 *  on each detour stop (the wire shape from ADR-0025 §5). */
function savedDetour(): DetourEntity {
  return {
    detour_id: "detour-1",
    direction_id: "dir-1",
    label: "Market diversion",
    entry: { type: "Point", coordinates: [122.5, 10.6] },
    exit: { type: "Point", coordinates: [122.52, 10.62] },
    detour_polyline: BASE,
    additional_distance_meters: 120,
    commuter_instruction: "Turn left at the market",
    driver_instruction: null,
    detour_stops: [
      {
        detour_stop_id: "dstop-1",
        detour_id: "detour-1",
        stop_order: 0,
        name: "Market",
        location: { type: "Point", coordinates: [122.51, 10.61] },
        type: "waiting_area",
        is_guaranteed_service: false,
        landmark_hint: null,
        notes: null,
        created_at: "2026-10-31T00:00:00.000Z",
        updated_at: "2026-10-31T00:00:00.000Z",
        created_by: CREATOR,
        updated_by: LAST_WRITER,
      },
      {
        detour_stop_id: "dstop-2",
        detour_id: "detour-1",
        stop_order: 1,
        name: "Old stop",
        location: { type: "Point", coordinates: [122.515, 10.615] },
        type: "waiting_area",
        is_guaranteed_service: false,
        landmark_hint: null,
        notes: null,
        created_at: "2026-10-31T00:00:00.000Z",
        updated_at: "2026-10-31T00:00:00.000Z",
        // A stop written before the columns existed.
        created_by: null,
        updated_by: null,
      },
    ],
    is_active: true,
    created_at: "2026-10-31T00:00:00.000Z",
    updated_at: "2026-10-31T00:00:00.000Z",
    created_by: CREATOR,
    updated_by: LAST_WRITER,
  };
}

describe("detour store — attribution carry-through (ticket #46)", () => {
  it("keeps the saved detour's creator and last writer on the edit baseline", () => {
    const store = createDetourStore(echoSnap);
    store.getState().openEdit(savedDetour(), TARGET);

    const baseline = store.getState().editBaseline;
    expect(baseline?.created_by).toEqual(CREATOR);
    expect(baseline?.updated_by).toEqual(LAST_WRITER);
  });

  it("carries each saved detour stop's attribution into its editable draft", () => {
    const store = createDetourStore(echoSnap);
    store.getState().openEdit(savedDetour(), TARGET);

    const [first, second] = store.getState().detourStops;
    // The stop the server attributed keeps it.
    expect(first.created_by).toEqual(CREATOR);
    expect(first.updated_by).toEqual(LAST_WRITER);
    // The stop written before the columns existed reads null, not an invented actor.
    expect(second.created_by).toBeNull();
    expect(second.updated_by).toBeNull();
  });

  it("leaves a newly added draft detour stop unattributed", () => {
    const store = createDetourStore(echoSnap);
    store.getState().openNew(TARGET);
    // split → merge → waypoint (the branching-node flow).
    store.getState().handleMapClick([122.5, 10.6]);
    store.getState().handleMapClick([122.52, 10.62]);
    store.getState().handleMapClick([122.505, 10.605]);

    const [added] = store.getState().detourStops;
    // The server has not observed a write for this stop yet.
    expect(added.created_by ?? null).toBeNull();
    expect(added.updated_by ?? null).toBeNull();
  });
});
