import type { DirectionEntity } from "@/features/routes/routesApi";
import type { DetourTarget } from "./detourStore";

/**
 * Builds the store's editor target from a loaded Direction. The directions
 * LIST response does not embed stops (`loadDirectionSummary` returns the
 * direction row only) — stops must be fetched via `useDirectionStopsQuery`
 * and passed in chain order (`stop_order`): the flanking source for
 * quick-mode detour inference. Callers that lack stops simply pass `[]` (the
 * editor then prompts for a point between two stops once they load).
 */
export function buildDetourTarget(
  direction: DirectionEntity,
  routeName: string,
  existingDetourCount: number,
  stops: readonly {
    stop_id: string;
    name: string;
    location: [number, number];
  }[],
): DetourTarget {
  return {
    directionId: direction.direction_id,
    directionLabel: direction.label,
    routeId: direction.route_id,
    routeName,
    basePolyline: direction.base_polyline,
    existingDetourCount,
    stops,
  };
}
