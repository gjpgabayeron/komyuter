import type { DetourEntity } from "@/features/routes/routesApi";
import type { GeoLineString, Restriction } from "@komyuter/shared";
import { nearestVertexIndex } from "./restrictionHelpers";

/**
 * Main restrictions inherit onto an alternative only when the whole range
 * survives the detour (entirely in the preserved prefix or suffix). A range
 * that crosses the entry/exit, or sits wholly inside the replaced span, is
 * deliberately dropped. The returned rows keep their base-polyline indices;
 * they are read-only on the alternative.
 */
export function inheritedMainRestrictions(
  base: GeoLineString,
  detour: DetourEntity,
  restrictions: Restriction[],
): Restriction[] {
  const entry = nearestVertexIndex(detour.entry.coordinates, base);
  const exit = nearestVertexIndex(detour.exit.coordinates, base);
  if (entry === null || exit === null || exit <= entry) return [];
  return restrictions.filter(
    (restriction) =>
      restriction.detour_id === null &&
      restriction.is_active &&
      (restriction.to_coord_index <= entry ||
        restriction.from_coord_index >= exit),
  );
}
