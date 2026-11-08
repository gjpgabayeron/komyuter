import { randomUUID } from "node:crypto";
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
 * Attribution (ADR-0025, ticket #45): Routes, Directions and Stops record who
 * created them and who last wrote them, taken from the resolved Account and
 * never from request input. The cases here are the ticket's own list — create
 * stamps both, a second Account's update moves only `updated_by`, a direction
 * save stamps the Direction and every Stop it writes without touching the
 * parent Route, and rows that predate the columns read null.
 */
describe("Attribution on the plotted path (ADR-0025)", () => {
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

    // A second, lower Account that may still plot (Plotter holds ROUTES_EDIT)
    // so "who created this" and "who touched it last" can disagree.
    const plotter = await createTestAdmin("attribution-plotter", "plotter");
    plotterId = plotter.userId;
    plotterToken = await signInAs(plotter.email, plotter.password);
  });

  afterAll(async () => {
    await app.close();
  });

  function auth(token: string) {
    return { authorization: `Bearer ${token}` };
  }

  async function createRoute(token: string, prefix = "attr"): Promise<string> {
    const routeId = uniqueRouteId(prefix);
    const created = await app.inject({
      method: "POST",
      url: "/api/admin/routes",
      headers: auth(token),
      payload: {
        route_id: routeId,
        name: "Attributed Route",
        short_name: "AR",
      },
    });
    expect(created.statusCode).toBe(201);
    return routeId;
  }

  function readRoute(routeId: string) {
    return app.inject({
      method: "GET",
      url: `/api/admin/routes/${routeId}`,
      headers: auth(ownerToken),
    });
  }

  it("stamps creator and last writer from the guard's Account on create", async () => {
    const routeId = uniqueRouteId("attr-create");
    const created = await app.inject({
      method: "POST",
      url: "/api/admin/routes",
      headers: auth(ownerToken),
      payload: {
        route_id: routeId,
        name: "Attributed Route",
        short_name: "AR",
        // A client-supplied actor must be ignored: the guard decides, not input.
        created_by: { userId: plotterId, name: "Forged" },
        updated_by: { userId: plotterId, name: "Forged" },
      },
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

    const read = await readRoute(routeId);
    expect(read.statusCode).toBe(200);
    expect(read.json().data.created_by).toEqual({
      userId: ownerId,
      name: expect.any(String),
    });
    expect(read.json().data.updated_by).toEqual({
      userId: ownerId,
      name: expect.any(String),
    });
  });

  it("moves only updated_by when a second Account updates the route", async () => {
    const routeId = await createRoute(ownerToken, "attr-update");

    const updated = await app.inject({
      method: "PUT",
      url: `/api/admin/routes/${routeId}`,
      headers: auth(plotterToken),
      payload: { name: "Renamed by the plotter", base_version: 1 },
    });
    expect(updated.statusCode).toBe(200);

    const data = updated.json().data;
    // The creator never changes; the last writer is the Account that just wrote.
    expect(data.created_by).toEqual({
      userId: ownerId,
      name: expect.any(String),
    });
    expect(data.updated_by).toEqual({ userId: plotterId, name: "Test Admin" });

    const read = await readRoute(routeId);
    expect(read.json().data.created_by).toEqual({
      userId: ownerId,
      name: expect.any(String),
    });
    expect(read.json().data.updated_by).toEqual({
      userId: plotterId,
      name: "Test Admin",
    });
  });

  it("stamps the Direction and every Stop a direction save writes, leaving the Route's attributed writer alone", async () => {
    const routeId = await createRoute(ownerToken, "attr-plot");
    const before = await readRoute(routeId);
    expect(before.statusCode).toBe(200);
    const routeBefore = before.json().data;

    const saved = await app.inject({
      method: "POST",
      url: `/api/admin/routes/${routeId}/directions`,
      headers: auth(plotterToken),
      payload: {
        label: "To Port",
        base_polyline: POLYLINE,
        stops: [
          { name: "City Hall", type: "terminal", location: point(A) },
          { name: "Plaza", type: "major_stop", location: point(MID) },
          { name: "Port", type: "terminal", location: point(B) },
        ],
      },
    });
    expect(saved.statusCode).toBe(201);

    const plotterAttribution = { userId: plotterId, name: "Test Admin" };
    const data = saved.json().data;
    expect(data.created_by).toEqual(plotterAttribution);
    expect(data.updated_by).toEqual(plotterAttribution);

    const writtenStops = [...data.stops, ...data.return_direction.stops];
    expect(writtenStops.length).toBe(6);
    for (const stop of writtenStops) {
      expect(stop.created_by).toEqual(plotterAttribution);
      expect(stop.updated_by).toEqual(plotterAttribution);
    }

    // Editing a direction is not an edit of the Route entity: the parent's
    // last writer and timestamp stay where they were.
    const after = await readRoute(routeId);
    const routeAfter = after.json().data;
    expect(routeAfter.updated_by).toEqual(routeBefore.updated_by);
    expect(routeAfter.updated_at).toBe(routeBefore.updated_at);
  });

  it("stamps the Route when its own fields change", async () => {
    const routeId = await createRoute(plotterToken, "attr-route-field");
    const created = await readRoute(routeId);
    expect(created.json().data.created_by).toEqual({
      userId: plotterId,
      name: "Test Admin",
    });

    const updated = await app.inject({
      method: "PUT",
      url: `/api/admin/routes/${routeId}`,
      headers: auth(ownerToken),
      payload: { short_name: "RENAMED", base_version: 1 },
    });
    expect(updated.statusCode).toBe(200);

    const data = updated.json().data;
    expect(data.created_by).toEqual({
      userId: plotterId,
      name: "Test Admin",
    });
    expect(data.updated_by).toEqual({
      userId: ownerId,
      name: expect.any(String),
    });
  });

  it("stamps stop create and update from the acting Account", async () => {
    const routeId = await createRoute(ownerToken, "attr-stop");
    const saved = await app.inject({
      method: "POST",
      url: `/api/admin/routes/${routeId}/directions`,
      headers: auth(ownerToken),
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
    const directionId = saved.json().data.direction_id as string;

    const created = await app.inject({
      method: "POST",
      url: `/api/admin/directions/${directionId}/stops`,
      headers: auth(plotterToken),
      payload: {
        name: "Added stop",
        type: "waiting_area",
        location: point(MID),
      },
    });
    expect(created.statusCode).toBe(201);
    const stopId = created.json().data.stop_id as string;
    expect(created.json().data.created_by).toEqual({
      userId: plotterId,
      name: "Test Admin",
    });
    expect(created.json().data.updated_by).toEqual({
      userId: plotterId,
      name: "Test Admin",
    });

    const updated = await app.inject({
      method: "PUT",
      url: `/api/admin/stops/${stopId}`,
      headers: auth(ownerToken),
      payload: { notes: "Checked on site" },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().data.created_by).toEqual({
      userId: plotterId,
      name: "Test Admin",
    });
    expect(updated.json().data.updated_by).toEqual({
      userId: ownerId,
      name: expect.any(String),
    });

    const stops = await app.inject({
      method: "GET",
      url: `/api/admin/directions/${directionId}/stops`,
      headers: auth(ownerToken),
    });
    const listed = stops
      .json()
      .data.find((row: { stop_id: string }) => row.stop_id === stopId);
    expect(listed.created_by).toEqual({
      userId: plotterId,
      name: "Test Admin",
    });
    expect(listed.updated_by).toEqual({
      userId: ownerId,
      name: expect.any(String),
    });
  });

  it("stamps a direction metadata update and its stops list", async () => {
    const routeId = await createRoute(ownerToken, "attr-dir-update");
    const saved = await app.inject({
      method: "POST",
      url: `/api/admin/routes/${routeId}/directions`,
      headers: auth(ownerToken),
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
    const directionId = saved.json().data.direction_id as string;
    const baseStopIds = saved
      .json()
      .data.stops.map((stop: { stop_id: string }) => stop.stop_id);

    const updated = await app.inject({
      method: "PUT",
      url: `/api/admin/directions/${directionId}`,
      headers: auth(plotterToken),
      payload: { label: "To the Port", base_version: 1 },
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
    // Editing the direction's label is not editing its stops.
    expect(
      updated
        .json()
        .data.stops.map((stop: { stop_id: string }) => stop.stop_id),
    ).toEqual(baseStopIds);
    expect(updated.json().data.stops[0].updated_by).toEqual({
      userId: ownerId,
      name: expect.any(String),
    });
  });

  it("reads a row written before the columns existed as null, then attributes it on the next write", async () => {
    const routeId = uniqueRouteId("attr-legacy");
    const pool = createTestPool();
    try {
      // Only a pre-M2b row can look like this: the API always stamps, so the
      // legacy state is created the way history created it — outside the API.
      await pool.query(
        "insert into routes (route_id, name, short_name, is_active) values ($1, $2, $3, false)",
        [routeId, "Legacy Route", "LR"],
      );
    } finally {
      await pool.end();
    }

    const read = await readRoute(routeId);
    expect(read.statusCode).toBe(200);
    expect(read.json().data.created_by).toBeNull();
    expect(read.json().data.updated_by).toBeNull();

    const updated = await app.inject({
      method: "PUT",
      url: `/api/admin/routes/${routeId}`,
      headers: auth(ownerToken),
      payload: { name: "Legacy Route (touched)", base_version: 1 },
    });
    expect(updated.statusCode).toBe(200);
    // The unobserved writes stay unobserved: only the last writer is recorded.
    expect(updated.json().data.created_by).toBeNull();
    expect(updated.json().data.updated_by).toEqual({
      userId: ownerId,
      name: expect.any(String),
    });
  });

  it("degrades an identity the provider no longer knows to the id with no name", async () => {
    const routeId = uniqueRouteId("attr-ghost");
    const ghostId = randomUUID();
    const pool = createTestPool();
    try {
      // An Account row whose auth identity is gone: the reference survives the
      // deletion of the identity (that is what ON DELETE SET NULL is for in the
      // other direction), so the id is still the honest answer.
      await pool.query(
        "insert into admin_users (user_id, role_id) values ($1, 'plotter')",
        [ghostId],
      );
      await pool.query(
        "insert into routes (route_id, name, short_name, is_active, created_by) values ($1, $2, $3, false, $4)",
        [routeId, "Ghost Route", "GR", ghostId],
      );
    } finally {
      await pool.end();
    }

    const read = await readRoute(routeId);
    expect(read.statusCode).toBe(200);
    expect(read.json().data.created_by).toEqual({ userId: ghostId, name: "" });
  });

  it("leaves the commuter export dataset unchanged", async () => {
    const routeId = await createRoute(ownerToken, "attr-export");

    const exported = await app.inject({
      method: "GET",
      url: "/api/admin/export/dataset",
      headers: auth(ownerToken),
    });
    expect(exported.statusCode).toBe(200);

    const row = exported
      .json()
      .routes.find((entry: { route_id: string }) => entry.route_id === routeId);
    expect(row).toBeTruthy();
    // Provenance is admin-internal: the public dataset keeps its shape.
    expect(Object.keys(row)).not.toContain("created_by");
    expect(Object.keys(row)).not.toContain("updated_by");
  });
});
