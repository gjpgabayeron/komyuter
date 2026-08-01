import { sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

export function asGeoJSON(column: AnyPgColumn | SQL): SQL {
  return sql`ST_AsGeoJSON(${column})::jsonb`;
}

export function geomFromGeoJSON(geojson: unknown): SQL {
  return sql`ST_GeomFromGeoJSON(${JSON.stringify(geojson)})`;
}

export function asPointFromGeoJSON(geojson: unknown): SQL {
  return sql`ST_GeomFromGeoJSON(${JSON.stringify(geojson)})::geometry(Point,4326)`;
}

export function asLineStringFromGeoJSON(geojson: unknown): SQL {
  return sql`ST_GeomFromGeoJSON(${JSON.stringify(geojson)})::geometry(LineString,4326)`;
}

export function pointOnLineMeters(
  point: unknown,
  line: SQL,
  meters: number,
): SQL {
  return sql`ST_DWithin(
    ST_GeomFromGeoJSON(${JSON.stringify(point)})::geography,
    ${line}::geography,
    ${meters}
  )`;
}

export function pointDistanceToLineMeters(point: unknown, line: SQL): SQL {
  return sql`ST_Distance(
    ST_GeomFromGeoJSON(${JSON.stringify(point)})::geography,
    ${line}::geography
  )`;
}
