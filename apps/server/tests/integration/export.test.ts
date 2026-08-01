import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildTestApp, signInAdmin, uniqueRouteId } from "./helpers";
import {
  assertDatasetValid,
  validateDatasetAgainstSchema,
} from "../helpers/dataset-schema";

const POLYLINE = {
  type: "LineString",
  coordinates: [
    [122.5, 10.6],
    [122.51, 10.61],
    [122.52, 10.62],
  ],
};

const POINT_A = { type: "Point", coordinates: [122.5, 10.6] };
const POINT_B = { type: "Point", coordinates: [122.52, 10.62] };

describe("export dataset (SC-004/SC-005)", () => {
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

  it("exports a dataset containing a plotted route with all references resolving", async () => {
    const routeId = uniqueRouteId("export-route");
    const createRoute = await app.inject({
      method: "POST",
      url: "/api/admin/routes",
      headers: auth(),
      payload: { route_id: routeId, name: "Export Route", short_name: "ER" },
    });
    expect(createRoute.statusCode).toBe(201);

    const createDirection = await app.inject({
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
    expect(createDirection.statusCode).toBe(201);
    const { direction_id, stops } = createDirection.json().data;
    const originStopId = stops[0].stop_id;
    const destinationStopId = stops[1].stop_id;

    await app.inject({
      method: "PUT",
      url: `/api/admin/directions/${direction_id}`,
      headers: auth(),
      payload: {
        origin_stop_id: originStopId,
        destination_stop_id: destinationStopId,
      },
    });

    const exportRes = await app.inject({
      method: "GET",
      url: "/api/admin/export/dataset",
      headers: auth(),
    });
    expect(exportRes.statusCode).toBe(200);
    expect(exportRes.headers["content-disposition"]).toMatch(/attachment/);
    expect(exportRes.headers["content-type"]).toMatch(/application\/json/);

    const dataset = exportRes.json();
    assertDatasetValid(dataset);

    expect(dataset.schema_version).toBe("1.0");
    expect(dataset.coordinate_order).toBe("lng_lat");
    expect(dataset.routes).toBeInstanceOf(Array);

    const route = dataset.routes.find(
      (r: { route_id: string }) => r.route_id === routeId,
    );
    expect(route).toBeTruthy();
    expect(route.directions).toHaveLength(1);
    expect(route.directions[0].stops).toHaveLength(2);
    expect(route.directions[0].terminals.origin).toBe(originStopId);
    expect(route.directions[0].terminals.destination).toBe(destinationStopId);

    const problems = [] as string[];
    const stopIds = new Set<string>();
    for (const r of dataset.routes) {
      for (const d of r.directions) {
        for (const s of d.stops) stopIds.add(s.stop_id);
        if (d.terminals.origin && !stopIds.has(d.terminals.origin)) {
          problems.push(`dangling origin ${d.terminals.origin}`);
        }
        if (d.terminals.destination && !stopIds.has(d.terminals.destination)) {
          problems.push(`dangling destination ${d.terminals.destination}`);
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it("does not emit arrival-time or ETA fields anywhere", async () => {
    const exportRes = await app.inject({
      method: "GET",
      url: "/api/admin/export/dataset",
      headers: auth(),
    });
    expect(exportRes.statusCode).toBe(200);
    const raw = exportRes.body;
    expect(raw).not.toMatch(/"eta"/i);
    expect(raw).not.toMatch(/"arrival"/i);
    expect(raw).not.toMatch(/"departure"/i);
  });

  it("serves a schema-valid dataset even on a fresh database", async () => {
    const exportRes = await app.inject({
      method: "GET",
      url: "/api/admin/export/dataset",
      headers: auth(),
    });
    expect(exportRes.statusCode).toBe(200);
    const errors = validateDatasetAgainstSchema(exportRes.json());
    expect(errors).toEqual([]);
  });

  it("parses standalone like the Collaboratory script read path", async () => {
    const exportRes = await app.inject({
      method: "GET",
      url: "/api/admin/export/dataset",
      headers: auth(),
    });
    expect(exportRes.statusCode).toBe(200);
    const parsed = JSON.parse(exportRes.body) as { routes: unknown[] };
    expect(Array.isArray(parsed.routes)).toBe(true);
    expect(parsed.routes.length).toBeGreaterThanOrEqual(1);
  });
});
