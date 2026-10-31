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
} from "./helpers";

const auth = (token: string) => ({ authorization: `Bearer ${token}` });

describe("Account status and deactivation (M2b)", () => {
  let app: FastifyInstance;
  let ownerToken = "";
  let ownerId = "";

  beforeAll(async () => {
    app = buildTestApp();
    await app.ready();

    const pool = createTestPool();
    try {
      await promoteOwner({
        pool,
        supabase: createTestSupabase(),
        email: testEnv().ADMIN_EMAIL,
      });
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

  it("reports isActive and lastSignInAt on the Account list", async () => {
    const account = await createTestAdmin("status-listed");
    await signInAs(account.email, account.password);

    const response = await app.inject({
      method: "GET",
      url: "/api/admin/accounts",
      headers: auth(ownerToken),
    });
    expect(response.statusCode).toBe(200);

    const listed = response
      .json()
      .data.find(
        (row: { userId: string }) => row.userId === account.userId,
      ) as { isActive: boolean; lastSignInAt: string | null };
    expect(listed).toBeTruthy();
    expect(listed.isActive).toBe(true);
    expect(typeof listed.lastSignInAt).toBe("string");
    expect(Number.isNaN(Date.parse(listed.lastSignInAt ?? ""))).toBe(false);
  });

  it("reports isActive on GET /api/admin/me for an active Account", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/admin/me",
      headers: auth(ownerToken),
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().data.isActive).toBe(true);
  });

  it("deactivates and reactivates an Account through the status endpoint", async () => {
    const account = await createTestAdmin("status-toggled");

    const deactivated = await app.inject({
      method: "PUT",
      url: `/api/admin/accounts/${account.userId}/status`,
      headers: auth(ownerToken),
      payload: { isActive: false },
    });
    expect(deactivated.statusCode).toBe(200);
    expect(deactivated.json().data.userId).toBe(account.userId);
    expect(deactivated.json().data.isActive).toBe(false);

    const listedAfter = await app.inject({
      method: "GET",
      url: "/api/admin/accounts",
      headers: auth(ownerToken),
    });
    const row = listedAfter
      .json()
      .data.find(
        (entry: { userId: string }) => entry.userId === account.userId,
      );
    expect(row.isActive).toBe(false);
    expect(row.role.name).toBe("Administrator");

    const reactivated = await app.inject({
      method: "PUT",
      url: `/api/admin/accounts/${account.userId}/status`,
      headers: auth(ownerToken),
      payload: { isActive: true },
    });
    expect(reactivated.statusCode).toBe(200);
    expect(reactivated.json().data.isActive).toBe(true);
  });

  it("refuses a Deactivated Account's next request with 403 ACCOUNT_DEACTIVATED", async () => {
    const account = await createTestAdmin("status-revoked");
    const token = await signInAs(account.email, account.password);

    const before = await app.inject({
      method: "GET",
      url: "/api/admin/routes",
      headers: auth(token),
    });
    expect(before.statusCode).toBe(200);

    const deactivated = await app.inject({
      method: "PUT",
      url: `/api/admin/accounts/${account.userId}/status`,
      headers: auth(ownerToken),
      payload: { isActive: false },
    });
    expect(deactivated.statusCode).toBe(200);

    for (const url of ["/api/admin/me", "/api/admin/routes"]) {
      const refused = await app.inject({
        method: "GET",
        url,
        headers: auth(token),
      });
      expect(refused.statusCode).toBe(403);
      expect(refused.json().error.code).toBe("ACCOUNT_DEACTIVATED");
    }
  });

  it("refuses a Deactivated Account's sign-in with the unified denial", async () => {
    const account = await createTestAdmin("status-signin");
    await app.inject({
      method: "PUT",
      url: `/api/admin/accounts/${account.userId}/status`,
      headers: auth(ownerToken),
      payload: { isActive: false },
    });

    const startedAt = Date.now();
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: account.email, password: account.password },
    });

    // FR-005: identical body and timing to a wrong password — nothing here
    // tells the caller the password was right but the Account is inactive.
    expect(response.statusCode).toBe(401);
    expect(response.json().success).toBe(false);
    expect(response.json().error.code).toBe("UNAUTHORIZED");
    expect(response.json().error.message).toBe("Invalid email or password");
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(200);
  });

  it("refuses self-deactivation", async () => {
    const response = await app.inject({
      method: "PUT",
      url: `/api/admin/accounts/${ownerId}/status`,
      headers: auth(ownerToken),
      payload: { isActive: false },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe("FORBIDDEN");

    const me = await app.inject({
      method: "GET",
      url: "/api/admin/me",
      headers: auth(ownerToken),
    });
    expect(me.statusCode).toBe(200);
    expect(me.json().data.isActive).toBe(true);
  });

  /**
   * The reach rule (ADR-0019 §5, §6): the status change is bounded by the same
   * `canManageRole` the Role surfaces and the force reset enforce — strictly
   * below the actor's Role Position and within its Permission set. An
   * Administrator is not the Super Admin, so this caller is refused by the
   * reach, not by the ownership property.
   */
  it("refuses a target at or above the actor's own Role position", async () => {
    const manager = await createTestAdmin("status-reach", "administrator");
    const managerToken = await signInAs(manager.email, manager.password);
    // Same Role as the actor: a peer, not a subordinate.
    const peer = await createTestAdmin("status-peer", "administrator");

    const response = await app.inject({
      method: "PUT",
      url: `/api/admin/accounts/${peer.userId}/status`,
      headers: auth(managerToken),
      payload: { isActive: false },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe("FORBIDDEN");
    expect(response.json().error.message).toContain("below your own position");

    const listed = await app.inject({
      method: "GET",
      url: "/api/admin/accounts",
      headers: auth(ownerToken),
    });
    const peerRow = listed
      .json()
      .data.find((row: { userId: string }) => row.userId === peer.userId);
    expect(peerRow.isActive).toBe(true);
  });

  /**
   * The self branch has its own refusal, and only a NON-owner ADMIN_MANAGE
   * holder can prove it: the owner's `canManageRole` answers true for
   * everything, so an owner self-deactivation that reaches the reach rule would
   * be admitted. This caller is refused by the self branch — the message names
   * it — and the owner test above keeps covering the ownership property.
   */
  it("refuses self-deactivation by a non-owner ADMIN_MANAGE holder", async () => {
    const manager = await createTestAdmin("status-self", "administrator");
    const managerToken = await signInAs(manager.email, manager.password);

    const response = await app.inject({
      method: "PUT",
      url: `/api/admin/accounts/${manager.userId}/status`,
      headers: auth(managerToken),
      payload: { isActive: false },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe("FORBIDDEN");
    expect(response.json().error.message).toContain("your own Account status");

    const me = await app.inject({
      method: "GET",
      url: "/api/admin/me",
      headers: auth(managerToken),
    });
    expect(me.statusCode).toBe(200);
    expect(me.json().data.isActive).toBe(true);
  });

  it("refuses deactivating the Super Admin for every other caller", async () => {
    const manager = await createTestAdmin("status-manager", "administrator");
    const managerToken = await signInAs(manager.email, manager.password);

    const response = await app.inject({
      method: "PUT",
      url: `/api/admin/accounts/${ownerId}/status`,
      headers: auth(managerToken),
      payload: { isActive: false },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe("FORBIDDEN");
    expect(response.json().error.message).toContain("Super Admin");

    const owner = await app.inject({
      method: "GET",
      url: "/api/admin/me",
      headers: auth(ownerToken),
    });
    expect(owner.statusCode).toBe(200);
    expect(owner.json().data.isActive).toBe(true);
  });

  it("requires ADMIN_MANAGE, a known Account and a boolean body", async () => {
    const viewer = await createTestAdmin("status-viewer", "viewer");
    const viewerToken = await signInAs(viewer.email, viewer.password);

    const refused = await app.inject({
      method: "PUT",
      url: `/api/admin/accounts/${viewer.userId}/status`,
      headers: auth(viewerToken),
      payload: { isActive: false },
    });
    expect(refused.statusCode).toBe(403);
    expect(refused.json().error.code).toBe("FORBIDDEN");
    expect(refused.json().error.message).toContain("ADMIN_MANAGE");

    const unknown = await app.inject({
      method: "PUT",
      url: "/api/admin/accounts/00000000-0000-0000-0000-0000000000ff/status",
      headers: auth(ownerToken),
      payload: { isActive: false },
    });
    expect(unknown.statusCode).toBe(404);
    expect(unknown.json().error.code).toBe("NOT_FOUND");

    const ownerDeactivate = await app.inject({
      method: "PUT",
      url: `/api/admin/accounts/${viewer.userId}/status`,
      headers: auth(ownerToken),
      payload: { isActive: "no" },
    });
    expect(ownerDeactivate.statusCode).toBe(422);
    expect(ownerDeactivate.json().error.code).toBe("VALIDATION_ERROR");
  });
});
