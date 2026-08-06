import type { CoordinatePair, GeoLineString } from "@komyuter/shared";
import type { AppInstance } from "./app";
import { loadEnv } from "../config/env";
import { validationError } from "./errors";

/** Mapbox Directions accepts at most 25 coordinates per request. */
export const MAPBOX_CHUNK_SIZE = 25;

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
}
