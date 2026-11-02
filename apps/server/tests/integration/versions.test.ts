import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type { GeoLineString, GeoPoint } from "@komyuter/shared";
import {
  buildTestApp,
  createTestAdmin,
  signInAdmin,
  signInAs,
  uniqueRouteId,
} from "./helpers";

const A: [number, number] = [122.5, 10.6];
const B: [number, number] = [122.52, 10.62];

const POLYLINE: GeoLineString = { type: "LineString", coordinates: [A, B] };

function point(coordinates: [number, number]): GeoPoint {
  return { type: "Point", coordinates };
}

/**
 * ADR-0020 (optimistic concurrency), ADR-0031 (stop identity). A Route and a
 * Direction each carry the stamp a save is based on; a save whose base is stale
 * is refused with VERSION_CONFLICT and writes nothing.
 */
describe("Route and Direction versions (ADR-0020)", () => {
  let app: FastifyInstance;
  let token = "";
  let plotterToken = "";

  beforeAll(async () => {
    app = buildTestApp();
    await app.ready();
    token = await signInAdmin();
    const plotter = await createTestAdmin("versions-plotter", "plotter");
    plotterToken = await signInAs(plotter.email, plotter.password);
  });

  afterAll(async () => {
    await app.close();
  });

  const auth = (as = token) => ({ authorization: `Bearer ${as}` });

  async function createRoute(): Promise<{ routeId: string; version: number }> {
    const routeId = uniqueRouteId("ver");
    const res = await app.inject({
      method: "POST",
      url: "/api/admin/routes",
      headers: auth(),
      payload: { route_id: routeId, name: "Versioned Route", short_name: "VR" },
    });
    expect(res.statusCode).toBe(201);
    return { routeId, version: res.json().data.version };
  }

  async function createPlottedDirection(routeId: string) {
    const res = await app.inject({
      method: "POST",
      url: `/api/admin/routes/${routeId}/directions`,
      headers: auth(),
      payload: {
        label: "To Port",
        base_polyline: POLYLINE,
        stops: [
          { name: "Start", type: "terminal", location: point(A) },
          { name: "End", type: "terminal", location: point(B) },
        ],
      },
    });
    expect(res.statusCode).toBe(201);
    return res.json().data as {
      direction_id: string;
      version: number;
      stops: { stop_id: string; name: string }[];
      return_direction: { direction_id: string; version: number };
    };
  }

  function getDirection(directionId: string) {
    return app.inject({
      method: "GET",
      url: `/api/admin/directions/${directionId}`,
      headers: auth(),
    });
  }

  function plotPayload(label: string) {
    return {
      label,
      base_polyline: POLYLINE,
      stops: [
        { name: "Start", type: "terminal", location: point(A) },
        { name: "End", type: "terminal", location: point(B) },
      ],
    };
  }

  it("a new Route and a new Direction each start at version 1", async () => {
    const { routeId, version } = await createRoute();
    expect(version).toBe(1);

    const direction = await createPlottedDirection(routeId);
    expect(direction.version).toBe(1);
    expect(direction.return_direction.version).toBe(1);
  });

  it("accepts a save based on the current version and returns the next one", async () => {
    const { routeId } = await createRoute();
    const direction = await createPlottedDirection(routeId);

    const res = await app.inject({
      method: "PUT",
      url: `/api/admin/directions/${direction.direction_id}`,
      headers: auth(),
      payload: {
        ...plotPayload("To Port Updated"),
        base_version: direction.version,
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.version).toBe(direction.version + 1);
  });

  it("refuses a stale Direction save with VERSION_CONFLICT and writes nothing", async () => {
    const { routeId } = await createRoute();
    const direction = await createPlottedDirection(routeId);

    const first = await app.inject({
      method: "PUT",
      url: `/api/admin/directions/${direction.direction_id}`,
      headers: auth(),
      payload: {
        ...plotPayload("First Save"),
        base_version: direction.version,
      },
    });
    expect(first.statusCode).toBe(200);
    const savedStopIds = first
      .json()
      .data.stops.map((stop: { stop_id: string }) => stop.stop_id);

    // A second Account still holding the pre-save base.
    const stale = await app.inject({
      method: "PUT",
      url: `/api/admin/directions/${direction.direction_id}`,
      headers: auth(plotterToken),
      payload: {
        ...plotPayload("Stale Save"),
        base_version: direction.version,
      },
    });

    expect(stale.statusCode).toBe(409);
    expect(stale.json()).toMatchObject({
      success: false,
      error: { code: "VERSION_CONFLICT" },
    });
    expect(stale.json().error.current_version).toBe(direction.version + 1);

    const current = await getDirection(direction.direction_id);
    expect(current.json().data.label).toBe("First Save");
    expect(current.json().data.version).toBe(direction.version + 1);
    expect(
      current
        .json()
        .data.stops.map((stop: { stop_id: string }) => stop.stop_id),
    ).toEqual(savedStopIds);
  });

  it("refuses a stale Route metadata save", async () => {
    const { routeId, version } = await createRoute();

    const first = await app.inject({
      method: "PUT",
      url: `/api/admin/routes/${routeId}`,
      headers: auth(),
      payload: { name: "First Name", base_version: version },
    });
    expect(first.statusCode).toBe(200);
    expect(first.json().data.version).toBe(version + 1);

    const stale = await app.inject({
      method: "PUT",
      url: `/api/admin/routes/${routeId}`,
      headers: auth(),
      payload: { name: "Stale Name", base_version: version },
    });
    expect(stale.statusCode).toBe(409);
    expect(stale.json().error.code).toBe("VERSION_CONFLICT");

    const current = await app.inject({
      method: "GET",
      url: `/api/admin/routes/${routeId}`,
      headers: auth(),
    });
    expect(current.json().data.name).toBe("First Name");
  });

  it("refuses a stale Direction delete", async () => {
    const { routeId } = await createRoute();
    const direction = await createPlottedDirection(routeId);

    const bumped = await app.inject({
      method: "PUT",
      url: `/api/admin/directions/${direction.direction_id}`,
      headers: auth(),
      payload: { ...plotPayload("Renamed"), base_version: direction.version },
    });
    expect(bumped.statusCode).toBe(200);

    const stale = await app.inject({
      method: "DELETE",
      url: `/api/admin/directions/${direction.direction_id}?base_version=${direction.version}`,
      headers: auth(),
    });
    expect(stale.statusCode).toBe(409);
    expect(stale.json().error.code).toBe("VERSION_CONFLICT");

    const current = await getDirection(direction.direction_id);
    expect(current.json().data.is_active).toBe(true);
  });

  it("refuses a stale Route delete and accepts the current version", async () => {
    const { routeId, version } = await createRoute();

    const renamed = await app.inject({
      method: "PUT",
      url: `/api/admin/routes/${routeId}`,
      headers: auth(),
      payload: { name: "Renamed", base_version: version },
    });
    expect(renamed.statusCode).toBe(200);

    const stale = await app.inject({
      method: "DELETE",
      url: `/api/admin/routes/${routeId}?base_version=${version}`,
      headers: auth(),
    });
    expect(stale.statusCode).toBe(409);

    const ok = await app.inject({
      method: "DELETE",
      url: `/api/admin/routes/${routeId}?base_version=${version + 1}`,
      headers: auth(),
    });
    expect(ok.statusCode).toBe(200);
  });

  it("refuses to save the derived return Direction as a base", async () => {
    const { routeId } = await createRoute();
    const direction = await createPlottedDirection(routeId);

    const res = await app.inject({
      method: "PUT",
      url: `/api/admin/directions/${direction.return_direction.direction_id}`,
      headers: auth(),
      payload: {
        ...plotPayload("Return As Base"),
        base_version: direction.return_direction.version,
      },
    });

    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe("CONFLICT");
  });

  it("requires base_version on every mutating save", async () => {
    const { routeId, version } = await createRoute();
    const direction = await createPlottedDirection(routeId);

    const routeSave = await app.inject({
      method: "PUT",
      url: `/api/admin/routes/${routeId}`,
      headers: auth(),
      payload: { name: "No Version" },
    });
    expect([400, 422]).toContain(routeSave.statusCode);

    const directionSave = await app.inject({
      method: "PUT",
      url: `/api/admin/directions/${direction.direction_id}`,
      headers: auth(),
      payload: plotPayload("No Version"),
    });
    expect([400, 422]).toContain(directionSave.statusCode);

    const routeDelete = await app.inject({
      method: "DELETE",
      url: `/api/admin/routes/${routeId}`,
      headers: auth(),
    });
    expect([400, 422]).toContain(routeDelete.statusCode);
    expect(version).toBe(1);
  });
});
