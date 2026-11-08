import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { promoteOwner } from "../../src/domain/owner-promotion";
import {
  REPLACEMENT_PASSWORD,
  buildTestApp,
  createTestAdmin,
  createTestPool,
  createTestSupabase,
  signInAdmin,
  signInAndChangePassword,
  signInAs,
  testEnv,
} from "./helpers";

const auth = (token: string) => ({ authorization: `Bearer ${token}` });

const emailFor = (prefix: string) => `${prefix}-${randomUUID()}@komyuter.test`;

/**
 * Force password reset (M2b, ticket #44; ADR-0019 §5, §13–14).
 *
 * Asserted through the HTTP seam only: a status code, an error code, a returned
 * field. The reach rule is the same `canManageRole` reach the Role surfaces use —
 * the target's *current* Role strictly below the actor's position and within its
 * Permission set — never a second rule. Because a Supabase password update ends
 * every session on this stack, the reset is also the live-session revocation, so
 * the target's pre-reset token is the proof, not an internal call.
 */
describe("Force password reset (M2b)", () => {
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

  /**
   * An Account the API invited, whose Forced Password Change is complete, so it
   * holds a live session and a known (non-temporary) password.
   */
  async function inviteActive(
    roleId = "viewer",
  ): Promise<{ email: string; userId: string; token: string }> {
    const email = emailFor("reset-target");
    const invited = await app.inject({
      method: "POST",
      url: "/api/admin/accounts",
      headers: auth(ownerToken),
      payload: { email, roleId },
    });
    expect(invited.statusCode).toBe(201);
    const data = invited.json().data;
    const token = await signInAndChangePassword(
      app,
      email,
      data.temporaryPassword,
    );
    return { email, userId: data.account.userId, token };
  }

  function reset(token: string, userId: string) {
    return app.inject({
      method: "POST",
      url: `/api/admin/accounts/${userId}/password-reset`,
      headers: auth(token),
    });
  }

  it("resets within reach, revokes the live session and forces the change", async () => {
    const target = await inviteActive("viewer");

    // Before the reset: the live token works and the Account's own password
    // signs in — the baseline the reset has to overturn.
    const before = await app.inject({
      method: "GET",
      url: "/api/admin/routes",
      headers: auth(target.token),
    });
    expect(before.statusCode).toBe(200);
    await expect(
      signInAs(target.email, REPLACEMENT_PASSWORD),
    ).resolves.toBeTruthy();

    const response = await reset(ownerToken, target.userId);
    expect(response.statusCode).toBe(200);
    const data = response.json().data;

    // The Temporary Password is server-generated, meets the same minimum an
    // invite does, and is not a field of the Account summary.
    expect(data.account.userId).toBe(target.userId);
    expect(typeof data.temporaryPassword).toBe("string");
    expect(data.temporaryPassword.length).toBeGreaterThanOrEqual(12);
    expect(data.temporaryPassword).not.toBe(REPLACEMENT_PASSWORD);
    expect(data.account).not.toHaveProperty("temporaryPassword");

    // The target's pre-reset session is refused on its very next request: a
    // Supabase password update ends every session on this stack (ADR-0019 §5).
    const stale = await app.inject({
      method: "GET",
      url: "/api/admin/routes",
      headers: auth(target.token),
    });
    expect(stale.statusCode).toBe(401);

    // The old password stops working.
    await expect(
      signInAs(target.email, REPLACEMENT_PASSWORD),
    ).rejects.toBeTruthy();

    // The new Temporary Password signs in and lands on the forced change screen:
    // identity is admitted, every other route is gated.
    const temporaryToken = await signInAs(target.email, data.temporaryPassword);
    const me = await app.inject({
      method: "GET",
      url: "/api/admin/me",
      headers: auth(temporaryToken),
    });
    expect(me.statusCode).toBe(200);
    expect(me.json().data.mustChangePassword).toBe(true);

    const gated = await app.inject({
      method: "GET",
      url: "/api/admin/accounts",
      headers: auth(temporaryToken),
    });
    expect(gated.statusCode).toBe(403);
    expect(gated.json().error.code).toBe("PASSWORD_CHANGE_REQUIRED");

    // The Temporary Password appears in no read.
    const listed = await app.inject({
      method: "GET",
      url: "/api/admin/accounts",
      headers: auth(ownerToken),
    });
    expect(listed.statusCode).toBe(200);
    expect(JSON.stringify(listed.json())).not.toContain(data.temporaryPassword);
  });

  it("refuses a reset on the acting Account itself", async () => {
    const response = await reset(ownerToken, ownerId);
    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe("FORBIDDEN");
    expect(response.json().error.message).toMatch(/own password/i);

    // A refused self-reset changes nothing: the owner's credential still works.
    await expect(
      signInAs(testEnv().ADMIN_EMAIL, testEnv().ADMIN_PASSWORD),
    ).resolves.toBeTruthy();
  });

  it("refuses a reset on the Super Admin for every other caller", async () => {
    const manager = await createTestAdmin("reset-owner", "administrator");
    const managerToken = await signInAs(manager.email, manager.password);

    const response = await reset(managerToken, ownerId);
    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe("FORBIDDEN");
    expect(response.json().error.message).toContain("Super Admin");

    // The owner is unreachable: its credential is untouched.
    await expect(
      signInAs(testEnv().ADMIN_EMAIL, testEnv().ADMIN_PASSWORD),
    ).resolves.toBeTruthy();
  });

  it("refuses out-of-reach targets with the boundary message", async () => {
    // A manager at position 90 with ADMIN_MANAGE + ROUTES_EDIT: it may reset
    // below 90 and within those Permissions, and nothing else. (The position is
    // an unused one: `roles_position_unique` means a position another test file
    // already took would collide on this shared database.)
    const managerRole = await app.inject({
      method: "POST",
      url: "/api/admin/roles",
      headers: auth(ownerToken),
      payload: {
        name: `Reset Manager ${randomUUID()}`,
        position: 90,
        permissions: ["ADMIN_MANAGE", "ROUTES_EDIT"],
      },
    });
    expect(managerRole.statusCode).toBe(201);
    const managerRoleId = managerRole.json().data.roleId as string;

    const managerEmail = emailFor("reset-manager");
    const manager = await app.inject({
      method: "POST",
      url: "/api/admin/accounts",
      headers: auth(ownerToken),
      payload: { email: managerEmail, roleId: managerRoleId },
    });
    expect(manager.statusCode).toBe(201);
    const managerToken = await signInAndChangePassword(
      app,
      managerEmail,
      manager.json().data.temporaryPassword,
    );

    // At or above the actor's position: an Administrator (100) and an Account at
    // the manager's own position (90) are both out of reach — "strictly below".
    const above = await createTestAdmin("reset-above", "administrator");
    const aboveResponse = await reset(managerToken, above.userId);
    expect(aboveResponse.statusCode).toBe(403);
    expect(aboveResponse.json().error.code).toBe("FORBIDDEN");

    const peer = await app.inject({
      method: "POST",
      url: "/api/admin/accounts",
      headers: auth(ownerToken),
      payload: { email: emailFor("reset-peer"), roleId: managerRoleId },
    });
    expect(peer.statusCode).toBe(201);
    const atOwnPosition = await reset(
      managerToken,
      peer.json().data.account.userId,
    );
    expect(atOwnPosition.statusCode).toBe(403);

    // Below the actor's position but outside its Permission set: Plotter holds
    // FARES_EDIT and MAPBOX_GEOSERVICES, which the manager does not.
    const plotter = await createTestAdmin("reset-plotter", "plotter");
    const outsidePermissions = await reset(managerToken, plotter.userId);
    expect(outsidePermissions.statusCode).toBe(403);
    expect(outsidePermissions.json().error.message).toContain("Permissions");

    // Below and within reach: a Viewer is resettable.
    const viewer = await createTestAdmin("reset-viewer", "viewer");
    const allowed = await reset(managerToken, viewer.userId);
    expect(allowed.statusCode).toBe(200);
    expect(typeof allowed.json().data.temporaryPassword).toBe("string");
  });

  it("requires ADMIN_MANAGE and a known target", async () => {
    const viewer = await createTestAdmin("reset-nonmanager", "viewer");
    const viewerToken = await signInAs(viewer.email, viewer.password);

    const refused = await reset(viewerToken, ownerId);
    expect(refused.statusCode).toBe(403);
    expect(refused.json().error.message).toContain("ADMIN_MANAGE");

    const unknown = await reset(
      ownerToken,
      "00000000-0000-0000-0000-0000000000ff",
    );
    expect(unknown.statusCode).toBe(404);
    expect(unknown.json().error.code).toBe("NOT_FOUND");
  });
});
