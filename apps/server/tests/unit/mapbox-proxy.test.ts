import { afterEach, describe, expect, it, vi } from "vitest";
import Fastify from "fastify";
import type { CoordinatePair, GeoLineString } from "@komyuter/shared";
import {
  buildDirectionsUrl,
  chunkCoordinates,
  concatenateLineStrings,
  parseCoordinates,
  registerMapbox,
  straightLineFallback,
} from "../../src/api/mapbox";

async function bareApp() {
  const app = Fastify();
  await registerMapbox(app as never);
  await app.ready();
  return app;
}

describe("parseCoordinates", () => {
  it("parses lng,lat pairs joined by ;", () => {
    expect(parseCoordinates("122.5,10.6;122.51,10.61")).toEqual([
      [122.5, 10.6],
      [122.51, 10.61],
    ]);
  });

  it("rejects malformed input", () => {
    expect(() => parseCoordinates("122.5,10.6;nope")).toThrow();
  });

  it("rejects fewer than 2 coordinates", () => {
    expect(() => parseCoordinates("122.5,10.6")).toThrow();
  });
});

describe("chunkCoordinates", () => {
  const coords = Array.from(
    { length: 30 },
    (_, i) => [122.5 + i / 1000, 10.6] as CoordinatePair,
  );

  it("returns a single chunk within the limit", () => {
    expect(chunkCoordinates(coords.slice(0, 25), 25)).toHaveLength(1);
  });

  it("splits over the limit into 25 + remainder", () => {
    const chunks = chunkCoordinates(coords, 25);
    expect(chunks.map((c) => c.length)).toEqual([25, 5]);
  });
});

describe("straightLineFallback", () => {
  it("builds a LineString from the coordinates", () => {
    expect(
      straightLineFallback([
        [1, 2],
        [3, 4],
      ]),
    ).toEqual({
      type: "LineString",
      coordinates: [
        [1, 2],
        [3, 4],
      ],
    });
  });
});

describe("concatenateLineStrings", () => {
  it("merges chunks and removes the duplicated joint coordinate", () => {
    const a: GeoLineString = {
      type: "LineString",
      coordinates: [
        [0, 0],
        [1, 1],
        [2, 2],
      ],
    };
    const b: GeoLineString = {
      type: "LineString",
      coordinates: [
        [2, 2],
        [3, 3],
      ],
    };
    expect(concatenateLineStrings([a, b]).coordinates).toEqual([
      [0, 0],
      [1, 1],
      [2, 2],
      [3, 3],
    ]);
  });
});

describe("buildDirectionsUrl", () => {
  it("builds the Mapbox Directions URL with access_token", () => {
    const url = buildDirectionsUrl(
      [
        [122.5, 10.6],
        [122.51, 10.61],
      ],
      "secret-token",
    );
    expect(url).toContain("122.5,10.6;122.51,10.61");
    expect(url).toContain("access_token=secret-token");
    expect(url).toContain("geometries=geojson");
  });
});

describe("GET /api/admin/mapbox/directions (route)", () => {
  afterEach(() => {
    delete process.env.MAPBOX_SECRET_TOKEN;
    vi.unstubAllGlobals();
  });

  it("falls back to a straight line when no token is configured", async () => {
    delete process.env.MAPBOX_SECRET_TOKEN;
    const app = await bareApp();
    const res = await app.inject({
      method: "GET",
      url: "/mapbox/directions?coordinates=122.5,10.6;122.51,10.61",
    });
    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(data.snapped).toBe(false);
    expect(data.warning).toBe("no_token");
    expect(data.polyline.coordinates).toEqual([
      [122.5, 10.6],
      [122.51, 10.61],
    ]);
  });

  it("returns snapped geometry from the Mapbox API", async () => {
    process.env.MAPBOX_SECRET_TOKEN = "test-token";
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              routes: [
                {
                  geometry: {
                    type: "LineString",
                    coordinates: [
                      [122.5, 10.6],
                      [122.51, 10.61],
                    ],
                  },
                  distance: 1234.5,
                },
              ],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
      ),
    );
    const app = await bareApp();
    const res = await app.inject({
      method: "GET",
      url: "/mapbox/directions?coordinates=122.5,10.6;122.51,10.61",
    });
    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(data.snapped).toBe(true);
    expect(data.distance_meters).toBe(1234.5);
    expect(data.warning).toBeNull();
  });

  it("falls back when the upstream call fails", async () => {
    process.env.MAPBOX_SECRET_TOKEN = "test-token";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(new Error("down"))),
    );
    const app = await bareApp();
    const res = await app.inject({
      method: "GET",
      url: "/mapbox/directions?coordinates=122.5,10.6;122.51,10.61",
    });
    expect(res.statusCode).toBe(200);
    const data = res.json().data;
    expect(data.snapped).toBe(false);
    expect(data.warning).toBe("upstream_error");
  });

  it("rejects malformed coordinates with 422", async () => {
    process.env.MAPBOX_SECRET_TOKEN = "test-token";
    const app = await bareApp();
    const res = await app.inject({
      method: "GET",
      url: "/mapbox/directions?coordinates=not,valid",
    });
    expect(res.statusCode).toBe(422);
    const body = res.json();
    // Bare Fastify instance (no central error handler): code sits top-level;
    // the real /api/admin app nests it under error.code.
    expect(body.error?.code ?? body.code).toBe("VALIDATION_ERROR");
  });
});
