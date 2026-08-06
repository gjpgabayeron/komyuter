import type { RasterSourceSpecification } from "maplibre-gl";

/** Default map center: Iloilo City proper (lng, lat). */
export const ILOILO_CITY: [number, number] = [122.5645, 10.693];

/**
 * Basemap tile source for the Route Plotting map. Uses the Mapbox public
 * style token when configured; otherwise falls back to OpenStreetMap so the
 * admin always renders offline/local without a token.
 */
export function getTileSource(): RasterSourceSpecification {
  const token = import.meta.env.VITE_MAPBOX_PUBLIC_TOKEN;
  if (token) {
    return {
      type: "raster",
      tiles: [
        `https://api.mapbox.com/styles/v1/mapbox/streets-v12/tiles/256/{z}/{x}/{y}?access_token=${token}`,
      ],
      tileSize: 256,
      attribution: "© Mapbox © OpenStreetMap",
      maxzoom: 22,
    };
  }
  return {
    type: "raster",
    tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
    tileSize: 256,
    attribution: "© OpenStreetMap contributors",
    maxzoom: 19,
  };
}
