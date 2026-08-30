import { useEffect } from "react";
import { useMap } from "react-map-gl/maplibre";
import { useDetourStore } from "@/features/detours/detourStore";

/**
 * Pans to the focused detour whenever `requestDetourFit` fires (detour focus
 * from the Detour list / saved-detour stop marker). Mirrors SelectionPanner's
 * zoom-preserving contract: it moves the camera to the detour's center but
 * NEVER changes the zoom level, so the admin keeps spatial context while
 * working on the detour (fitBounds-style reframing would zoom in/out).
 * Reads fresh state at effect time — the focused detour's entry/exit nodes,
 * detour stops, and loop all arrived before the fit request.
 */
export function DetourFitter() {
  const map = useMap().current;
  const detourFitCounter = useDetourStore((s) => s.detourFitCounter);

  useEffect(() => {
    if (!map || detourFitCounter <= 0) return;
    const state = useDetourStore.getState();
    const points: [number, number][] = [
      ...(state.entry ? [state.entry.coordinate] : []),
      ...(state.exit ? [state.exit.coordinate] : []),
      ...state.detourStops.map((stop) => stop.location),
      ...(state.loop?.coordinates ?? []),
    ];
    if (points.length === 0) return;
    const bounds = points.reduce(
      (acc, [lng, lat]) => {
        acc[0][0] = Math.min(acc[0][0], lng);
        acc[0][1] = Math.min(acc[0][1], lat);
        acc[1][0] = Math.max(acc[1][0], lng);
        acc[1][1] = Math.max(acc[1][1], lat);
        return acc;
      },
      [
        [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY],
        [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY],
      ] as [[number, number], [number, number]],
    );
    // Pan-only: center the detour, keep the current zoom intact.
    map.easeTo({
      center: [
        (bounds[0][0] + bounds[1][0]) / 2,
        (bounds[0][1] + bounds[1][1]) / 2,
      ],
      duration: 450,
    });
  }, [detourFitCounter, map]);

  return null;
}
