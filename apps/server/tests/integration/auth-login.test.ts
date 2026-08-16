import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import {
  buildTestApp,
  createNonAdminToken,
  createTestAdmin,
  createTestSupabase,
  envWith,
  signInAdmin,
  testEnv,
} from "./helpers";

const UNIFIED_DENIAL = "Invalid email or password";
const DEV_CREDENTIAL = {
  email: "admin@komyuter.ph",
  password: "komyuter-admin-dev",
};

/** Asserts the response is the uniform 401 denial and took ~DENIAL_MIN_MS. */
function expectUnifiedDenial(
  response: { statusCode: number; json: () => unknown },
  startedAt: number,
) {
  expect(response.statusCode).toBe(401);
  const body = response.json() as {
    success: boolean;
    error: { code: string; message: string };
  };
  expect(body.success).toBe(false);
  expect(body.error.code).toBe("UNAUTHORIZED");
  expect(body.error.message).toBe(UNIFIED_DENIAL);
  expect(Date.now() - startedAt).toBeGreaterThanOrEqual(200);
}

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
    expect(body.data.user.name).toBe("Admin Komyuter");
    expect(typeof body.data.user.id).toBe("string");
  });

  it("rejects wrong credentials with the unified 401 denial", async () => {
    const startedAt = Date.now();
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: {
        email: testEnv().ADMIN_EMAIL,
        password: "definitely-not-the-password",
      },
    });

    expectUnifiedDenial(response, startedAt);
  });

  it("rejects a signed-in but non-admin user identically to wrong credentials", async () => {
    const email = `nonadmin-login-${randomUUID()}@komyuter.test`;
    const password = "non-admin-test-password";
    const { error } = await createTestSupabase().auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    expect(error).toBeNull();

    const startedAt = Date.now();
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email, password },
    });

    // FR-005: same code, same message, same ~250 ms delay as any other denial.
    expectUnifiedDenial(response, startedAt);
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
    expect(body.data.name).toBe("Admin Komyuter");
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

describe("login throttling + dev-credential gate (US3)", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = buildTestApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  async function wrongPassword(email: string, source: string) {
    const startedAt = Date.now();
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      remoteAddress: source,
      payload: { email, password: "wrong-password" },
    });
    expectUnifiedDenial(response, startedAt);
    return response;
  }

  async function login(email: string, password: string, source: string) {
    return app.inject({
      method: "POST",
      url: "/api/auth/login",
      remoteAddress: source,
      payload: { email, password },
    });
  }

  async function expectThrottledDenial(
    email: string,
    password: string,
    source: string,
  ) {
    const startedAt = Date.now();
    const response = await login(email, password, source);
    expectUnifiedDenial(response, startedAt);
  }

  it("blocks an account after 5 failures, refusing even the correct password", async () => {
    const { email, password } = await createTestAdmin("throttle-account");
    // Five failures from five distinct sources → only the ACCOUNT key builds up.
    for (let i = 0; i < 5; i += 1) {
      await wrongPassword(email, `198.51.100.${10 + i}`);
    }

    // Correct password from a sixth source → still refused: account blocked.
    await expectThrottledDenial(email, password, "198.51.100.99");
  });

  it("blocks a source after 5 failures, refusing a different account from it", async () => {
    const victim = await createTestAdmin("throttle-source-victim");
    const other = await createTestAdmin("throttle-source-other");
    const source = "203.0.113.55";
    for (let i = 0; i < 5; i += 1) {
      await wrongPassword(victim.email, source);
    }

    // A DIFFERENT, clean account from the blocked source → refused: source blocked.
    await expectThrottledDenial(other.email, other.password, source);
  });

  it("clears the account and source counters on a successful sign-in", async () => {
    const { email, password } = await createTestAdmin("throttle-clear");
    // 4 failures (under the block threshold) …
    for (let i = 0; i < 4; i += 1) {
      await wrongPassword(email, `198.51.100.${50 + i}`);
    }
    // … then a success resets the counters …
    const success = await login(email, password, "198.51.100.80");
    expect(success.statusCode).toBe(200);

    // … so a fresh run of 4 failures (under the threshold) does NOT block the
    // account — if the earlier success had not cleared it, these 4 would bring
    // the cumulative count to 8 and the final login would be refused.
    for (let i = 0; i < 4; i += 1) {
      await wrongPassword(email, `198.51.100.${60 + i}`);
    }
    const afterReset = await login(email, password, "198.51.100.90");
    expect(afterReset.statusCode).toBe(200);
  });

  it("refuses the documented dev credential when ALLOW_DEV_CREDENTIAL=false", async () => {
    const lockedApp = buildTestApp(envWith({ ALLOW_DEV_CREDENTIAL: "false" }));
    try {
      await lockedApp.ready();
      const startedAt = Date.now();
      const response = await lockedApp.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: DEV_CREDENTIAL,
      });
      expectUnifiedDenial(response, startedAt);
    } finally {
      await lockedApp.close();
    }
  });

  it("accepts the documented dev credential when ALLOW_DEV_CREDENTIAL=true", async () => {
    const openApp = buildTestApp(envWith({ ALLOW_DEV_CREDENTIAL: "true" }));
    try {
      await openApp.ready();
      const response = await openApp.inject({
        method: "POST",
        url: "/api/auth/login",
        payload: DEV_CREDENTIAL,
      });
      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.success).toBe(true);
      expect(body.data.user.email).toBe(DEV_CREDENTIAL.email);
    } finally {
      await openApp.close();
    }
  });
});

describe("Origin allowlist guard (US4)", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = buildTestApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("rejects a request with a foreign Origin with the 403 envelope", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: { origin: "https://evil.example" },
      payload: {
        email: testEnv().ADMIN_EMAIL,
        password: testEnv().ADMIN_PASSWORD,
      },
    });

    expect(response.statusCode).toBe(403);
    const body = response.json();
    expect(body.success).toBe(false);
    expect(body.error.code).toBe("FORBIDDEN");
  });

  it("passes a request with an allowed Origin", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: { origin: "http://localhost:5173" },
      payload: { email: "nobody@komyuter.test", password: "wrong" },
    });

    // Reached the route (unified 401 denial) → the guard let it through.
    expect(response.statusCode).toBe(401);
  });

  it("passes a request without an Origin header", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "nobody@komyuter.test", password: "wrong" },
    });

    expect(response.statusCode).toBe(401);
  });

  it("passes OPTIONS preflight requests (handled by the CORS plugin)", async () => {
    const response = await app.inject({
      method: "OPTIONS",
      url: "/api/auth/login",
      headers: {
        origin: "https://evil.example",
        "access-control-request-method": "POST",
      },
    });

    expect(response.statusCode).toBe(204);
  });
});

describe("POST /api/auth/logout (idempotent)", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = buildTestApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("returns 204 for a valid token and revokes it globally", async () => {
    const token = await signInAdmin();

    const response = await app.inject({
      method: "POST",
      url: "/api/auth/logout",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(response.statusCode).toBe(204);
    expect(response.body).toBe("");

    // The same token must no longer authenticate protected endpoints.
    const me = await app.inject({
      method: "GET",
      url: "/api/auth/me",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(me.statusCode).toBe(401);
  });

  it("returns 204 for an invalid token", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/logout",
      headers: { authorization: "Bearer not-a-real-token" },
    });
    expect(response.statusCode).toBe(204);
  });

  it("returns 204 without a token", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/logout",
    });
    expect(response.statusCode).toBe(204);
  });
});
