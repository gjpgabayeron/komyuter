import { geoLineStringSchema, geoPointSchema } from "@komyuter/shared";
import type { GeoLineString, GeoPoint } from "@komyuter/shared";

const [MIN_LONGITUDE, MAX_LONGITUDE, MIN_LATITUDE, MAX_LATITUDE] = [
  -180, 180, -90, 90,
];

export interface ValidationIssue {
  path: (string | number)[];
  message: string;
}

export type GuardResult<T> =
  { ok: true; value: T } | { ok: false; issues: ValidationIssue[] };

function flattenZod(error: {
  issues: { path: PropertyKey[]; message: string }[];
}): ValidationIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path.filter(
      (segment): segment is string | number =>
        typeof segment === "string" || typeof segment === "number",
    ),
    message: issue.message,
  }));
}

function validatePair(
  coords: unknown,
  path: (string | number)[],
): GuardResult<[number, number]> {
  if (!Array.isArray(coords) || coords.length !== 2) {
    return {
      ok: false,
      issues: [
        { path, message: "Coordinate pair must be [longitude, latitude]" },
      ],
    };
  }
  const [lng, lat] = coords;
  const issues: ValidationIssue[] = [];
  if (
    typeof lng !== "number" ||
    !Number.isFinite(lng) ||
    lng < MIN_LONGITUDE ||
    lng > MAX_LONGITUDE
  ) {
    issues.push({
      path: [...path, 0],
      message: `longitude must be a finite number within [${MIN_LONGITUDE}, ${MAX_LONGITUDE}]`,
    });
  }
  if (
    typeof lat !== "number" ||
    !Number.isFinite(lat) ||
    lat < MIN_LATITUDE ||
    lat > MAX_LATITUDE
  ) {
    issues.push({
      path: [...path, 1],
      message: `latitude must be a finite number within [${MIN_LATITUDE}, ${MAX_LATITUDE}]`,
    });
  }
  if (issues.length > 0) {
    return { ok: false, issues };
  }
  return { ok: true, value: [lng, lat] };
}

export function validateGeoPoint(value: unknown): GuardResult<GeoPoint> {
  const parsed = geoPointSchema.safeParse(value);
  if (!parsed.success) {
    return { ok: false, issues: flattenZod(parsed.error) };
  }
  const pair = validatePair(parsed.data.coordinates, ["coordinates"]);
  if (!pair.ok) {
    return pair;
  }
  return { ok: true, value: { type: "Point", coordinates: pair.value } };
}

export function validateGeoLineString(
  value: unknown,
): GuardResult<GeoLineString> {
  const parsed = geoLineStringSchema.safeParse(value);
  if (!parsed.success) {
    return { ok: false, issues: flattenZod(parsed.error) };
  }
  const issues: ValidationIssue[] = [];
  for (let index = 0; index < parsed.data.coordinates.length; index++) {
    const pair = validatePair(parsed.data.coordinates[index], [
      "coordinates",
      index,
    ]);
    if (!pair.ok) {
      issues.push(...pair.issues);
    }
  }
  if (issues.length > 0) {
    return { ok: false, issues };
  }
  return {
    ok: true,
    value: { type: "LineString", coordinates: parsed.data.coordinates },
  };
}
