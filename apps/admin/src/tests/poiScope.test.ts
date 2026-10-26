import { describe, expect, it } from "vitest";
import type { GeocodeHit } from "@komyuter/shared";
import type { MapViewport } from "@/lib/plottingStore";
import {
  AREA_SEARCH_THRESHOLD,
  candidatesToDraw,
  distanceMeters,
  expandBounds,
  pinSizeForZoom,
  scopeHits,
  scopeToNearestCluster,
  shouldOfferAreaSearch,
} from "@/features/routes/poiScope";

const CENTRE = { longitude: 122.5656, latitude: 10.7202 };

/** A ~2 km box around Iloilo centre. */
const viewport: MapViewport = {
  ...CENTRE,
  zoom: 14,
  bounds: { west: 122.5476, south: 10.7022, east: 122.5836, north: 10.7382 },
};

function hit(name: string, location: [number, number]): GeocodeHit {
  return { id: name, name, description: "Iloilo City", location };
}

const inView = hit("Jaro Plaza", [122.5562, 10.7248]);
const justOutside = hit("Somewhere Near", [122.6, 10.7248]);
const farAway = hit("SM City Iloilo", [122.5511, 10.7145]);

describe("expandBounds", () => {
  it("grows the box around its centre", () => {
    const box = expandBounds(viewport.bounds, 2);
    expect(box.west).toBeCloseTo(122.5296, 4);
    expect(box.east).toBeCloseTo(122.6016, 4);
    expect(box.south).toBeCloseTo(10.6842, 4);
    expect(box.north).toBeCloseTo(10.7562, 4);
  });
});

describe("scopeHits", () => {
  it("keeps what is in view and drops what is far outside it", () => {
    const beyond = hit("Far Town", [122.95, 10.7248]);
    const scoped = scopeHits("plaza", [inView, farAway, beyond], viewport);
    expect(scoped.map((h) => h.name)).toEqual(["Jaro Plaza", "SM City Iloilo"]);
  });

  it("keeps a hit just off screen, thanks to the slack", () => {
    // ~3.2 km east of centre: outside the screen, inside the expanded box.
    const scoped = scopeHits("somewhere", [justOutside], viewport);
    expect(scoped).toHaveLength(1);
  });

  it("drops a hit beyond the slack", () => {
    // ~40 km east: beyond even the expanded box. The query does not name it, so
    // the exact-name exemption does not apply.
    const beyond = hit("Far Town", [122.95, 10.7248]);
    expect(scopeHits("town", [beyond], viewport)).toEqual([]);
  });

  it("never hides a hit whose name is the query", () => {
    const beyond = hit("Guimaras Wharf", [122.95, 10.7248]);
    // The name matches, so the plotter can still find it from elsewhere.
    expect(scopeHits("guimaras wharf", [beyond], viewport)).toHaveLength(1);
    // …but a different query does not get that exemption.
    expect(scopeHits("wharf", [beyond], viewport)).toEqual([]);
  });

  it("hides nothing before the camera has reported", () => {
    expect(scopeHits("plaza", [farAway], null)).toEqual([farAway]);
  });
});

describe("distanceMeters", () => {
  it("measures about a kilometre per 0.009° of latitude", () => {
    const metres = distanceMeters([122.5656, 10.7202], [122.5656, 10.7292]);
    expect(metres).toBeGreaterThan(950);
    expect(metres).toBeLessThan(1050);
    expect(distanceMeters([122.5656, 10.7202], [122.5656, 10.7202])).toBe(0);
  });
});

describe("scopeToNearestCluster (first query of a session)", () => {
  const camera = { longitude: 122.5656, latitude: 10.7202 };

  it("anchors on the hit nearest the camera, not the first in the list", () => {
    const farFirst = hit("Far First", [122.95, 10.72]); // ~42 km east
    const near = hit("Near", [122.566, 10.7205]); // ~50 m
    const nearTwo = hit("Near Two", [122.568, 10.7215]); // ~300 m
    const kept = scopeToNearestCluster(
      "plaza",
      [farFirst, near, nearTwo],
      camera,
    );
    expect(kept.map((h) => h.name)).toEqual(["Near", "Near Two"]);
  });

  it("drops a namesake beyond the cluster radius", () => {
    const anchor = hit("SM City Iloilo", [122.5511, 10.7144]);
    const namesake = hit("SM City Cebu", [123.8854, 10.3157]); // ~180 km
    const kept = scopeToNearestCluster("sm", [anchor, namesake], camera);
    expect(kept.map((h) => h.name)).toEqual(["SM City Iloilo"]);
  });

  it("keeps an exact name match even when it sits outside the radius", () => {
    const anchor = hit("SM Delgado", [122.5671, 10.6986]);
    const target = hit("Guimaras Wharf", [122.6, 10.7]); // ~3.6 km from anchor
    const kept = scopeToNearestCluster(
      "Guimaras Wharf",
      [anchor, target],
      camera,
    );
    expect(kept.map((h) => h.name)).toContain("Guimaras Wharf");
  });

  it("hides nothing without a camera, and nothing survives an empty answer", () => {
    const only = hit("Jaro Plaza", [122.5562, 10.7248]);
    expect(scopeToNearestCluster("plaza", [only], null)).toEqual([only]);
    expect(scopeToNearestCluster("plaza", [], camera)).toEqual([]);
  });
});

describe("pinSizeForZoom", () => {
  it("uses the base size at the default city zoom", () => {
    expect(pinSizeForZoom(13)).toBe(34);
  });

  it("grows when zooming in and shrinks when zooming out", () => {
    expect(pinSizeForZoom(16)).toBeGreaterThan(pinSizeForZoom(13));
    expect(pinSizeForZoom(10)).toBeLessThan(pinSizeForZoom(13));
  });

  it("clamps at both ends so a pin never vanishes or swamps the map", () => {
    expect(pinSizeForZoom(30)).toBe(52);
    expect(pinSizeForZoom(0)).toBe(28);
  });

  it("falls back to the base size without a camera", () => {
    expect(pinSizeForZoom(null)).toBe(34);
    expect(pinSizeForZoom(undefined)).toBe(34);
  });
});

describe("candidatesToDraw", () => {
  const jaro = hit("Jaro Plaza", [122.5562, 10.7248]);
  const molo = hit("Molo Plaza", [122.5456, 10.6973]);

  it("draws every candidate when nothing is picked", () => {
    expect(candidatesToDraw([jaro, molo], null)).toHaveLength(2);
  });

  it("drops the picked hit so its own marker is the only one on the coordinate", () => {
    const drawn = candidatesToDraw([jaro, molo], jaro.id);
    expect(drawn.map((h) => h.name)).toEqual(["Molo Plaza"]);
  });

  it("keeps the others when the picked id is not in the set", () => {
    expect(candidatesToDraw([jaro, molo], "gone")).toHaveLength(2);
  });
});

describe("shouldOfferAreaSearch", () => {
  it("is false before a search has run", () => {
    expect(shouldOfferAreaSearch(viewport, null)).toBe(false);
  });

  it("is false while the camera sits where the search ran", () => {
    expect(shouldOfferAreaSearch(viewport, CENTRE)).toBe(false);
  });

  it("is false for a small nudge", () => {
    const spanLat = viewport.bounds.north - viewport.bounds.south;
    const nudge = { ...CENTRE, latitude: CENTRE.latitude + spanLat * 0.1 };
    expect(shouldOfferAreaSearch(viewport, nudge)).toBe(false);
  });

  it("is true once the camera leaves the threshold", () => {
    const spanLng = viewport.bounds.east - viewport.bounds.west;
    const moved = {
      ...CENTRE,
      longitude: CENTRE.longitude + spanLng * (AREA_SEARCH_THRESHOLD + 0.01),
    };
    expect(shouldOfferAreaSearch(viewport, moved)).toBe(true);
  });
});
