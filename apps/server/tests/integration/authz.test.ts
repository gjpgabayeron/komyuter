import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { promoteOwner } from "../../src/domain/owner-promotion";
import {
  buildTestApp,
  createTestAdmin,
  createTestPool,
  createTestSupabase,
  signInAdmin,
  signInAs,
  testEnv,
  uniqueRouteId,
} from "./helpers";

const auth = (token: string) => ({ authorization: `Bearer ${token}` });
const suffix = () => randomUUID().slice(0, 8);

const FARE_CONFIG = {
  label: "M2a fare",
  base_fare: 13,
  base_distance_km: 4,
  rate_per_km: 1.8,
  student_discount_pct: 20,
  senior_discount_pct: 20,
};

describe("M2a authorization core", () => {
  let app: FastifyInstance;
  let ownerToken = "";
  let ownerId = "";
  let managerToken = "";
  let managerId = "";
  let managerRoleId = "";
  let viewerToken = "";
  let viewerId = "";

  beforeAll(async () => {
    app = buildTestApp();
    await app.ready();

    const pool = createTestPool();
    try {
      const supabase = createTestSupabase();
      expect(
        await promoteOwner({
          pool,
          supabase,
          email: testEnv().ADMIN_EMAIL,
        }),
      ).toBe("promoted");
      expect(
        await promoteOwner({
          pool,
          supabase,
          email: testEnv().ADMIN_EMAIL,
        }),
      ).toBe("already");
      expect(
        await promoteOwner({
          pool,
          supabase,
          email: `missing-${suffix()}@komyuter.test`,
        }),
      ).toBe("missing-identity");
    } finally {
      await pool.end();
    }

    ownerToken = await signInAdmin();
    const me = await app.inject({
      method: "GET",
      url: "/api/admin/me",
      headers: auth(ownerToken),
    });
    expect(me.statusCode).toBe(200);
    ownerId = me.json().data.userId;
  });

  afterAll(async () => {
    await app.close();
  });

  it("returns the owner's effective set at GET /api/admin/me", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/admin/me",
      headers: auth(ownerToken),
    });
    expect(response.statusCode).toBe(200);
    const data = response.json().data;
    expect(data.isSuperAdmin).toBe(true);
    expect(data.role.name).toBe("Administrator");
    expect(data.permissions).toEqual(
      expect.arrayContaining([
        "ROUTES_EDIT",
        "FARES_EDIT",
        "EXPORT_DATASET",
        "MAPBOX_GEOSERVICES",
        "ADMIN_MANAGE",
      ]),
    );
  });

  it("lets a Viewer read transit data but refuses writes and the access model", async () => {
    const viewer = await createTestAdmin("viewer", "viewer");
    viewerId = viewer.userId;
    viewerToken = await signInAs(viewer.email, viewer.password);

    const read = await app.inject({
      method: "GET",
      url: "/api/admin/routes",
      headers: auth(viewerToken),
    });
    expect(read.statusCode).toBe(200);

    const write = await app.inject({
      method: "POST",
      url: "/api/admin/routes",
      headers: auth(viewerToken),
      payload: {
        route_id: uniqueRouteId("viewer-route"),
        name: "Viewer Route",
        short_name: "VR",
      },
    });
    expect(write.statusCode).toBe(403);
    expect(write.json().error.code).toBe("FORBIDDEN");
    expect(write.json().error.message).toContain("ROUTES_EDIT");

    const fareWrite = await app.inject({
      method: "POST",
      url: "/api/admin/fare-configs",
      headers: auth(viewerToken),
      payload: { ...FARE_CONFIG, label: `viewer-fare-${suffix()}` },
    });
    expect(fareWrite.statusCode).toBe(403);
    expect(fareWrite.json().error.message).toContain("FARES_EDIT");

    const fareRead = await app.inject({
      method: "GET",
      url: "/api/admin/fare-configs",
      headers: auth(viewerToken),
    });
    expect(fareRead.statusCode).toBe(200);

    const mapbox = await app.inject({
      method: "GET",
      url: "/api/admin/mapbox/geocode?q=Iloilo",
      headers: auth(viewerToken),
    });
    expect(mapbox.statusCode).toBe(403);
    expect(mapbox.json().error.message).toContain("MAPBOX_GEOSERVICES");

    for (const url of [
      "/api/admin/roles",
      "/api/admin/accounts",
      "/api/admin/export/dataset",
    ]) {
      const response = await app.inject({
        method: "GET",
        url,
        headers: auth(viewerToken),
      });
      expect(response.statusCode).toBe(403);
    }

    const me = await app.inject({
      method: "GET",
      url: "/api/admin/me",
      headers: auth(viewerToken),
    });
    expect(me.statusCode).toBe(200);
    expect(me.json().data.permissions).toEqual([]);
    expect(me.json().data.role.name).toBe("Viewer");
  });

  it("lets a Plotter plot and edit fares but not manage the access model or export", async () => {
    const plotter = await createTestAdmin("plotter", "plotter");
    const token = await signInAs(plotter.email, plotter.password);

    const route = await app.inject({
      method: "POST",
      url: "/api/admin/routes",
      headers: auth(token),
      payload: {
        route_id: uniqueRouteId("plotter-route"),
        name: "Plotter Route",
        short_name: "PR",
      },
    });
    expect(route.statusCode).toBe(201);

    const fare = await app.inject({
      method: "POST",
      url: "/api/admin/fare-configs",
      headers: auth(token),
      payload: { ...FARE_CONFIG, label: `fare-${suffix()}` },
    });
    expect(fare.statusCode).toBe(201);

    for (const url of [
      "/api/admin/roles",
      "/api/admin/accounts",
      "/api/admin/export/dataset",
    ]) {
      const response = await app.inject({
        method: "GET",
        url,
        headers: auth(token),
      });
      expect(response.statusCode).toBe(403);
    }
  });

  it("creates a Role and invites an Account holding it", async () => {
    const name = `Manager ${suffix()}`;
    const created = await app.inject({
      method: "POST",
      url: "/api/admin/roles",
      headers: auth(ownerToken),
      payload: {
        name,
        position: 60,
        permissions: ["ADMIN_MANAGE", "ROUTES_EDIT"],
      },
    });
    expect(created.statusCode).toBe(201);
    managerRoleId = created.json().data.roleId;
    expect(created.json().data.permissions).toEqual([
      "ROUTES_EDIT",
      "ADMIN_MANAGE",
    ]);

    const email = `manager-${suffix()}@komyuter.test`;
    const invited = await app.inject({
      method: "POST",
      url: "/api/admin/accounts",
      headers: auth(ownerToken),
      payload: {
        email,
        temporaryPassword: "manager-password-1",
        roleId: managerRoleId,
      },
    });
    expect(invited.statusCode).toBe(201);
    managerId = invited.json().data.userId;
    managerToken = await signInAs(email, "manager-password-1");

    const me = await app.inject({
      method: "GET",
      url: "/api/admin/me",
      headers: auth(managerToken),
    });
    expect(me.statusCode).toBe(200);
    expect(me.json().data.isSuperAdmin).toBe(false);
    expect(me.json().data.role.name).toBe(name);
    expect(me.json().data.permissions).toEqual(["ROUTES_EDIT", "ADMIN_MANAGE"]);

    const accounts = await app.inject({
      method: "GET",
      url: "/api/admin/accounts",
      headers: auth(ownerToken),
    });
    expect(accounts.statusCode).toBe(200);
    const listed = accounts
      .json()
      .data.find((account: { userId: string }) => account.userId === managerId);
    expect(listed).toBeTruthy();
    expect(listed.email).toBe(email);
    expect(listed.role.name).toBe(name);
  });

  it("answers 409 for duplicate Role names and positions", async () => {
    const name = `Duplicate ${suffix()}`;
    const first = await app.inject({
      method: "POST",
      url: "/api/admin/roles",
      headers: auth(ownerToken),
      payload: { name, position: 80, permissions: [] },
    });
    expect(first.statusCode).toBe(201);

    const sameName = await app.inject({
      method: "POST",
      url: "/api/admin/roles",
      headers: auth(ownerToken),
      payload: { name, position: 81, permissions: [] },
    });
    expect(sameName.statusCode).toBe(409);

    const samePosition = await app.inject({
      method: "POST",
      url: "/api/admin/roles",
      headers: auth(ownerToken),
      payload: {
        name: `Other ${suffix()}`,
        position: 80,
        permissions: [],
      },
    });
    expect(samePosition.statusCode).toBe(409);
  });

  it("answers 409 for a duplicate Account and 404 for unknown ids", async () => {
    const email = `duplicate-${suffix()}@komyuter.test`;
    const payload = {
      email,
      temporaryPassword: "duplicate-password-1",
      roleId: "viewer",
    };
    const first = await app.inject({
      method: "POST",
      url: "/api/admin/accounts",
      headers: auth(ownerToken),
      payload,
    });
    expect(first.statusCode).toBe(201);
    const accountId = first.json().data.userId;

    const second = await app.inject({
      method: "POST",
      url: "/api/admin/accounts",
      headers: auth(ownerToken),
      payload,
    });
    expect(second.statusCode).toBe(409);

    const unknownRole = await app.inject({
      method: "PUT",
      url: `/api/admin/accounts/${accountId}/role`,
      headers: auth(ownerToken),
      payload: { roleId: "does-not-exist" },
    });
    expect(unknownRole.statusCode).toBe(404);

    const unknownAccount = await app.inject({
      method: "PUT",
      url: `/api/admin/accounts/${randomUUID()}/role`,
      headers: auth(ownerToken),
      payload: { roleId: "viewer" },
    });
    expect(unknownAccount.statusCode).toBe(404);
  });

  it("enforces grant-subset and position for a non-owner manager", async () => {
    const allowed = await app.inject({
      method: "POST",
      url: "/api/admin/roles",
      headers: auth(managerToken),
      payload: {
        name: `Helper ${suffix()}`,
        position: 40,
        permissions: ["ROUTES_EDIT"],
      },
    });
    expect(allowed.statusCode).toBe(201);

    const overGrant = await app.inject({
      method: "POST",
      url: "/api/admin/roles",
      headers: auth(managerToken),
      payload: {
        name: `Overreach ${suffix()}`,
        position: 30,
        permissions: ["FARES_EDIT"],
      },
    });
    expect(overGrant.statusCode).toBe(403);

    const above = await app.inject({
      method: "POST",
      url: "/api/admin/roles",
      headers: auth(managerToken),
      payload: {
        name: `Above ${suffix()}`,
        position: 70,
        permissions: ["ROUTES_EDIT"],
      },
    });
    expect(above.statusCode).toBe(403);

    for (const url of [
      "/api/admin/roles/administrator",
      `/api/admin/roles/${managerRoleId}`,
    ]) {
      const response = await app.inject({
        method: "PUT",
        url,
        headers: auth(managerToken),
        payload: {
          name: `Edited ${suffix()}`,
          position: 20,
          permissions: ["ROUTES_EDIT"],
        },
      });
      expect(response.statusCode).toBe(403);
    }

    const deleted = await app.inject({
      method: "DELETE",
      url: "/api/admin/roles/administrator",
      headers: auth(managerToken),
    });
    expect(deleted.statusCode).toBe(403);
  });

  it("restricts assignment on both sides of the move", async () => {
    const inviteToTop = await app.inject({
      method: "POST",
      url: "/api/admin/accounts",
      headers: auth(managerToken),
      payload: {
        email: `overreach-${suffix()}@komyuter.test`,
        temporaryPassword: "overreach-password-1",
        roleId: "administrator",
      },
    });
    expect(inviteToTop.statusCode).toBe(403);

    const toTop = await app.inject({
      method: "PUT",
      url: `/api/admin/accounts/${viewerId}/role`,
      headers: auth(managerToken),
      payload: { roleId: "administrator" },
    });
    expect(toTop.statusCode).toBe(403);

    const own = await app.inject({
      method: "PUT",
      url: `/api/admin/accounts/${managerId}/role`,
      headers: auth(managerToken),
      payload: { roleId: "viewer" },
    });
    expect(own.statusCode).toBe(403);

    const overGrant = await app.inject({
      method: "PUT",
      url: `/api/admin/accounts/${viewerId}/role`,
      headers: auth(managerToken),
      payload: { roleId: "plotter" },
    });
    expect(overGrant.statusCode).toBe(403);

    const allowed = await app.inject({
      method: "PUT",
      url: `/api/admin/accounts/${viewerId}/role`,
      headers: auth(managerToken),
      payload: { roleId: "viewer" },
    });
    expect(allowed.statusCode).toBe(200);
    expect(allowed.json().data.role.name).toBe("Viewer");
  });

  it("refuses assigning an Account whose current Role is outside the actor's set", async () => {
    const exporter = await app.inject({
      method: "POST",
      url: "/api/admin/roles",
      headers: auth(ownerToken),
      payload: {
        name: `Exporter ${suffix()}`,
        position: 45,
        permissions: ["EXPORT_DATASET"],
      },
    });
    expect(exporter.statusCode).toBe(201);
    const exporterRoleId = exporter.json().data.roleId;

    const email = `exporter-${suffix()}@komyuter.test`;
    const invited = await app.inject({
      method: "POST",
      url: "/api/admin/accounts",
      headers: auth(ownerToken),
      payload: {
        email,
        temporaryPassword: "exporter-password-1",
        roleId: exporterRoleId,
      },
    });
    expect(invited.statusCode).toBe(201);

    const response = await app.inject({
      method: "PUT",
      url: `/api/admin/accounts/${invited.json().data.userId}/role`,
      headers: auth(managerToken),
      payload: { roleId: "viewer" },
    });
    expect(response.statusCode).toBe(403);
  });

  it("refuses to delete a Role that Accounts hold", async () => {
    const response = await app.inject({
      method: "DELETE",
      url: "/api/admin/roles/viewer",
      headers: auth(ownerToken),
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().error.message).toContain("held by");
  });

  it("keeps the Super Admin immutable at the database level", async () => {
    const pool = createTestPool();
    try {
      await expect(
        pool.query(
          "update admin_users set is_super_admin = false where user_id = $1",
          [ownerId],
        ),
      ).rejects.toThrow(/cannot be demoted/);

      await expect(
        pool.query(
          "update admin_users set role_id = 'viewer' where user_id = $1",
          [ownerId],
        ),
      ).rejects.toThrow(/cannot be changed/);

      await expect(
        pool.query("delete from admin_users where user_id = $1", [ownerId]),
      ).rejects.toThrow(/cannot be deleted/);

      await expect(
        pool.query(
          "update admin_users set is_super_admin = true where user_id = $1",
          [viewerId],
        ),
      ).rejects.toThrow(/duplicate key|unique/i);
    } finally {
      await pool.end();
    }
  });

  it("refuses an API change to the owner's own Role", async () => {
    const response = await app.inject({
      method: "PUT",
      url: `/api/admin/accounts/${ownerId}/role`,
      headers: auth(ownerToken),
      payload: { roleId: "viewer" },
    });
    expect(response.statusCode).toBe(403);
  });
});
