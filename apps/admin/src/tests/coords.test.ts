import { describe, expect, it } from "vitest";
import type { CoordinatePair, GeoLineString } from "@komyuter/shared";
import {
  coordsDistanceMeters,
  coordinatesEqual,
  divergingSegments,
  formatDistance,
  nearestCoordIndex,
  parseCoordinatePair,
  pathCoversStops,
  pathEndsOnStops,
  polylineDistanceMeters,
  resolveConnectingLine,
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

describe("resolveConnectingLine (FR-006/FR-007, US2)", () => {
  const A: CoordinatePair = [122.5, 10.6];
  const B: CoordinatePair = [122.52, 10.62];
  const line = (coordinates: CoordinatePair[]): GeoLineString => ({
    type: "LineString",
    coordinates,
  });

  it("shows the straight fallback until a path exists, then nothing to connect", () => {
    // No committed path yet → transient straight line keeps the map non-blank.
    expect(resolveConnectingLine(null, [A, B])).toEqual(
      straightLineThrough([A, B]),
    );
    // Committed draft: the draft line itself is drawn, nothing to connect.
    expect(resolveConnectingLine(line([A, B]), [A, B])).toBeNull();
  });
});

describe("divergingSegments", () => {
  // Points on the "shared road": the corridor near lat 0.
  const corridor = (() => {
    const pts: CoordinatePair[] = [];
    for (let i = 0; i <= 10; i++) {
      pts.push([i * 0.001, 0]); // 0 → 0.01 lng, ~1.1 km, on lat 0
    }
    return pts;
  })();

  it("returns [] when the polyline fully coincides with the other", () => {
    // Exact reverse of the corridor — nothing diverges.
    const reverse = [...corridor].reverse();
    expect(divergingSegments(reverse, corridor)).toEqual([]);
  });

  it("returns one run equal to the polyline when it fully diverges", () => {
    const farAway = corridor.map(
      (p) => [p[0], p[1] + 0.1] as CoordinatePair, // ~11 km north
    );
    const runs = divergingSegments(farAway, corridor);
    expect(runs).toHaveLength(1);
    expect(runs[0]).toEqual(farAway);
  });

  it("returns only the middle run when the ends stay on the shared road", () => {
    // Divergent detour in the middle: vertices 4-7 move 500 m north, the
    // rest stay on the corridor.
    const detour = corridor.map((p, i) =>
      i >= 4 && i <= 7 ? ([p[0], p[1] + 0.005] as CoordinatePair) : p,
    );
    const runs = divergingSegments(detour, corridor);
    expect(runs).toHaveLength(1);
    expect(runs[0]).toHaveLength(4); // vertices 4..7
    expect(runs[0][0]).toEqual([0.004, 0.005]);
    expect(runs[0][3]).toEqual([0.007, 0.005]);
  });

  it("splits two disjoint divergent runs", () => {
    const detached = corridor.map((p, i) => {
      if (i >= 2 && i <= 3) return [p[0], p[1] + 0.005] as CoordinatePair;
      if (i >= 7 && i <= 8) return [p[0], p[1] + 0.006] as CoordinatePair;
      return p;
    });
    const runs = divergingSegments(detached, corridor);
    expect(runs).toHaveLength(2);
    expect(runs[0]).toHaveLength(2);
    expect(runs[1]).toHaveLength(2);
  });

  it("drops single-vertex fragments", () => {
    const isolated = corridor.map((p, i) =>
      i === 5 ? ([p[0], p[1] + 0.005] as CoordinatePair) : p,
    );
    expect(divergingSegments(isolated, corridor)).toEqual([]);
  });

  it("handles an empty overlap target (single-direction route)", () => {
    expect(divergingSegments(corridor, [])).toEqual([corridor]);
  });
});

describe("pathCoversStops", () => {
  const line = (coords: CoordinatePair[]): GeoLineString => ({
    type: "LineString",
    coordinates: coords,
  });

  it("accepts a path that passes through every stop", () => {
    const polyline = line([
      [122.5, 10.6],
      [122.505, 10.605],
      [122.51, 10.61],
    ]);
    const stops = [
      { location: [122.5, 10.6] },
      { location: [122.51, 10.61] },
    ] as { location: CoordinatePair }[];
    expect(pathCoversStops(polyline, stops)).toBe(true);
  });

  it("rejects when a stop is far from the path entirely", () => {
    const polyline = line([
      [122.5, 10.6],
      [122.51, 10.61],
    ]);
    const stops = [
      { location: [122.5, 10.6] },
      { location: [122.9, 10.9] },
    ] as { location: CoordinatePair }[];
    expect(pathCoversStops(polyline, stops)).toBe(false);
  });
});
