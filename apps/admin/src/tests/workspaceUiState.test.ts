import { describe, expect, it } from "vitest";
import { deriveUiState } from "@/lib/plottingStore";

/** The four-state machine (empty / overview / focus / edit) — pure derivation. */
describe("deriveUiState (workspace state machine)", () => {
  const base = {
    loaded: true,
    routeCount: 3,
    routeId: null,
    focusedRouteId: null,
  };

  it("empty: loaded with zero routes", () => {
    expect(deriveUiState({ ...base, routeCount: 0 })).toBe("empty");
  });

  it("overview: loaded with routes, nothing focused or opened", () => {
    expect(deriveUiState(base)).toBe("overview");
  });

  it("focus: a route is focused from the map (peek)", () => {
    expect(deriveUiState({ ...base, focusedRouteId: "route-9" })).toBe("focus");
  });

  it("edit: an opened route wins over focus", () => {
    expect(
      deriveUiState({ ...base, focusedRouteId: "route-9", routeId: "route-9" }),
    ).toBe("edit");
  });

  it("overview while data is still loading (empty is never flashed)", () => {
    expect(
      deriveUiState({
        loaded: false,
        routeCount: 0,
        routeId: null,
        focusedRouteId: null,
      }),
    ).toBe("overview");
  });
});
