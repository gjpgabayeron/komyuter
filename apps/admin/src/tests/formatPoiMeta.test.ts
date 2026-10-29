import { describe, expect, it } from "vitest";
import {
  formatDistance,
  poiMetaLine,
} from "@/features/routes/search/formatPoiMeta";

describe("formatDistance", () => {
  it("keeps metres below a kilometre", () => {
    expect(formatDistance(0)).toBe("0 m");
    expect(formatDistance(634)).toBe("634 m");
    expect(formatDistance(999)).toBe("999 m");
  });

  it("switches to one decimal kilometre from 1 km", () => {
    expect(formatDistance(1000)).toBe("1.0 km");
    expect(formatDistance(1696)).toBe("1.7 km");
    expect(formatDistance(2410)).toBe("2.4 km");
  });

  it("returns null when Mapbox omitted the distance", () => {
    expect(formatDistance(null)).toBeNull();
    expect(formatDistance(undefined)).toBeNull();
    expect(formatDistance(Number.NaN)).toBeNull();
  });
});

describe("poiMetaLine", () => {
  it("joins the category and the distance", () => {
    expect(poiMetaLine({ category: "park", distanceMeters: 1011 })).toBe(
      "park · 1.0 km",
    );
  });

  it("degrades to whichever part is known", () => {
    expect(
      poiMetaLine({ category: "shopping mall", distanceMeters: null }),
    ).toBe("shopping mall");
    expect(poiMetaLine({ category: null, distanceMeters: 640 })).toBe("640 m");
  });

  it("is empty when nothing is known", () => {
    expect(poiMetaLine({ category: null, distanceMeters: null })).toBe("");
  });
});
