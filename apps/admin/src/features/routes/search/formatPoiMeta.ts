import type { CoordinatePair, GeocodeHit } from "@komyuter/shared";
import type { DraftStop } from "@/lib/plottingStore";
import type { Selection } from "@/lib/selection";
import { distanceMeters } from "../poiScope";

/** "640 m" / "1.7 km" — the distance Mapbox measured from the search centre. */
export function formatDistance(
  meters: number | null | undefined,
): string | null {
  if (meters === null || meters === undefined || !Number.isFinite(meters)) {
    return null;
  }
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

/** The stop a searched place will be inserted after, as the plate needs it. */
export interface PoiAnchor {
  /** 1-based position in the stops list, for `from #3`. */
  index: number;
  name: string;
  location: CoordinatePair;
}

/**
 * The insertion anchor the current selection implies, or null when the place
 * would append. A selection that no longer names a stop is the append case —
 * the same rule `addPoiAsStop` applies when it actually inserts.
 */
export function poiAnchorFor(
  selection: Selection,
  stops: readonly DraftStop[],
): PoiAnchor | null {
  if (selection.type !== "stop") return null;
  const index = stops.findIndex((stop) => stop.id === selection.stopId);
  if (index < 0) return null;
  const stop = stops[index];
  return { index: index + 1, name: stop.name, location: stop.location };
}

/** The plate header's second line: where the chosen place will land. */
export function insertionAnchorLabel(anchor: PoiAnchor | null): string {
  return anchor
    ? `Inserting after #${anchor.index} · ${anchor.name}`
    : "Appends to end";
}

/**
 * The distance part of a row's meta line, with its basis stated.
 *
 * With an anchor the distance is measured client-side from the selected stop
 * (`1.2 km from #3`), so it is correct for the insertion decision and still
 * exists when the upstream reported no distance. Without one the wire value —
 * camera-relative by definition — is the map-centre fallback (`2.3 km from
 * centre`), and a missing value degrades to no distance at all.
 */
export function poiDistanceLabel(
  hit: Pick<GeocodeHit, "location" | "distanceMeters">,
  anchor: PoiAnchor | null,
): string | null {
  if (anchor) {
    const formatted = formatDistance(
      distanceMeters(anchor.location, hit.location),
    );
    return formatted ? `${formatted} from #${anchor.index}` : null;
  }
  const formatted = formatDistance(hit.distanceMeters);
  return formatted ? `${formatted} from centre` : null;
}

/**
 * The one-line meta summary under a result row, e.g.
 * `"park · 1.2 km from #3"` or `"park · 2.3 km from centre"`.
 *
 * Both parts are optional in the wire data — Mapbox omits `poi_category` for
 * some places and `distance` when it has no origin to measure from — so the
 * line degrades to whatever is known, and to an empty string when nothing is.
 */
export function poiMetaLine(
  hit: Pick<GeocodeHit, "category" | "location" | "distanceMeters">,
  anchor: PoiAnchor | null = null,
): string {
  return [hit.category ?? null, poiDistanceLabel(hit, anchor)]
    .filter((part): part is string => typeof part === "string" && part !== "")
    .join(" · ");
}
