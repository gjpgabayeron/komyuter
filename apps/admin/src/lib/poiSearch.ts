import type { CoordinatePair } from "@komyuter/shared";

/** A geocoding hit in the admin's preferred coordinate order [lng, lat]. */
export interface PoiResult {
  id: string;
  name: string;
  description: string;
  location: CoordinatePair;
}

/**
 * Approximate Iloilo service-region bounds (lng1,lat1,lng2,lat2) used to bias
 * Nominatim results toward the map's area (bounded=0 prefers in-box hits but
 * still allows nearby places outside).
 */
export const ILOILO_VIEWBOX = "121.9,11.0,123.2,10.3";

/**
 * POI search uses OpenStreetMap Nominatim directly from the admin client —
 * free, keyless, CORS-enabled — biased to the Philippines/Iloilo. (A Mapbox
 * Geocoding proxy can replace it later behind MAPBOX_SECRET_TOKEN; the result
 * contract here is deliberately service-agnostic.)
 */
export function buildNominatimUrl(query: string, limit = 6): string {
  const params = new URLSearchParams({
    format: "jsonv2",
    q: query,
    limit: String(limit),
    bounded: "0",
    countrycodes: "ph",
  });
  // viewbox is appended raw so commas stay unescaped (safe: digits/dots/commas).
  return `https://nominatim.openstreetmap.org/search?${params.toString()}&viewbox=${ILOILO_VIEWBOX}`;
}

/** Maps a Nominatim jsonv2 response to PoiResult[]; invalid entries dropped. */
export function parseNominatimResults(json: unknown): PoiResult[] {
  if (!Array.isArray(json)) return [];
  const results: PoiResult[] = [];
  for (const item of json) {
    if (!item || typeof item !== "object") continue;
    const record = item as {
      place_id?: number | string;
      display_name?: string;
      lat?: string | number;
      lon?: string | number;
    };
    const lat = Number(record.lat);
    const lon = Number(record.lon);
    const display =
      typeof record.display_name === "string" ? record.display_name : "";
    if (
      !Number.isFinite(lat) ||
      !Number.isFinite(lon) ||
      display.length === 0
    ) {
      continue;
    }
    const parts = display.split(",").map((part) => part.trim());
    results.push({
      id: String(record.place_id ?? `${lon},${lat}`),
      name: parts[0],
      description: parts.slice(1).join(", "),
      location: [lon, lat],
    });
  }
  return results;
}
