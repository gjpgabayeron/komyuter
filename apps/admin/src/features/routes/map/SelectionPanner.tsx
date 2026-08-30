import { useEffect } from "react";
import { useMap } from "react-map-gl/maplibre";
import { usePlottingStore } from "@/lib/plottingStore";
import { useDetourStore } from "@/features/detours/detourStore";

/**
 * Smoothly pans and centers the selected stop's marker (from map click or
 * stop list), so the active stop is always in view — WITHOUT changing the
 * zoom level (the admin keeps spatial context; fitBounds-style reframing is
 * left to RouteFitter/DetourFitter on route/detour focus). Reads fresh store
 * state at effect time so a stale stop id never panics.
 *
 * Handles BOTH the base-route stop selection (plottingStore) and a focused
 * detour stop (detourStore.selectedDetourStopId): focusing a detour stop
 * must not zoom — it only centers that stop on screen.
 */
export function SelectionPanner() {
  const map = useMap().current;
  const selection = usePlottingStore((s) => s.selection);
  const selectedDetourStopId = useDetourStore((s) => s.selectedDetourStopId);

  useEffect(() => {
    if (!map) return;

    // Detour stop focused → pan to it (same zoom-preserving contract).
    if (selectedDetourStopId !== null) {
      const stop = useDetourStore
        .getState()
        .detourStops.find((s) => s.id === selectedDetourStopId);
      if (stop) {
        map.easeTo({
          center: [stop.location[0], stop.location[1]],
          duration: 450,
        });
        return;
      }
    }

    if (selection.type !== "stop") return;
    const stop = usePlottingStore
      .getState()
      .stops.find((s) => s.id === selection.stopId);
    if (!stop) return;
    map.easeTo({
      center: [stop.location[0], stop.location[1]],
      duration: 450,
    });
  }, [selection, selectedDetourStopId, map]);

  return null;
}
