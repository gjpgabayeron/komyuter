import { describe, expect, it } from "vitest";
import type { DraftStop } from "@/lib/plottingStore";
import { clearSelection } from "@/lib/selection";
import {
  formatDistance,
  insertionAnchorLabel,
  poiAnchorFor,
  poiDistanceLabel,
  poiMetaLine,
  type PoiAnchor,
} from "@/features/routes/search/formatPoiMeta";

/** The stop a place would be inserted after. */
const anchor: PoiAnchor = {
  index: 3,
  name: "Plaza Libertad",
  location: [122.5656, 10.7202],
};

/** The same place ~995 m north of the anchor. */
const hitLocation: [number, number] = [122.5656, 10.7292];

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

describe("poiAnchorFor (the insertion anchor follows the selection)", () => {
  const stops: DraftStop[] = [
    { id: "s1", name: "Start", type: "terminal", location: [122.55, 10.7] },
    {
      id: "s2",
      name: "Plaza Libertad",
      type: "major_stop",
      location: [122.5656, 10.7202],
    },
  ];

  it("names the selected stop and its 1-based position", () => {
    expect(poiAnchorFor({ type: "stop", stopId: "s2" }, stops)).toEqual({
      index: 2,
      name: "Plaza Libertad",
      location: [122.5656, 10.7202],
    });
  });

  it("re-points when the selection changes", () => {
    expect(poiAnchorFor({ type: "stop", stopId: "s1" }, stops)?.index).toBe(1);
    expect(poiAnchorFor({ type: "stop", stopId: "s2" }, stops)?.index).toBe(2);
  });

  it("has no anchor when nothing is selected or the stop is gone", () => {
    expect(poiAnchorFor(clearSelection, stops)).toBeNull();
    expect(poiAnchorFor({ type: "stop", stopId: "gone" }, stops)).toBeNull();
  });
});

describe("insertionAnchorLabel", () => {
  it("names the stop a place will be inserted after", () => {
    expect(insertionAnchorLabel(anchor)).toBe(
      "Inserting after #3 · Plaza Libertad",
    );
  });

  it("says plainly that the place appends when nothing is selected", () => {
    expect(insertionAnchorLabel(null)).toBe(
      "Appends to end — nothing selected",
    );
  });
});

describe("poiDistanceLabel", () => {
  it("measures from the anchor and states the basis", () => {
    expect(
      poiDistanceLabel({ location: hitLocation, distanceMeters: null }, anchor),
    ).toBe("995 m from #3");
  });

  it("falls back to the camera-relative wire value and states the centre", () => {
    expect(
      poiDistanceLabel({ location: hitLocation, distanceMeters: 2345 }, null),
    ).toBe("2.3 km from centre");
  });

  it("still measures from the anchor when the upstream reports no distance", () => {
    expect(
      poiDistanceLabel({ location: hitLocation, distanceMeters: null }, anchor),
    ).toBe("995 m from #3");
  });

  it("degrades to no distance when the centre value is missing", () => {
    expect(
      poiDistanceLabel({ location: hitLocation, distanceMeters: null }, null),
    ).toBeNull();
  });
});

describe("poiMetaLine", () => {
  it("joins category and an anchor-relative distance", () => {
    expect(
      poiMetaLine(
        { category: "park", location: hitLocation, distanceMeters: null },
        anchor,
      ),
    ).toBe("park · 995 m from #3");
  });

  it("joins category and a centre-relative distance", () => {
    expect(
      poiMetaLine(
        { category: "park", location: hitLocation, distanceMeters: 2345 },
        null,
      ),
    ).toBe("park · 2.3 km from centre");
  });

  it("degrades to whichever part is known", () => {
    expect(
      poiMetaLine(
        {
          category: "shopping mall",
          location: hitLocation,
          distanceMeters: null,
        },
        null,
      ),
    ).toBe("shopping mall");
    expect(
      poiMetaLine(
        { category: null, location: hitLocation, distanceMeters: null },
        anchor,
      ),
    ).toBe("995 m from #3");
  });

  it("is empty when nothing is known", () => {
    expect(
      poiMetaLine(
        { category: null, location: hitLocation, distanceMeters: null },
        null,
      ),
    ).toBe("");
  });
});
