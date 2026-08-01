import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildTestApp, signInAdmin, uniqueRouteId } from "./helpers";

const POLYLINE = {
  type: "LineString",
  coordinates: [
    [122.5, 10.6],
    [122.51, 10.61],
    [122.52, 10.62],
  ],
} as const;

const POINT_A = { type: "Point", coordinates: [122.5, 10.6] } as const;
const POINT_B = { type: "Point", coordinates: [122.52, 10.62] } as const;
const POINT_OFF_PATH = { type: "Point", coordinates: [122.9, 10.9] } as const;

describe("CRUD reflection and validation (SC-002/SC-003)", () => {
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

  it("creates, reads, edits, and deactivates a route", async () => {
    const routeId = uniqueRouteId("crud-route");
    const create = await app.inject({
      method: "POST",
      url: "/api/admin/routes",
      headers: auth(),
      payload: { route_id: routeId, name: "CRUD Route", short_name: "CR" },
    });
    expect(create.statusCode).toBe(201);

    const list = await app.inject({
      method: "GET",
      url: "/api/admin/routes",
      headers: auth(),
    });
    const listed = list
      .json()
      .data.find((r: { route_id: string }) => r.route_id === routeId);
    expect(listed).toBeTruthy();
    expect(listed.is_active).toBe(true);
    expect(listed.direction_count).toBe(0);

    const update = await app.inject({
      method: "PUT",
      url: `/api/admin/routes/${routeId}`,
      headers: auth(),
      payload: { name: "CRUD Route Updated" },
    });
    expect(update.statusCode).toBe(200);
    expect(update.json().data.name).toBe("CRUD Route Updated");

    const softDelete = await app.inject({
      method: "DELETE",
      url: `/api/admin/routes/${routeId}`,
      headers: auth(),
    });
    expect(softDelete.statusCode).toBe(200);
    expect(softDelete.json().data.is_active).toBe(false);

    const reRead = await app.inject({
      method: "GET",
      url: `/api/admin/routes/${routeId}`,
      headers: auth(),
    });
    expect(reRead.statusCode).toBe(200);
    expect(reRead.json().data.is_active).toBe(false);
  });

  it("creates a fare config, edits it, and reads the new value", async () => {
    const create = await app.inject({
      method: "POST",
      url: "/api/admin/fare-configs",
      headers: auth(),
      payload: {
        label: "CRUD Fare",
        base_fare: 13,
        base_distance_km: 4,
        rate_per_km: 1.8,
        student_discount_pct: 20,
        senior_discount_pct: 20,
      },
    });
    expect(create.statusCode).toBe(201);
    const fareConfigId = create.json().data.fare_config_id;
    expect(fareConfigId).toBeTruthy();

    const update = await app.inject({
      method: "PUT",
      url: `/api/admin/fare-configs/${fareConfigId}`,
      headers: auth(),
      payload: { base_fare: 14.5 },
    });
    expect(update.statusCode).toBe(200);
    expect(update.json().data.base_fare).toBe(14.5);

    const read = await app.inject({
      method: "GET",
      url: `/api/admin/fare-configs/${fareConfigId}`,
      headers: auth(),
    });
    expect(read.json().data.base_fare).toBe(14.5);
  });

  it("creates a direction with ordered stops and reflects edits without restart", async () => {
    const routeId = uniqueRouteId("dir-route");
    await app.inject({
      method: "POST",
      url: "/api/admin/routes",
      headers: auth(),
      payload: { route_id: routeId, name: "Direction Route", short_name: "DR" },
    });

    const create = await app.inject({
      method: "POST",
      url: `/api/admin/routes/${routeId}/directions`,
      headers: auth(),
      payload: {
        label: "Outbound",
        base_polyline: POLYLINE,
        stops: [
          {
            name: "Stop One",
            type: "terminal",
            location: POINT_A,
            stop_order: 1,
          },
          {
            name: "Stop Two",
            type: "major_stop",
            location: POINT_B,
            stop_order: 2,
          },
        ],
      },
    });
    expect(create.statusCode).toBe(201);
    const directionId = create.json().data.direction_id;
    expect(create.json().data.stops).toHaveLength(2);
    expect(
      create.json().data.stops.map((s: { name: string }) => s.name),
    ).toEqual(["Stop One", "Stop Two"]);

    const stopId = create.json().data.stops[0].stop_id;

    const moveStop = await app.inject({
      method: "PUT",
      url: `/api/admin/stops/${stopId}`,
      headers: auth(),
      payload: { location: POINT_B },
    });
    expect(moveStop.statusCode).toBe(200);
    expect(moveStop.json().data.location.coordinates).toEqual(
      POINT_B.coordinates,
    );

    const read = await app.inject({
      method: "GET",
      url: `/api/admin/directions/${directionId}`,
      headers: auth(),
    });
    expect(read.statusCode).toBe(200);
    expect(read.json().data.stops[0].location.coordinates).toEqual(
      POINT_B.coordinates,
    );

    const list = await app.inject({
      method: "GET",
      url: `/api/admin/routes/${routeId}`,
      headers: auth(),
    });
    expect(list.json().data.directions).toHaveLength(1);
    expect(list.json().data.directions[0].stops).toHaveLength(2);
  });

  it("rejects deleting a stop referenced as a direction terminal with 409", async () => {
    const routeId = uniqueRouteId("terminal-route");
    await app.inject({
      method: "POST",
      url: "/api/admin/routes",
      headers: auth(),
      payload: { route_id: routeId, name: "Terminal Route", short_name: "TR" },
    });
    const created = await app.inject({
      method: "POST",
      url: `/api/admin/routes/${routeId}/directions`,
      headers: auth(),
      payload: { label: "Outbound", base_polyline: POLYLINE },
    });
    const directionId = created.json().data.direction_id;

    const stop = await app.inject({
      method: "POST",
      url: `/api/admin/directions/${directionId}/stops`,
      headers: auth(),
      payload: { name: "Terminal Stop", type: "terminal", location: POINT_A },
    });
    const stopId = stop.json().data.stop_id;

    await app.inject({
      method: "PUT",
      url: `/api/admin/directions/${directionId}`,
      headers: auth(),
      payload: { origin_stop_id: stopId },
    });

    const del = await app.inject({
      method: "DELETE",
      url: `/api/admin/stops/${stopId}`,
      headers: auth(),
    });
    expect(del.statusCode).toBe(409);
    expect(del.json().error.code).toBe("CONFLICT");

    const stillThere = await app.inject({
      method: "GET",
      url: `/api/admin/directions/${directionId}`,
      headers: auth(),
    });
    expect(stillThere.json().data.stops).toHaveLength(1);
  });

  it("rejects an empty stop list on a direction with 422 and no data change", async () => {
    const routeId = uniqueRouteId("empty-route");
    await app.inject({
      method: "POST",
      url: "/api/admin/routes",
      headers: auth(),
      payload: { route_id: routeId, name: "Empty Route", short_name: "ER" },
    });

    const bad = await app.inject({
      method: "POST",
      url: `/api/admin/routes/${routeId}/directions`,
      headers: auth(),
      payload: { label: "Outbound", base_polyline: POLYLINE, stops: [] },
    });
    expect(bad.statusCode).toBe(422);
    expect(bad.json().error.code).toBe("VALIDATION_ERROR");

    const read = await app.inject({
      method: "GET",
      url: `/api/admin/routes/${routeId}`,
      headers: auth(),
    });
    expect(read.json().data.directions).toHaveLength(0);
  });

  it("rejects an invalid LineString with 422", async () => {
    const routeId = uniqueRouteId("geom-route");
    await app.inject({
      method: "POST",
      url: "/api/admin/routes",
      headers: auth(),
      payload: { route_id: routeId, name: "Geom Route", short_name: "GR" },
    });

    const bad = await app.inject({
      method: "POST",
      url: `/api/admin/routes/${routeId}/directions`,
      headers: auth(),
      payload: {
        label: "Outbound",
        base_polyline: { type: "LineString", coordinates: [[122.5, 10.6]] },
      },
    });
    expect(bad.statusCode).toBe(422);
    expect(bad.json().error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects a detour whose entry is off the base polyline with 422", async () => {
    const routeId = uniqueRouteId("detour-route");
    await app.inject({
      method: "POST",
      url: "/api/admin/routes",
      headers: auth(),
      payload: { route_id: routeId, name: "Detour Route", short_name: "DR" },
    });
    const created = await app.inject({
      method: "POST",
      url: `/api/admin/routes/${routeId}/directions`,
      headers: auth(),
      payload: { label: "Outbound", base_polyline: POLYLINE },
    });
    const directionId = created.json().data.direction_id;

    const bad = await app.inject({
      method: "POST",
      url: `/api/admin/directions/${directionId}/detours`,
      headers: auth(),
      payload: {
        label: "Bad Detour",
        entry: POINT_OFF_PATH,
        exit: POINT_B,
        detour_polyline: POLYLINE,
        commuter_instruction: "Follow the detour",
      },
    });
    expect(bad.statusCode).toBe(422);
    expect(bad.json().error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects restriction indices out of range with 422", async () => {
    const routeId = uniqueRouteId("rest-route");
    await app.inject({
      method: "POST",
      url: "/api/admin/routes",
      headers: auth(),
      payload: {
        route_id: routeId,
        name: "Restriction Route",
        short_name: "RR",
      },
    });
    const created = await app.inject({
      method: "POST",
      url: `/api/admin/routes/${routeId}/directions`,
      headers: auth(),
      payload: { label: "Outbound", base_polyline: POLYLINE },
    });
    const directionId = created.json().data.direction_id;

    const bad = await app.inject({
      method: "POST",
      url: `/api/admin/directions/${directionId}/restrictions`,
      headers: auth(),
      payload: {
        from_coord_index: 0,
        to_coord_index: 99,
        reason: "no_stopping_zone",
        affects: "boarding",
      },
    });
    expect(bad.statusCode).toBe(422);
    expect(bad.json().error.code).toBe("VALIDATION_ERROR");
  });
});
