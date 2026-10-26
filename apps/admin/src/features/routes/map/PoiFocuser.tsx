import { useEffect } from "react";
import { useMap } from "react-map-gl/maplibre";
import { usePlottingStore } from "@/lib/plottingStore";

/**
 * Flies the map to a place the plotter picked in the search pill.
 *
 * The pill lives in the workspace chrome — a sibling of `<Map>`, not a child —
 * so `useMap()` inside it resolves to `undefined` and `map.flyTo` was silently
 * skipped (issue #16 follow-up: selecting a result did not move the map). This
 * controller sits inside `<Map>` where the instance exists, consumes the
 * request, and clears it so a re-render never replays the flight.
 */
export function PoiFocuser() {
  const map = useMap().current;
  const focus = usePlottingStore((s) => s.poiFocus);

  useEffect(() => {
    if (!map || !focus) return;
    map.flyTo({ center: focus.location, zoom: 15, duration: 600 });
    usePlottingStore.getState().clearPoiFocus();
  }, [map, focus]);

  return null;
}
