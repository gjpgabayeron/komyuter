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
    // Draft-first: new routes default to INACTIVE (Pasted #42).
    expect(listed.is_active).toBe(false);
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
    expect(softDelete.json().data.route_id).toBe(routeId);

    // Hard delete: the route is gone, not just deactivated.
    const reRead = await app.inject({
      method: "GET",
      url: `/api/admin/routes/${routeId}`,
      headers: auth(),
    });
    expect(reRead.statusCode).toBe(404);
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
    expect(list.json().data.directions).toHaveLength(2);
    expect(list.json().data.directions[0].stops).toHaveLength(2);
    expect(list.json().data.directions[1].stops).toHaveLength(2);
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

  it("creates a detour whose loop starts and ends on entry/exit (FR-023)", async () => {
    const routeId = uniqueRouteId("detour-ok");
    await app.inject({
      method: "POST",
      url: "/api/admin/routes",
      headers: auth(),
      payload: { route_id: routeId, name: "Detour OK", short_name: "DO" },
    });
    const created = await app.inject({
      method: "POST",
      url: `/api/admin/routes/${routeId}/directions`,
      headers: auth(),
      payload: { label: "Outbound", base_polyline: POLYLINE },
    });
    const directionId = created.json().data.direction_id;

    const diversionLoop = {
      type: "LineString",
      coordinates: [
        [122.5, 10.6],
        [122.505, 10.605],
        [122.52, 10.62],
      ],
    };
    const ok = await app.inject({
      method: "POST",
      url: `/api/admin/directions/${directionId}/detours`,
      headers: auth(),
      payload: {
        label: "Good Detour",
        entry: POINT_A,
        exit: POINT_B,
        detour_polyline: diversionLoop,
        additional_distance_meters: 400,
        commuter_instruction: "Take the diversion",
      },
    });
    expect(ok.statusCode).toBe(201);
    expect(ok.json().data.is_active).toBe(true);
    expect(ok.json().data.additional_distance_meters).toBe(400);

    // Text-only edits (no geometry) must not re-run the loop gate.
    const renamed = await app.inject({
      method: "PUT",
      url: `/api/admin/detours/${ok.json().data.detour_id}`,
      headers: auth(),
      payload: { label: "Renamed Detour" },
    });
    expect(renamed.statusCode).toBe(200);
    expect(renamed.json().data.label).toBe("Renamed Detour");

    // Replacing ONLY detour_polyline revalidates the loop's endpoints
    // against the CURRENT entry/exit (FR-023) — this loop drifts off start.
    const drifting = await app.inject({
      method: "PUT",
      url: `/api/admin/detours/${ok.json().data.detour_id}`,
      headers: auth(),
      payload: {
        detour_polyline: {
          type: "LineString",
          coordinates: [
            [122.51, 10.61],
            [122.505, 10.605],
            [122.52, 10.62],
          ],
        },
      },
    });
    expect(drifting.statusCode).toBe(422);
    expect(drifting.json().error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects a detour loop whose start drifts from entry with 422", async () => {
    const routeId = uniqueRouteId("detour-drift");
    await app.inject({
      method: "POST",
      url: "/api/admin/routes",
      headers: auth(),
      payload: { route_id: routeId, name: "Detour Drift", short_name: "DD" },
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
        label: "Drifted Detour",
        entry: POINT_A,
        exit: POINT_B,
        detour_polyline: {
          type: "LineString",
          coordinates: [
            [122.51, 10.61],
            [122.505, 10.605],
            [122.52, 10.62],
          ],
        },
        commuter_instruction: "Follow the detour",
      },
    });
    expect(bad.statusCode).toBe(422);
    expect(bad.json().error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects a detour loop whose end drifts from exit with 422", async () => {
    const routeId = uniqueRouteId("detour-drift-end");
    await app.inject({
      method: "POST",
      url: "/api/admin/routes",
      headers: auth(),
      payload: {
        route_id: routeId,
        name: "Detour Drift End",
        short_name: "DE",
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
      url: `/api/admin/directions/${directionId}/detours`,
      headers: auth(),
      payload: {
        label: "Drifted End Detour",
        entry: POINT_A,
        exit: POINT_B,
        detour_polyline: {
          type: "LineString",
          coordinates: [
            [122.5, 10.6],
            [122.505, 10.605],
            [122.53, 10.63],
          ],
        },
        commuter_instruction: "Follow the detour",
      },
    });
    expect(bad.statusCode).toBe(422);
    expect(bad.json().error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects a degenerate detour whose entry equals exit with 422", async () => {
    const routeId = uniqueRouteId("detour-degenerate");
    await app.inject({
      method: "POST",
      url: "/api/admin/routes",
      headers: auth(),
      payload: {
        route_id: routeId,
        name: "Detour Degenerate",
        short_name: "DG",
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
      url: `/api/admin/directions/${directionId}/detours`,
      headers: auth(),
      payload: {
        label: "Degenerate Detour",
        entry: POINT_A,
        exit: POINT_A,
        detour_polyline: {
          type: "LineString",
          coordinates: [
            [122.5, 10.6],
            [122.505, 10.605],
            [122.52, 10.62],
          ],
        },
        commuter_instruction: "Follow the detour",
      },
    });
    expect(bad.statusCode).toBe(422);
    expect(bad.json().error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects a negative additional distance with 422 (zod floor)", async () => {
    const routeId = uniqueRouteId("detour-negative");
    await app.inject({
      method: "POST",
      url: "/api/admin/routes",
      headers: auth(),
      payload: {
        route_id: routeId,
        name: "Detour Negative",
        short_name: "DN",
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
      url: `/api/admin/directions/${directionId}/detours`,
      headers: auth(),
      payload: {
        label: "Negative Detour",
        entry: POINT_A,
        exit: POINT_B,
        detour_polyline: {
          type: "LineString",
          coordinates: [
            [122.5, 10.6],
            [122.515, 10.615],
            [122.52, 10.62],
          ],
        },
        additional_distance_meters: -1,
        commuter_instruction: "Follow the detour",
      },
    });
    expect(bad.statusCode).toBe(422);
    expect(bad.json().error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects a duplicate detour label within the direction with 422", async () => {
    const routeId = uniqueRouteId("detour-dup-label");
    await app.inject({
      method: "POST",
      url: "/api/admin/routes",
      headers: auth(),
      payload: { route_id: routeId, name: "Detour Dup", short_name: "DD" },
    });
    const created = await app.inject({
      method: "POST",
      url: `/api/admin/routes/${routeId}/directions`,
      headers: auth(),
      payload: { label: "Outbound", base_polyline: POLYLINE },
    });
    const directionId = created.json().data.direction_id;
    const base = {
      entry: POINT_A,
      exit: POINT_B,
      detour_polyline: {
        type: "LineString",
        coordinates: [
          [122.5, 10.6],
          [122.515, 10.615],
          [122.52, 10.62],
        ],
      },
      commuter_instruction: "Follow the detour",
    };
    const first = await app.inject({
      method: "POST",
      url: `/api/admin/directions/${directionId}/detours`,
      headers: auth(),
      payload: { label: "Duplicate", ...base },
    });
    expect(first.statusCode).toBe(201);
    const second = await app.inject({
      method: "POST",
      url: `/api/admin/directions/${directionId}/detours`,
      headers: auth(),
      payload: { label: "Duplicate", ...base },
    });
    expect(second.statusCode).toBe(422);
    expect(second.json().error.code).toBe("VALIDATION_ERROR");
  });

  it("permanently deletes a detour and frees its label (destructive)", async () => {
    const routeId = uniqueRouteId("detour-hard-del");
    await app.inject({
      method: "POST",
      url: "/api/admin/routes",
      headers: auth(),
      payload: {
        route_id: routeId,
        name: "Detour Hard Del",
        short_name: "HD",
      },
    });
    const created = await app.inject({
      method: "POST",
      url: `/api/admin/routes/${routeId}/directions`,
      headers: auth(),
      payload: { label: "Outbound", base_polyline: POLYLINE },
    });
    const directionId = created.json().data.direction_id;
    const payload = {
      label: "Doomed Detour",
      entry: POINT_A,
      exit: POINT_B,
      detour_polyline: {
        type: "LineString",
        coordinates: [
          [122.5, 10.6],
          [122.515, 10.615],
          [122.52, 10.62],
        ],
      },
      commuter_instruction: "Follow the detour",
    };

    const createdDetour = await app.inject({
      method: "POST",
      url: `/api/admin/directions/${directionId}/detours`,
      headers: auth(),
      payload,
    });
    expect(createdDetour.statusCode).toBe(201);
    const detourId = createdDetour.json().data.detour_id;

    const removed = await app.inject({
      method: "DELETE",
      url: `/api/admin/detours/${detourId}`,
      headers: auth(),
    });
    expect(removed.statusCode).toBe(200);
    expect(removed.json().data.detour_id).toBe(detourId);

    // The row is gone — the list is empty and a repeat delete is a 404.
    const listed = await app.inject({
      method: "GET",
      url: `/api/admin/directions/${directionId}/detours`,
      headers: auth(),
    });
    expect(listed.json().data).toHaveLength(0);
    const again = await app.inject({
      method: "DELETE",
      url: `/api/admin/detours/${detourId}`,
      headers: auth(),
    });
    expect(again.statusCode).toBe(404);

    // The deleted detour's label is free for reuse immediately.
    const relabeled = await app.inject({
      method: "POST",
      url: `/api/admin/directions/${directionId}/detours`,
      headers: auth(),
      payload: { ...payload, label: "Doomed Detour" },
    });
    expect(relabeled.statusCode).toBe(201);
  });

  it("persists detour stops atomically and cascades them on detour delete", async () => {
    const routeId = uniqueRouteId("detour-stops");
    await app.inject({
      method: "POST",
      url: "/api/admin/routes",
      headers: auth(),
      payload: { route_id: routeId, name: "Detour Stops", short_name: "DS" },
    });
    const created = await app.inject({
      method: "POST",
      url: `/api/admin/routes/${routeId}/directions`,
      headers: auth(),
      payload: { label: "Outbound", base_polyline: POLYLINE },
    });
    const directionId = created.json().data.direction_id;

    const detour_stops = [
      {
        name: "Market detour",
        location: { type: "Point", coordinates: [122.505, 10.605] },
        type: "waiting_area",
        is_guaranteed_service: false,
        landmark_hint: "Corner stall",
        notes: null,
      },
      {
        name: "Bridge detour",
        location: { type: "Point", coordinates: [122.515, 10.615] },
        type: "major_stop",
      },
    ];
    const ok = await app.inject({
      method: "POST",
      url: `/api/admin/directions/${directionId}/detours`,
      headers: auth(),
      payload: {
        label: "Stops Detour",
        entry: POINT_A,
        exit: POINT_B,
        detour_polyline: {
          type: "LineString",
          coordinates: [
            [122.5, 10.6],
            [122.505, 10.605],
            [122.515, 10.615],
            [122.52, 10.62],
          ],
        },
        additional_distance_meters: 250,
        commuter_instruction: "Follow the detour",
        detour_stops,
      },
    });
    expect(ok.statusCode).toBe(201);

    const listed = await app.inject({
      method: "GET",
      url: `/api/admin/directions/${directionId}/detours`,
      headers: auth(),
    });
    expect(listed.statusCode).toBe(200);
    const stops = listed.json().data[0].detour_stops;
    expect(stops).toHaveLength(2);
    expect(stops[0].name).toBe("Market detour");
    expect(stops[0].stop_order).toBe(0);
    expect(stops[0].landmark_hint).toBe("Corner stall");
    expect(stops[1].name).toBe("Bridge detour");
    expect(stops[1].type).toBe("major_stop");
    expect(stops[1].stop_order).toBe(1);

    // PUT replaces the stop list wholesale (reorder + rename).
    const replaced = await app.inject({
      method: "PUT",
      url: `/api/admin/detours/${ok.json().data.detour_id}`,
      headers: auth(),
      payload: {
        detour_stops: [
          {
            name: "Bridge detour",
            location: { type: "Point", coordinates: [122.515, 10.615] },
            type: "major_stop",
          },
          {
            name: "Market detour renamed",
            location: { type: "Point", coordinates: [122.505, 10.605] },
          },
        ],
      },
    });
    expect(replaced.statusCode).toBe(200);
    const afterPut = replaced.json().data.detour_stops;
    expect(afterPut).toHaveLength(2);
    expect(afterPut[0].name).toBe("Bridge detour");
    expect(afterPut[0].stop_order).toBe(0);
    expect(afterPut[1].name).toBe("Market detour renamed");

    // DELETE cascades the detour's stops.
    const removed = await app.inject({
      method: "DELETE",
      url: `/api/admin/detours/${ok.json().data.detour_id}`,
      headers: auth(),
    });
    expect(removed.statusCode).toBe(200);
    const count = await app.inject({
      method: "GET",
      url: `/api/admin/directions/${directionId}/detours`,
      headers: auth(),
    });
    expect(count.json().data).toHaveLength(0);
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

describe("fare configuration lifecycle guards (feature 006)", () => {
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

  async function createFareConfig(
    label: string,
    extra: Record<string, unknown> = {},
  ) {
    const res = await app.inject({
      method: "POST",
      url: "/api/admin/fare-configs",
      headers: auth(),
      payload: {
        label,
        base_fare: 13,
        base_distance_km: 4,
        rate_per_km: 1.8,
        student_discount_pct: 20,
        senior_discount_pct: 20,
        ...extra,
      },
    });
    expect(res.statusCode).toBe(201);
    return res.json().data as {
      fare_config_id: string;
      is_active: boolean;
      is_default: boolean;
    };
  }

  async function createRoute(
    routeId: string,
    fareConfigId: string | null,
    isActive = true,
  ) {
    const res = await app.inject({
      method: "POST",
      url: "/api/admin/routes",
      headers: auth(),
      payload: {
        route_id: routeId,
        name: routeId,
        short_name: "T",
        fare_config_id: fareConfigId,
        is_active: isActive,
      },
    });
    expect(res.statusCode).toBe(201);
    return res.json().data as { route_id: string; is_active: boolean };
  }

  async function getFareConfig(fareConfigId: string) {
    const res = await app.inject({
      method: "GET",
      url: `/api/admin/fare-configs/${fareConfigId}`,
      headers: auth(),
    });
    expect(res.statusCode).toBe(200);
    return res.json().data as {
      fare_config_id: string;
      is_active: boolean;
      is_default: boolean;
    };
  }

  it("rejects deactivating a fare config referenced by an active route with 409", async () => {
    const { fare_config_id } = await createFareConfig("Guard Active Ref");
    const routeId = uniqueRouteId("ref-active");
    await createRoute(routeId, fare_config_id);

    const del = await app.inject({
      method: "DELETE",
      url: `/api/admin/fare-configs/${fare_config_id}`,
      headers: auth(),
    });
    expect(del.statusCode).toBe(409);
    expect(del.json().error.code).toBe("CONFLICT");

    const read = await getFareConfig(fare_config_id);
    expect(read.is_active).toBe(true);
  });

  it("allows deactivating a fare config referenced only by an inactive route", async () => {
    const { fare_config_id } = await createFareConfig("Guard Inactive Ref");
    const routeId = uniqueRouteId("ref-inactive");
    await createRoute(routeId, fare_config_id);
    const deactivateRoute = await app.inject({
      method: "PUT",
      url: `/api/admin/routes/${routeId}`,
      headers: auth(),
      payload: { is_active: false },
    });
    expect(deactivateRoute.statusCode).toBe(200);

    const del = await app.inject({
      method: "DELETE",
      url: `/api/admin/fare-configs/${fare_config_id}`,
      headers: auth(),
    });
    expect(del.statusCode).toBe(200);
    expect(del.json().data.is_active).toBe(false);
  });

  it("rejects deactivating the sole default fare config with 409", async () => {
    const { fare_config_id } = await createFareConfig("Guard Sole Default", {
      is_default: true,
    });

    const del = await app.inject({
      method: "DELETE",
      url: `/api/admin/fare-configs/${fare_config_id}`,
      headers: auth(),
    });
    expect(del.statusCode).toBe(409);
    expect(del.json().error.code).toBe("CONFLICT");
  });

  it("reports active_route_count on the fare config list", async () => {
    const { fare_config_id: unreferenced } = await createFareConfig(
      "Guard Count Unreferenced",
    );
    const { fare_config_id: referenced } = await createFareConfig(
      "Guard Count Referenced",
    );

    await createRoute(uniqueRouteId("count-active"), referenced);

    const inactiveRouteId = uniqueRouteId("count-inactive");
    await createRoute(inactiveRouteId, referenced, false);
    const deactivateRoute = await app.inject({
      method: "PUT",
      url: `/api/admin/routes/${inactiveRouteId}`,
      headers: auth(),
      payload: { is_active: false },
    });
    expect(deactivateRoute.statusCode).toBe(200);

    const list = await app.inject({
      method: "GET",
      url: "/api/admin/fare-configs",
      headers: auth(),
    });
    const rows = list.json().data as Array<{
      fare_config_id: string;
      active_route_count: number;
    }>;
    const find = (id: string) => rows.find((r) => r.fare_config_id === id);
    expect(find(unreferenced)?.active_route_count).toBe(0);
    expect(find(referenced)?.active_route_count).toBe(1);
  });

  it("rejects an update that would leave the default fare config inactive with 409", async () => {
    const { fare_config_id } = await createFareConfig(
      "Guard Default Inactive",
      {
        is_default: true,
      },
    );

    const res = await app.inject({
      method: "PUT",
      url: `/api/admin/fare-configs/${fare_config_id}`,
      headers: auth(),
      payload: { is_active: false },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("CONFLICT");

    const read = await getFareConfig(fare_config_id);
    expect(read.is_active).toBe(true);
    expect(read.is_default).toBe(true);
  });

  it("rejects making a non-default fare config an inactive default with 409", async () => {
    const { fare_config_id } = await createFareConfig("Guard Inactive Default");

    const res = await app.inject({
      method: "PUT",
      url: `/api/admin/fare-configs/${fare_config_id}`,
      headers: auth(),
      payload: { is_active: false, is_default: true },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("CONFLICT");

    const read = await getFareConfig(fare_config_id);
    expect(read.is_active).toBe(true);
    expect(read.is_default).toBe(false);
  });

  it("rejects setting an already-inactive fare config as default with 409", async () => {
    const { fare_config_id } = await createFareConfig(
      "Guard Inactive Set Default",
    );
    const deactivate = await app.inject({
      method: "DELETE",
      url: `/api/admin/fare-configs/${fare_config_id}`,
      headers: auth(),
    });
    expect(deactivate.statusCode).toBe(200);

    const res = await app.inject({
      method: "PUT",
      url: `/api/admin/fare-configs/${fare_config_id}`,
      headers: auth(),
      payload: { is_default: true },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("CONFLICT");

    const read = await getFareConfig(fare_config_id);
    expect(read.is_active).toBe(false);
    expect(read.is_default).toBe(false);
  });

  it("rejects an update that would leave zero default fare configs with 409", async () => {
    const { fare_config_id } = await createFareConfig("Guard Zero Defaults", {
      is_default: true,
    });

    const res = await app.inject({
      method: "PUT",
      url: `/api/admin/fare-configs/${fare_config_id}`,
      headers: auth(),
      payload: { is_active: false, is_default: false },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("CONFLICT");

    const read = await getFareConfig(fare_config_id);
    expect(read.is_active).toBe(true);
    expect(read.is_default).toBe(true);
  });
});
