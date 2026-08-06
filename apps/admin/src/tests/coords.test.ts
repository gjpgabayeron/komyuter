import { describe, expect, it } from "vitest";
import type { CoordinatePair } from "@komyuter/shared";
import {
  coordinatesEqual,
  nearestCoordIndex,
  parseCoordinatePair,
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
