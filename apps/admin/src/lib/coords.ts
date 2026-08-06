import type { CoordinatePair } from "@komyuter/shared";

/** Parses a "lng,lat" string into a coordinate pair. Throws on malformed input. */
export function parseCoordinatePair(input: string): CoordinatePair {
  const [lngRaw, latRaw] = input.split(",").map((part) => part.trim());
  const lng = Number(lngRaw);
  const lat = Number(latRaw);
  if (!Number.isFinite(lng) || !Number.isFinite(lat)) {
    throw new Error(`Invalid coordinate pair: ${input}`);
  }
  return [lng, lat];
}

/** Loose equality of two [lng, lat] pairs within an epsilon (default ~1e-9). */
export function coordinatesEqual(
  a: CoordinatePair,
  b: CoordinatePair,
  epsilon = 1e-9,
): boolean {
  return Math.abs(a[0] - b[0]) <= epsilon && Math.abs(a[1] - b[1]) <= epsilon;
}

/**
 * Index of the polyline vertex nearest to `point` (squared-degree distance),
 * or -1 when no vertex is within `maxDistanceDeg`. Used to snap stop drags
 * and clicked points back onto the drawn path.
 */
export function nearestCoordIndex(
  point: CoordinatePair,
  line: readonly CoordinatePair[],
  maxDistanceDeg = 0.005,
): number {
  let bestIndex = -1;
  let bestDistanceSq = Number.POSITIVE_INFINITY;
  for (let i = 0; i < line.length; i++) {
    const dx = line[i][0] - point[0];
    const dy = line[i][1] - point[1];
    const distanceSq = dx * dx + dy * dy;
    if (distanceSq < bestDistanceSq) {
      bestDistanceSq = distanceSq;
      bestIndex = i;
    }
  }
  return bestDistanceSq <= maxDistanceDeg * maxDistanceDeg ? bestIndex : -1;
}
