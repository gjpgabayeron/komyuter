import {
  projectPointOnPolyline,
  type CoordinatePair,
  type GeoLineString,
  type ProjectedPoint,
} from "@komyuter/shared";

export interface DetourBaseSplit {
  /** Base line before the split; null when the split is the first vertex. */
  before: GeoLineString | null;
  /** The base segment replaced by the detour, drawn dashed under it. */
  replaced: GeoLineString;
  /** Base line after the merge; null when the merge is the last vertex. */
  after: GeoLineString | null;
}

function dedupe(points: CoordinatePair[]): CoordinatePair[] {
  return points.filter((point, index) => {
    if (index === 0) return true;
    const previous = points[index - 1];
    return point[0] !== previous[0] || point[1] !== previous[1];
  });
}

function line(points: CoordinatePair[]): GeoLineString | null {
  return points.length >= 2
    ? { type: "LineString", coordinates: points }
    : null;
}

/**
 * Splits the base polyline at the detour's split and merge so the focused
 * detour can be drawn solid in the route colour while the replaced main
 * segment stays visible as a lower-opacity dashed line.
 *
 * The projected points belong to the saved base the detour was created
 * against; re-project their coordinates onto the CURRENT base so a moved
 * vertex cannot point the split at a stale segment.
 */
export function splitBaseForDetour(
  base: GeoLineString,
  entry: ProjectedPoint,
  exit: ProjectedPoint,
): DetourBaseSplit | null {
  const start = projectPointOnPolyline(
    entry.coordinate,
    base.coordinates,
    Number.POSITIVE_INFINITY,
  );
  const end = projectPointOnPolyline(
    exit.coordinate,
    base.coordinates,
    Number.POSITIVE_INFINITY,
  );
  if (!start || !end) return null;

  const forward =
    start.index < end.index ||
    (start.index === end.index && start.fraction <= end.fraction);
  const a = forward ? start : end;
  const b = forward ? end : start;
  if (a.index === b.index && Math.abs(a.fraction - b.fraction) < 1e-9) {
    return null;
  }

  const coordinates = base.coordinates;
  const before = dedupe([...coordinates.slice(0, a.index + 1), a.coordinate]);
  const replaced = dedupe([
    a.coordinate,
    ...coordinates.slice(a.index + 1, b.index + 1),
    b.coordinate,
  ]);
  const after = dedupe([b.coordinate, ...coordinates.slice(b.index + 1)]);
  const replacedLine = line(replaced);
  if (!replacedLine) return null;

  return {
    before: line(before),
    replaced: replacedLine,
    after: line(after),
  };
}
