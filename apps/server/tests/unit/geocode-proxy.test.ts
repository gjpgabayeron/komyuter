import { afterEach, describe, expect, it, vi } from "vitest";
import Fastify from "fastify";
import {
  buildForwardUrl,
  clampGeocodeLimit,
  GEOCODE_DEFAULT_LIMIT,
  GEOCODE_MAX_LIMIT,
  ILOILO_PROXIMITY,
  normaliseSession,
  parseGeocodeLimit,
  registerMapbox,
  toGeocodeHits,
} from "../../src/api/mapbox";

async function bareApp() {
  const app = Fastify();
  await registerMapbox(app as never);
  await app.ready();
  return app;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function feature(
  overrides: {
    id?: string;
    name?: string;
    place?: string;
    coordinates?: unknown;
  } = {},
) {
  // `in` rather than `??`, so a deliberate `null` coordinate reaches the mapper
  // instead of being replaced by the default point.
  const coordinates =
    "coordinates" in overrides ? overrides.coordinates : [122.5511, 10.7144];
  return {
    type: "Feature",
    geometry: { type: "Point", coordinates },
    properties: {
      mapbox_id: overrides.id ?? "dXJuOm1ieHBvaTox",
      name: overrides.name ?? "SM City Iloilo",
      place_formatted: overrides.place ?? "Iloilo City, 5000, Philippines",
    },
  };
}

describe("buildForwardUrl", () => {
  it("targets the Search Box forward endpoint with the region bias", () => {
    const url = buildForwardUrl("SM City Iloilo", "secret-token", "session-1");
    expect(url).toContain(
      "https://api.mapbox.com/search/searchbox/v1/forward?",
    );
    expect(url).toContain("q=SM+City+Iloilo");
    expect(url).toContain("country=ph");
    expect(url).toContain("language=en");
    expect(url).toContain(`proximity=${ILOILO_PROXIMITY}`);
    expect(url).toContain(`limit=${GEOCODE_DEFAULT_LIMIT}`);
    expect(url).toContain("session_token=session-1");
    expect(url).toContain("auto_complete=true");
    expect(url).toContain("access_token=secret-token");
    // The endpoint that lost the POIs, the per-row retrieve and the hard bbox
    // filter must all stay gone (issue #16 follow-up).
    expect(url).not.toContain("/geocoding/v5/");
    expect(url).not.toContain("/retrieve/");
    expect(url).not.toContain("bbox=");
    expect(url).not.toContain("nominatim");
  });

  it("clamps the requested limit", () => {
    expect(buildForwardUrl("q", "t", "s", 99)).toContain(
      `limit=${GEOCODE_MAX_LIMIT}`,
    );
    expect(buildForwardUrl("q", "t", "s", 0)).toContain("limit=1");
  });
});

describe("normaliseSession", () => {
  it("keeps a plausible session id and falls back on junk", () => {
    expect(normaliseSession("3f9a1b2c-4d5e-6f70-8192-a3b4c5d6e7f8", "fb")).toBe(
      "3f9a1b2c-4d5e-6f70-8192-a3b4c5d6e7f8",
    );
    expect(normaliseSession("short", "fb")).toBe("fb");
    expect(normaliseSession("has spaces and $ymbols", "fb")).toBe("fb");
    expect(normaliseSession(undefined, "fb")).toBe("fb");
    expect(normaliseSession("x".repeat(80), "fb")).toBe("fb");
  });
});

describe("clampGeocodeLimit / parseGeocodeLimit", () => {
  it("clamps and truncates numbers", () => {
    expect(clampGeocodeLimit(4.9)).toBe(4);
    expect(clampGeocodeLimit(-3)).toBe(1);
    expect(clampGeocodeLimit(Number.NaN)).toBe(GEOCODE_DEFAULT_LIMIT);
  });

  it("parses the query parameter defensively", () => {
    expect(parseGeocodeLimit("4")).toBe(4);
    expect(parseGeocodeLimit("")).toBe(GEOCODE_DEFAULT_LIMIT);
    expect(parseGeocodeLimit(undefined)).toBe(GEOCODE_DEFAULT_LIMIT);
    expect(parseGeocodeLimit("nope")).toBe(GEOCODE_DEFAULT_LIMIT);
    expect(parseGeocodeLimit("50")).toBe(GEOCODE_MAX_LIMIT);
  });
});

describe("toGeocodeHits", () => {
  it("maps features into located hits with name and description", () => {
    expect(toGeocodeHits({ features: [feature()] })).toEqual([
      {
        id: "dXJuOm1ieHBvaTox",
        name: "SM City Iloilo",
        description: "Iloilo City, 5000, Philippines",
        location: [122.5511, 10.7144],
      },
    ]);
  });

  it("falls back to full_address and to the feature id", () => {
    const hits = toGeocodeHits({
      features: [
        {
          type: "Feature",
          id: "feature-1",
          geometry: { coordinates: [122.5562, 10.7248] },
          properties: {
            name: "Jaro Plaza",
            full_address: "Jaro Plaza, Iloilo City, Philippines",
          },
        },
      ],
    });
    expect(hits).toEqual([
      {
        id: "feature-1",
        name: "Jaro Plaza",
        description: "Jaro Plaza, Iloilo City, Philippines",
        location: [122.5562, 10.7248],
      },
    ]);
  });

  it("drops features without a usable point, id or name", () => {
    const hits = toGeocodeHits({
      features: [
        feature({ id: "keep" }),
        feature({ id: "no-point", coordinates: null }),
        feature({ id: "bad-lng", coordinates: ["x", 10.7] }),
        feature({ id: "short", coordinates: [122.5] }),
        feature({ id: "", name: "No id" }),
        feature({ id: "no-name", name: "   " }),
        "not an object",
        null,
      ],
    });
    expect(hits.map((hit) => hit.id)).toEqual(["keep"]);
  });

  it("returns [] for bodies that are not feature collections", () => {
    expect(toGeocodeHits({ message: "Not Found" })).toEqual([]);
    expect(toGeocodeHits({ features: "nope" })).toEqual([]);
    expect(toGeocodeHits(null)).toEqual([]);
  });
});

describe("GET /api/admin/mapbox/geocode (forward route)", () => {
  afterEach(() => {
    delete process.env.MAPBOX_SECRET_TOKEN;
    vi.unstubAllGlobals();
  });

  it("answers no_token when MAPBOX_SECRET_TOKEN is absent", async () => {
    // `config/env.ts` loads apps/server/.env at import time, so an absent token
    // has to be simulated explicitly.
    delete process.env.MAPBOX_SECRET_TOKEN;
    const app = await bareApp();
    const res = await app.inject({
      method: "GET",
      url: "/mapbox/geocode?q=Iloilo",
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual({ results: [], warning: "no_token" });
  });

  it("returns located results and no warning on success", async () => {
    process.env.MAPBOX_SECRET_TOKEN = "test-token";
    const fetchMock = vi.fn(async () =>
      jsonResponse({ type: "FeatureCollection", features: [feature()] }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const app = await bareApp();
    const res = await app.inject({
      method: "GET",
      url: "/mapbox/geocode?q=SM%20City%20Iloilo&session=session-1",
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual({
      results: [
        {
          id: "dXJuOm1ieHBvaTox",
          name: "SM City Iloilo",
          description: "Iloilo City, 5000, Philippines",
          location: [122.5511, 10.7144],
        },
      ],
      warning: null,
    });
    const requested = String((fetchMock.mock.calls[0] as unknown[])[0]);
    expect(requested).toContain("/search/searchbox/v1/forward?");
    expect(requested).toContain(`proximity=${ILOILO_PROXIMITY}`);
    expect(requested).toContain("session_token=session-1");
  });

  it("forwards a client-supplied limit", async () => {
    process.env.MAPBOX_SECRET_TOKEN = "test-token";
    const fetchMock = vi.fn(async () =>
      jsonResponse({ features: [feature()] }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const app = await bareApp();
    await app.inject({
      method: "GET",
      url: "/mapbox/geocode?q=Iloilo&limit=3",
    });
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toContain(
      "limit=3",
    );
  });

  it("answers upstream_error when Mapbox returns a bad status", async () => {
    process.env.MAPBOX_SECRET_TOKEN = "test-token";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 500 })),
    );
    const app = await bareApp();
    const res = await app.inject({
      method: "GET",
      url: "/mapbox/geocode?q=Iloilo",
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual({ results: [], warning: "upstream_error" });
  });

  it("answers upstream_error when the fetch itself rejects", async () => {
    process.env.MAPBOX_SECRET_TOKEN = "test-token";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(new Error("down"))),
    );
    const app = await bareApp();
    const res = await app.inject({
      method: "GET",
      url: "/mapbox/geocode?q=Iloilo",
    });
    expect(res.json().data.warning).toBe("upstream_error");
  });

  it("rejects a missing or too-short query with 422", async () => {
    process.env.MAPBOX_SECRET_TOKEN = "test-token";
    const app = await bareApp();
    for (const url of [
      "/mapbox/geocode",
      "/mapbox/geocode?q=",
      "/mapbox/geocode?q=il",
    ]) {
      const res = await app.inject({ method: "GET", url });
      expect(res.statusCode).toBe(422);
      const body = res.json();
      expect(body.error?.code ?? body.code).toBe("VALIDATION_ERROR");
    }
  });

  it("no longer serves the per-row resolve route", async () => {
    process.env.MAPBOX_SECRET_TOKEN = "test-token";
    const app = await bareApp();
    const res = await app.inject({
      method: "GET",
      url: "/mapbox/geocode/resolve?id=abc",
    });
    expect(res.statusCode).toBe(404);
  });
});
