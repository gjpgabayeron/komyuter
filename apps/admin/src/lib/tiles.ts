import type { BaseMapStyle } from "./plottingStore";

/** Default map center: Iloilo City proper (lng, lat). */
export const ILOILO_CITY: [number, number] = [122.5645, 10.693];

/**
 * OpenFreeMap vector styles (OSM data, OpenMapTiles schema) — free for
 * COMMERCIAL use with attribution (per openfreemap.org FAQ), no API key,
 * no volume limits. Crisp at every zoom (vector, not pre-rasterized).
 *
 * - default: bright (standard detail)
 * - minimalist: positron (grey, simplified — POI icons hidden)
 * - 3d: liberty, shown in a tilted/rotatable perspective (same map the
 *   OpenFreeMap demo calls "3D" — the style is liberty, the 3D effect comes
 *   from the camera pitch/rotation, applied by PerspectiveController)
 */
const OPENFREEMAP_BRIGHT = "https://tiles.openfreemap.org/styles/bright";
const OPENFREEMAP_POSITRON = "https://tiles.openfreemap.org/styles/positron";
const OPENFREEMAP_LIBERTY = "https://tiles.openfreemap.org/styles/liberty";

/** The basemap style URL for a style choice. */
export function baseMapStyleFor(style: BaseMapStyle): string {
  switch (style) {
    case "minimalist":
      return OPENFREEMAP_POSITRON;
    case "3d":
      return OPENFREEMAP_LIBERTY;
    default:
      return OPENFREEMAP_BRIGHT;
  }
}
