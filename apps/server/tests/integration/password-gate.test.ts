import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { promoteOwner } from "../../src/domain/owner-promotion";
import {
  buildTestApp,
  createTestPool,
  createTestSupabase,
  signInAdmin,
  signInAs,
  testEnv,
} from "./helpers";

const auth = (token: string) => ({ authorization: `Bearer ${token}` });

const emailFor = (prefix: string) => `${prefix}-${randomUUID()}@komyuter.test`;

/** Comfortably above the authentication surface's minimum (12). */
const REPLACEMENT_PASSWORD = "replacement-password-1";

/**
 * Forced Password Change and self-service password (M2b, ADR-0019 §4 and §11).
 *
 * The gate is asserted through the HTTP seam only: a status, an error code, a
 * field — never the guard's internals. The one structural claim that a test can
 * carry is that the bypass is declared per route: `GET /api/admin/me` and
 * `POST /api/auth/password` are admitted while `GET /api/admin/accounts` — the
 * same method and the same `/api/admin` prefix as `/me` — is not.
 */
describe("Forced Password Change gate (M2b)", () => {
  let app: FastifyInstance;
  let ownerToken = "";

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
  });

  afterAll(async () => {
    await app.close();
  });

  async function invite(
    roleId = "plotter",
  ): Promise<{ email: string; temporaryPassword: string; userId: string }> {
    const email = emailFor("forced");
    const invited = await app.inject({
      method: "POST",
      url: "/api/admin/accounts",
      headers: auth(ownerToken),
      payload: { email, roleId },
    });
    expect(invited.statusCode).toBe(201);
    const data = invited.json().data;
    return {
      email,
      temporaryPassword: data.temporaryPassword,
      userId: data.account.userId,
    };
  }

  /** The real sign-in path, so the token is the one the SPA would hold. */
  async function signIn(email: string, password: string): Promise<string> {
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email, password },
    });
    expect(response.statusCode).toBe(200);
    return response.json().data.access_token as string;
  }

  function changePassword(
    token: string,
    currentPassword: string,
    newPassword: string,
  ) {
    return app.inject({
      method: "POST",
      url: "/api/auth/password",
      headers: auth(token),
      payload: { currentPassword, newPassword },
    });
  }

  it("flags an invited Account, and sign-in still succeeds while it is flagged", async () => {
    const invited = await invite();

    // Sign-in is not the gate (ADR-0019 §4): a flagged Account signs in, and the
    // flag is what routes the SPA to the change screen.
    const token = await signIn(invited.email, invited.temporaryPassword);

    const me = await app.inject({
      method: "GET",
      url: "/api/admin/me",
      headers: auth(token),
    });
    expect(me.statusCode).toBe(200);
    expect(me.json().data.mustChangePassword).toBe(true);
    expect(me.json().data.email).toBe(invited.email);

    // The flag is per Account: the owner is an ordinary permanent password.
    const ownerMe = await app.inject({
      method: "GET",
      url: "/api/admin/me",
      headers: auth(ownerToken),
    });
    expect(ownerMe.statusCode).toBe(200);
    expect(ownerMe.json().data.mustChangePassword).toBe(false);
  });

  it("refuses every non-allowlisted admin route with 403 PASSWORD_CHANGE_REQUIRED", async () => {
    const invited = await invite();
    const token = await signIn(invited.email, invited.temporaryPassword);

    // An open transit read, a Permission-gated Accounts read (same method and
    // prefix as /me), and a mutation — all refused by the gate, before the
    // route's own Permission is even consulted.
    for (const url of ["/api/admin/routes", "/api/admin/accounts"]) {
      const refused = await app.inject({
        method: "GET",
        url,
        headers: auth(token),
      });
      expect(refused.statusCode).toBe(403);
      expect(refused.json().error.code).toBe("PASSWORD_CHANGE_REQUIRED");
    }

    const refusedWrite = await app.inject({
      method: "POST",
      url: "/api/admin/routes",
      headers: auth(token),
      payload: {
        route_id: "forced-gate",
        name: "Forced gate",
        short_name: "FG",
      },
    });
    expect(refusedWrite.statusCode).toBe(403);
    expect(refusedWrite.json().error.code).toBe("PASSWORD_CHANGE_REQUIRED");

    // The password-change action itself is admitted: it fails on the credentials
    // it was given, not on the flag.
    const admitted = await changePassword(
      token,
      "not-the-current-one",
      REPLACEMENT_PASSWORD,
    );
    expect(admitted.statusCode).toBe(422);
    expect(admitted.json().error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects a wrong current password and changes nothing", async () => {
    const invited = await invite();
    const token = await signIn(invited.email, invited.temporaryPassword);

    const wrong = await changePassword(
      token,
      "definitely-not-the-temporary-password",
      REPLACEMENT_PASSWORD,
    );
    expect(wrong.statusCode).toBe(422);
    expect(wrong.json().error.code).toBe("VALIDATION_ERROR");
    expect(wrong.json().error.message).toMatch(/current password/i);

    // Nothing changed: the flag is still set, the gate still holds, the old
    // credential still works and the rejected one does not.
    const me = await app.inject({
      method: "GET",
      url: "/api/admin/me",
      headers: auth(token),
    });
    expect(me.statusCode).toBe(200);
    expect(me.json().data.mustChangePassword).toBe(true);

    const stillGated = await app.inject({
      method: "GET",
      url: "/api/admin/routes",
      headers: auth(token),
    });
    expect(stillGated.statusCode).toBe(403);
    expect(stillGated.json().error.code).toBe("PASSWORD_CHANGE_REQUIRED");

    await expect(
      signInAs(invited.email, invited.temporaryPassword),
    ).resolves.toBeTruthy();
    await expect(
      signInAs(invited.email, REPLACEMENT_PASSWORD),
    ).rejects.toBeTruthy();
  });

  it("refuses a new password below the shared minimum length", async () => {
    const invited = await invite();

    // 11 characters, one under PASSWORD_MIN_LENGTH — the same rule an invite's
    // generated password satisfies.
    const tooShort = "short-pass1";
    expect(tooShort).toHaveLength(12 - 1);

    const response = await changePassword(
      await signIn(invited.email, invited.temporaryPassword),
      invited.temporaryPassword,
      tooShort,
    );
    expect(response.statusCode).toBe(422);
    expect(response.json().error.code).toBe("VALIDATION_ERROR");

    // The flag is untouched and the Temporary Password still works.
    await expect(
      signInAs(invited.email, invited.temporaryPassword),
    ).resolves.toBeTruthy();
  });

  it("changes the password, clears the flag, and answers with a usable session", async () => {
    const invited = await invite();
    const token = await signIn(invited.email, invited.temporaryPassword);

    const changed = await changePassword(
      token,
      invited.temporaryPassword,
      REPLACEMENT_PASSWORD,
    );
    expect(changed.statusCode).toBe(200);
    expect(changed.json().data.mustChangePassword).toBe(false);

    // Replacing the password ends the Account's sessions, so the action answers
    // with a fresh one — otherwise the SPA would be signed out mid-flow and
    // could not resume the page it was on.
    const freshToken = changed.json().data.access_token;
    expect(typeof freshToken).toBe("string");
    expect(freshToken.length).toBeGreaterThan(0);

    const me = await app.inject({
      method: "GET",
      url: "/api/admin/me",
      headers: auth(freshToken),
    });
    expect(me.statusCode).toBe(200);
    expect(me.json().data.mustChangePassword).toBe(false);

    // The gate is gone for this Account: an ordinary admin read is admitted.
    const routes = await app.inject({
      method: "GET",
      url: "/api/admin/routes",
      headers: auth(freshToken),
    });
    expect(routes.statusCode).toBe(200);

    // The pre-change session is refused (GoTrue ends sessions when the password
    // is replaced) and the Temporary Password no longer signs in.
    const stale = await app.inject({
      method: "GET",
      url: "/api/admin/me",
      headers: auth(token),
    });
    expect(stale.statusCode).toBe(401);
    await expect(
      signInAs(invited.email, invited.temporaryPassword),
    ).rejects.toBeTruthy();
    await expect(
      signInAs(invited.email, REPLACEMENT_PASSWORD),
    ).resolves.toBeTruthy();
  });

  it("serves a voluntary change once the flag is clear", async () => {
    const invited = await invite();
    const token = await signIn(invited.email, invited.temporaryPassword);
    const forced = await changePassword(
      token,
      invited.temporaryPassword,
      REPLACEMENT_PASSWORD,
    );
    expect(forced.statusCode).toBe(200);

    const voluntary = await changePassword(
      forced.json().data.access_token,
      REPLACEMENT_PASSWORD,
      "second-replacement-1",
    );
    expect(voluntary.statusCode).toBe(200);
    expect(voluntary.json().data.mustChangePassword).toBe(false);
    await expect(
      signInAs(invited.email, "second-replacement-1"),
    ).resolves.toBeTruthy();
  });

  it("refuses an unauthenticated password change", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/password",
      payload: {
        currentPassword: "whatever-the-value",
        newPassword: REPLACEMENT_PASSWORD,
      },
    });
    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe("UNAUTHORIZED");
  });
});
