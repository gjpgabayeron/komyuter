import { describe, expect, it } from "vitest";
import type { GeoLineString, GeoPoint } from "@komyuter/shared";
import { ApiError } from "../../src/api/errors";
import {
  assertDetourLoopEndpoints,
  DETOUR_ON_LINE_TOLERANCE_METERS,
} from "../../src/domain/validation";

const ENTRY: GeoPoint = { type: "Point", coordinates: [122.5, 10.6] };
const EXIT: GeoPoint = { type: "Point", coordinates: [122.52, 10.62] };

/** A loop that diverts through an off-line waypoint between START and END. */
function loop(start: GeoPoint, end: GeoPoint): GeoLineString {
  return {
    type: "LineString",
    coordinates: [start.coordinates, [122.505, 10.605], end.coordinates],
  };
}

/** Asserts the action throws the domain VALIDATION_ERROR (422) containing
 *  `messagePart`. */
function expectDetourValidation(action: () => void, messagePart: string): void {
  try {
    action();
    throw new Error("expected assertDetourLoopEndpoints to throw");
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError);
    if (error instanceof ApiError) {
      expect(error.code).toBe("VALIDATION_ERROR");
      expect(error.message).toContain(messagePart);
    }
  }
}

describe("assertDetourLoopEndpoints (FR-023, SC-014)", () => {
  it("accepts a loop whose start and end coincide with entry and exit", () => {
    expect(() =>
      assertDetourLoopEndpoints(loop(ENTRY, EXIT), ENTRY, EXIT),
    ).not.toThrow();
  });

  it("accepts exact matches at the tolerance boundary", () => {
    expect(() =>
      assertDetourLoopEndpoints(
        loop(ENTRY, EXIT),
        ENTRY,
        EXIT,
        DETOUR_ON_LINE_TOLERANCE_METERS,
      ),
    ).not.toThrow();
  });

  it("rejects a loop whose start drifts far from entry", () => {
    const driftedStart: GeoPoint = {
      type: "Point",
      coordinates: [122.51, 10.61],
    };
    expectDetourValidation(
      () => assertDetourLoopEndpoints(loop(driftedStart, EXIT), ENTRY, EXIT),
      "Detour loop start",
    );
  });

  it("rejects a loop whose end drifts far from exit", () => {
    const driftedEnd: GeoPoint = {
      type: "Point",
      coordinates: [122.51, 10.61],
    };
    expectDetourValidation(
      () => assertDetourLoopEndpoints(loop(ENTRY, driftedEnd), ENTRY, EXIT),
      "Detour loop end",
    );
  });

  it("rejects a degenerate detour whose entry and exit coincide", () => {
    expectDetourValidation(
      () => assertDetourLoopEndpoints(loop(ENTRY, ENTRY), ENTRY, ENTRY),
      "degenerate",
    );
  });
});
