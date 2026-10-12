import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildTestApp, envWith } from "./helpers";

const ALLOWED = "https://admin.komyuter.ph";
const FOREIGN = "https://evil.example";

/**
 * The origin allowlist is one parse feeding two mechanisms, and this is where that
 * agreement is observable: CORS must offer headers only to an allow-listed origin,
 * and the guard must refuse a foreign one outright. `/api/status` is the probe
 * because it is public — the guard runs on every request, so no token is needed to
 * exercise it.
 */
describe("origin allowlist — guard and CORS agree (M2)", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = buildTestApp(envWith({ ADMIN_ORIGINS: ALLOWED }));
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("offers CORS headers to an allow-listed origin", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/status",
      headers: { origin: ALLOWED },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["access-control-allow-origin"]).toBe(ALLOWED);
  });

  it("refuses a foreign origin instead of reflecting it", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/status",
      headers: { origin: FOREIGN },
    });

    expect(response.statusCode).toBe(403);
    // The regression this pins: `origin: true` would have reflected the foreign
    // origin back as an explicit allow alongside the 403.
    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("still serves requests with no Origin header at all", async () => {
    // curl, native clients and the tests themselves send none; the guard's contract
    // is that absence is not suspicion.
    const response = await app.inject({ method: "GET", url: "/api/status" });
    expect(response.statusCode).toBe(200);
  });
});
