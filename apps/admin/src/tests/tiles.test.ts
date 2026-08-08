import { describe, expect, it } from "vitest";
import { baseMapStyleFor } from "@/lib/tiles";

describe("basemap styles (commercial-safe OpenFreeMap)", () => {
  it("default uses OpenFreeMap bright", () => {
    expect(baseMapStyleFor("default")).toBe(
      "https://tiles.openfreemap.org/styles/bright",
    );
  });

  it("minimalist uses OpenFreeMap positron (light, POI-free vector style)", () => {
    expect(baseMapStyleFor("minimalist")).toBe(
      "https://tiles.openfreemap.org/styles/positron",
    );
  });

  it("3d uses OpenFreeMap liberty (the 3D effect is a tilted camera, not a style)", () => {
    expect(baseMapStyleFor("3d")).toBe(
      "https://tiles.openfreemap.org/styles/liberty",
    );
  });

  it("every style resolves to a distinct provider style", () => {
    const urls = (["default", "minimalist", "3d"] as const).map((s) =>
      baseMapStyleFor(s),
    );
    expect(new Set(urls).size).toBe(3);
    urls.forEach((url) => expect(url).toMatch(/tiles\.openfreemap\.org/));
  });
});
