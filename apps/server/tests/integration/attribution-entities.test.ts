import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import {
  buildTestApp,
  createTestAdmin,
  createTestPool,
  signInAdmin,
  signInAs,
  uniqueRouteId,
} from "./helpers";

const A: [number, number] = [122.5, 10.6];
const MID: [number, number] = [122.51, 10.61];
const B: [number, number] = [122.52, 10.62];

const POLYLINE = { type: "LineString", coordinates: [A, MID, B] } as const;

function point(coordinates: [number, number]) {
  return { type: "Point", coordinates } as const;
}

/**
 * Attribution on the remaining entities (ADR-0025, ticket #46): Detours,
 * Detour Stops, Restrictions and Fare Configurations record who created them
 * and who last wrote them, taken from the resolved Account and never from
 * request input. Create sets both columns; update moves only `updated_by`;
 * rows written before the columns read null. The commuter export keeps its
 * shape — provenance is admin-internal.
 */
describe("Attribution on detours, restrictions and fare configs (ADR-0025)", () => {
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
    expect(me.statusCode).toBe(200);
    ownerId = me.json().data.userId;

    const plotter = await createTestAdmin("attribution-entities", "plotter");
    plotterId = plotter.userId;
    plotterToken = await signInAs(plotter.email, plotter.password);
  });

  afterAll(async () => {
    await app.close();
  });

  function auth(token: string) {
    return { authorization: `Bearer ${token}` };
  }

  /** A route with a plotted base direction; returns the direction id. */
  async function createDirection(token: string, prefix: string) {
    const routeId = uniqueRouteId(prefix);
    const route = await app.inject({
      method: "POST",
      url: "/api/admin/routes",
      headers: auth(token),
      payload: {
        route_id: routeId,
        name: "Attributed Route",
        short_name: "AR",
      },
    });
    expect(route.statusCode).toBe(201);
    const saved = await app.inject({
      method: "POST",
      url: `/api/admin/routes/${routeId}/directions`,
      headers: auth(token),
      payload: {
        label: "To Port",
        base_polyline: POLYLINE,
        stops: [
          { name: "City Hall", type: "terminal", location: point(A) },
          { name: "Port", type: "terminal", location: point(B) },
        ],
      },
    });
    expect(saved.statusCode).toBe(201);
    return saved.json().data.direction_id as string;
  }

  function detourPayload(extra: Record<string, unknown> = {}) {
    return {
      label: "Market diversion",
      entry: point(A),
      exit: point(B),
      detour_polyline: { type: "LineString", coordinates: [A, MID, B] },
      additional_distance_meters: 400,
      commuter_instruction: "Take the diversion",
      ...extra,
    };
  }

  it("stamps a Detour on create and moves only updated_by on update", async () => {
    const directionId = await createDirection(ownerToken, "attr-detour");

    const created = await app.inject({
      method: "POST",
      url: `/api/admin/directions/${directionId}/detours`,
      headers: auth(ownerToken),
      payload: detourPayload(),
    });
    expect(created.statusCode).toBe(201);
    const data = created.json().data;
    expect(data.created_by).toEqual({
      userId: ownerId,
      name: expect.any(String),
    });
    expect(data.updated_by).toEqual({
      userId: ownerId,
      name: expect.any(String),
    });

    const detourId = data.detour_id as string;
    const updated = await app.inject({
      method: "PUT",
      url: `/api/admin/detours/${detourId}`,
      headers: auth(plotterToken),
      payload: { label: "Renamed diversion" },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().data.created_by).toEqual({
      userId: ownerId,
      name: expect.any(String),
    });
    expect(updated.json().data.updated_by).toEqual({
      userId: plotterId,
      name: "Test Admin",
    });

    // The list read carries the same attribution.
    const listed = await app.inject({
      method: "GET",
      url: `/api/admin/directions/${directionId}/detours`,
      headers: auth(ownerToken),
    });
    const row = listed
      .json()
      .data.find((d: { detour_id: string }) => d.detour_id === detourId);
    expect(row.created_by).toEqual({
      userId: ownerId,
      name: expect.any(String),
    });
    expect(row.updated_by).toEqual({ userId: plotterId, name: "Test Admin" });
  });

  it("attributes a Detour Stop created with its Detour", async () => {
    const directionId = await createDirection(ownerToken, "attr-dstop");

    const created = await app.inject({
      method: "POST",
      url: `/api/admin/directions/${directionId}/detours`,
      headers: auth(ownerToken),
      payload: detourPayload({
        detour_stops: [
          {
            name: "Market detour",
            location: point(MID),
            type: "waiting_area",
            is_guaranteed_service: false,
          },
        ],
      }),
    });
    expect(created.statusCode).toBe(201);

    const stops = created.json().data.detour_stops;
    expect(stops).toHaveLength(1);
    expect(stops[0].created_by).toEqual({
      userId: ownerId,
      name: expect.any(String),
    });
    expect(stops[0].updated_by).toEqual({
      userId: ownerId,
      name: expect.any(String),
    });

    // Nested detour stops read the same attribution from the list endpoint.
    const listed = await app.inject({
      method: "GET",
      url: `/api/admin/directions/${directionId}/detours`,
      headers: auth(ownerToken),
    });
    const nested = listed.json().data[0].detour_stops[0];
    expect(nested.created_by).toEqual({
      userId: ownerId,
      name: expect.any(String),
    });
    expect(nested.updated_by).toEqual({
      userId: ownerId,
      name: expect.any(String),
    });
  });

  it("stamps a Restriction on create and moves only updated_by on update", async () => {
    const directionId = await createDirection(ownerToken, "attr-rest");

    const created = await app.inject({
      method: "POST",
      url: `/api/admin/directions/${directionId}/restrictions`,
      headers: auth(ownerToken),
      payload: {
        from_coord_index: 0,
        to_coord_index: 1,
        reason: "no_stopping_zone",
        affects: "boarding",
      },
    });
    expect(created.statusCode).toBe(201);
    const restrictionId = created.json().data.restriction_id as string;
    expect(created.json().data.created_by).toEqual({
      userId: ownerId,
      name: expect.any(String),
    });
    expect(created.json().data.updated_by).toEqual({
      userId: ownerId,
      name: expect.any(String),
    });

    const updated = await app.inject({
      method: "PUT",
      url: `/api/admin/restrictions/${restrictionId}`,
      headers: auth(plotterToken),
      payload: { affects: "both" },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().data.created_by).toEqual({
      userId: ownerId,
      name: expect.any(String),
    });
    expect(updated.json().data.updated_by).toEqual({
      userId: plotterId,
      name: "Test Admin",
    });

    const listed = await app.inject({
      method: "GET",
      url: `/api/admin/directions/${directionId}/restrictions`,
      headers: auth(ownerToken),
    });
    const row = listed
      .json()
      .data.find(
        (r: { restriction_id: string }) => r.restriction_id === restrictionId,
      );
    expect(row.created_by).toEqual({
      userId: ownerId,
      name: expect.any(String),
    });
    expect(row.updated_by).toEqual({ userId: plotterId, name: "Test Admin" });
  });

  it("stamps a Fare Configuration on create and moves only updated_by on update", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/api/admin/fare-configs",
      headers: auth(ownerToken),
      payload: {
        label: "Attributed Fare",
        base_fare: 13,
        base_distance_km: 4,
        rate_per_km: 1.8,
        student_discount_pct: 20,
        senior_discount_pct: 20,
      },
    });
    expect(created.statusCode).toBe(201);
    const fareConfigId = created.json().data.fare_config_id as string;
    expect(created.json().data.created_by).toEqual({
      userId: ownerId,
      name: expect.any(String),
    });
    expect(created.json().data.updated_by).toEqual({
      userId: ownerId,
      name: expect.any(String),
    });

    const updated = await app.inject({
      method: "PUT",
      url: `/api/admin/fare-configs/${fareConfigId}`,
      headers: auth(plotterToken),
      payload: { base_fare: 15 },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().data.created_by).toEqual({
      userId: ownerId,
      name: expect.any(String),
    });
    expect(updated.json().data.updated_by).toEqual({
      userId: plotterId,
      name: "Test Admin",
    });

    const read = await app.inject({
      method: "GET",
      url: `/api/admin/fare-configs/${fareConfigId}`,
      headers: auth(ownerToken),
    });
    expect(read.json().data.created_by).toEqual({
      userId: ownerId,
      name: expect.any(String),
    });
    expect(read.json().data.updated_by).toEqual({
      userId: plotterId,
      name: "Test Admin",
    });
  });

  it("reads a row written before the columns existed as null, then attributes it on the next write", async () => {
    // A fare config is the simplest entity to seed outside the API: the API
    // always stamps, so the only way to reach the legacy state is the way
    // history reached it — a row that predates the columns.
    const fareConfigId = `fare-legacy-${Date.now()}`;
    const pool = createTestPool();
    try {
      await pool.query(
        "insert into fare_configs (fare_config_id, label) values ($1, $2)",
        [fareConfigId, "Legacy Fare"],
      );
    } finally {
      await pool.end();
    }

    const read = await app.inject({
      method: "GET",
      url: `/api/admin/fare-configs/${fareConfigId}`,
      headers: auth(ownerToken),
    });
    expect(read.statusCode).toBe(200);
    expect(read.json().data.created_by).toBeNull();
    expect(read.json().data.updated_by).toBeNull();

    const updated = await app.inject({
      method: "PUT",
      url: `/api/admin/fare-configs/${fareConfigId}`,
      headers: auth(ownerToken),
      payload: { base_fare: 16 },
    });
    expect(updated.statusCode).toBe(200);
    // The unobserved create stays unobserved; only the last writer is recorded.
    expect(updated.json().data.created_by).toBeNull();
    expect(updated.json().data.updated_by).toEqual({
      userId: ownerId,
      name: expect.any(String),
    });
  });

  it("leaves the commuter export dataset unchanged", async () => {
    const directionId = await createDirection(
      ownerToken,
      "attr-export-entities",
    );
    await app.inject({
      method: "POST",
      url: `/api/admin/directions/${directionId}/detours`,
      headers: auth(ownerToken),
      payload: detourPayload({
        detour_stops: [{ name: "Market detour", location: point(MID) }],
      }),
    });
    await app.inject({
      method: "POST",
      url: `/api/admin/directions/${directionId}/restrictions`,
      headers: auth(ownerToken),
      payload: {
        from_coord_index: 0,
        to_coord_index: 1,
        reason: "no_stopping_zone",
        affects: "boarding",
      },
    });

    const exported = await app.inject({
      method: "GET",
      url: "/api/admin/export/dataset",
      headers: auth(ownerToken),
    });
    expect(exported.statusCode).toBe(200);
    const dataset = exported.json();

    // Detours and restrictions are nested under the route's directions; fare
    // configs sit at the top level. Provenance is admin-internal: no export
    // row carries the attribution keys.
    const directions = dataset.routes.flatMap(
      (route: { directions?: unknown[] }) => route.directions ?? [],
    );
    const samples = [
      ...directions
        .flatMap((d: { detours?: object[] }) => d.detours ?? [])
        .map((detour: object) => ["detour", detour] as const),
      ...directions
        .flatMap(
          (d: { detours?: { detour_stops?: object[] }[] }) => d.detours ?? [],
        )
        .flatMap(
          (detour: { detour_stops?: object[] }) => detour.detour_stops ?? [],
        )
        .map((stop: object) => ["detour_stop", stop] as const),
      ...directions
        .flatMap((d: { restrictions?: object[] }) => d.restrictions ?? [])
        .map((restriction: object) => ["restriction", restriction] as const),
      ...dataset.fare_configs.map((f: object) => ["fare_config", f] as const),
    ];
    for (const [kind, row] of samples) {
      expect(Object.keys(row as object), kind).not.toContain("created_by");
      expect(Object.keys(row as object), kind).not.toContain("updated_by");
    }
  });
});
