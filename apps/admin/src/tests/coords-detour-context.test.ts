import { describe, expect, it } from "vitest";
import type { GeoLineString } from "@komyuter/shared";
import { buildDetourContextLines, type ProjectedPoint } from "@/lib/coords";

/**
 * Detour-focus route context (detour as primary path): the main polyline is
 * split at the detour's split/merge projections, and the "primary" path is
 * main-before + detour loop + main-after.
 *
 * The Iloilo fixture polyline runs roughly west→east with vertices:
 *   [122.5,10.6] [122.51,10.61] [122.52,10.62] [122.53,10.63]
 * Split at vertex 1 (mid-route), merge at vertex 2.
 */
const MAIN: GeoLineString = {
  type: "LineString",
  coordinates: [
    [122.5, 10.6],
    [122.51, 10.61],
    [122.52, 10.62],
    [122.53, 10.63],
  ],
};

const SPLIT: ProjectedPoint = {
  coordinate: [122.51, 10.61],
  index: 1,
  fraction: 0,
  distanceMeters: 0,
};

const MERGE: ProjectedPoint = {
  coordinate: [122.52, 10.62],
  index: 2,
  fraction: 0,
  distanceMeters: 0,
};

const LOOP: GeoLineString = {
  type: "LineString",
  coordinates: [
    [122.51, 10.61],
    [122.515, 10.615],
    [122.52, 10.62],
  ],
};

describe("buildDetourContextLines (detour-as-primary route context)", () => {
  it("splits the main line into before/replaced/after at split & merge", () => {
    const ctx = buildDetourContextLines(MAIN, SPLIT, MERGE, LOOP);
    expect(ctx).not.toBeNull();
    expect(ctx!.before.coordinates).toEqual([
      [122.5, 10.6],
      [122.51, 10.61],
    ]);
    expect(ctx!.replaced.coordinates).toEqual([
      [122.51, 10.61],
      [122.52, 10.62],
    ]);
    expect(ctx!.after.coordinates).toEqual([
      [122.52, 10.62],
      [122.53, 10.63],
    ]);
  });

  it("builds the primary path as before + detour loop + after (solid)", () => {
    const ctx = buildDetourContextLines(MAIN, SPLIT, MERGE, LOOP);
    expect(ctx!.primary.coordinates).toEqual([
      // before
      [122.5, 10.6],
      [122.51, 10.61],
      // loop
      [122.51, 10.61],
      [122.515, 10.615],
      [122.52, 10.62],
      // after
      [122.52, 10.62],
      [122.53, 10.63],
    ]);
  });

  it("accepts mid-segment split/merge (fractional projections)", () => {
    const ctx = buildDetourContextLines(
      MAIN,
      {
        coordinate: [122.505, 10.605],
        index: 0,
        fraction: 0.5,
        distanceMeters: 0,
      },
      {
        coordinate: [122.525, 10.625],
        index: 2,
        fraction: 0.5,
        distanceMeters: 0,
      },
      LOOP,
    );
    expect(ctx).not.toBeNull();
    expect(ctx!.before.coordinates[ctx!.before.coordinates.length - 1]).toEqual(
      [122.505, 10.605],
    );
    expect(ctx!.after.coordinates[0]).toEqual([122.525, 10.625]);
  });

  it("handles same-segment split+merge (both fractional on one segment)", () => {
    const ctx = buildDetourContextLines(
      MAIN,
      {
        coordinate: [122.505, 10.605],
        index: 0,
        fraction: 0.5,
        distanceMeters: 0,
      },
      {
        coordinate: [122.515, 10.615],
        index: 0,
        fraction: 1.5,
        distanceMeters: 0,
      },
      LOOP,
    );
    // Both project to segment 0 → replaced is just [split, merge], before
    // ends at split, after starts at merge (no middle vertices to slice).
    expect(ctx).not.toBeNull();
    expect(ctx!.replaced.coordinates).toEqual([
      [122.505, 10.605],
      [122.515, 10.615],
    ]);
    expect(ctx!.before.coordinates[ctx!.before.coordinates.length - 1]).toEqual(
      [122.505, 10.605],
    );
    expect(ctx!.after.coordinates[0]).toEqual([122.515, 10.615]);
  });

  it("handles split at vertex 0 and merge at the last vertex", () => {
    const last = MAIN.coordinates[MAIN.coordinates.length - 1];
    const ctx = buildDetourContextLines(
      MAIN,
      { coordinate: [122.5, 10.6], index: 0, fraction: 0, distanceMeters: 0 },
      { coordinate: last, index: 3, fraction: 0, distanceMeters: 0 },
      LOOP,
    );
    expect(ctx).not.toBeNull();
    // before is a single point (the split vertex), after a single point.
    expect(ctx!.before.coordinates).toEqual([[122.5, 10.6]]);
    expect(ctx!.after.coordinates).toEqual([last]);
  });

  it("returns null when split is AFTER merge (out of travel order)", () => {
    expect(buildDetourContextLines(MAIN, MERGE, SPLIT, LOOP)).toBeNull();
  });

  it("returns null for degenerate inputs", () => {
    expect(
      buildDetourContextLines(
        { type: "LineString", coordinates: [[122.5, 10.6]] },
        SPLIT,
        MERGE,
        LOOP,
      ),
    ).toBeNull();
    expect(
      buildDetourContextLines(MAIN, SPLIT, MERGE, {
        type: "LineString",
        coordinates: [[122.51, 10.61]],
      }),
    ).toBeNull();
  });
});
