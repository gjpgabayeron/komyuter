import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildTestApp, signInAdmin, uniqueRouteId } from "./helpers";

describe("status endpoint and persistence (SC-006/SC-008, FR-014)", () => {
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

  it("reports status ok with a monotonically non-decreasing route count", async () => {
    const before = await app.inject({ method: "GET", url: "/api/status" });
    expect(before.statusCode).toBe(200);
    const beforeBody = before.json();
    expect(beforeBody.success).toBe(true);
    expect(beforeBody.data.status).toBe("ok");
    expect(typeof beforeBody.data.stats.routes).toBe("number");
    expect(typeof beforeBody.data.stats.stops).toBe("number");
    expect(typeof beforeBody.data.stats.directions).toBe("number");

    const routeId = uniqueRouteId("status-route");
    const create = await app.inject({
      method: "POST",
      url: "/api/admin/routes",
      headers: auth(),
      payload: { route_id: routeId, name: "Status Route", short_name: "SR" },
    });
    expect(create.statusCode).toBe(201);

    const after = await app.inject({ method: "GET", url: "/api/status" });
    const afterBody = after.json();
    expect(afterBody.data.stats.routes).toBeGreaterThanOrEqual(
      beforeBody.data.stats.routes + 1,
    );
  });

  it("serves persisted data through a fresh app instance (restart equivalent)", async () => {
    const routeId = uniqueRouteId("persist-route");
    const create = await app.inject({
      method: "POST",
      url: "/api/admin/routes",
      headers: auth(),
      payload: { route_id: routeId, name: "Persist Route", short_name: "PR" },
    });
    expect(create.statusCode).toBe(201);

    await app.close();
    app = buildTestApp();
    await app.ready();

    const read = await app.inject({
      method: "GET",
      url: `/api/admin/routes/${routeId}`,
      headers: { authorization: `Bearer ${await signInAdmin()}` },
    });
    expect(read.statusCode).toBe(200);
    expect(read.json().data.route_id).toBe(routeId);
  });
});
