import { describe, expect, it } from "vitest";
import { rightPlateFor } from "@/features/routes/search/rightPlate";

describe("rightPlateFor (which plate the right column shows)", () => {
  it("shows properties when no search session is running", () => {
    expect(
      rightPlateFor({
        searchActive: false,
        candidateCount: 0,
        hasStatus: false,
      }),
    ).toBe("properties");
    // Stale results from a finished session must not keep the column.
    expect(
      rightPlateFor({
        searchActive: false,
        candidateCount: 4,
        hasStatus: true,
      }),
    ).toBe("properties");
  });

  it("shows the results plate for an ambiguous answer", () => {
    expect(
      rightPlateFor({
        searchActive: true,
        candidateCount: 3,
        hasStatus: false,
      }),
    ).toBe("search");
  });

  it("shows the results plate when the answer is empty but explained", () => {
    // With the pill's dropdown gone, no_token / out_of_area / request_failed
    // have nowhere else to be said.
    expect(
      rightPlateFor({ searchActive: true, candidateCount: 0, hasStatus: true }),
    ).toBe("search");
  });

  it("collapses the column for a confident single hit", () => {
    // The marker and the camera are the answer; the column stays out of the way.
    expect(
      rightPlateFor({
        searchActive: true,
        candidateCount: 0,
        hasStatus: false,
      }),
    ).toBe("none");
  });
});
