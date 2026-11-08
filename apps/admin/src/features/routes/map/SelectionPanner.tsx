import { useEffect } from "react";
import { useMap } from "react-map-gl/maplibre";
import { usePlottingStore } from "@/lib/plottingStore";

/**
 * Smoothly pans and centers the selected stop's marker (from map click or
 * stop list), so the active stop is always in view. Reads fresh store state
 * at effect time so a stale stop id never panics.
 */
export function SelectionPanner() {
  const map = useMap().current;
  const selection = usePlottingStore((s) => s.selection);

  useEffect(() => {
    if (!map || selection.type !== "stop") return;
    const stop = usePlottingStore
      .getState()
      .stops.find((s) => s.id === selection.stopId);
    if (!stop) return;
    map.easeTo({
      center: [stop.location[0], stop.location[1]],
      duration: 450,
    });
  }, [selection, map]);

  return null;
}
