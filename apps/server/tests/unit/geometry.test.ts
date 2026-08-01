import { describe, expect, it } from "vitest";
import {
  validateGeoLineString,
  validateGeoPoint,
} from "../../src/domain/geometry";

describe("validateGeoPoint", () => {
  it("accepts a valid [lng, lat] point", () => {
    const result = validateGeoPoint({
      type: "Point",
      coordinates: [121.0, 14.6],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({
        type: "Point",
        coordinates: [121.0, 14.6],
      });
    }
  });

  it("accepts boundary values", () => {
    const result = validateGeoPoint({ type: "Point", coordinates: [180, -90] });
    expect(result.ok).toBe(true);
  });

  it("rejects out-of-range longitude", () => {
    const result = validateGeoPoint({
      type: "Point",
      coordinates: [181, 14.6],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues[0].path).toEqual(["coordinates", 0]);
      expect(result.issues[0].message).toContain("longitude");
    }
  });

  it("rejects out-of-range latitude", () => {
    const result = validateGeoPoint({
      type: "Point",
      coordinates: [121.0, -91],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues[0].path).toEqual(["coordinates", 1]);
      expect(result.issues[0].message).toContain("latitude");
    }
  });

  it("accepts in-range pairs regardless of presumed order (range is the enforceable check)", () => {
    const result = validateGeoPoint({
      type: "Point",
      coordinates: [14.6, 88.0],
    });
    expect(result.ok).toBe(true);
  });

  it("rejects non-finite coordinates", () => {
    const result = validateGeoPoint({
      type: "Point",
      coordinates: [NaN, 14.6],
    });
    expect(result.ok).toBe(false);
  });

  it("rejects non-geometry payloads", () => {
    const result = validateGeoPoint({ type: "Polygon", coordinates: [] });
    expect(result.ok).toBe(false);
    expect(validateGeoPoint(null).ok).toBe(false);
    expect(validateGeoPoint("nope").ok).toBe(false);
  });
});

describe("validateGeoLineString", () => {
  it("accepts a valid LineString with 2+ points", () => {
    const result = validateGeoLineString({
      type: "LineString",
      coordinates: [
        [121.0, 14.6],
        [121.1, 14.7],
      ],
    });
    expect(result.ok).toBe(true);
  });

  it("rejects a LineString with fewer than 2 points", () => {
    const result = validateGeoLineString({
      type: "LineString",
      coordinates: [[121.0, 14.6]],
    });
    expect(result.ok).toBe(false);
  });

  it("rejects out-of-range coordinates with per-point paths", () => {
    const result = validateGeoLineString({
      type: "LineString",
      coordinates: [
        [181.0, 14.6],
        [121.1, 14.7],
      ],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues[0].path).toEqual(["coordinates", 0, 0]);
    }
  });

  it("rejects non-geometry payloads", () => {
    expect(validateGeoLineString({ type: "Feature", geometry: {} }).ok).toBe(
      false,
    );
    expect(validateGeoLineString(undefined).ok).toBe(false);
  });
});
