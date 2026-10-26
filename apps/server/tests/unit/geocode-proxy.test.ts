import { afterEach, describe, expect, it, vi } from "vitest";
import Fastify from "fastify";
import {
  buildRetrieveUrl,
  buildSuggestUrl,
  clampGeocodeLimit,
  GEOCODE_DEFAULT_LIMIT,
  GEOCODE_MAX_LIMIT,
  ILOILO_PROXIMITY,
  normaliseSession,
  parseGeocodeLimit,
  registerMapbox,
  toGeocodeResult,
  toSuggestions,
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

describe("buildSuggestUrl", () => {
  it("targets the Search Box suggest endpoint with the region bias", () => {
    const url = buildSuggestUrl("SM City Iloilo", "secret-token", "session-1");
    expect(url).toContain(
      "https://api.mapbox.com/search/searchbox/v1/suggest?",
    );
    expect(url).toContain("q=SM+City+Iloilo");
    expect(url).toContain("country=ph");
    expect(url).toContain(`proximity=${ILOILO_PROXIMITY}`);
    expect(url).toContain(`limit=${GEOCODE_DEFAULT_LIMIT}`);
    expect(url).toContain("session_token=session-1");
    expect(url).toContain("access_token=secret-token");
    // The classic geocoding endpoint is what lost the POIs; it must not return.
    expect(url).not.toContain("/geocoding/v5/");
    expect(url).not.toContain("bbox=");
    expect(url).not.toContain("nominatim");
  });

  it("clamps the requested limit", () => {
    expect(buildSuggestUrl("q", "t", "s", 99)).toContain(
      `limit=${GEOCODE_MAX_LIMIT}`,
    );
    expect(buildSuggestUrl("q", "t", "s", 0)).toContain("limit=1");
  });
});

describe("buildRetrieveUrl", () => {
  it("escapes the suggestion id and carries the same billing session", () => {
    const url = buildRetrieveUrl("dXJuOm1ieHBvaTox/a+b", "t", "session-1");
    expect(url).toContain("/search/searchbox/v1/retrieve/");
    expect(url).toContain("dXJuOm1ieHBvaTox%2Fa%2Bb");
    expect(url).toContain("session_token=session-1");
    expect(url).toContain("access_token=t");
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

describe("toSuggestions", () => {
  it("maps Search Box suggestions onto id/name/description", () => {
    const results = toSuggestions({
      suggestions: [
        {
          mapbox_id: "dXJuOm1ieHBvaTox",
          name: "SM City Iloilo",
          place_formatted: "Iloilo City, 5000, Philippines",
        },
        {
          mapbox_id: "dXJuOm1ieHBvaToy",
          name: "Jaro Plaza",
          full_address: "Jaro Plaza, Iloilo City, Philippines",
        },
      ],
    });
    expect(results).toEqual([
      {
        id: "dXJuOm1ieHBvaTox",
        name: "SM City Iloilo",
        description: "Iloilo City, 5000, Philippines",
      },
      {
        id: "dXJuOm1ieHBvaToy",
        name: "Jaro Plaza",
        description: "Jaro Plaza, Iloilo City, Philippines",
      },
    ]);
  });

  it("drops rows without an id or a name", () => {
    const results = toSuggestions({
      suggestions: [
        { mapbox_id: "ok", name: "Good" },
        { name: "No id" },
        { mapbox_id: "no-name", name: "   " },
        "not an object",
        null,
      ],
    });
    expect(results.map((r) => r.id)).toEqual(["ok"]);
  });

  it("returns [] for bodies that are not suggestion collections", () => {
    expect(toSuggestions({ message: "Not Found" })).toEqual([]);
    expect(toSuggestions({ suggestions: "nope" })).toEqual([]);
    expect(toSuggestions(null)).toEqual([]);
  });
});

describe("toGeocodeResult", () => {
  it("reads the coordinate in [lng, lat] order", () => {
    expect(
      toGeocodeResult({
        features: [{ geometry: { coordinates: [122.5511369, 10.7144566] } }],
      }),
    ).toEqual({ location: [122.5511369, 10.7144566] });
  });

  it("returns null when the feature carries no usable geometry", () => {
    expect(toGeocodeResult({ features: [] })).toBeNull();
    expect(toGeocodeResult({ features: [{}] })).toBeNull();
    expect(
      toGeocodeResult({ features: [{ geometry: { coordinates: ["x", 2] } }] }),
    ).toBeNull();
    expect(
      toGeocodeResult({ features: [{ geometry: { coordinates: [1] } }] }),
    ).toBeNull();
    expect(toGeocodeResult(null)).toBeNull();
  });
});

describe("GET /api/admin/mapbox/geocode (suggest route)", () => {
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
    expect(res.json().data).toEqual({ suggestions: [], warning: "no_token" });
  });

  it("returns suggestions and no warning on success", async () => {
    process.env.MAPBOX_SECRET_TOKEN = "test-token";
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        suggestions: [
          {
            mapbox_id: "dXJuOm1ieHBvaTox",
            name: "SM City Iloilo",
            place_formatted: "Iloilo City, 5000, Philippines",
          },
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const app = await bareApp();
    const res = await app.inject({
      method: "GET",
      url: "/mapbox/geocode?q=SM%20City%20Iloilo&session=session-1",
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual({
      suggestions: [
        {
          id: "dXJuOm1ieHBvaTox",
          name: "SM City Iloilo",
          description: "Iloilo City, 5000, Philippines",
        },
      ],
      warning: null,
    });
    const requested = String((fetchMock.mock.calls[0] as unknown[])[0]);
    expect(requested).toContain("/search/searchbox/v1/suggest?");
    expect(requested).toContain(`proximity=${ILOILO_PROXIMITY}`);
    expect(requested).toContain("session_token=session-1");
  });

  it("forwards a client-supplied limit", async () => {
    process.env.MAPBOX_SECRET_TOKEN = "test-token";
    const fetchMock = vi.fn(async () => jsonResponse({ suggestions: [] }));
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
    expect(res.json().data).toEqual({
      suggestions: [],
      warning: "upstream_error",
    });
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
});

describe("GET /api/admin/mapbox/geocode/resolve (retrieve route)", () => {
  afterEach(() => {
    delete process.env.MAPBOX_SECRET_TOKEN;
    vi.unstubAllGlobals();
  });

  it("rejects a missing id with 422", async () => {
    process.env.MAPBOX_SECRET_TOKEN = "test-token";
    const app = await bareApp();
    const res = await app.inject({
      method: "GET",
      url: "/mapbox/geocode/resolve",
    });
    expect(res.statusCode).toBe(422);
  });

  it("answers no_token when MAPBOX_SECRET_TOKEN is absent", async () => {
    delete process.env.MAPBOX_SECRET_TOKEN;
    const app = await bareApp();
    const res = await app.inject({
      method: "GET",
      url: "/mapbox/geocode/resolve?id=abc",
    });
    expect(res.json().data).toEqual({ location: null, warning: "no_token" });
  });

  it("resolves the id into a [lng, lat] location", async () => {
    process.env.MAPBOX_SECRET_TOKEN = "test-token";
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        features: [{ geometry: { coordinates: [122.5511369, 10.7144566] } }],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const app = await bareApp();
    const res = await app.inject({
      method: "GET",
      url: "/mapbox/geocode/resolve?id=dXJuOm1ieHBvaTox&session=session-1",
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual({
      location: [122.5511369, 10.7144566],
      warning: null,
    });
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toContain(
      "/search/searchbox/v1/retrieve/dXJuOm1ieHBvaTox",
    );
  });

  it("answers upstream_error when the retrieve call fails", async () => {
    process.env.MAPBOX_SECRET_TOKEN = "test-token";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("boom", { status: 500 })),
    );
    const app = await bareApp();
    const res = await app.inject({
      method: "GET",
      url: "/mapbox/geocode/resolve?id=abc",
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual({
      location: null,
      warning: "upstream_error",
    });
  });
});
