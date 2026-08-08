import { describe, expect, it } from "vitest";
import type { CoordinatePair } from "@komyuter/shared";
import {
  findOppositeOverlapRuns,
  shiftOverlapRuns,
  OVERLAP_OFFSET_METERS,
} from "@/lib/overlap";

/**
 * Flat-earth helpers at a fixed Iloilo-scale latitude. One degree of latitude
 * ≈ 111,320 m; one degree of longitude ≈ 111,320 · cos(lat).
 */
const M_PER_DEG_LAT = 111_320;
const BASE_LAT = 10.7;
const perDegLng = M_PER_DEG_LAT * Math.cos((BASE_LAT * Math.PI) / 180);

/** Step between test vertices (~22 m). */
const STEP = 0.0002;
const BASE: CoordinatePair = [122.5, BASE_LAT];

/** A northbound polyline with `count` vertices spaced ~22 m apart. */
function northLine(
  count: number,
  from: CoordinatePair = BASE,
): CoordinatePair[] {
  return Array.from({ length: count }, (_, i) => [from[0], from[1] + i * STEP]);
}

/** The same line shifted east by `meters` (a parallel street). */
function shiftedEast(line: CoordinatePair[], meters: number): CoordinatePair[] {
  const dLng = meters / perDegLng;
  return line.map(([lng, lat]) => [lng + dLng, lat]);
}

describe("findOppositeOverlapRuns", () => {
  it("matches two routes traversing the same road in opposite directions", () => {
    const north = northLine(20);
    const south = [...north].reverse();
    const runs = findOppositeOverlapRuns([
      { routeId: "A", coords: north },
      { routeId: "B", coords: south },
    ]);
    const a = runs.find((r) => r.routeId === "A");
    const b = runs.find((r) => r.routeId === "B");
    expect(a?.runs).toHaveLength(1);
    expect(a?.runs[0]).toEqual({ start: 0, end: 19 });
    expect(b?.runs).toHaveLength(1);
    expect(b?.runs[0]).toEqual({ start: 0, end: 19 });
  });

  it("ignores same-direction convoys on the same road", () => {
    const north = northLine(20);
    const runs = findOppositeOverlapRuns([
      { routeId: "A", coords: north },
      { routeId: "B", coords: [...north] },
    ]);
    expect(runs).toEqual([]);
  });

  it("ignores genuinely different parallel roads outside tolerance", () => {
    const north = northLine(20);
    const parallel = shiftedEast(north, 40);
    const runs = findOppositeOverlapRuns([
      { routeId: "A", coords: north },
      { routeId: "B", coords: [...parallel].reverse() },
    ]);
    expect(runs).toEqual([]);
  });

  it("limits each run to the shared stretch of a partial overlap", () => {
    // A is long; B overlaps only A's middle ten vertices, reversed.
    const aCoords = northLine(30);
    const bCoords = [...aCoords.slice(10, 20)].reverse();
    const runs = findOppositeOverlapRuns([
      { routeId: "A", coords: aCoords },
      { routeId: "B", coords: bCoords },
    ]);
    const a = runs.find((r) => r.routeId === "A");
    const b = runs.find((r) => r.routeId === "B");
    expect(a?.runs).toEqual([{ start: 10, end: 19 }]);
    expect(b?.runs).toEqual([{ start: 0, end: 9 }]);
  });

  it("detects a loop doubling back on itself (self-overlap)", () => {
    // Go north 25 vertices, then return south along the exact same line.
    const out = northLine(25);
    const back = [...out].reverse();
    const coords = [...out, ...back];
    const runs = findOppositeOverlapRuns([{ routeId: "S", coords }]);
    const s = runs.find((r) => r.routeId === "S");
    expect(s?.runs).toHaveLength(2);
    // One run on the outbound pass (0..21) and one on the inbound pass
    // (28..49). The turnaround vertex (index 24/25, duplicated at the turn)
    // itself must NOT be treated as overlap — its along-line distance to the
    // adjacent pass is below the self-overlap gate.
    const starts = (s?.runs ?? []).map((r) => r.start).sort((a, b) => a - b);
    const ends = (s?.runs ?? []).map((r) => r.end).sort((a, b) => a - b);
    expect(starts).toEqual([0, 28]);
    expect(ends).toEqual([21, 49]);
  });

  it("returns [] for a single straight polyline with no backtracking", () => {
    const runs = findOppositeOverlapRuns([
      { routeId: "S", coords: northLine(25) },
    ]);
    expect(runs).toEqual([]);
  });
});

describe("shiftOverlapRuns", () => {
  it("returns the input unchanged when there are no runs", () => {
    const north = northLine(20);
    expect(shiftOverlapRuns(north, [])).toBe(north);
  });

  it("shifts overlapping vertices right of travel with a full-offset plateau", () => {
    const north = northLine(20);
    const south = [...north].reverse();
    const runs = findOppositeOverlapRuns([
      { routeId: "A", coords: north },
      { routeId: "B", coords: south },
    ]);
    const aRuns = runs.find((r) => r.routeId === "A")!.runs;
    const shifted = shiftOverlapRuns(north, aRuns);

    // Northbound right-of-travel is EAST: the plateau vertex moves +6 m lng.
    const expectedDlng = OVERLAP_OFFSET_METERS / perDegLng;
    const mid = 10;
    expect(
      Math.abs(shifted[mid][0] - north[mid][0] - expectedDlng),
    ).toBeLessThan(expectedDlng * 0.05);
    // Latitude must not move for a pure eastward shift.
    expect(Math.abs(shifted[mid][1] - north[mid][1])).toBeLessThan(1e-12);

    // Southbound right-of-travel is WEST.
    const bRuns = runs.find((r) => r.routeId === "B")!.runs;
    const shiftedSouth = shiftOverlapRuns(south, bRuns);
    expect(shiftedSouth[mid][0]).toBeLessThan(south[mid][0]);

    // Run ends are tapered to zero: the first vertex is untouched.
    expect(shifted[0]).toEqual(north[0]);
    expect(shifted[19]).toEqual(north[19]);
  });

  it("keeps vertices outside the run untouched", () => {
    const aCoords = northLine(30);
    const bCoords = [...aCoords.slice(10, 20)].reverse();
    const runs = findOppositeOverlapRuns([
      { routeId: "A", coords: aCoords },
      { routeId: "B", coords: bCoords },
    ]);
    const aRuns = runs.find((r) => r.routeId === "A")!.runs;
    const shifted = shiftOverlapRuns(aCoords, aRuns);
    expect(shifted[0]).toEqual(aCoords[0]);
    expect(shifted[29]).toEqual(aCoords[29]);
    // The plateau vertex inside the run is fully shifted.
    const expectedDlng = OVERLAP_OFFSET_METERS / perDegLng;
    expect(shifted[15][0] - aCoords[15][0]).toBeCloseTo(expectedDlng, 6);
  });

  it("shifts the two passes of a self-overlap to opposite sides", () => {
    const out = northLine(25);
    const back = [...out].reverse();
    const coords = [...out, ...back];
    const runs = findOppositeOverlapRuns([{ routeId: "S", coords }]);
    const s = runs.find((r) => r.routeId === "S")!;
    const shifted = shiftOverlapRuns(coords, s.runs);

    // Outbound plateau vertex (index 10): shifted east.
    expect(shifted[10][0]).toBeGreaterThan(coords[10][0]);
    // Inbound pass vertex (index 35 = back[10]): shifted west.
    expect(shifted[35][0]).toBeLessThan(coords[35][0]);
  });
});
