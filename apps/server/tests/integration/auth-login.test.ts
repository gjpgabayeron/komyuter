import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import {
  buildTestApp,
  createNonAdminToken,
  createTestSupabase,
  signInAdmin,
  testEnv,
} from "./helpers";

describe("auth login + me (backend auth for the admin shell)", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = buildTestApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("logs in a valid admin and returns an access token + identity", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: {
        email: testEnv().ADMIN_EMAIL,
        password: testEnv().ADMIN_PASSWORD,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.success).toBe(true);
    expect(typeof body.data.access_token).toBe("string");
    expect(body.data.access_token.length).toBeGreaterThan(0);
    expect(body.data.user.email).toBe(testEnv().ADMIN_EMAIL);
    expect(typeof body.data.user.id).toBe("string");
  });

  it("rejects wrong credentials with 401", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: {
        email: testEnv().ADMIN_EMAIL,
        password: "definitely-not-the-password",
      },
    });

    expect(response.statusCode).toBe(401);
    const body = response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("rejects a signed-in but non-admin user with 403", async () => {
    const email = `nonadmin-login-${randomUUID()}@komyuter.test`;
    const password = "non-admin-test-password";
    const { error } = await createTestSupabase().auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    expect(error).toBeNull();

    const response = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email, password },
    });

    expect(response.statusCode).toBe(403);
    const body = response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("FORBIDDEN");
  });

  it("rejects a malformed login body with 422", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "not-an-email" },
    });

    expect(response.statusCode).toBe(422);
    const body = response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("returns the admin identity from /me with a valid token", async () => {
    const token = await signInAdmin();

    const response = await app.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.success).toBe(true);
    expect(body.data.email).toBe(testEnv().ADMIN_EMAIL);
    expect(typeof body.data.id).toBe("string");
  });

  it("rejects /me without a token", async () => {
    const response = await app.inject({ method: "GET", url: "/api/auth/me" });

    expect(response.statusCode).toBe(401);
    const body = response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("UNAUTHORIZED");
  });

  it("rejects /me for a non-admin user with 403", async () => {
    const token = await createNonAdminToken();

    const response = await app.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: { authorization: `Bearer ${token}` },
    });

    expect(response.statusCode).toBe(403);
    const body = response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("FORBIDDEN");
  });
});
