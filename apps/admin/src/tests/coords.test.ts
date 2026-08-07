import { describe, expect, it } from "vitest";
import type { CoordinatePair, GeoLineString } from "@komyuter/shared";
import {
  coordsDistanceMeters,
  coordinatesEqual,
  formatDistance,
  nearestCoordIndex,
  parseCoordinatePair,
  pathEndsOnStops,
  polylineDistanceMeters,
  straightLineThrough,
} from "@/lib/coords";

describe("parseCoordinatePair", () => {
  it("parses a lng,lat pair", () => {
    expect(parseCoordinatePair("122.5689, 10.6931")).toEqual([
      122.5689, 10.6931,
    ]);
  });

  it("rejects malformed input", () => {
    expect(() => parseCoordinatePair("not,valid")).toThrow();
    expect(() => parseCoordinatePair("122.5")).toThrow();
  });
});

describe("coordinatesEqual", () => {
  it("is true for identical pairs", () => {
    expect(coordinatesEqual([122.5, 10.6], [122.5, 10.6])).toBe(true);
  });

  it("is false for different pairs", () => {
    expect(coordinatesEqual([122.5, 10.6], [122.51, 10.6])).toBe(false);
  });

  it("honours an explicit epsilon", () => {
    expect(coordinatesEqual([122.5, 10.6], [122.5001, 10.6], 0.001)).toBe(true);
  });
});

describe("nearestCoordIndex", () => {
  const line: CoordinatePair[] = [
    [122.5, 10.6],
    [122.51, 10.61],
    [122.52, 10.62],
  ];

  it("returns the exact vertex index for a hit", () => {
    expect(nearestCoordIndex([122.51, 10.61], line)).toBe(1);
  });

  it("returns the nearest vertex within the threshold", () => {
    expect(nearestCoordIndex([122.5105, 10.6105], line)).toBe(1);
  });

  it("returns -1 when every vertex is too far", () => {
    expect(nearestCoordIndex([122.9, 10.9], line)).toBe(-1);
  });

  it("returns -1 for an empty line", () => {
    expect(nearestCoordIndex([122.5, 10.6], [])).toBe(-1);
  });
});

describe("coordsDistanceMeters", () => {
  it("is 0 for identical points", () => {
    expect(coordsDistanceMeters([122.5, 10.6], [122.5, 10.6])).toBe(0);
  });

  it("approximates a 0.001° latitude step (~111 m)", () => {
    const d = coordsDistanceMeters([122.5, 10.6], [122.5, 10.601]);
    expect(d).toBeGreaterThan(100);
    expect(d).toBeLessThan(130);
  });
});

describe("pathEndsOnStops", () => {
  const A: CoordinatePair = [122.5, 10.6];
  const B: CoordinatePair = [122.52, 10.62];
  const line: GeoLineString = { type: "LineString", coordinates: [A, B] };
  const stops = [{ location: A }, { location: B }];

  it("accepts a path that starts and ends on stops", () => {
    expect(pathEndsOnStops(line, stops)).toEqual({ ok: true });
  });

  it("accepts a loop ending on the start stop (FR-004)", () => {
    const loop: GeoLineString = {
      type: "LineString",
      coordinates: [A, B, A],
    };
    expect(pathEndsOnStops(loop, stops)).toEqual({ ok: true });
  });

  it("rejects a path whose start is far from the first stop", () => {
    const offStart: GeoLineString = {
      type: "LineString",
      coordinates: [[122.6, 10.7], B],
    };
    expect(pathEndsOnStops(offStart, stops)).toEqual({
      ok: false,
      reason: "start",
    });
  });

  it("rejects a path whose end is far from the last stop", () => {
    const offEnd: GeoLineString = {
      type: "LineString",
      coordinates: [A, [122.6, 10.7]],
    };
    expect(pathEndsOnStops(offEnd, stops)).toEqual({
      ok: false,
      reason: "end",
    });
  });

  it("rejects fewer than 2 stops", () => {
    expect(pathEndsOnStops(line, [{ location: A }])).toEqual({
      ok: false,
      reason: "start",
    });
  });
});

describe("straightLineThrough", () => {
  it("connects ordered points into a LineString", () => {
    expect(
      straightLineThrough([
        [122.5, 10.6],
        [122.51, 10.61],
      ]),
    ).toEqual({
      type: "LineString",
      coordinates: [
        [122.5, 10.6],
        [122.51, 10.61],
      ],
    });
  });

  it("returns null for fewer than 2 points", () => {
    expect(straightLineThrough([[122.5, 10.6]])).toBeNull();
    expect(straightLineThrough([])).toBeNull();
  });
});

describe("polylineDistanceMeters", () => {
  it("sums consecutive haversine segment lengths", () => {
    const line: GeoLineString = {
      type: "LineString",
      coordinates: [
        [122.5, 10.6],
        [122.5, 10.601],
        [122.5, 10.602],
      ],
    };
    // Two ~111 m latitude steps.
    const total = polylineDistanceMeters(line);
    expect(total).toBeGreaterThan(200);
    expect(total).toBeLessThan(260);
  });

  it("is 0 for a degenerate line", () => {
    expect(
      polylineDistanceMeters({
        type: "LineString",
        coordinates: [[122.5, 10.6]],
      }),
    ).toBe(0);
  });
});

describe("formatDistance", () => {
  it("formats meters with thousands separators", () => {
    expect(formatDistance(1234, "m")).toBe("1,234 m");
    expect(formatDistance(0, "m")).toBe("0 m");
  });

  it("converts to kilometres with two decimals", () => {
    expect(formatDistance(1234, "km")).toBe("1.23 km");
    expect(formatDistance(1000, "km")).toBe("1.00 km");
  });
});
