import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildTestApp, envWith } from "./helpers";

/**
 * ADR-0018 §1 / ROADMAP M1 — one service, one origin. The API serves the built
 * admin SPA, and the history fallback must not swallow `/api/*`.
 *
 * A throwaway dist directory stands in for `apps/admin/dist` so the test never
 * depends on whether the SPA happens to be built in the working tree.
 */
const INDEX_MARKER = "komyuter-admin-index";
const ASSET_NAME = "index-4f3a1c.js";
const ASSET_BODY = 'console.log("asset");';

describe("SPA hosting and the /api-excluding history fallback (M1)", () => {
  let app: FastifyInstance;
  let distDir = "";

  beforeAll(async () => {
    distDir = mkdtempSync(join(tmpdir(), "komyuter-spa-"));
    writeFileSync(
      join(distDir, "index.html"),
      `<!doctype html><html><head><title>${INDEX_MARKER}</title></head><body></body></html>`,
    );
    mkdirSync(join(distDir, "assets"), { recursive: true });
    writeFileSync(join(distDir, "assets", ASSET_NAME), ASSET_BODY);

    app = buildTestApp(envWith({ ADMIN_DIST_DIR: distDir }));
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    if (distDir) {
      rmSync(distDir, { recursive: true, force: true });
    }
  });

  it("serves index.html at the root", async () => {
    const response = await app.inject({ method: "GET", url: "/" });
    expect(response.statusCode).toBe(200);
    expect(response.body).toContain(INDEX_MARKER);
  });

  it("serves the hashed build assets", async () => {
    const response = await app.inject({
      method: "GET",
      url: `/assets/${ASSET_NAME}`,
    });
    expect(response.statusCode).toBe(200);
    expect(response.body).toBe(ASSET_BODY);
  });

  it("rewrites a deep client-side route to index.html (refresh must not 404)", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/routes/route-1/directions/direction-1",
    });
    expect(response.statusCode).toBe(200);
    expect(response.body).toContain(INDEX_MARKER);
  });

  it("leaves /api/* alone — an unknown API path keeps the API's 404 envelope", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/api/definitely-not-a-route",
    });
    expect(response.statusCode).toBe(404);
    expect(response.body).not.toContain(INDEX_MARKER);
    expect(response.json()).toEqual({
      success: false,
      error: {
        code: "NOT_FOUND",
        message: "Route GET:/api/definitely-not-a-route not found",
      },
    });
  });

  it("does not rewrite non-navigation methods", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/routes/route-1",
    });
    expect(response.statusCode).toBe(404);
    expect(response.body).not.toContain(INDEX_MARKER);
    expect(response.json().success).toBe(false);
  });
});
