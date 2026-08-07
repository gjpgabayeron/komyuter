import { describe, expect, it } from "vitest";
import {
  buildNominatimUrl,
  ILOILO_VIEWBOX,
  parseNominatimResults,
} from "@/lib/poiSearch";

describe("buildNominatimUrl", () => {
  it("encodes the query and biases to the Iloilo viewbox", () => {
    const url = buildNominatimUrl("Iloilo City Hall");
    expect(url).toContain("q=Iloilo+City+Hall");
    expect(url).toContain(`viewbox=${ILOILO_VIEWBOX}`);
    expect(url).toContain("bounded=0");
    expect(url).toContain("countrycodes=ph");
  });
});

describe("parseNominatimResults", () => {
  it("parses valid hits into [lng, lat] order", () => {
    const results = parseNominatimResults([
      {
        place_id: 42,
        display_name: "Iloilo City Hall, Plaza Libertad, Iloilo City, Iloilo",
        lat: "10.69220",
        lon: "122.56450",
      },
    ]);
    expect(results).toEqual([
      {
        id: "42",
        name: "Iloilo City Hall",
        description: "Plaza Libertad, Iloilo City, Iloilo",
        location: [122.5645, 10.6922],
      },
    ]);
  });

  it("drops entries without usable coordinates or names", () => {
    const results = parseNominatimResults([
      { place_id: 1, display_name: "Good", lat: "10.0", lon: "122.0" },
      { place_id: 2, display_name: "Bad lat", lat: "nope", lon: "122.0" },
      { place_id: 3, display_name: "", lat: "10.0", lon: "122.0" },
      { place_id: 4, display_name: "No coords" },
      "not an object",
      null,
    ]);
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("1");
  });

  it("returns [] for a non-array response", () => {
    expect(parseNominatimResults({ error: "x" })).toEqual([]);
    expect(parseNominatimResults(null)).toEqual([]);
  });
});
