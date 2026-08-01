import { sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";

export function asGeoJSON(column: SQL): SQL {
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
