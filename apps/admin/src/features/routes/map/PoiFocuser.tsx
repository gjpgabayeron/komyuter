import { useEffect, useRef } from "react";
import { useMap } from "react-map-gl/maplibre";
import type { CoordinatePair } from "@komyuter/shared";
import { usePlottingStore } from "@/lib/plottingStore";
import type { CameraPadding } from "@/features/routes/workspace/geometry";

/** Bounding box of a point set, as `[sw, ne]` in `[lng, lat]` order. */
function boundsOf(
  locations: CoordinatePair[],
): [CoordinatePair, CoordinatePair] {
  const [firstLng, firstLat] = locations[0];
  let minLng = firstLng;
  let maxLng = firstLng;
  let minLat = firstLat;
  let maxLat = firstLat;
  for (const [lng, lat] of locations.slice(1)) {
    minLng = Math.min(minLng, lng);
    maxLng = Math.max(maxLng, lng);
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
  }
  return [
    [minLng, minLat],
    [maxLng, maxLat],
  ];
}

/**
 * Moves the camera for a search: flies to one place, or frames the whole
 * candidate set.
 *
 * The pill lives in the workspace chrome — a sibling of `<Map>`, not a child —
 * so `useMap()` inside it resolves to `undefined` and `map.flyTo` was silently
 * skipped (issue #16 follow-up: selecting a result did not move the map). This
 * controller sits inside `<Map>` where the instance exists, consumes the
 * request, and clears it so a re-render never replays the movement.
 *
 * Every move starts by installing the layout's visible-region padding, so a
 * place focus lands in the unoccluded area and a candidate fit frames the
 * candidates inside it — never under the results plate (ADR-0024).
 */
export function PoiFocuser({ padding }: { padding: CameraPadding }) {
  const map = useMap().current;
  const focus = usePlottingStore((s) => s.poiFocus);
  const paddingRef = useRef(padding);
  paddingRef.current = padding;

  useEffect(() => {
    if (!map || !focus) return;
    // The request arrived with the layout that answers it (the results plate
    // has just opened), so this is the post-reveal visible region.
    map.setPadding(paddingRef.current);
    if (focus.kind === "point") {
      map.flyTo({ center: focus.location, zoom: 15, duration: 600 });
    } else if (focus.locations.length > 0) {
      const [southWest, northEast] = boundsOf(focus.locations);
      const degenerate =
        southWest[0] === northEast[0] && southWest[1] === northEast[1];
      if (degenerate) {
        // A single candidate has no extent to fit; flying reads the same.
        map.flyTo({ center: southWest, zoom: 15, duration: 600 });
      } else {
        map.fitBounds([southWest, northEast], {
          maxZoom: 16,
          duration: 600,
        });
      }
    }
    usePlottingStore.getState().clearPoiFocus();
  }, [map, focus]);

  return null;
}
