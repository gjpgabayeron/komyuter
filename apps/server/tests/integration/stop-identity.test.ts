import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type { GeoPoint } from "@komyuter/shared";
import {
  buildTestApp,
  createTestAdmin,
  signInAdmin,
  signInAs,
  uniqueRouteId,
} from "./helpers";

const A: [number, number] = [122.5, 10.6];
const B: [number, number] = [122.52, 10.62];
const C: [number, number] = [122.54, 10.64];

const POLYLINE = {
  type: "LineString",
  coordinates: [A, B, C],
} as const;

function point(coordinates: [number, number]): GeoPoint {
  return { type: "Point", coordinates };
}

interface StopResult {
  stop_id: string;
  name: string;
  created_by: { userId: string } | null;
  updated_by: { userId: string } | null;
}

interface SaveResult {
  direction_id: string;
  version: number;
  stops: StopResult[];
  return_direction: {
    direction_id: string;
    version: number;
    stops: StopResult[];
  };
}

/**
 * ADR-0031: a stop id survives a save. The plotted save upserts — a stop the
 * client already has keeps its id and its author, a new one is named by the
 * server, and the return Direction's rows are matched through their base stop.
 */
describe("Stop identity across saves (ADR-0031)", () => {
  let app: FastifyInstance;
  let ownerToken = "";
  let ownerId = "";
  let plotterToken = "";
  let plotterId = "";

  beforeAll(async () => {
    app = buildTestApp();
    await app.ready();
    ownerToken = await signInAdmin();
    const me = await app.inject({
      method: "GET",
      url: "/api/admin/me",
      headers: auth(ownerToken),
    });
    ownerId = me.json().data.userId;

    const plotter = await createTestAdmin("stop-identity-plotter", "plotter");
    plotterId = plotter.userId;
    plotterToken = await signInAs(plotter.email, plotter.password);
  });

  afterAll(async () => {
    await app.close();
  });

  function auth(token = ownerToken) {
    return { authorization: `Bearer ${token}` };
  }

  async function createRoute(): Promise<string> {
    const routeId = uniqueRouteId("stops");
    const res = await app.inject({
      method: "POST",
      url: "/api/admin/routes",
      headers: auth(),
      payload: { route_id: routeId, name: "Stop Identity", short_name: "SI" },
    });
    expect(res.statusCode).toBe(201);
    return routeId;
  }

  async function createDirection(routeId: string): Promise<SaveResult> {
    const res = await app.inject({
      method: "POST",
      url: `/api/admin/routes/${routeId}/directions`,
      headers: auth(),
      payload: {
        label: "To Port",
        base_polyline: POLYLINE,
        stops: [
          { name: "Start", type: "terminal", location: point(A) },
          { name: "Middle", type: "major_stop", location: point(B) },
          { name: "End", type: "terminal", location: point(C) },
        ],
      },
    });
    expect(res.statusCode).toBe(201);
    return res.json().data as SaveResult;
  }

  function replace(
    directionId: string,
    baseVersion: number,
    stops: {
      stop_id?: string;
      name: string;
      location: GeoPoint;
    }[],
    token = ownerToken,
  ) {
    const first = stops[0].location.coordinates;
    const last = stops[stops.length - 1].location.coordinates;
    return app.inject({
      method: "PUT",
      url: `/api/admin/directions/${directionId}`,
      headers: auth(token),
      payload: {
        label: "To Port",
        base_version: baseVersion,
        base_polyline: { type: "LineString", coordinates: [first, last] },
        stops: stops.map((stop) => ({
          ...stop,
          type: "terminal",
        })),
      },
    });
  }

  function asStops(stops: StopResult[], names = ["Start", "Middle", "End"]) {
    return stops.map((stop, index) => ({
      stop_id: stop.stop_id,
      name: names[index] ?? stop.name,
      location: point([A, B, C][index] ?? A),
    }));
  }

  it("keeps every stop id, including the derived return's rows", async () => {
    const routeId = await createRoute();
    const created = await createDirection(routeId);

    const first = await replace(
      created.direction_id,
      created.version,
      asStops(created.stops),
    );
    expect(first.statusCode).toBe(200);

    const second = await replace(
      created.direction_id,
      first.json().data.version,
      asStops(first.json().data.stops),
    );
    expect(second.statusCode).toBe(200);

    const data = second.json().data as SaveResult;
    expect(data.stops.map((s) => s.stop_id)).toEqual(
      created.stops.map((s) => s.stop_id),
    );
    expect(data.return_direction.stops.map((s) => s.stop_id)).toEqual(
      created.return_direction.stops.map((s) => s.stop_id),
    );
  });

  it("keeps the creator of an unchanged stop and moves only the edited one", async () => {
    const routeId = await createRoute();
    const created = await createDirection(routeId);

    const renamed = asStops(created.stops);
    renamed[1].name = "Middle Renamed";

    const res = await replace(
      created.direction_id,
      created.version,
      renamed,
      plotterToken,
    );
    expect(res.statusCode).toBe(200);

    const data = res.json().data as SaveResult;
    const [start, middle, end] = data.stops;

    // Untouched rows keep both columns as they were.
    expect(start.created_by?.userId).toBe(ownerId);
    expect(start.updated_by?.userId).toBe(ownerId);
    expect(end.updated_by?.userId).toBe(ownerId);

    // The row the save actually changed moves only its last writer.
    expect(middle.stop_id).toBe(created.stops[1].stop_id);
    expect(middle.name).toBe("Middle Renamed");
    expect(middle.created_by?.userId).toBe(ownerId);
    expect(middle.updated_by?.userId).toBe(plotterId);
  });

  it("refuses a stop id that belongs to another direction", async () => {
    const routeId = await createRoute();
    const created = await createDirection(routeId);

    // A stop of the RETURN direction is not the base direction's to write.
    const stolen = created.return_direction.stops[1].stop_id;
    const stops = asStops(created.stops);
    stops[1].stop_id = stolen;

    const res = await replace(created.direction_id, created.version, stops);
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("CONFLICT");
  });

  it("names a stop sent with an id the server does not know", async () => {
    const routeId = await createRoute();
    const created = await createDirection(routeId);

    const stops = asStops(created.stops);
    stops[1].stop_id = "stop-client-invented";

    const res = await replace(created.direction_id, created.version, stops);
    expect(res.statusCode).toBe(200);

    const data = res.json().data as SaveResult;
    expect(data.stops[1].stop_id).not.toBe("stop-client-invented");
    expect(data.stops[0].stop_id).toBe(created.stops[0].stop_id);
    expect(data.stops[2].stop_id).toBe(created.stops[2].stop_id);
  });

  it("deletes only the stops the payload drops", async () => {
    const routeId = await createRoute();
    const created = await createDirection(routeId);

    const res = await replace(created.direction_id, created.version, [
      { stop_id: created.stops[0].stop_id, name: "Start", location: point(A) },
      { stop_id: created.stops[1].stop_id, name: "Middle", location: point(B) },
    ]);
    expect(res.statusCode).toBe(200);

    const data = res.json().data as SaveResult;
    expect(data.stops.map((s) => s.stop_id)).toEqual([
      created.stops[0].stop_id,
      created.stops[1].stop_id,
    ]);
  });
});
