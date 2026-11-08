import type { GeoLineString } from "@komyuter/shared";
import { describe, expect, it } from "vitest";

import {
  nearestVertexIndex,
  normalizeRange,
  restrictionLine,
  restrictionRangeLabel,
  rangeCoordinates,
} from "@/features/restrictions/restrictionHelpers";

// A straight north-south line: indices 0..3.
const line: GeoLineString = {
  type: "LineString" as const,
  coordinates: [
    [122.5, 10.7],
    [122.5, 10.71],
    [122.5, 10.72],
    [122.5, 10.73],
  ],
};

describe("restriction geometry", () => {
  it("returns the exact vertex when the click is on it", () => {
    expect(nearestVertexIndex([122.5, 10.71], line)).toBe(1);
  });

  it("rounds a click along a segment to the nearer endpoint", () => {
    expect(nearestVertexIndex([122.5, 10.711], line)).toBe(1);
    expect(nearestVertexIndex([122.5, 10.719], line)).toBe(2);
  });

  it("returns null for a line with no coordinates", () => {
    expect(
      nearestVertexIndex([122.5, 10.7], {
        type: "LineString" as const,
        coordinates: [],
      }),
    ).toBeNull();
  });

  it("normalizes a reversed range", () => {
    expect(normalizeRange(3, 1)).toEqual({ from: 1, to: 3 });
    expect(normalizeRange(1, 3)).toEqual({ from: 1, to: 3 });
  });

  it("slices the polyline inclusively", () => {
    expect(rangeCoordinates(line, 1, 2)).toEqual([
      [122.5, 10.71],
      [122.5, 10.72],
    ]);
    expect(rangeCoordinates(line, 2, 1)).toEqual([
      [122.5, 10.71],
      [122.5, 10.72],
    ]);
  });

  it("builds a restriction line from its indices", () => {
    expect(
      restrictionLine(line, {
        from_coord_index: 0,
        to_coord_index: 1,
      }).coordinates,
    ).toEqual([
      [122.5, 10.7],
      [122.5, 10.71],
    ]);
  });

  it("labels a normalized range", () => {
    expect(
      restrictionRangeLabel({ from_coord_index: 4, to_coord_index: 2 }),
    ).toBe("Vertices 2–4");
  });
});
