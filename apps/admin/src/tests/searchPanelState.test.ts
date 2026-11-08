import { describe, expect, it } from "vitest";
import { searchPanelState } from "@/features/routes/search/panelState";

describe("searchPanelState (the plate's five answers)", () => {
  it("loading wins while a query is in flight, even over a stale answer", () => {
    expect(
      searchPanelState({ loading: true, candidateCount: 0, status: null }),
    ).toBe("loading");
    expect(
      searchPanelState({
        loading: true,
        candidateCount: 4,
        status: "upstream_error",
      }),
    ).toBe("loading");
  });

  it("results when the answer has rows", () => {
    expect(
      searchPanelState({ loading: false, candidateCount: 3, status: null }),
    ).toBe("results");
  });

  it("empty-but-valid when the upstream answered and the scope kept nothing", () => {
    expect(
      searchPanelState({
        loading: false,
        candidateCount: 0,
        status: "out_of_area",
      }),
    ).toBe("empty");
  });

  it("unavailable names each of the three causes", () => {
    for (const status of [
      "no_token",
      "upstream_error",
      "request_failed",
    ] as const) {
      expect(
        searchPanelState({ loading: false, candidateCount: 0, status }),
      ).toBe("unavailable");
    }
  });

  it("absent on a confident single hit: no plate, the map answers", () => {
    expect(
      searchPanelState({ loading: false, candidateCount: 0, status: null }),
    ).toBe("absent");
  });
});
