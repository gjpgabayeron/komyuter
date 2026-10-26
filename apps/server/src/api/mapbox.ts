import { randomUUID } from "node:crypto";
import type {
  CoordinatePair,
  GeoLineString,
  GeocodeResult,
  GeocodeSuggestion,
  GeocodeWarning,
} from "@komyuter/shared";
import type { AppInstance } from "./app";
import { loadEnv } from "../config/env";
import { validationError } from "./errors";

/** Mapbox Directions accepts at most 25 coordinates per request. */
export const MAPBOX_CHUNK_SIZE = 25;

/**
 * Iloilo City centre, handed to the Search Box API as `proximity` so hits rank
 * near the service region (ADR-0010 — one region, one dataset). Proximity only
 * *biases* ranking, unlike the classic geocoding `bbox` this replaced: that was
 * a hard filter, and it dropped every real POI in the city — a search for
 * "SM City Iloilo" came back as a road in Leganes (issue #16 follow-up).
 */
export const ILOILO_PROXIMITY = "122.5656,10.7202";

/** Shortest query worth a billed search request, matching the pill's floor. */
export const GEOCODE_MIN_QUERY_LENGTH = 3;

/** Result-count bounds; Search Box `suggest` accepts 1–10. */
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

/** Restricts a billing session id to a safe shape; junk falls back to `fallback`. */
export function normaliseSession(raw: unknown, fallback: string): string {
  return typeof raw === "string" && /^[A-Za-z0-9-]{8,64}$/.test(raw)
    ? raw
    : fallback;
}

/**
 * Builds the Search Box `suggest` URL. The token, the region bias and the
 * billing session stay server-side, so the browser never learns where search
 * went — that is what made issue #16 a CSP problem in the first place.
 */
export function buildSuggestUrl(
  query: string,
  token: string,
  session: string,
  limit: number = GEOCODE_DEFAULT_LIMIT,
): string {
  const params = new URLSearchParams({
    q: query,
    country: "ph",
    language: "en",
    limit: String(clampGeocodeLimit(limit)),
    session_token: session,
    access_token: token,
  });
  // `proximity` is appended raw so its comma stays unescaped (digits, dots,
  // commas only) — URLSearchParams would percent-encode the separator.
  return `https://api.mapbox.com/search/searchbox/v1/suggest?${params.toString()}&proximity=${ILOILO_PROXIMITY}`;
}

/** Builds the Search Box `retrieve` URL that turns a suggestion id into a point. */
export function buildRetrieveUrl(
  id: string,
  token: string,
  session: string,
): string {
  const params = new URLSearchParams({
    session_token: session,
    access_token: token,
  });
  return `https://api.mapbox.com/search/searchbox/v1/retrieve/${encodeURIComponent(
    id,
  )}?${params.toString()}`;
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
 * Maps a Search Box `suggest` body onto `GeocodeSuggestion[]`.
 *
 * `suggest` answers with names and ids but no coordinates, which is what the
 * dropdown needs: the id is resolved by `retrieve` only when the plotter picks
 * a row. Anything without an id and a name is dropped rather than rendered as
 * a blank row.
 */
export function toSuggestions(json: unknown): GeocodeSuggestion[] {
  if (!json || typeof json !== "object") return [];
  const suggestions = (json as { suggestions?: unknown }).suggestions;
  if (!Array.isArray(suggestions)) return [];

  const results: GeocodeSuggestion[] = [];
  for (const suggestion of suggestions) {
    if (!suggestion || typeof suggestion !== "object") continue;
    const record = suggestion as {
      mapbox_id?: unknown;
      name?: unknown;
      place_formatted?: unknown;
      full_address?: unknown;
    };
    const id = typeof record.mapbox_id === "string" ? record.mapbox_id : "";
    const name = typeof record.name === "string" ? record.name.trim() : "";
    if (!id || !name) continue;
    const secondary =
      typeof record.place_formatted === "string"
        ? record.place_formatted
        : typeof record.full_address === "string"
          ? record.full_address
          : "";
    results.push({ id, name, description: secondary.trim() });
  }
  return results;
}

/**
 * Maps a Search Box `retrieve` body onto the resolved coordinate, `[lng, lat]`,
 * or null when the feature carries no usable geometry.
 */
export function toGeocodeResult(json: unknown): GeocodeResult | null {
  if (!json || typeof json !== "object") return null;
  const features = (json as { features?: unknown }).features;
  if (!Array.isArray(features) || features.length === 0) return null;
  const first = features[0];
  if (!first || typeof first !== "object") return null;
  const geometry = (first as { geometry?: unknown }).geometry;
  if (!geometry || typeof geometry !== "object") return null;
  const coordinates = (geometry as { coordinates?: unknown }).coordinates;
  if (!Array.isArray(coordinates) || coordinates.length < 2) return null;
  const lng = Number(coordinates[0]);
  const lat = Number(coordinates[1]);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;
  return { location: [lng, lat] };
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
   * Place search (issue #16). Search Box `suggest` answers with names and ids;
   * `/mapbox/geocode/resolve` turns the id the plotter picked into a point.
   *
   * The classic geocoding endpoint this replaced could not find POIs in Iloilo:
   * measured against live data, "SM City Iloilo" came back as a road in Leganes
   * and `types=poi` returned nothing at all. Search Box ranks places by name.
   *
   * Same degradation contract as directions: an absent token or a failing
   * upstream is a 200 with an empty answer and a `warning` the pill explains,
   * never an error the UI has to guess at. Same-origin from the browser by
   * construction (`/api/admin/...`), which is why the CSP needed no directive.
   */
  app.get("/mapbox/geocode", async (request) => {
    const {
      q: rawQuery,
      limit: rawLimit,
      session: rawSession,
    } = request.query as { q?: string; limit?: string; session?: string };
    const query = typeof rawQuery === "string" ? rawQuery.trim() : "";
    if (query.length < GEOCODE_MIN_QUERY_LENGTH) {
      throw validationError(
        `Query must be at least ${GEOCODE_MIN_QUERY_LENGTH} characters`,
      );
    }
    const limit = parseGeocodeLimit(rawLimit);
    const session = normaliseSession(rawSession, randomUUID());

    const env = loadEnv(process.env);
    const token = env.MAPBOX_SECRET_TOKEN;

    const degraded = (warning: GeocodeWarning) => ({
      success: true,
      data: { suggestions: [] as GeocodeSuggestion[], warning },
    });

    if (!token) {
      return degraded("no_token");
    }

    try {
      const res = await fetch(buildSuggestUrl(query, token, session, limit));
      if (!res.ok) {
        throw new Error(`Mapbox suggest responded with status ${res.status}`);
      }
      const json = (await res.json()) as unknown;
      return {
        success: true,
        data: { suggestions: toSuggestions(json), warning: null },
      };
    } catch (error) {
      app.log.warn(
        { error },
        "Mapbox suggest proxy failed; returning no suggestions",
      );
      return degraded("upstream_error");
    }
  });

  /**
   * Resolves one suggestion id into a coordinate. Separate from `suggest` on
   * purpose: coordinates are only worth a second billed call once the plotter
   * has actually chosen a row.
   */
  app.get("/mapbox/geocode/resolve", async (request) => {
    const { id: rawId, session: rawSession } = request.query as {
      id?: string;
      session?: string;
    };
    const id = typeof rawId === "string" ? rawId.trim() : "";
    if (!id) {
      throw validationError("Missing required query parameter: id");
    }
    const session = normaliseSession(rawSession, randomUUID());

    const env = loadEnv(process.env);
    const token = env.MAPBOX_SECRET_TOKEN;

    const degraded = (warning: GeocodeWarning) => ({
      success: true,
      data: { location: null, warning },
    });

    if (!token) {
      return degraded("no_token");
    }

    try {
      const res = await fetch(buildRetrieveUrl(id, token, session));
      if (!res.ok) {
        throw new Error(`Mapbox retrieve responded with status ${res.status}`);
      }
      const json = (await res.json()) as unknown;
      const resolved: GeocodeResult | null = toGeocodeResult(json);
      return {
        success: true,
        data: { location: resolved?.location ?? null, warning: null },
      };
    } catch (error) {
      app.log.warn(
        { error },
        "Mapbox retrieve proxy failed; returning no location",
      );
      return degraded("upstream_error");
    }
  });
}
