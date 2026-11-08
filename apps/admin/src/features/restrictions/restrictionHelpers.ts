import type {
  CoordinatePair,
  GeoLineString,
  Restriction,
  RestrictionKind,
} from "@komyuter/shared";

import { projectPointOnPolyline } from "@/lib/coords";

export const RESTRICTION_KIND_LABELS: Record<RestrictionKind, string> = {
  no_loading: "No loading",
  no_unloading: "No unloading",
  both: "Both",
};

/**
 * The base-polyline vertex nearest a map click. Unlike a detour entry/exit,
 * a restriction range end is a vertex, not a point along a segment: the
 * server stores integer indices, so a click rounds to the closer end of the
 * segment it projects onto.
 */
export function nearestVertexIndex(
  point: CoordinatePair,
  line: GeoLineString,
): number | null {
  if (line.coordinates.length === 0) return null;
  const projected = projectPointOnPolyline(
    point,
    line.coordinates,
    Number.POSITIVE_INFINITY,
  );
  if (!projected) return null;
  const last = line.coordinates.length - 1;
  const rounded =
    projected.fraction >= 0.5 ? projected.index + 1 : projected.index;
  return Math.min(last, Math.max(0, rounded));
}

/** Orders a pair of picked indices so `from <= to`. */
export function normalizeRange(
  a: number,
  b: number,
): { from: number; to: number } {
  return a <= b ? { from: a, to: b } : { from: b, to: a };
}

/** The polyline slice a restriction covers, endpoints included. */
export function rangeCoordinates(
  line: GeoLineString,
  from: number,
  to: number,
): CoordinatePair[] {
  const range = normalizeRange(from, to);
  return line.coordinates.slice(range.from, range.to + 1);
}

export function restrictionLine(
  line: GeoLineString,
  restriction: Pick<Restriction, "from_coord_index" | "to_coord_index">,
): GeoLineString {
  return {
    type: "LineString",
    coordinates: rangeCoordinates(
      line,
      restriction.from_coord_index,
      restriction.to_coord_index,
    ),
  };
}

export function restrictionRangeLabel(
  restriction: Pick<Restriction, "from_coord_index" | "to_coord_index">,
): string {
  const range = normalizeRange(
    restriction.from_coord_index,
    restriction.to_coord_index,
  );
  return `Vertices ${range.from}–${range.to}`;
}
