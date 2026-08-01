import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildTestApp, signInAdmin } from "./helpers";

describe("local latency (SC-007)", () => {
  let app: FastifyInstance;
  let token = "";

  beforeAll(async () => {
    app = buildTestApp();
    await app.ready();
    token = await signInAdmin();
  });

  afterAll(async () => {
    await app.close();
  });

  const auth = () => ({ authorization: `Bearer ${token}` });

  it("serves status reads 20x with at least 19 of 20 under 1 second", async () => {
    const durations: number[] = [];
    for (let i = 0; i < 20; i++) {
      const start = performance.now();
      const res = await app.inject({ method: "GET", url: "/api/status" });
      durations.push(performance.now() - start);
      expect(res.statusCode).toBe(200);
    }
    const underSecond = durations.filter((d) => d < 1000).length;
    expect(underSecond).toBeGreaterThanOrEqual(19);
  });

  it("serves export reads 20x with at least 19 of 20 under 1 second", async () => {
    const durations: number[] = [];
    for (let i = 0; i < 20; i++) {
      const start = performance.now();
      const res = await app.inject({
        method: "GET",
        url: "/api/admin/export/dataset",
        headers: auth(),
      });
      durations.push(performance.now() - start);
      expect(res.statusCode).toBe(200);
    }
    const underSecond = durations.filter((d) => d < 1000).length;
    expect(underSecond).toBeGreaterThanOrEqual(19);
  });
});
