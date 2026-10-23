import { afterEach, describe, expect, it, vi } from "vitest";
import Fastify from "fastify";
import {
  buildGeocodeUrl,
  clampGeocodeLimit,
  GEOCODE_DEFAULT_LIMIT,
  GEOCODE_MAX_LIMIT,
  ILOILO_BBOX,
  parseGeocodeLimit,
  registerMapbox,
  toGeocodeResults,
} from "../../src/api/mapbox";

async function bareApp() {
  const app = Fastify();
  await registerMapbox(app as never);
  await app.ready();
  return app;
}

function mapboxResponse(features: unknown) {
  return new Response(JSON.stringify({ features }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("buildGeocodeUrl", () => {
  it("encodes the query and applies the server-side region bias", () => {
    const url = buildGeocodeUrl("Iloilo City Hall", "secret-token");
    expect(url).toContain(
      "/geocoding/v5/mapbox.places/Iloilo%20City%20Hall.json",
    );
    expect(url).toContain("country=ph");
    expect(url).toContain(`bbox=${ILOILO_BBOX}`);
    expect(url).toContain(`limit=${GEOCODE_DEFAULT_LIMIT}`);
    expect(url).toContain("access_token=secret-token");
    // Nominatim is gone from the client AND the server (issue #16).
    expect(url).not.toContain("nominatim");
  });

  it("escapes characters that would otherwise change the path", () => {
    const url = buildGeocodeUrl("a/b?c", "t");
    expect(url).toContain("/mapbox.places/a%2Fb%3Fc.json");
  });

  it("clamps the requested limit into Mapbox's accepted range", () => {
    expect(buildGeocodeUrl("q", "t", 99)).toContain(
      `limit=${GEOCODE_MAX_LIMIT}`,
    );
    expect(buildGeocodeUrl("q", "t", 0)).toContain("limit=1");
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

describe("toGeocodeResults", () => {
  it("maps features into [lng, lat] hits with name + description split", () => {
    const results = toGeocodeResults({
      features: [
        {
          id: "place.123",
          text: "Iloilo City Hall",
          place_name:
            "Iloilo City Hall, Plaza Libertad, Iloilo City, Iloilo, Philippines",
          center: [122.5645, 10.6922],
        },
      ],
    });
    expect(results).toEqual([
      {
        id: "place.123",
        name: "Iloilo City Hall",
        description: "Plaza Libertad, Iloilo City, Iloilo, Philippines",
        location: [122.5645, 10.6922],
      },
    ]);
  });

  it("falls back to the first place_name segment when `text` is missing", () => {
    const [result] = toGeocodeResults({
      features: [
        { place_name: "Jaro Plaza, Iloilo City", center: [122.58, 10.72] },
      ],
    });
    expect(result.name).toBe("Jaro Plaza");
    expect(result.description).toBe("Iloilo City");
    expect(result.id).toBe("122.58,10.72");
  });

  it("drops entries without usable coordinates or text", () => {
    const results = toGeocodeResults({
      features: [
        {
          id: "good",
          text: "Good",
          place_name: "Good, Iloilo",
          center: [1, 2],
        },
        { id: "bad-lng", text: "Bad", place_name: "Bad", center: ["x", 2] },
        { id: "no-center", text: "No center", place_name: "No center" },
        { id: "short-center", text: "Short", place_name: "Short", center: [1] },
        { id: "empty", text: "   ", place_name: "  ", center: [1, 2] },
        "not an object",
        null,
      ],
    });
    expect(results.map((r) => r.id)).toEqual(["good"]);
  });

  it("returns [] for responses that are not feature collections", () => {
    expect(toGeocodeResults({ message: "Not Found" })).toEqual([]);
    expect(toGeocodeResults({ features: "nope" })).toEqual([]);
    expect(toGeocodeResults(null)).toEqual([]);
    expect(toGeocodeResults([])).toEqual([]);
  });
});

describe("GET /api/admin/mapbox/geocode (route)", () => {
  afterEach(() => {
    delete process.env.MAPBOX_SECRET_TOKEN;
    vi.unstubAllGlobals();
  });

  it("answers no_token when MAPBOX_SECRET_TOKEN is absent", async () => {
    delete process.env.MAPBOX_SECRET_TOKEN;
    const app = await bareApp();
    const res = await app.inject({
      method: "GET",
      url: "/mapbox/geocode?q=Iloilo",
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual({ results: [], warning: "no_token" });
  });

  it("returns mapped results and no warning on success", async () => {
    process.env.MAPBOX_SECRET_TOKEN = "test-token";
    const fetchMock = vi.fn(async () =>
      mapboxResponse([
        {
          id: "place.1",
          text: "Iloilo City",
          place_name: "Iloilo City, Iloilo, Philippines",
          center: [122.56, 10.72],
        },
      ]),
    );
    vi.stubGlobal("fetch", fetchMock);
    const app = await bareApp();
    const res = await app.inject({
      method: "GET",
      url: "/mapbox/geocode?q=Iloilo",
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual({
      results: [
        {
          id: "place.1",
          name: "Iloilo City",
          description: "Iloilo, Philippines",
          location: [122.56, 10.72],
        },
      ],
      warning: null,
    });
    // The browser's query and the server's region bias, not the client's.
    const requested = String((fetchMock.mock.calls[0] as unknown[])[0]);
    expect(requested).toContain("Iloilo.json");
    expect(requested).toContain(`bbox=${ILOILO_BBOX}`);
  });

  it("forwards a client-supplied limit", async () => {
    process.env.MAPBOX_SECRET_TOKEN = "test-token";
    const fetchMock = vi.fn(async () => mapboxResponse([]));
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
      results: [],
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
    expect(res.statusCode).toBe(200);
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
