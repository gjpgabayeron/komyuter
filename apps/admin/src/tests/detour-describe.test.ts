import { describe, expect, it, vi } from "vitest";
import type { GeoLineString } from "@komyuter/shared";
import type { DetourEntity } from "@/features/routes/routesApi";
import {
  createDetourStore,
  type DetourTarget,
  type LoopSnapper,
} from "@/features/detours/detourStore";

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
    name: "Terminal",
    location: [122.5, 10.6] as [number, number],
  },
  {
    stop_id: "stop-2",
    name: "Market",
    location: [122.51, 10.61] as [number, number],
  },
  {
    stop_id: "stop-3",
    name: "Bridge",
    location: [122.52, 10.62] as [number, number],
  },
];

const TARGET: DetourTarget = {
  directionId: "dir-1",
  directionLabel: "Outbound",
  routeId: "route-1",
  routeName: "Route 1",
  basePolyline: BASE,
  existingDetourCount: 0,
  stops: STOPS,
};

/** Snake path — lengthens each leg slightly vs the base line. */
const extendedSnap = vi.fn(
  async (coordinates: [number, number][]): Promise<GeoLineString> => ({
    type: "LineString",
    coordinates: coordinates.flatMap((pair, index) =>
      index === 0 || index === coordinates.length - 1
        ? [pair]
        : [[pair[0] - 0.0009, pair[1] + 0.0009], pair],
    ),
  }),
) as unknown as LoopSnapper;

const echoSnap = vi.fn(
  async (coordinates: [number, number][]): Promise<GeoLineString> => ({
    type: "LineString",
    coordinates,
  }),
) as unknown as LoopSnapper;

const SPLIT = [122.5, 10.6] as [number, number];
const MERGE = [122.52, 10.62] as [number, number];
const WAYPOINT = [122.505, 10.605] as [number, number];

/** Looks the store and composes split → merge → one waypoint. */
async function placedStore(snap: LoopSnapper = echoSnap, count = 0) {
  const store = createDetourStore(snap);
  store.getState().openNew({ ...TARGET, existingDetourCount: count });
  const get = () => store.getState();
  get().handleMapClick(SPLIT);
  get().handleMapClick(MERGE);
  get().handleMapClick(WAYPOINT);
  await vi.waitFor(() => expect(get().loop).not.toBeNull());
  return store;
}

describe("detour describe — labels (US2, FR-008)", () => {
  it("auto-generates labels in creation order", async () => {
    const store = await placedStore(echoSnap, 0);
    expect(store.getState().label).toBe("Detour 1");
    const second = await placedStore(echoSnap, 4);
    expect(second.getState().label).toBe("Detour 5");
  });

  it("blocks saves with a message that names the missing field", async () => {
    const store = await placedStore();
    const get = () => store.getState();

    get().setLabel("");
    let result = get().validateSave();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("label");

    get().setLabel("Detour 1");
    get().setCommuterInstruction("");
    result = get().validateSave();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("instruction");
  });
});

describe("detour describe — additional distance (FR-011)", () => {
  it("is the loop length minus the replaced arc, recomputed as waypoints grow", async () => {
    const store = createDetourStore(extendedSnap);
    store.getState().openNew(TARGET);
    const get = () => store.getState();
    get().handleMapClick(SPLIT);
    get().handleMapClick(MERGE);
    get().handleMapClick(WAYPOINT);
    await vi.waitFor(() =>
      expect(get().additionalDistanceMeters).not.toBeNull(),
    );
    const first = get().additionalDistanceMeters as number;
    expect(first).toBeGreaterThan(0);

    // A farther waypoint lengthens the road-followed loop → extra grows.
    get().handleMapClick([122.515, 10.62]);
    await vi.waitFor(() => {
      expect((get().additionalDistanceMeters as number) > first).toBe(true);
    });
  });
});

describe("detour edit — prefilled composition (US3, FR-013)", () => {
  const detour: DetourEntity = {
    detour_id: "det-1",
    direction_id: "dir-1",
    label: "Detour 1",
    entry: { type: "Point", coordinates: [122.5, 10.6] },
    exit: { type: "Point", coordinates: [122.52, 10.62] },
    detour_polyline: {
      type: "LineString",
      coordinates: [
        [122.5, 10.6],
        [122.505, 10.605],
        [122.52, 10.62],
      ],
    },
    additional_distance_meters: 120,
    commuter_instruction: "Take the diversion.",
    driver_instruction: null,
    detour_stops: [
      {
        detour_stop_id: "dstp-1",
        detour_id: "det-1",
        stop_order: 0,
        name: "Market detour stop",
        location: { type: "Point", coordinates: [122.505, 10.605] },
        type: "waiting_area",
        is_guaranteed_service: false,
        landmark_hint: null,
        notes: null,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
      },
    ],
    is_active: true,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };

  it("openEdit hydrates nodes, stops, and fields into the waypoint phase", async () => {
    const store = createDetourStore(echoSnap);
    store.getState().openEdit(detour, TARGET);
    const state = store.getState();
    expect(state.editDetourId).toBe("det-1");
    expect(state.mode).toBe("waypoint");
    expect(state.label).toBe("Detour 1");
    expect(state.entry?.index).toBe(0);
    expect(state.exit?.index).toBe(2);
    expect(state.detourStops).toHaveLength(1);
    expect(state.detourStops[0]?.name).toBe("Market detour stop");
    expect(state.loop?.coordinates).toHaveLength(3);

    const result = state.validateSave();
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.payload.detour_polyline.coordinates).toEqual([
        [122.5, 10.6],
        [122.505, 10.605],
        [122.52, 10.62],
      ]);
      expect(result.payload.detour_stops).toHaveLength(1);
    }
  });

  it("a waypoint click in edit mode appends a stop but never stomps the saved text", async () => {
    const store = createDetourStore(echoSnap);
    store.getState().openEdit(detour, TARGET);
    const get = () => store.getState();
    get().handleMapClick([122.507, 10.607]);
    expect(get().detourStops).toHaveLength(2);
    expect(get().label).toBe("Detour 1"); // saved text survives
    expect(get().commuterInstruction).toBe("Take the diversion.");
  });
});

describe("detour draft persistence (US4, T031)", () => {
  it("serializes a round-trippable snapshot with mode + stops", async () => {
    const store = await placedStore();
    const draft = store.getState().serializeDraft();
    expect(draft).not.toBeNull();
    if (!draft) return;
    expect(draft.mode).toBe("waypoint");
    expect(draft.detourStops).toHaveLength(1);

    store.getState().close();
    const restored = createDetourStore(echoSnap);
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
