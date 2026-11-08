import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import {
  buildTestApp,
  createNonAdminToken,
  signInAdmin,
  uniqueRouteId,
} from "./helpers";

describe("auth gating (SC-001)", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = buildTestApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  const routeBody = (id: string) => ({
    route_id: id,
    name: "Test Route",
    short_name: "TR",
  });

  it("rejects an unauthenticated write with 401 and does not change data", async () => {
    const id = uniqueRouteId("unauth-route");
    const response = await app.inject({
      method: "POST",
      url: "/api/admin/routes",
      payload: routeBody(id),
    });

    expect(response.statusCode).toBe(401);
    const body = response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("UNAUTHORIZED");

    const list = await app.inject({
      method: "GET",
      url: "/api/admin/routes",
      headers: { authorization: `Bearer ${await signInAdmin()}` },
    });
    expect(list.statusCode).toBe(200);
    expect(
      list.json().data.some((r: { route_id: string }) => r.route_id === id),
    ).toBe(false);
  });

  it("rejects a non-admin token with 403 and no data change", async () => {
    const id = uniqueRouteId("forbidden-route");
    const token = await createNonAdminToken();

    const response = await app.inject({
      method: "POST",
      url: "/api/admin/routes",
      headers: { authorization: `Bearer ${token}` },
      payload: routeBody(id),
    });

    expect(response.statusCode).toBe(403);
    const body = response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("FORBIDDEN");

    const list = await app.inject({
      method: "GET",
      url: "/api/admin/routes",
      headers: { authorization: `Bearer ${await signInAdmin()}` },
    });
    expect(
      list.json().data.some((r: { route_id: string }) => r.route_id === id),
    ).toBe(false);
  });

  it("allows the seeded admin to create a route", async () => {
    const id = uniqueRouteId("admin-route");
    const token = await signInAdmin();

    const response = await app.inject({
      method: "POST",
      url: "/api/admin/routes",
      headers: { authorization: `Bearer ${token}` },
      payload: routeBody(id),
    });

    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.success).toBe(true);
    expect(body.data.route_id).toBe(id);

    const read = await app.inject({
      method: "GET",
      url: `/api/admin/routes/${id}`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(read.statusCode).toBe(200);
    expect(read.json().data.route_id).toBe(id);
  });
});
