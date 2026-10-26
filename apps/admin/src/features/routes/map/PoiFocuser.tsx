import { useEffect } from "react";
import { useMap } from "react-map-gl/maplibre";
import type { CoordinatePair } from "@komyuter/shared";
import { usePlottingStore } from "@/lib/plottingStore";

/** Padding around a bounds fit, so dots never sit against the plate edges. */
const FIT_PADDING = 64;

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
 */
export function PoiFocuser() {
  const map = useMap().current;
  const focus = usePlottingStore((s) => s.poiFocus);

  useEffect(() => {
    if (!map || !focus) return;
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
          padding: FIT_PADDING,
          duration: 600,
          maxZoom: 16,
        });
      }
    }
    usePlottingStore.getState().clearPoiFocus();
  }, [map, focus]);

  return null;
}
