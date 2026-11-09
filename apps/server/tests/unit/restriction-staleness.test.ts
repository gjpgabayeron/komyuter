import { describe, expect, it } from "vitest";
import { findStaleRestrictionWarnings } from "../../src/domain/validation";

const line = (coordinates: [number, number][]) => ({
  type: "LineString" as const,
  coordinates,
});

const restriction = {
  restriction_id: "restriction-1",
  from_coord_index: 1,
  to_coord_index: 2,
};

describe("findStaleRestrictionWarnings", () => {
  it("does not warn when the covered coordinates are unchanged", () => {
    expect(
      findStaleRestrictionWarnings(
        "dir-1",
        line([
          [0, 0],
          [1, 0],
          [2, 0],
          [3, 0],
        ]),
        line([
          [0, 0],
          [1, 0],
          [2, 0],
          [3, 0],
        ]),
        [restriction],
      ),
    ).toEqual([]);
  });

  it("warns when the range no longer fits the new polyline", () => {
    const warnings = findStaleRestrictionWarnings(
      "dir-1",
      line([
        [0, 0],
        [1, 0],
        [2, 0],
        [3, 0],
      ]),
      line([
        [0, 0],
        [1, 0],
      ]),
      [restriction],
    );
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain(restriction.restriction_id);
    expect(warnings[0]).toContain("new polyline has indices [0, 1]");
  });

  it("warns when the same indices cover a different stretch", () => {
    const warnings = findStaleRestrictionWarnings(
      "dir-1",
      line([
        [0, 0],
        [1, 0],
        [2, 0],
        [3, 0],
      ]),
      line([
        [0, 0],
        [1, 1],
        [2, 0],
        [3, 0],
      ]),
      [restriction],
    );
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("no longer covers the same stretch");
  });

  it("does not warn for a change outside the restriction range", () => {
    const outside = { ...restriction, from_coord_index: 0, to_coord_index: 1 };
    const warnings = findStaleRestrictionWarnings(
      "dir-1",
      line([
        [0, 0],
        [1, 0],
        [2, 0],
        [3, 0],
      ]),
      line([
        [0, 0],
        [1, 0],
        [2, 1],
        [3, 0],
      ]),
      [outside],
    );
    expect(warnings).toEqual([]);
  });

  it("skips the moved check when there is no old polyline", () => {
    expect(
      findStaleRestrictionWarnings(
        "dir-1",
        null,
        line([
          [0, 0],
          [1, 0],
          [2, 0],
        ]),
        [restriction],
      ),
    ).toEqual([]);
  });
});
