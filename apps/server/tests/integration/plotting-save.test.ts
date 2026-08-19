import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type { GeoLineString, GeoPoint } from "@komyuter/shared";
import { buildTestApp, signInAdmin, uniqueRouteId } from "./helpers";

const A: [number, number] = [122.5, 10.6];
const MID: [number, number] = [122.51, 10.61];
const B: [number, number] = [122.52, 10.62];
const C: [number, number] = [122.54, 10.64];
const FAR: [number, number] = [122.9, 10.9];

const LONG_POLYLINE: GeoLineString = {
  type: "LineString",
  coordinates: [A, MID, B],
};

function point(coordinates: [number, number]): GeoPoint {
  return { type: "Point", coordinates };
}

describe("Route plotting atomic save (FR-012/FR-027/FR-028, ADR-0008)", () => {
  let app: FastifyInstance;
  let token = "";

  beforeAll(async () => {
    app = buildTestApp();
    await app.ready();
    token = await signInAdmin();
  });

  afterAll(async () => {
    await app.close();
  });

  const auth = () => ({ authorization: `Bearer ${token}` });

  async function createRoute(prefix = "plot"): Promise<string> {
    const routeId = uniqueRouteId(prefix);
    const res = await app.inject({
      method: "POST",
      url: "/api/admin/routes",
      headers: auth(),
      payload: { route_id: routeId, name: "Plot Route", short_name: "PR" },
    });
    expect(res.statusCode).toBe(201);
    return routeId;
  }

  function listDirections(routeId: string) {
    return app.inject({
      method: "GET",
      url: `/api/admin/routes/${routeId}/directions`,
      headers: auth(),
    });
  }

  it("POST saves the base direction and derives the return atomically (SC-013)", async () => {
    const routeId = await createRoute();
    const res = await app.inject({
      method: "POST",
      url: `/api/admin/routes/${routeId}/directions`,
      headers: auth(),
      payload: {
        label: "To Port",
        base_polyline: LONG_POLYLINE,
        stops: [
          {
            name: "City Hall",
            type: "terminal",
            location: point(A),
            stop_order: 1,
          },
          {
            name: "Port",
            type: "major_stop",
            location: point(B),
            stop_order: 2,
          },
        ],
      },
    });
    expect(res.statusCode).toBe(201);
    const data = res.json().data;

    expect(data.stops.map((s: { name: string }) => s.name)).toEqual([
      "City Hall",
      "Port",
    ]);
    expect(data.origin_stop_id).toBe(data.stops[0].stop_id);
    expect(data.destination_stop_id).toBe(data.stops[1].stop_id);

    const ret = data.return_direction;
    expect(ret).toBeTruthy();
    expect(ret.label).toBe("To City Hall");
    expect(ret.base_polyline.coordinates).toEqual([B, MID, A]);
    expect(ret.stops.map((s: { name: string }) => s.name)).toEqual([
      "Port",
      "City Hall",
    ]);
    expect(ret.stops.map((s: { stop_order: number }) => s.stop_order)).toEqual([
      1, 2,
    ]);
    // Terminals are the return direction's OWN stop rows (resolvable inside
    // its own stop list), not the base's stop ids.
    expect(ret.origin_stop_id).toBe(ret.stops[0].stop_id);
    expect(ret.destination_stop_id).toBe(ret.stops[1].stop_id);

    const list = await listDirections(routeId);
    expect(list.json().data).toHaveLength(2);
  });

  it("rejects a single-stop save with 422 and persists nothing", async () => {
    const routeId = await createRoute("single");
    const res = await app.inject({
      method: "POST",
      url: `/api/admin/routes/${routeId}/directions`,
      headers: auth(),
      payload: {
        label: "To Nowhere",
        base_polyline: LONG_POLYLINE,
        stops: [
          {
            name: "Only Stop",
            type: "terminal",
            location: point(A),
            stop_order: 1,
          },
        ],
      },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe("VALIDATION_ERROR");

    const list = await listDirections(routeId);
    expect(list.json().data).toHaveLength(0);
  });

  it("rejects a path whose start does not match the first stop (422)", async () => {
    const routeId = await createRoute("start");
    const res = await app.inject({
      method: "POST",
      url: `/api/admin/routes/${routeId}/directions`,
      headers: auth(),
      payload: {
        label: "To Port",
        base_polyline: { type: "LineString", coordinates: [FAR, MID, B] },
        stops: [
          {
            name: "City Hall",
            type: "terminal",
            location: point(A),
            stop_order: 1,
          },
          {
            name: "Port",
            type: "major_stop",
            location: point(B),
            stop_order: 2,
          },
        ],
      },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe("VALIDATION_ERROR");

    const list = await listDirections(routeId);
    expect(list.json().data).toHaveLength(0);
  });

  it("accepts a loop that ends on the starting stop (FR-004)", async () => {
    const routeId = await createRoute("loop");
    const res = await app.inject({
      method: "POST",
      url: `/api/admin/routes/${routeId}/directions`,
      headers: auth(),
      payload: {
        label: "Loop",
        base_polyline: { type: "LineString", coordinates: [A, MID, B, A] },
        stops: [
          {
            name: "City Hall",
            type: "terminal",
            location: point(A),
            stop_order: 1,
          },
          {
            name: "Port",
            type: "major_stop",
            location: point(B),
            stop_order: 2,
          },
        ],
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().data.return_direction).toBeTruthy();
  });

  it("rejects a third active direction with 409 (ADR-0008)", async () => {
    const routeId = await createRoute("third");
    const first = await app.inject({
      method: "POST",
      url: `/api/admin/routes/${routeId}/directions`,
      headers: auth(),
      payload: {
        label: "To Port",
        base_polyline: LONG_POLYLINE,
        stops: [
          {
            name: "City Hall",
            type: "terminal",
            location: point(A),
            stop_order: 1,
          },
          {
            name: "Port",
            type: "major_stop",
            location: point(B),
            stop_order: 2,
          },
        ],
      },
    });
    expect(first.statusCode).toBe(201);

    const second = await app.inject({
      method: "POST",
      url: `/api/admin/routes/${routeId}/directions`,
      headers: auth(),
      payload: {
        label: "To Port",
        base_polyline: LONG_POLYLINE,
        stops: [
          {
            name: "City Hall",
            type: "terminal",
            location: point(A),
            stop_order: 1,
          },
          {
            name: "Port",
            type: "major_stop",
            location: point(B),
            stop_order: 2,
          },
        ],
      },
    });
    expect(second.statusCode).toBe(409);
    expect(second.json().error.code).toBe("CONFLICT");
  });

  it("PUT with stops + polyline replaces the base and re-derives the return", async () => {
    const routeId = await createRoute("replace");
    const created = await app.inject({
      method: "POST",
      url: `/api/admin/routes/${routeId}/directions`,
      headers: auth(),
      payload: {
        label: "To Port",
        base_polyline: LONG_POLYLINE,
        stops: [
          {
            name: "City Hall",
            type: "terminal",
            location: point(A),
            stop_order: 1,
          },
          {
            name: "Port",
            type: "major_stop",
            location: point(B),
            stop_order: 2,
          },
        ],
      },
    });
    const baseId = created.json().data.direction_id;

    const replaced = await app.inject({
      method: "PUT",
      url: `/api/admin/directions/${baseId}`,
      headers: auth(),
      payload: {
        label: "To Market",
        base_polyline: { type: "LineString", coordinates: [B, C] },
        stops: [
          { name: "Port", type: "terminal", location: point(B), stop_order: 1 },
          {
            name: "Market",
            type: "major_stop",
            location: point(C),
            stop_order: 2,
          },
        ],
      },
    });
    expect(replaced.statusCode).toBe(200);
    const data = replaced.json().data;
    expect(data.stops.map((s: { name: string }) => s.name)).toEqual([
      "Port",
      "Market",
    ]);
    expect(data.base_polyline.coordinates).toEqual([B, C]);
    expect(data.origin_stop_id).toBe(data.stops[0].stop_id);
    expect(data.destination_stop_id).toBe(data.stops[1].stop_id);

    const ret = data.return_direction;
    expect(ret).toBeTruthy();
    expect(ret.label).toBe("To Port");
    expect(ret.stops.map((s: { name: string }) => s.name)).toEqual([
      "Market",
      "Port",
    ]);
    expect(ret.base_polyline.coordinates).toEqual([C, B]);
    expect(ret.origin_stop_id).toBe(ret.stops[0].stop_id);
    expect(ret.destination_stop_id).toBe(ret.stops[1].stop_id);

    const read = await app.inject({
      method: "GET",
      url: `/api/admin/directions/${baseId}`,
      headers: auth(),
    });
    expect(read.json().data.stops).toHaveLength(2);
    expect(read.json().data.stops.map((s: { name: string }) => s.name)).toEqual(
      ["Port", "Market"],
    );

    const list = await listDirections(routeId);
    expect(list.json().data).toHaveLength(2);
  });

  it("legacy POST without stops still creates a single direction (no derivation)", async () => {
    const routeId = await createRoute("legacy");
    const res = await app.inject({
      method: "POST",
      url: `/api/admin/routes/${routeId}/directions`,
      headers: auth(),
      payload: { label: "Outbound", base_polyline: LONG_POLYLINE },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().data.return_direction).toBeUndefined();
    expect(res.json().data.stops).toEqual([]);

    const list = await listDirections(routeId);
    expect(list.json().data).toHaveLength(1);
  });

  it("route detail returns the base direction first, never the derived return", async () => {
    const routeId = await createRoute("order");
    const res = await app.inject({
      method: "POST",
      url: `/api/admin/routes/${routeId}/directions`,
      headers: auth(),
      payload: {
        label: "To B",
        base_polyline: { type: "LineString", coordinates: [A, B] },
        stops: [
          {
            name: "Origin Stop",
            type: "terminal",
            location: point(A),
            stop_order: 1,
          },
          {
            name: "End Stop",
            type: "terminal",
            location: point(B),
            stop_order: 2,
          },
        ],
      },
    });
    expect(res.statusCode).toBe(201);

    const detail = await app.inject({
      method: "GET",
      url: `/api/admin/routes/${routeId}`,
      headers: auth(),
    });
    const directions = detail.json().data.directions;
    expect(directions).toHaveLength(2);
    // directions[0] is the admin-plotted base: its label + stop order.
    expect(directions[0].label).toBe("To B");
    expect(directions[0].stops.map((s: { name: string }) => s.name)).toEqual([
      "Origin Stop",
      "End Stop",
    ]);
    // The derived return is second, with the reversed sequence.
    expect(directions[1].stops.map((s: { name: string }) => s.name)).toEqual([
      "End Stop",
      "Origin Stop",
    ]);
  });

  it("GET /routes/overview returns every route's base/return polylines + stops in one request", async () => {
    const routeId = await createRoute("ov");
    const save = await app.inject({
      method: "POST",
      url: `/api/admin/routes/${routeId}/directions`,
      headers: auth(),
      payload: {
        label: "To Port",
        base_polyline: LONG_POLYLINE,
        stops: [
          {
            name: "City Hall",
            type: "terminal",
            location: point(A),
            stop_order: 1,
          },
          {
            name: "Port",
            type: "major_stop",
            location: point(B),
            stop_order: 2,
          },
        ],
      },
    });
    expect(save.statusCode).toBe(201);
    const res = await app.inject({
      method: "GET",
      url: "/api/admin/routes/overview",
      headers: auth(),
    });
    expect(res.statusCode).toBe(200);
    const data = res.json().data as Array<{
      route_id: string;
      name: string;
      color: string | null;
      is_active: boolean;
      base_polyline: { coordinates: number[][] } | null;
      return_polyline: { coordinates: number[][] } | null;
      stops: { name: string }[];
    }>;
    // "overview" must never be captured by the /routes/:routeId param route.
    expect(res.json().data).toBeInstanceOf(Array);
    const mine = data.find((r) => r.route_id === routeId);
    expect(mine).toBeTruthy();
    expect(mine?.base_polyline?.coordinates).toEqual(LONG_POLYLINE.coordinates);
    expect(mine?.return_polyline?.coordinates).toEqual([B, MID, A]);
    expect(mine?.stops.map((s) => s.name)).toEqual(["City Hall", "Port"]);
    expect(mine?.is_active).toBe(false); // draft-first default
  });
});
