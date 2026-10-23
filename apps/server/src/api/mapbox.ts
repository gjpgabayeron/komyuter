import type {
  CoordinatePair,
  GeoLineString,
  GeocodeResult,
  GeocodeWarning,
} from "@komyuter/shared";
import type { AppInstance } from "./app";
import { loadEnv } from "../config/env";
import { validationError } from "./errors";

/** Mapbox Directions accepts at most 25 coordinates per request. */
export const MAPBOX_CHUNK_SIZE = 25;

/**
 * Approximate Iloilo service-region bounds as Mapbox wants them:
 * `minLng,minLat,maxLng,maxLat` (ADR-0010 — one region, one dataset).
 * This used to live in the admin client (`lib/poiSearch.ts`); the browser no
 * longer decides where the geocoder looks.
 */
export const ILOILO_BBOX = "121.9,10.3,123.2,11.0";

/** Shortest query worth a billed geocoding request, matching the pill's floor. */
export const GEOCODE_MIN_QUERY_LENGTH = 3;

/** Result-count bounds; Mapbox accepts 1–10 for the places endpoint. */
export const GEOCODE_DEFAULT_LIMIT = 6;
export const GEOCODE_MAX_LIMIT = 10;

/**
 * Parses "lng,lat;lng,lat;…" into coordinate pairs. Throws on malformed input
 * or fewer than 2 coordinates.
 */
export function parseCoordinates(raw: string): CoordinatePair[] {
  const coordinates = raw.split(";").map((token) => {
    const [lngRaw, latRaw] = token.split(",").map((part) => part.trim());
    const lng = Number(lngRaw);
    const lat = Number(latRaw);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
      throw new Error(`Invalid coordinate pair: ${token}`);
    }
    return [lng, lat] as CoordinatePair;
  });
  if (coordinates.length < 2) {
    throw new Error("At least 2 coordinates are required");
  }
  return coordinates;
}

/** Splits coordinates into chunks of at most chunkSize (Mapbox limit). */
export function chunkCoordinates(
  coordinates: CoordinatePair[],
  chunkSize: number,
): CoordinatePair[][] {
  const chunks: CoordinatePair[][] = [];
  for (let i = 0; i < coordinates.length; i += chunkSize) {
    chunks.push(coordinates.slice(i, i + chunkSize));
  }
  return chunks;
}

/** Straight-line geometry used when snapping is unavailable. */
export function straightLineFallback(
  coordinates: CoordinatePair[],
): GeoLineString {
  return { type: "LineString", coordinates };
}

/**
 * Joins snapped chunks into one LineString, dropping the duplicated joint
 * coordinate where consecutive chunks meet.
 */
export function concatenateLineStrings(chunks: GeoLineString[]): GeoLineString {
  const coordinates: CoordinatePair[] = [];
  for (const chunk of chunks) {
    for (let index = 0; index < chunk.coordinates.length; index++) {
      const coord = chunk.coordinates[index];
      if (index === 0 && coordinates.length > 0) {
        const last = coordinates[coordinates.length - 1];
        if (last[0] === coord[0] && last[1] === coord[1]) {
          continue;
        }
      }
      coordinates.push(coord);
    }
  }
  return { type: "LineString", coordinates };
}

/** Builds the Mapbox Directions driving URL for one chunk. */
export function buildDirectionsUrl(
  chunk: CoordinatePair[],
  token: string,
): string {
  const waypoints = chunk.map(([lng, lat]) => `${lng},${lat}`).join(";");
  const params = new URLSearchParams({
    geometries: "geojson",
    overview: "full",
    steps: "false",
    alternatives: "false",
    access_token: token,
  });
  return `https://api.mapbox.com/directions/v5/mapbox/driving/${waypoints}?${params}`;
}

/**
 * Builds the Mapbox Geocoding URL for one query. `q` is path-encoded and the
 * region bias is applied server-side, so the browser never chooses the origin
 * or the search box (that is what made issue #16 a CSP problem).
 */
export function buildGeocodeUrl(
  query: string,
  token: string,
  limit: number = GEOCODE_DEFAULT_LIMIT,
): string {
  const params = new URLSearchParams({
    country: "ph",
    limit: String(clampGeocodeLimit(limit)),
    access_token: token,
  });
  // `bbox` is appended raw so its commas stay unescaped (safe: digits, dots,
  // commas only) — URLSearchParams would percent-encode the separators.
  return `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(
    query,
  )}.json?${params.toString()}&bbox=${ILOILO_BBOX}`;
}

/** Clamps a requested result count into Mapbox's accepted 1–10 range. */
export function clampGeocodeLimit(limit: number): number {
  if (!Number.isFinite(limit)) return GEOCODE_DEFAULT_LIMIT;
  return Math.min(Math.max(Math.trunc(limit), 1), GEOCODE_MAX_LIMIT);
}

/** Parses the optional `limit` query parameter; junk falls back to the default. */
export function parseGeocodeLimit(raw: unknown): number {
  if (typeof raw !== "string" || raw.trim() === "")
    return GEOCODE_DEFAULT_LIMIT;
  return clampGeocodeLimit(Number(raw));
}

/**
 * Maps a Mapbox Geocoding feature collection onto `GeocodeResult[]`.
 *
 * Defensive in the same way the old client parser was: anything without a
 * usable `center` or display text is dropped rather than rendered as a blank
 * row. `name` is Mapbox's `text` (the place itself) and `description` is the
 * rest of `place_name` (city, province, …), which is what the pill shows.
 */
export function toGeocodeResults(json: unknown): GeocodeResult[] {
  if (!json || typeof json !== "object") return [];
  const features = (json as { features?: unknown }).features;
  if (!Array.isArray(features)) return [];

  const results: GeocodeResult[] = [];
  for (const feature of features) {
    if (!feature || typeof feature !== "object") continue;
    const record = feature as {
      id?: unknown;
      text?: unknown;
      place_name?: unknown;
      center?: unknown;
    };
    const center = record.center;
    if (!Array.isArray(center) || center.length < 2) continue;
    const lng = Number(center[0]);
    const lat = Number(center[1]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;

    const display =
      typeof record.place_name === "string" ? record.place_name.trim() : "";
    const parts = display.split(",").map((part) => part.trim());
    const name =
      typeof record.text === "string" && record.text.trim() !== ""
        ? record.text.trim()
        : parts[0];
    if (!name) continue;

    // Drop the leading segment only when it is the same place `name` carries.
    const rest = parts.filter((part) => part !== "" && part !== name);
    results.push({
      id: String(record.id ?? `${lng},${lat}`),
      name,
      description: rest.join(", "),
      location: [lng, lat],
    });
  }
  return results;
}

/**
 * Admin-only Mapbox Directions proxy (registered under /api/admin).
 * Snaps a plotted path to the road network; falls back to a straight line
 * when no MAPBOX_SECRET_TOKEN is configured or the upstream call fails, so
 * plotting always works offline. Never forwards upstream durations/instructions
 * — only geometry + distance (ADR-0009).
 */
export async function registerMapbox(app: AppInstance): Promise<void> {
  app.get("/mapbox/directions", async (request) => {
    const { coordinates: raw } = request.query as { coordinates?: string };
    if (!raw) {
      throw validationError("Missing required query parameter: coordinates");
    }
    let coordinates: CoordinatePair[];
    try {
      coordinates = parseCoordinates(raw);
    } catch (error) {
      throw validationError(
        error instanceof Error ? error.message : "Invalid coordinates",
      );
    }

    const env = loadEnv(process.env);
    const token = env.MAPBOX_SECRET_TOKEN;

    const fallback = () => ({
      success: true,
      data: {
        polyline: straightLineFallback(coordinates),
        distance_meters: 0,
        snapped: false,
        warning: token ? "upstream_error" : "no_token",
      },
    });

    if (!token) {
      return fallback();
    }

    try {
      const chunks = chunkCoordinates(coordinates, MAPBOX_CHUNK_SIZE);
      const results = await Promise.all(
        chunks.map(async (chunk) => {
          const res = await fetch(buildDirectionsUrl(chunk, token));
          if (!res.ok) {
            throw new Error(`Mapbox responded with status ${res.status}`);
          }
          const json = (await res.json()) as {
            routes?: { geometry: GeoLineString; distance: number }[];
          };
          const route = json.routes?.[0];
          if (!route) {
            throw new Error("Mapbox returned no route");
          }
          return {
            polyline: route.geometry,
            distanceMeters: route.distance,
          };
        }),
      );
      return {
        success: true,
        data: {
          polyline: concatenateLineStrings(results.map((r) => r.polyline)),
          distance_meters: results.reduce(
            (sum, r) => sum + r.distanceMeters,
            0,
          ),
          snapped: true,
          warning: null,
        },
      };
    } catch (error) {
      app.log.warn(
        { error },
        "Mapbox directions proxy failed; falling back to straight line",
      );
      return fallback();
    }
  });

  /**
   * Place search (issue #16). Same degradation contract as directions: an
   * absent token or a failing upstream is a 200 with an empty result set and a
   * `warning` the pill can explain, never an error the UI has to guess at.
   *
   * Same-origin from the browser by construction (`/api/admin/...`), which is
   * why this fixes the CSP block without widening `connect-src`.
   */
  app.get("/mapbox/geocode", async (request) => {
    const { q: rawQuery, limit: rawLimit } = request.query as {
      q?: string;
      limit?: string;
    };
    const query = typeof rawQuery === "string" ? rawQuery.trim() : "";
    if (query.length < GEOCODE_MIN_QUERY_LENGTH) {
      throw validationError(
        `Query must be at least ${GEOCODE_MIN_QUERY_LENGTH} characters`,
      );
    }
    const limit = parseGeocodeLimit(rawLimit);

    const env = loadEnv(process.env);
    const token = env.MAPBOX_SECRET_TOKEN;

    const degraded = (warning: GeocodeWarning) => ({
      success: true,
      data: { results: [] as GeocodeResult[], warning },
    });

    if (!token) {
      return degraded("no_token");
    }

    try {
      const res = await fetch(buildGeocodeUrl(query, token, limit));
      if (!res.ok) {
        throw new Error(`Mapbox geocoding responded with status ${res.status}`);
      }
      const json = (await res.json()) as unknown;
      return {
        success: true,
        data: { results: toGeocodeResults(json), warning: null },
      };
    } catch (error) {
      app.log.warn(
        { error },
        "Mapbox geocode proxy failed; returning empty results",
      );
      return degraded("upstream_error");
    }
  });
}
