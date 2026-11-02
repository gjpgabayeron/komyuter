import { describe, expect, it } from "vitest";
import type {
  DirectionEntity,
  RouteDetail,
  StopEntity,
} from "@/features/routes/routesApi";
import type { DraftStop, RouteMetaDraft } from "@/lib/plottingStore";
import {
  anchorLabel,
  anchorToDraftStop,
  anchorsToStops,
  baseSnapshot,
  draftSnapshot,
  entityToAnchor,
  entityToDraftStop,
  fieldLabel,
  fieldValue,
  fieldsToRouteMeta,
  metaFields,
  polylinePair,
  routeMetaFromRoute,
  serverSnapshot,
  stopToAnchor,
} from "@/features/routes/conflict/mergeInputs";

const A: [number, number] = [122.5, 10.6];
const B: [number, number] = [122.52, 10.62];

const draftStop: DraftStop = {
  id: "stop-a",
  name: "City Hall",
  type: "terminal",
  location: A,
  is_guaranteed_service: true,
  landmark_hint: "Beside the plaza",
  notes: null,
  created_by: { userId: "u1", name: "Maria" },
  updated_by: { userId: "u2", name: "Jose" },
};

const serverStop: StopEntity = {
  stop_id: "stop-a",
  direction_id: "dir-1",
  name: "City Hall",
  stop_order: 1,
  type: "terminal",
  location: { type: "Point", coordinates: A },
  is_guaranteed_service: true,
  landmark_hint: "Beside the plaza",
  notes: null,
  is_active: true,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  created_by: null,
  updated_by: { userId: "u2", name: "Jose" },
};

const direction: DirectionEntity = {
  direction_id: "dir-1",
  route_id: "route-1",
  label: "To Port",
  base_polyline: { type: "LineString", coordinates: [A, B] },
  origin_stop_id: "stop-a",
  destination_stop_id: "stop-b",
  is_active: true,
  version: 4,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  created_by: null,
  updated_by: null,
  stops: [serverStop],
};

const route: RouteDetail = {
  route_id: "route-1",
  name: "City Proper",
  short_name: "CP",
  color: "#4A90D9",
  is_active: true,
  fare_config_id: "fare-1",
  version: 7,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  created_by: null,
  updated_by: null,
  directions: [direction],
};

const meta: RouteMetaDraft = {
  name: "City Proper",
  shortName: "CP",
  color: "#4A90D9",
  isActive: true,
  fareConfigId: "fare-1",
};

describe("merge input mapping (ticket #55)", () => {
  it("round-trips a Draft stop through an anchor", () => {
    const anchor = stopToAnchor(draftStop);
    expect(anchor).toMatchObject({
      id: "stop-a",
      kind: "stop",
      updatedBy: "u2",
    });
    expect(anchor.fields).toMatchObject({
      name: "City Hall",
      type: "terminal",
      location: A,
      is_guaranteed_service: true,
      landmark_hint: "Beside the plaza",
    });
    expect(anchorToDraftStop(anchor)).toMatchObject({
      id: "stop-a",
      name: "City Hall",
      location: A,
      landmark_hint: "Beside the plaza",
    });
  });

  it("maps a server stop into the same anchor shape", () => {
    const server = entityToAnchor(serverStop);
    const draft = stopToAnchor(draftStop);
    expect(server.fields).toEqual(draft.fields);
    expect(server.updatedBy).toBe("u2");
  });

  it("maps a server stop into a Draft stop", () => {
    expect(entityToDraftStop(serverStop)).toMatchObject({
      id: "stop-a",
      location: A,
      updated_by: { userId: "u2", name: "Jose" },
    });
  });

  it("snapshots the Draft and the server separately, with their own polylines", () => {
    const mine = draftSnapshot([draftStop], meta, direction.base_polyline);
    const theirs = serverSnapshot(route, direction, direction.base_polyline);

    expect(mine.snapshot.anchors).toHaveLength(1);
    expect(mine.snapshot.meta).toMatchObject({ name: "City Proper" });
    expect(theirs.snapshot.anchors).toHaveLength(1);
    expect(polylinePair(mine.polyline, theirs.polyline)).toEqual({
      mine: direction.base_polyline,
      theirs: direction.base_polyline,
    });
  });

  it("returns null for a legacy Draft with no base", () => {
    expect(baseSnapshot(null)).toBeNull();
    expect(
      baseSnapshot({
        version: 2,
        stops: [draftStop],
        routeMeta: meta,
        polyline: null,
      })?.anchors,
    ).toHaveLength(1);
  });

  it("maps Route metadata in both directions", () => {
    expect(routeMetaFromRoute(route)).toEqual(meta);
    expect(fieldsToRouteMeta(metaFields(meta), null)).toEqual(meta);
    expect(fieldsToRouteMeta(null, meta)).toEqual(meta);
  });

  it("converts anchors to a stop list in order", () => {
    const stops = anchorsToStops([
      stopToAnchor(draftStop),
      stopToAnchor({ ...draftStop, id: "stop-b", name: "Port" }),
    ]);
    expect(stops.map((stop) => stop.name)).toEqual(["City Hall", "Port"]);
  });

  it("labels anchors and fields for the resolver", () => {
    expect(anchorLabel("__meta__", [])).toBe("Route details");
    expect(anchorLabel("stop-a", [stopToAnchor(draftStop)])).toBe("City Hall");
    expect(anchorLabel("missing", [])).toBe("Stop");
    expect(fieldLabel("landmark_hint")).toBe("Landmark");
    expect(fieldValue("location", A)).toBe("122.50000, 10.60000");
    expect(fieldValue("isActive", false)).toBe("No");
    expect(fieldValue("notes", null)).toBe("—");
  });
});
