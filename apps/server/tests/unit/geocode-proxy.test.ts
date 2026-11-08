import { afterEach, describe, expect, it, vi } from "vitest";
import Fastify from "fastify";
import {
  buildForwardUrl,
  clampGeocodeLimit,
  GEOCODE_DEFAULT_LIMIT,
  GEOCODE_MAX_LIMIT,
  ILOILO_PROXIMITY,
  openHoursToday,
  parseGeocodeLimit,
  parseProximity,
  registerMapbox,
  toGeocodeHits,
} from "../../src/api/mapbox";
import { installAllPermissionsAccount } from "../helpers/fake-account";

async function bareApp() {
  const app = Fastify();
  installAllPermissionsAccount(app);
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
    const url = buildForwardUrl("SM City Iloilo", "secret-token");
    expect(url).toContain(
      "https://api.mapbox.com/search/searchbox/v1/forward?",
    );
    expect(url).toContain("q=SM+City+Iloilo");
    expect(url).toContain("country=ph");
    expect(url).toContain("language=en");
    expect(url).toContain(`proximity=${ILOILO_PROXIMITY}`);
    expect(url).toContain(`limit=${GEOCODE_DEFAULT_LIMIT}`);
    expect(url).toContain("auto_complete=true");
    expect(url).toContain("access_token=secret-token");
  });

  it("never sends session_token — /forward rejects it with a 400", () => {
    // Regression pin. `session_token` belongs to the suggest/retrieve billing
    // pair; sending it to /forward produced
    // `400 Query deserialize error: unknown field 'session_token'`, which the
    // proxy reported as upstream_error — "Search is unavailable right now" for
    // every query.
    expect(buildForwardUrl("Jaro Plaza", "secret-token")).not.toContain(
      "session_token",
    );
  });

  it("keeps the endpoints that lost the POIs, and the hard filter, gone", () => {
    const url = buildForwardUrl("Jaro Plaza", "secret-token");
    expect(url).not.toContain("/geocoding/v5/");
    expect(url).not.toContain("/retrieve/");
    expect(url).not.toContain("bbox=");
    expect(url).not.toContain("nominatim");
  });

  it("clamps the requested limit", () => {
    expect(buildForwardUrl("q", "t", 99)).toContain(
      `limit=${GEOCODE_MAX_LIMIT}`,
    );
    expect(buildForwardUrl("q", "t", 0)).toContain("limit=1");
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

describe("parseProximity", () => {
  it("accepts a well-formed camera centre", () => {
    expect(parseProximity("122.5656,10.7202")).toBe("122.5656,10.7202");
    expect(parseProximity(" 122.5 , 10.7 ")).toBe("122.5,10.7");
  });

  it("falls back to the service centre for junk, out-of-range or missing input", () => {
    // A bad proximity makes Mapbox answer 400, which would surface as
    // "Search is unavailable" — so it is replaced, never forwarded.
    expect(parseProximity(undefined)).toBe(ILOILO_PROXIMITY);
    expect(parseProximity("")).toBe(ILOILO_PROXIMITY);
    expect(parseProximity("not,a,coordinate")).toBe(ILOILO_PROXIMITY);
    expect(parseProximity("nope,10.7")).toBe(ILOILO_PROXIMITY);
    expect(parseProximity("122.5")).toBe(ILOILO_PROXIMITY);
    expect(parseProximity("200,10.7")).toBe(ILOILO_PROXIMITY);
    expect(parseProximity("122.5,95")).toBe(ILOILO_PROXIMITY);
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
        category: null,
        distanceMeters: null,
        openHours: null,
        phone: null,
        website: null,
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
        category: null,
        distanceMeters: null,
        openHours: null,
        phone: null,
        website: null,
      },
    ]);
  });

  it("carries the POI metadata Mapbox returns for Iloilo places", () => {
    // A Monday, so "today" is deterministic for the hours field.
    const monday = new Date("2026-10-26T02:00:00Z");
    const hits = toGeocodeHits(
      {
        features: [
          {
            type: "Feature",
            geometry: { coordinates: [122.5511, 10.7144] },
            properties: {
              mapbox_id: "poi-1",
              name: "SM City Iloilo",
              place_formatted: "Iloilo City, 5000, Philippines",
              // Coarse-to-fine; the specific label is the last one.
              poi_category: ["shopping", "shopping mall"],
              distance: 1696,
              metadata: {
                phone: "+639178761111",
                website: "https://www.smsupermalls.com/",
                // Malls ship periods with an empty weekday_text.
                open_hours: {
                  weekday_text: [],
                  periods: [
                    {
                      open: { day: 0, time: "1000" },
                      close: { day: 0, time: "2200" },
                    },
                    {
                      open: { day: 1, time: "1000" },
                      close: { day: 1, time: "2200" },
                    },
                  ],
                },
              },
            },
          },
        ],
      },
      monday,
    );

    expect(hits[0]).toMatchObject({
      category: "shopping mall",
      distanceMeters: 1696,
      openHours: "10:00 – 22:00",
      phone: "+639178761111",
      website: "https://www.smsupermalls.com/",
    });
  });

  it("leaves metadata null when Mapbox omits it", () => {
    const hits = toGeocodeHits({ features: [feature()] });
    expect(hits[0].category).toBeNull();
    expect(hits[0].distanceMeters).toBeNull();
    expect(hits[0].openHours).toBeNull();
    expect(hits[0].phone).toBeNull();
    expect(hits[0].website).toBeNull();
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

describe("openHoursToday", () => {
  // Monday 10:00 in Asia/Manila.
  const monday = new Date("2026-10-26T02:00:00Z");

  it("prefers the already-written weekday line", () => {
    expect(
      openHoursToday(
        {
          weekday_text: [
            "Sunday: Closed",
            "Monday: Open 24 hours",
            "Tuesday: Open 24 hours",
          ],
          periods: [
            { open: { day: 1, time: "0900" }, close: { day: 1, time: "1700" } },
          ],
        },
        monday,
      ),
    ).toBe("Open 24 hours");
  });

  it("falls back to today's period when weekday_text is empty", () => {
    expect(
      openHoursToday(
        {
          weekday_text: [],
          periods: [
            {
              open: { day: 0, time: "1000" },
              close: { day: 0, time: "2200" },
            },
            {
              open: { day: 1, time: "1000" },
              close: { day: 1, time: "2200" },
            },
          ],
        },
        monday,
      ),
    ).toBe("10:00 – 22:00");
  });

  it("reads a period with no close as 24 hours", () => {
    expect(
      openHoursToday({ periods: [{ open: { day: 1, time: "0000" } }] }, monday),
    ).toBe("Open 24 hours");
  });

  it("returns null when no day matches or the input is junk", () => {
    expect(
      openHoursToday(
        {
          periods: [
            { open: { day: 3, time: "0900" }, close: { day: 3, time: "1700" } },
          ],
        },
        monday,
      ),
    ).toBeNull();
    expect(
      openHoursToday({ weekday_text: ["Monday: "], periods: [] }, monday),
    ).toBeNull();
    expect(openHoursToday({}, monday)).toBeNull();
    expect(openHoursToday(null, monday)).toBeNull();
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
      url: "/mapbox/geocode?q=SM%20City%20Iloilo&proximity=122.6,10.7",
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual({
      results: [
        {
          id: "dXJuOm1ieHBvaTox",
          name: "SM City Iloilo",
          description: "Iloilo City, 5000, Philippines",
          location: [122.5511, 10.7144],
          category: null,
          distanceMeters: null,
          openHours: null,
          phone: null,
          website: null,
        },
      ],
      warning: null,
    });
    const requested = String((fetchMock.mock.calls[0] as unknown[])[0]);
    expect(requested).toContain("/search/searchbox/v1/forward?");
    expect(requested).toContain("proximity=122.6,10.7");
    expect(requested).not.toContain("session_token");
  });

  it("replaces a malformed proximity with the service centre", async () => {
    process.env.MAPBOX_SECRET_TOKEN = "test-token";
    const fetchMock = vi.fn(async () =>
      jsonResponse({ features: [feature()] }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const app = await bareApp();
    await app.inject({
      method: "GET",
      url: "/mapbox/geocode?q=Iloilo&proximity=garbage",
    });
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toContain(
      `proximity=${ILOILO_PROXIMITY}`,
    );
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
