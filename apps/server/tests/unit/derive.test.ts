import { describe, expect, it } from "vitest";
import type { CoordinatePair, GeoLineString } from "@komyuter/shared";
import {
  buildDerivedReturn,
  coordinatesDistanceMeters,
  deriveReturnLabel,
  normalizeStopOrder,
  pathEndpointsOnStops,
  reverseCoordinates,
  type PlotStopInput,
} from "../../src/domain/derive";

const A: CoordinatePair = [122.5, 10.6];
const B: CoordinatePair = [122.52, 10.62];
const C: CoordinatePair = [122.54, 10.64];

function stop(
  name: string,
  location: CoordinatePair,
  stop_order?: number,
): PlotStopInput {
  return {
    name,
    type: "terminal",
    location: { type: "Point", coordinates: location },
    stop_order,
  };
}

describe("reverseCoordinates", () => {
  it("returns a reversed copy without mutating the input", () => {
    const input: CoordinatePair[] = [A, B, C];
    const result = reverseCoordinates(input);
    expect(result).toEqual([C, B, A]);
    expect(input).toEqual([A, B, C]);
    expect(result).not.toBe(input);
  });
});

describe("coordinatesDistanceMeters", () => {
  it("is 0 for identical points", () => {
    expect(coordinatesDistanceMeters(A, A)).toBe(0);
  });

  it("approximates a 0.001° latitude step (~111 m)", () => {
    const d = coordinatesDistanceMeters([122.5, 10.6], [122.5, 10.601]);
    expect(d).toBeGreaterThan(100);
    expect(d).toBeLessThan(130);
  });

  it("is symmetric", () => {
    expect(coordinatesDistanceMeters(A, B)).toBeCloseTo(
      coordinatesDistanceMeters(B, A),
      6,
    );
  });
});

describe("deriveReturnLabel", () => {
  it('produces "To {first stop name}"', () => {
    expect(deriveReturnLabel([{ name: "City Hall" }, { name: "Port" }])).toBe(
      "To City Hall",
    );
  });
});

describe("buildDerivedReturn", () => {
  const polyline: GeoLineString = {
    type: "LineString",
    coordinates: [A, B, C],
  };
  const base = {
    label: "Outbound",
    polyline,
    stops: [stop("City Hall", A, 1), stop("Port", C, 2)],
  };

  it("reverses the polyline coordinates", () => {
    expect(buildDerivedReturn(base).polyline.coordinates).toEqual([C, B, A]);
  });

  it("derives the return label from the first base stop", () => {
    expect(buildDerivedReturn(base).label).toBe("To City Hall");
  });

  it("reverses stop order and renumbers stop_order from 1", () => {
    const derived = buildDerivedReturn(base);
    expect(derived.stops.map((s) => s.name)).toEqual(["Port", "City Hall"]);
    expect(derived.stops.map((s) => s.stop_order)).toEqual([1, 2]);
  });

  it("never reuses the base stop objects or their location objects", () => {
    const derived = buildDerivedReturn(base);
    expect(derived.stops[1]).not.toBe(base.stops[0]);
    expect(derived.stops[1].location).not.toBe(base.stops[0].location);
  });

  it("does not mutate the base polyline or stops", () => {
    buildDerivedReturn(base);
    expect(polyline.coordinates).toEqual([A, B, C]);
    expect(base.stops.map((s) => s.name)).toEqual(["City Hall", "Port"]);
  });
});

describe("pathEndpointsOnStops", () => {
  it("accepts a path whose ends match the first and last stops", () => {
    const polyline: GeoLineString = {
      type: "LineString",
      coordinates: [A, B, C],
    };
    expect(
      pathEndpointsOnStops(polyline, [stop("A", A), stop("B", C)]),
    ).toEqual({ ok: true });
  });

  it("rejects a path starting far from the first stop", () => {
    const polyline: GeoLineString = {
      type: "LineString",
      coordinates: [[122.6, 10.7], B, C],
    };
    const result = pathEndpointsOnStops(polyline, [stop("A", A), stop("B", C)]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("start_mismatch");
      expect(result.distanceMeters).toBeGreaterThan(1000);
    }
  });

  it("rejects a path ending far from the last stop", () => {
    const polyline: GeoLineString = {
      type: "LineString",
      coordinates: [A, B, [122.6, 10.7]],
    };
    const result = pathEndpointsOnStops(polyline, [stop("A", A), stop("B", C)]);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("end_mismatch");
    }
  });

  it("rejects fewer than 2 stops", () => {
    const polyline: GeoLineString = { type: "LineString", coordinates: [A, B] };
    expect(pathEndpointsOnStops(polyline, [stop("Only", A)]).ok).toBe(false);
  });
});

describe("normalizeStopOrder", () => {
  it("renumbers stops 1..n in array order", () => {
    const result = normalizeStopOrder([stop("X", A, 9), stop("Y", C, 3)]);
    expect(result.map((s) => s.stop_order)).toEqual([1, 2]);
  });
});
