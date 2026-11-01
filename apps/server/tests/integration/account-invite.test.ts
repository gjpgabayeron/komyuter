import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { promoteOwner } from "../../src/domain/owner-promotion";
import {
  buildTestApp,
  createTestPool,
  createTestSupabase,
  signInAdmin,
  signInAndChangePassword,
  signInAs,
  testEnv,
  uniqueRouteId,
} from "./helpers";

const auth = (token: string) => ({ authorization: `Bearer ${token}` });

const emailFor = (prefix: string) => `${prefix}-${randomUUID()}@komyuter.test`;

describe("Account invitation and Role assignment (M2b)", () => {
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

  it("generates the Temporary Password server-side from an email and a Role", async () => {
    const email = emailFor("invite");

    const invited = await app.inject({
      method: "POST",
      url: "/api/admin/accounts",
      headers: auth(ownerToken),
      payload: { email, roleId: "plotter" },
    });

    expect(invited.statusCode).toBe(201);
    const data = invited.json().data;
    expect(data.account.email).toBe(email);
    expect(data.account.role.name).toBe("Plotter");
    expect(data.account.isActive).toBe(true);

    // The authentication surface's minimum password length, as a literal: the
    // generated Temporary Password must satisfy the same rule an Account's own
    // password does, so the invite can never hand out a weak credential.
    expect(typeof data.temporaryPassword).toBe("string");
    expect(data.temporaryPassword.length).toBeGreaterThanOrEqual(12);

    // The Temporary Password is not part of the Account summary…
    expect(data.account).not.toHaveProperty("temporaryPassword");

    // …it is a real credential…
    await expect(signInAs(email, data.temporaryPassword)).resolves.toBeTruthy();

    // …and it appears in no read.
    const listed = await app.inject({
      method: "GET",
      url: "/api/admin/accounts",
      headers: auth(ownerToken),
    });
    expect(listed.statusCode).toBe(200);
    expect(
      listed
        .json()
        .data.find(
          (row: { userId: string }) => row.userId === data.account.userId,
        ),
    ).toBeTruthy();
    expect(JSON.stringify(listed.json())).not.toContain(data.temporaryPassword);
  });

  it("never issues the same Temporary Password twice", async () => {
    const passwords: string[] = [];
    for (const roleId of ["viewer", "viewer"]) {
      const response = await app.inject({
        method: "POST",
        url: "/api/admin/accounts",
        headers: auth(ownerToken),
        payload: { email: emailFor("invite-unique"), roleId },
      });
      expect(response.statusCode).toBe(201);
      passwords.push(response.json().data.temporaryPassword);
    }
    expect(new Set(passwords).size).toBe(passwords.length);
  });

  it("ignores a client-supplied password: only the generated one signs in", async () => {
    const email = emailFor("invite-client-password");
    const response = await app.inject({
      method: "POST",
      url: "/api/admin/accounts",
      headers: auth(ownerToken),
      payload: {
        email,
        roleId: "viewer",
        temporaryPassword: "client-chosen-password-1",
      },
    });

    expect(response.statusCode).toBe(201);
    const generated = response.json().data.temporaryPassword;
    expect(generated).not.toBe("client-chosen-password-1");

    await expect(
      signInAs(email, "client-chosen-password-1"),
    ).rejects.toBeTruthy();
    await expect(signInAs(email, generated)).resolves.toBeTruthy();
  });

  it("answers 409 for an email that already has an Account", async () => {
    const email = emailFor("invite-duplicate");
    const payload = { email, roleId: "viewer" };

    const first = await app.inject({
      method: "POST",
      url: "/api/admin/accounts",
      headers: auth(ownerToken),
      payload,
    });
    expect(first.statusCode).toBe(201);

    const second = await app.inject({
      method: "POST",
      url: "/api/admin/accounts",
      headers: auth(ownerToken),
      payload,
    });
    expect(second.statusCode).toBe(409);
    expect(second.json().error.code).toBe("CONFLICT");
  });

  it("refuses a Role at or above the actor's position, or outside its Permissions", async () => {
    // A manager sits at position 60 with ADMIN_MANAGE + ROUTES_EDIT: it may
    // invite below 60 and within those Permissions, and nothing else.
    const managerRole = await app.inject({
      method: "POST",
      url: "/api/admin/roles",
      headers: auth(ownerToken),
      payload: {
        name: `Invite Manager ${randomUUID()}`,
        position: 61,
        permissions: ["ADMIN_MANAGE", "ROUTES_EDIT"],
      },
    });
    expect(managerRole.statusCode).toBe(201);

    const managerEmail = emailFor("invite-manager");
    const manager = await app.inject({
      method: "POST",
      url: "/api/admin/accounts",
      headers: auth(ownerToken),
      payload: { email: managerEmail, roleId: managerRole.json().data.roleId },
    });
    expect(manager.statusCode).toBe(201);
    const managerToken = await signInAndChangePassword(
      app,
      managerEmail,
      manager.json().data.temporaryPassword,
    );

    const atOwnPosition = await app.inject({
      method: "POST",
      url: "/api/admin/accounts",
      headers: auth(managerToken),
      payload: {
        email: emailFor("invite-at-position"),
        roleId: managerRole.json().data.roleId,
      },
    });
    expect(atOwnPosition.statusCode).toBe(403);
    expect(atOwnPosition.json().error.code).toBe("FORBIDDEN");

    const abovePosition = await app.inject({
      method: "POST",
      url: "/api/admin/accounts",
      headers: auth(managerToken),
      payload: {
        email: emailFor("invite-above-position"),
        roleId: "administrator",
      },
    });
    expect(abovePosition.statusCode).toBe(403);

    // Plotter is below 60 but carries FARES_EDIT and MAPBOX_GEOSERVICES, which
    // the manager does not hold — so it is outside the manager's Permission set.
    const outsidePermissions = await app.inject({
      method: "POST",
      url: "/api/admin/accounts",
      headers: auth(managerToken),
      payload: {
        email: emailFor("invite-outside-permissions"),
        roleId: "plotter",
      },
    });
    expect(outsidePermissions.statusCode).toBe(403);

    // A refused invite creates nothing: no identity, no Account row.
    const listed = await app.inject({
      method: "GET",
      url: "/api/admin/accounts",
      headers: auth(ownerToken),
    });
    expect(listed.statusCode).toBe(200);
    expect(
      listed
        .json()
        .data.some((row: { email: string }) =>
          ["invite-at-position", "invite-above-position"].some((prefix) =>
            row.email.includes(prefix),
          ),
        ),
    ).toBe(false);

    // The Role the manager may assign still works: Viewer is below 60 and
    // grants nothing the manager lacks.
    const allowed = await app.inject({
      method: "POST",
      url: "/api/admin/accounts",
      headers: auth(managerToken),
      payload: { email: emailFor("invite-allowed"), roleId: "viewer" },
    });
    expect(allowed.statusCode).toBe(201);
  });

  it("refuses an invite from an Account without ADMIN_MANAGE", async () => {
    const plotterEmail = emailFor("invite-plotter");
    const plotter = await app.inject({
      method: "POST",
      url: "/api/admin/accounts",
      headers: auth(ownerToken),
      payload: { email: plotterEmail, roleId: "plotter" },
    });
    expect(plotter.statusCode).toBe(201);
    const plotterToken = await signInAndChangePassword(
      app,
      plotterEmail,
      plotter.json().data.temporaryPassword,
    );

    const refused = await app.inject({
      method: "POST",
      url: "/api/admin/accounts",
      headers: auth(plotterToken),
      payload: { email: emailFor("invite-refused"), roleId: "viewer" },
    });
    expect(refused.statusCode).toBe(403);
    expect(refused.json().error.message).toContain("ADMIN_MANAGE");
  });

  /**
   * ADR-0019 §6: a Role change is not a Session Revocation. The Role and the
   * Effective Permission Set are re-read on every request, so both directions
   * land on the target's very next request with no new sign-in — one token
   * throughout, never reissued.
   */
  it("applies a Role change on the target's next request in both directions", async () => {
    const email = emailFor("role-live");
    const invited = await app.inject({
      method: "POST",
      url: "/api/admin/accounts",
      headers: auth(ownerToken),
      payload: { email, roleId: "viewer" },
    });
    expect(invited.statusCode).toBe(201);
    const userId = invited.json().data.account.userId;
    const token = await signInAndChangePassword(
      app,
      email,
      invited.json().data.temporaryPassword,
    );

    const plot = (name: string) =>
      app.inject({
        method: "POST",
        url: "/api/admin/routes",
        headers: auth(token),
        payload: {
          route_id: uniqueRouteId("live-role"),
          name,
          short_name: "LR",
        },
      });

    // A Viewer reads transit data but may not plot.
    const readBefore = await app.inject({
      method: "GET",
      url: "/api/admin/routes",
      headers: auth(token),
    });
    expect(readBefore.statusCode).toBe(200);
    expect((await plot("Before widdening")).statusCode).toBe(403);

    // Widen: Viewer → Plotter. The same token may now plot.
    const widened = await app.inject({
      method: "PUT",
      url: `/api/admin/accounts/${userId}/role`,
      headers: auth(ownerToken),
      payload: { roleId: "plotter" },
    });
    expect(widened.statusCode).toBe(200);
    expect(widened.json().data.role.name).toBe("Plotter");
    expect((await plot("After widening")).statusCode).toBe(201);

    const meWidened = await app.inject({
      method: "GET",
      url: "/api/admin/me",
      headers: auth(token),
    });
    expect(meWidened.statusCode).toBe(200);
    expect(meWidened.json().data.role.name).toBe("Plotter");
    expect(meWidened.json().data.permissions).toContain("ROUTES_EDIT");

    // Narrow: Plotter → Viewer. The same token is refused immediately.
    const narrowed = await app.inject({
      method: "PUT",
      url: `/api/admin/accounts/${userId}/role`,
      headers: auth(ownerToken),
      payload: { roleId: "viewer" },
    });
    expect(narrowed.statusCode).toBe(200);
    expect(narrowed.json().data.role.name).toBe("Viewer");

    const refused = await plot("After narrowing");
    expect(refused.statusCode).toBe(403);
    expect(refused.json().error.code).toBe("FORBIDDEN");
    expect(refused.json().error.message).toContain("ROUTES_EDIT");

    const meNarrowed = await app.inject({
      method: "GET",
      url: "/api/admin/me",
      headers: auth(token),
    });
    expect(meNarrowed.statusCode).toBe(200);
    expect(meNarrowed.json().data.role.name).toBe("Viewer");
    expect(meNarrowed.json().data.permissions).toEqual([]);
  });

  it("refuses an Account changing its own Role", async () => {
    const managerRole = await app.inject({
      method: "POST",
      url: "/api/admin/roles",
      headers: auth(ownerToken),
      payload: {
        name: `Self Manager ${randomUUID()}`,
        position: 62,
        permissions: ["ADMIN_MANAGE", "ROUTES_EDIT"],
      },
    });
    expect(managerRole.statusCode).toBe(201);

    const email = emailFor("role-self");
    const invited = await app.inject({
      method: "POST",
      url: "/api/admin/accounts",
      headers: auth(ownerToken),
      payload: { email, roleId: managerRole.json().data.roleId },
    });
    expect(invited.statusCode).toBe(201);
    const userId = invited.json().data.account.userId;
    const token = await signInAndChangePassword(
      app,
      email,
      invited.json().data.temporaryPassword,
    );

    const selfChange = await app.inject({
      method: "PUT",
      url: `/api/admin/accounts/${userId}/role`,
      headers: auth(token),
      payload: { roleId: "viewer" },
    });
    expect(selfChange.statusCode).toBe(403);
    expect(selfChange.json().error.message).toContain("own Role");

    // The Role it holds is untouched by the refusal.
    const me = await app.inject({
      method: "GET",
      url: "/api/admin/me",
      headers: auth(token),
    });
    expect(me.statusCode).toBe(200);
    expect(me.json().data.role.name).toBe(managerRole.json().data.name);

    // The owner is refused its own Role change as well — ownership is single,
    // and the `protect_super_admin` trigger backstops it.
    const ownerSelfChange = await app.inject({
      method: "PUT",
      url: `/api/admin/accounts/${ownerId}/role`,
      headers: auth(ownerToken),
      payload: { roleId: "viewer" },
    });
    expect(ownerSelfChange.statusCode).toBe(403);
  });
});
