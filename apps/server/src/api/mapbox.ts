import type {
  CoordinatePair,
  GeoLineString,
  GeocodeHit,
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

/** The service region's timezone — opening hours are a local-time question. */
const MANILA_TZ = "Asia/Manila";

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

/**
 * Builds the Search Box `forward` URL.
 *
 * One call, up to ten results, each carrying its own `geometry` — that is what
 * lets the map draw every candidate and preview one on hover without a second
 * round trip per row. `auto_complete=true` keeps the as-you-type feel of the
 * `suggest` endpoint this replaced, and `proximity` biases ranking without
 * hard-filtering hits out of the region.
 *
 * There is deliberately **no `session_token`**: `/forward` is not part of the
 * suggest/retrieve billing pair and rejects the parameter outright with
 * `400 Query deserialize error: unknown field 'session_token'`, which the proxy
 * reported as `upstream_error` — "Search is unavailable right now" for every
 * query. Measured against the live API, everything else here is accepted.
 *
 * The token and the bias stay server-side, so the browser never learns where
 * search went — that is what made issue #16 a CSP problem.
 */
export function buildForwardUrl(
  query: string,
  token: string,
  limit: number = GEOCODE_DEFAULT_LIMIT,
  proximity: string = ILOILO_PROXIMITY,
): string {
  const params = new URLSearchParams({
    q: query,
    country: "ph",
    language: "en",
    limit: String(clampGeocodeLimit(limit)),
    auto_complete: "true",
    access_token: token,
  });
  // `proximity` is appended raw so its comma stays unescaped (digits, dots,
  // commas only) — URLSearchParams would percent-encode the separator.
  return `https://api.mapbox.com/search/searchbox/v1/forward?${params.toString()}&proximity=${proximity}`;
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
 * Validates a client-supplied `proximity` (`lng,lat`) and falls back to the
 * service-region centre.
 *
 * The pill sends the camera centre so ranking follows what the plotter is
 * looking at. This is a bias only — measured: Mapbox ignores `radius` and
 * `bbox` on `/forward`, so scoping to the camera happens client-side
 * (`poiScope.ts`). Anything malformed or out of range is replaced rather than
 * forwarded, because Mapbox answers a bad proximity with a 400 that would
 * surface as "Search is unavailable".
 */
export function parseProximity(raw: unknown): string {
  if (typeof raw !== "string") return ILOILO_PROXIMITY;
  const [lngRaw, latRaw, ...rest] = raw.split(",").map((part) => part.trim());
  if (rest.length > 0) return ILOILO_PROXIMITY;
  const lng = Number(lngRaw);
  const lat = Number(latRaw);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) return ILOILO_PROXIMITY;
  if (Math.abs(lng) > 180 || Math.abs(lat) > 90) return ILOILO_PROXIMITY;
  return `${lng},${lat}`;
}

/**
 * Display-ready opening hours for *today*, in the service region's timezone.
 *
 * Mapbox is inconsistent about this field: some POIs ship `weekday_text` (a
 * Monday-first list of sentences) with no usable `periods`, and others the
 * reverse — Iloilo's malls have `periods` with an empty `weekday_text`. So both
 * shapes are tried, prose first because it is already human-readable.
 */
export function openHoursToday(
  openHours: unknown,
  now: Date = new Date(),
): string | null {
  if (!openHours || typeof openHours !== "object") return null;
  const record = openHours as { weekday_text?: unknown; periods?: unknown };

  const weekday = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    timeZone: MANILA_TZ,
  }).format(now);

  if (Array.isArray(record.weekday_text)) {
    const line = record.weekday_text.find(
      (entry): entry is string =>
        typeof entry === "string" && entry.startsWith(`${weekday}:`),
    );
    if (line) {
      const text = line.slice(weekday.length + 1).trim();
      if (text !== "") return text;
    }
  }

  if (!Array.isArray(record.periods)) return null;
  // Day-of-week in another zone: read the local calendar date there.
  const localDay = new Date(
    now.toLocaleString("en-US", { timeZone: MANILA_TZ }),
  ).getDay();
  const period = record.periods.find((entry) => {
    if (!entry || typeof entry !== "object") return false;
    const open = (entry as { open?: { day?: unknown } }).open;
    return open?.day === localDay;
  }) as { open?: { time?: unknown }; close?: { time?: unknown } } | undefined;
  if (!period) return null;

  const opens = formatHhmm(period.open?.time);
  if (!opens) return null;
  const closes = formatHhmm(period.close?.time);
  return closes === null ? "Open 24 hours" : `${opens} – ${closes}`;
}

/** `"1000"` → `"10:00"`; anything that is not four digits is rejected. */
function formatHhmm(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const digits = raw.replace(/\D/g, "");
  if (digits.length !== 4) return null;
  return `${digits.slice(0, 2)}:${digits.slice(2)}`;
}

/**
 * Maps a Search Box `forward` body onto `GeocodeHit[]`.
 *
 * Every feature carries its own `geometry`, which is the whole reason this
 * replaced `suggest` + `retrieve`: the dropdown rows and the candidate dots
 * come from one response. Properties are read defensively — the id from
 * `properties.mapbox_id` (or the feature's own id), `name` from
 * `properties.name`, and the row's second line from `place_formatted`, falling
 * back to `full_address`. Anything without a usable point or name is dropped
 * rather than rendered as a blank row.
 */
export function toGeocodeHits(
  json: unknown,
  // Injectable clock: opening hours are "today", which makes assertions about
  // them time-dependent unless the caller can pin the day.
  now: Date = new Date(),
): GeocodeHit[] {
  if (!json || typeof json !== "object") return [];
  const features = (json as { features?: unknown }).features;
  if (!Array.isArray(features)) return [];

  const results: GeocodeHit[] = [];
  for (const feature of features) {
    if (!feature || typeof feature !== "object") continue;
    const record = feature as {
      id?: unknown;
      properties?: unknown;
      geometry?: unknown;
    };
    const geometry = record.geometry;
    if (!geometry || typeof geometry !== "object") continue;
    const coordinates = (geometry as { coordinates?: unknown }).coordinates;
    if (!Array.isArray(coordinates) || coordinates.length < 2) continue;
    const lng = Number(coordinates[0]);
    const lat = Number(coordinates[1]);
    if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue;

    const properties = (record.properties ?? {}) as {
      mapbox_id?: unknown;
      name?: unknown;
      place_formatted?: unknown;
      full_address?: unknown;
      poi_category?: unknown;
      metadata?: unknown;
      distance?: unknown;
    };
    const id =
      typeof properties.mapbox_id === "string"
        ? properties.mapbox_id
        : typeof record.id === "string"
          ? record.id
          : "";
    const name =
      typeof properties.name === "string" ? properties.name.trim() : "";
    if (!id || !name) continue;
    const secondary =
      typeof properties.place_formatted === "string"
        ? properties.place_formatted
        : typeof properties.full_address === "string"
          ? properties.full_address
          : "";
    // Categories come coarse-to-fine (`["shopping", "shopping mall"]`); the last
    // one is the label a plotter would recognise.
    const categories = Array.isArray(properties.poi_category)
      ? properties.poi_category.filter(
          (entry): entry is string => typeof entry === "string" && entry !== "",
        )
      : [];
    const metadata = (properties.metadata ?? {}) as {
      phone?: unknown;
      website?: unknown;
      open_hours?: unknown;
    };
    const distance = Number(properties.distance);
    results.push({
      id,
      name,
      description: secondary.trim(),
      location: [lng, lat],
      category: categories.at(-1) ?? null,
      distanceMeters: Number.isFinite(distance) ? distance : null,
      openHours: openHoursToday(metadata.open_hours, now),
      phone:
        typeof metadata.phone === "string" && metadata.phone !== ""
          ? metadata.phone
          : null,
      website:
        typeof metadata.website === "string" && metadata.website !== ""
          ? metadata.website
          : null,
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
  app.get(
    "/mapbox/directions",
    { config: { permission: "MAPBOX_GEOSERVICES" } },
    async (request) => {
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
    },
  );

  /**
   * Place search (issue #16). One Search Box `forward` call answers with up to
   * ten located candidates, so the pill can list them and the map can draw
   * every one of them without a second request.
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
  app.get(
    "/mapbox/geocode",
    { config: { permission: "MAPBOX_GEOSERVICES" } },
    async (request) => {
      const {
        q: rawQuery,
        limit: rawLimit,
        proximity: rawProximity,
      } = request.query as {
        q?: string;
        limit?: string;
        proximity?: string;
      };
      const query = typeof rawQuery === "string" ? rawQuery.trim() : "";
      if (query.length < GEOCODE_MIN_QUERY_LENGTH) {
        throw validationError(
          `Query must be at least ${GEOCODE_MIN_QUERY_LENGTH} characters`,
        );
      }
      const limit = parseGeocodeLimit(rawLimit);
      const proximity = parseProximity(rawProximity);

      const env = loadEnv(process.env);
      const token = env.MAPBOX_SECRET_TOKEN;

      const degraded = (warning: GeocodeWarning) => ({
        success: true,
        data: { results: [] as GeocodeHit[], warning },
      });

      if (!token) {
        return degraded("no_token");
      }

      try {
        const res = await fetch(
          buildForwardUrl(query, token, limit, proximity),
        );
        if (!res.ok) {
          throw new Error(`Mapbox forward responded with status ${res.status}`);
        }
        const json = (await res.json()) as unknown;
        return {
          success: true,
          data: { results: toGeocodeHits(json), warning: null },
        };
      } catch (error) {
        app.log.warn(
          { error },
          "Mapbox forward proxy failed; returning no candidates",
        );
        return degraded("upstream_error");
      }
    },
  );
}
