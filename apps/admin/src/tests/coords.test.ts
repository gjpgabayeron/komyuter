import { describe, expect, it } from "vitest";
import type { CoordinatePair, GeoLineString } from "@komyuter/shared";
import {
  coordsDistanceMeters,
  coordinatesEqual,
  divergingSegments,
  formatDistance,
  inferDetourFlanks,
  nearestCoordIndex,
  parseCoordinatePair,
  pathCoversStops,
  pathEndsOnStops,
  polylineDistanceMeters,
  polylineSegmentLength,
  projectPointOnPolyline,
  replacedArcLengthMeters,
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

describe("resolveConnectingLine transient stub (perf/UX audit)", () => {
  it("extends a stub from the committed path end to a just-placed stop", () => {
    const path: GeoLineString = {
      type: "LineString",
      coordinates: [
        [122.5, 10.6],
        [122.51, 10.61],
      ],
    };
    const stops: CoordinatePair[] = [
      [122.5, 10.6],
      [122.51, 10.61],
      [122.55, 10.65], // new stop well beyond the path end
    ];
    const line = resolveConnectingLine(path, stops);
    expect(line).toEqual({
      type: "LineString",
      coordinates: [
        [122.51, 10.61],
        [122.55, 10.65],
      ],
    });
  });

  it("draws NO stub for a closed loop whose newest stop is covered mid-loop", () => {
    // The loop's path END is its START vertex, far from the final stop — but
    // the final stop sits mid-loop on a nearby vertex, so it IS covered.
    const loop: GeoLineString = {
      type: "LineString",
      coordinates: [
        [122.5, 10.6],
        [122.51, 10.61],
        [122.52, 10.62],
        [122.5, 10.6],
      ],
    };
    expect(
      resolveConnectingLine(loop, [
        [122.5, 10.6],
        [122.5104, 10.6104], // ~60 m from the mid-loop vertex
      ]),
    ).toBeNull();
  });

  it("returns null when the newest stop is already covered by the path", () => {
    const path: GeoLineString = {
      type: "LineString",
      coordinates: [
        [122.5, 10.6],
        [122.51, 10.61],
      ],
    };
    expect(
      resolveConnectingLine(path, [
        [122.5, 10.6],
        [122.51, 10.61],
      ]),
    ).toBeNull();
  });
});

describe("resolveConnectingLine chain-line override (map reflects a rewire)", () => {
  const road: GeoLineString = {
    type: "LineString",
    coordinates: [
      [122.5, 10.6],
      [122.51, 10.61],
      [122.52, 10.62],
    ],
  };
  const allStops: CoordinatePair[] = [
    [122.5, 10.6],
    [122.51, 10.61],
    [122.52, 10.62],
  ];

  it("draws the chain straight line when the newest stop is covered by the old path (rewire)", () => {
    // All three stops sit ON the old path, so the stub would never draw — but
    // the chain ORDER changed (out of sync) and the map must reflect it.
    const line = resolveConnectingLine(road, allStops, true);
    expect(line?.coordinates).toEqual(allStops);
  });

  it("draws nothing for a stop placed near the old path (covered — no stub, no line)", () => {
    // A stop placed ~50 m from a path vertex is covered: without the rewire
    // override (placements are not rewires at the RouteMap level) neither the
    // stub nor a chain line draws — no flash during the snap window.
    const stops: CoordinatePair[] = [
      [122.5, 10.6],
      [122.51, 10.61],
      [122.50045, 10.60045],
    ];
    expect(resolveConnectingLine(road, stops)).toBeNull();
    expect(resolveConnectingLine(road, stops, true)).not.toBeNull(); // force still draws the chain
  });

  it("still falls through to the stub for a fresh placement beyond the path", () => {
    const stops: CoordinatePair[] = [
      [122.5, 10.6],
      [122.51, 10.61],
      [122.55, 10.65], // far beyond the path — a placement, not a rewire
    ];
    const line = resolveConnectingLine(road, stops, true);
    // The stub (path end -> newest), NOT the full straight chain line.
    expect(line?.coordinates).toEqual([
      [122.52, 10.62],
      [122.55, 10.65],
    ]);
  });
});

describe("projectPointOnPolyline (detour snap)", () => {
  const line: CoordinatePair[] = [
    [122.5, 10.6],
    [122.51, 10.61],
    [122.52, 10.62],
  ];

  it("snaps a click near the line to the nearest segment", () => {
    // Midpoint of segment 0, nudged ~10 m perpendicular to the line.
    const a = line[0];
    const b = line[1];
    const mid: CoordinatePair = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy);
    const click: CoordinatePair = [
      mid[0] - (dy / len) * 0.00009,
      mid[1] + (dx / len) * 0.00009,
    ];
    const result = projectPointOnPolyline(click, line);
    expect(result).not.toBeNull();
    expect(result!.index).toBe(0);
    expect(result!.distanceMeters).toBeGreaterThan(0);
    expect(result!.distanceMeters).toBeLessThan(30);
    expect(result!.coordinate[0]).toBeGreaterThan(122.5);
    expect(result!.coordinate[0]).toBeLessThan(122.51);
    expect(result!.coordinate[0]).toBeCloseTo(mid[0], 2);
  });

  it("returns null for a click far from the polyline", () => {
    expect(projectPointOnPolyline([122.9, 10.9], line)).toBeNull();
  });

  it("returns distance 0 for an exact vertex hit and reports the vertex index", () => {
    const result = projectPointOnPolyline([122.51, 10.61], line);
    expect(result!.distanceMeters).toBe(0);
    // A vertex-exact snap belongs to the segment STARTING at that vertex so
    // the replaced base arc begins exactly there (no off-by-one over-count).
    expect(result!.index).toBe(1);
  });

  it("reports the leading vertex index of the snapped segment", () => {
    // Exact midpoint of segment 1; strictly nearest to it (segment 0 clamps).
    const result = projectPointOnPolyline([122.515, 10.615], line);
    expect(result).not.toBeNull();
    expect(result!.index).toBe(1);
    expect(result!.distanceMeters).toBe(0);
  });

  it("snaps when the click is within the custom max distance", () => {
    const result = projectPointOnPolyline([122.51, 10.615], line, 600);
    expect(result).not.toBeNull();
  });
});

describe("polylineSegmentLength (detour replaced distance)", () => {
  // ~111 m per 0.001° of latitude.
  const line: GeoLineString = {
    type: "LineString",
    coordinates: [
      [122.5, 10.6],
      [122.5, 10.601],
      [122.5, 10.602],
    ],
  };

  it("sums the haversine segments between indices", () => {
    const length = polylineSegmentLength(line, 0, 2);
    expect(length).toBeGreaterThan(200);
    expect(length).toBeLessThan(260);
  });

  it("returns 0 for a zero-length slice", () => {
    expect(polylineSegmentLength(line, 1, 1)).toBe(0);
  });

  it("throws when the slice is inverted or out of range", () => {
    expect(() => polylineSegmentLength(line, 2, 1)).toThrow(RangeError);
    expect(() => polylineSegmentLength(line, -1, 2)).toThrow(RangeError);
    expect(() => polylineSegmentLength(line, 0, 5)).toThrow(RangeError);
  });
});

describe("replacedArcLengthMeters (FR-011 fractional exactness)", () => {
  // Two ~111 m segments: A=[122.5,10.6] → B=[122.5,10.601] → C=[122.5,10.602].
  const line: GeoLineString = {
    type: "LineString",
    coordinates: [
      [122.5, 10.6],
      [122.5, 10.601],
      [122.5, 10.602],
    ],
  };

  it("measures entry-tail + full middles + exit-head for fractional points", () => {
    // Entry at 25% along AB, exit at 75% along BC: replaced =
    // (1-0.25)·|AB| + 0.75·|BC| ≈ 0.75·111 + 0.75·111 ≈ 166 m.
    const meters = replacedArcLengthMeters(
      line,
      { index: 0, fraction: 0.25 },
      { index: 1, fraction: 0.75 },
    );
    expect(meters).toBeGreaterThan(150);
    expect(meters).toBeLessThan(180);
  });

  it("measures a same-segment pair as the fraction delta", () => {
    const segment = coordsDistanceMeters([122.5, 10.6], [122.5, 10.601]);
    const meters = replacedArcLengthMeters(
      line,
      { index: 0, fraction: 0.2 },
      { index: 0, fraction: 0.8 },
    );
    expect(meters).toBeCloseTo(0.6 * segment, 1);
  });

  it("returns 0 defensively for out-of-order or same-position pairs", () => {
    expect(
      replacedArcLengthMeters(
        line,
        { index: 1, fraction: 0.5 },
        { index: 0, fraction: 0.5 },
      ),
    ).toBe(0);
    expect(
      replacedArcLengthMeters(
        line,
        { index: 0, fraction: 0.5 },
        { index: 0, fraction: 0.5 },
      ),
    ).toBe(0);
  });
});

describe("inferDetourFlanks (quick-mode detour authoring)", () => {
  const base: GeoLineString = {
    type: "LineString",
    coordinates: [
      [122.5, 10.6],
      [122.51, 10.61],
      [122.52, 10.62],
    ],
  };
  const chainStops = [
    { stop_id: "A", name: "A", location: [122.5, 10.6] as [number, number] },
    { stop_id: "B", name: "B", location: [122.51, 10.61] as [number, number] },
    { stop_id: "C", name: "C", location: [122.52, 10.62] as [number, number] },
  ];

  it("flanks a mid-segment click by arc order (before at-or-before, after strictly after)", () => {
    const result = inferDetourFlanks(base, chainStops, [122.505, 10.605]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.before.stop_id).toBe("A");
      expect(result.after.stop_id).toBe("B");
      expect(result.viaStop).toBeNull();
    }
  });

  it("treats a click on an existing stop as the via stop with chain neighbours", () => {
    const result = inferDetourFlanks(base, chainStops, [122.51, 10.61]); // B
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.viaStop?.stop_id).toBe("B");
      expect(result.before.stop_id).toBe("A");
      expect(result.after.stop_id).toBe("C");
    }
  });

  it("picks the LAST at-or-before stop for a click past several stops", () => {
    const result = inferDetourFlanks(base, chainStops, [122.515, 10.615]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.before.stop_id).toBe("B");
      expect(result.after.stop_id).toBe("C");
    }
  });

  it("fails with a precise reason before the first stop, after the last stop, or off the route", () => {
    expect(inferDetourFlanks(base, chainStops, [122.49, 10.59])).toEqual({
      ok: false,
      reason: "before_first",
    });
    expect(inferDetourFlanks(base, chainStops, [122.55, 10.65])).toEqual({
      ok: false,
      reason: "after_last",
    });
    expect(inferDetourFlanks(base, chainStops, [122.9, 10.9])).toEqual({
      ok: false,
      reason: "after_last",
    });
  });

  it("fails with no_stops when fewer than two stops exist", () => {
    expect(
      inferDetourFlanks(base, chainStops.slice(0, 1), [122.505, 10.605]),
    ).toEqual({ ok: false, reason: "no_stops" });
  });
});

describe("inferDetourFlanks — loop routes wrap across the closing arc", () => {
  // A closed loop polyline: the last vertex returns to the first.
  const loop: GeoLineString = {
    type: "LineString",
    coordinates: [
      [122.5, 10.6],
      [122.51, 10.6],
      [122.51, 10.61],
      [122.5, 10.61],
      [122.5, 10.6],
    ],
  };
  const loopStops = [
    { stop_id: "A", name: "A", location: [122.5, 10.6] as [number, number] },
    { stop_id: "B", name: "B", location: [122.51, 10.61] as [number, number] },
    { stop_id: "C", name: "C", location: [122.5, 10.61] as [number, number] },
  ];

  it("flanks a click past the last stop with last → first (the closing arc)", () => {
    const result = inferDetourFlanks(loop, loopStops, [122.495, 10.605]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.before.stop_id).toBe("C"); // chain last
      expect(result.after.stop_id).toBe("A"); // wraps to chain first
    }
  });

  it("wraps chain neighbours for a via-stop click on the chain's last stop", () => {
    const result = inferDetourFlanks(loop, loopStops, [122.5, 10.61]); // C (chain last)
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.viaStop?.stop_id).toBe("C");
      expect(result.before.stop_id).toBe("B");
      expect(result.after.stop_id).toBe("A");
    }
  });
});
