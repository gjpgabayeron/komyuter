import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Db } from "../../src/config/db";
import type { Env } from "../../src/config/env";
import { buildApp } from "../../src/api/app";

/**
 * Ticket #47 — the server half of the Read-only Workspace.
 *
 * The SPA hides every mutating affordance for an Account without
 * `ROUTES_EDIT`, but the UI is an affordance and never the boundary
 * (ADR-0019: "anything the UI hides must also be refused server-side"). This
 * suite holds the real app — real route table, real guard, real Permission
 * hook, real error envelope — against a **Viewer** whose effective set is
 * empty, and asserts each hidden affordance is refused.
 *
 * Only the two things that are genuinely outside the process are stubbed: the
 * identity provider (a signed-in token) and the database read that resolves
 * the Account's Role. Nothing else is faked, so a route that lost its
 * `config.permission` fails here rather than shipping.
 */
const VIEWER_ID = "viewer-account";
const POINT = { type: "Point" as const, coordinates: [122.5646, 10.7202] };
const LINE = {
  type: "LineString" as const,
  coordinates: [
    [122.5646, 10.7202],
    [122.5701, 10.7231],
  ],
};

const ENV: Env = {
  DATABASE_URL: "postgres://postgres:postgres@127.0.0.1:54322/postgres",
  SUPABASE_URL: "http://127.0.0.1:54321",
  SUPABASE_SERVICE_ROLE_KEY: "test-service-role-key",
  PORT: 3000,
  ALLOW_DEV_CREDENTIAL: false,
  ADMIN_ORIGINS: "http://localhost:5173",
};

/** A signed-in identity the provider would resolve for the bearer token. */
function fakeSupabase(): SupabaseClient {
  return {
    auth: {
      getUser: async () => ({
        data: { user: { id: VIEWER_ID, email: "viewer@komyuter.test" } },
        error: null,
      }),
      admin: {
        listUsers: async () => ({ data: { users: [] }, error: null }),
      },
    },
  } as unknown as SupabaseClient;
}

/**
 * The one database read the guard makes (`loadAdminAccount`): the Viewer's
 * Role, holding no Permission. Every other query resolves to an empty result
 * — the write paths below are refused before any of them run.
 */
function fakeDb(): Db {
  const account = {
    userId: VIEWER_ID,
    roleId: "viewer",
    roleName: "Viewer",
    position: 10,
    rolePermissions: 0n,
    isSuperAdmin: false,
    isActive: true,
    mustChangePassword: false,
  };
  const query = {
    from: () => query,
    innerJoin: () => query,
    where: () => query,
    orderBy: () => query,
    groupBy: () => query,
    limit: async () => [account],
    then: (
      onFulfilled: (value: unknown[]) => unknown,
      onRejected?: (reason: unknown) => unknown,
    ) => Promise.resolve([]).then(onFulfilled, onRejected),
  };
  return { select: () => query } as unknown as Db;
}

interface Refusal {
  /** What the SPA hides, in the dashboard's own words. */
  affordance: string;
  method: "GET" | "POST" | "PUT" | "DELETE";
  url: string;
  body?: unknown;
  /** The Permission the refusal must name. */
  permission: string;
}

const WORKSPACE_WRITES: Refusal[] = [
  {
    affordance: "create a route",
    method: "POST",
    url: "/api/admin/routes",
    body: { name: "Viewer Route", short_name: "VR" },
    permission: "ROUTES_EDIT",
  },
  {
    affordance: "edit a route's metadata",
    method: "PUT",
    url: "/api/admin/routes/iloilo-city-proper",
    body: { name: "Renamed" },
    permission: "ROUTES_EDIT",
  },
  {
    affordance: "delete a route",
    method: "DELETE",
    url: "/api/admin/routes/iloilo-city-proper",
    permission: "ROUTES_EDIT",
  },
  {
    affordance: "save a direction (save)",
    method: "POST",
    url: "/api/admin/routes/iloilo-city-proper/directions",
    body: { label: "To Plaza", base_polyline: LINE },
    permission: "ROUTES_EDIT",
  },
  {
    affordance: "replace a direction (save)",
    method: "PUT",
    url: "/api/admin/directions/direction-1",
    body: { label: "To Plaza" },
    permission: "ROUTES_EDIT",
  },
  {
    affordance: "delete a direction",
    method: "DELETE",
    url: "/api/admin/directions/direction-1",
    permission: "ROUTES_EDIT",
  },
  {
    affordance: "add a stop",
    method: "POST",
    url: "/api/admin/directions/direction-1/stops",
    body: { name: "Plaza", type: "major_stop", location: POINT },
    permission: "ROUTES_EDIT",
  },
  {
    affordance: "edit a stop",
    method: "PUT",
    url: "/api/admin/stops/stop-1",
    body: { name: "Plaza" },
    permission: "ROUTES_EDIT",
  },
  {
    affordance: "delete a stop",
    method: "DELETE",
    url: "/api/admin/stops/stop-1",
    permission: "ROUTES_EDIT",
  },
  {
    affordance: "create a detour",
    method: "POST",
    url: "/api/admin/directions/direction-1/detours",
    body: {
      label: "Bridge closed",
      entry: POINT,
      exit: POINT,
      detour_polyline: LINE,
      commuter_instruction: "Alight before the bridge",
    },
    permission: "ROUTES_EDIT",
  },
  {
    affordance: "edit a detour",
    method: "PUT",
    url: "/api/admin/detours/detour-1",
    body: { label: "Bridge closed" },
    permission: "ROUTES_EDIT",
  },
  {
    affordance: "delete a detour",
    method: "DELETE",
    url: "/api/admin/detours/detour-1",
    permission: "ROUTES_EDIT",
  },
  {
    affordance: "create a restriction",
    method: "POST",
    url: "/api/admin/directions/direction-1/restrictions",
    body: {
      from_coord_index: 0,
      to_coord_index: 1,
      kind: "both",
    },
    permission: "ROUTES_EDIT",
  },
  {
    affordance: "edit a restriction",
    method: "PUT",
    url: "/api/admin/restrictions/restriction-1",
    body: { note: "No stopping 7–9am" },
    permission: "ROUTES_EDIT",
  },
  {
    affordance: "delete a restriction",
    method: "DELETE",
    url: "/api/admin/restrictions/restriction-1",
    permission: "ROUTES_EDIT",
  },
];

const OTHER_CAPABILITIES: Refusal[] = [
  {
    affordance: "edit a fare configuration",
    method: "POST",
    url: "/api/admin/fare-configs",
    body: {
      label: "Viewer fare",
      base_fare: 13,
      base_distance_km: 4,
      rate_per_km: 1.8,
      student_discount_pct: 20,
      senior_discount_pct: 20,
    },
    permission: "FARES_EDIT",
  },
  {
    affordance: "export the dataset",
    method: "GET",
    url: "/api/admin/export/dataset",
    permission: "EXPORT_DATASET",
  },
  {
    affordance: "search for a place (the gated Mapbox token)",
    method: "GET",
    url: "/api/admin/mapbox/geocode?q=plaza",
    permission: "MAPBOX_GEOSERVICES",
  },
  {
    affordance: "read the access model (Accounts)",
    method: "GET",
    url: "/api/admin/accounts",
    permission: "ADMIN_MANAGE",
  },
];

describe("a Viewer's hidden workspace actions are refused by the server", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = buildApp({ db: fakeDb(), supabase: fakeSupabase(), env: ENV });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  const authorization = { authorization: "Bearer viewer-token" };

  it.each(WORKSPACE_WRITES)(
    "refuses $affordance",
    async ({ method, url, body, permission }) => {
      const response = await app.inject({
        method,
        url,
        headers: authorization,
        ...(body === undefined ? {} : { payload: body as object }),
      });
      expect(response.statusCode).toBe(403);
      expect(response.json().error.code).toBe("FORBIDDEN");
      expect(response.json().error.message).toContain(permission);
    },
  );

  it("refuses the affordances of the other four capabilities too", async () => {
    for (const { method, url, body, permission } of OTHER_CAPABILITIES) {
      const response = await app.inject({
        method,
        url,
        headers: authorization,
        ...(body === undefined ? {} : { payload: body as object }),
      });
      expect(response.statusCode, `${method} ${url}`).toBe(403);
      expect(response.json().error.message, `${method} ${url}`).toContain(
        permission,
      );
    }
  });

  it("still lets the Viewer read the transit data the workspace renders", async () => {
    for (const url of [
      "/api/admin/routes",
      "/api/admin/routes/overview",
      "/api/admin/routes/iloilo-city-proper",
    ]) {
      const response = await app.inject({
        method: "GET",
        url,
        headers: authorization,
      });
      expect(response.statusCode, url).toBe(200);
      expect(response.json().success).toBe(true);
    }
  });

  it("still serves the Viewer its own effective set for the capability module", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/admin/me",
      headers: authorization,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().data.permissions).toEqual([]);
  });
});
