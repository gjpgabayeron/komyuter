import { useEffect } from "react";
import { useMap } from "react-map-gl/maplibre";
import { usePlottingStore } from "@/lib/plottingStore";

/**
 * Frames the whole route whenever `requestFit` is fired (route selection,
 * route load). Reads fresh state at effect time so async-loaded stops/paths
 * are framed once they arrive.
 */
export function RouteFitter() {
  const map = useMap().current;
  const fitCounter = usePlottingStore((s) => s.fitCounter);

  useEffect(() => {
    if (!map || fitCounter <= 0) return;
    const state = usePlottingStore.getState();
    const points: [number, number][] = [
      ...state.stops.map((stop) => stop.location),
      ...(state.polyline?.coordinates ?? []),
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
    map.fitBounds(bounds, { padding: 80, maxZoom: 15, duration: 450 });
  }, [fitCounter, map]);

  return null;
}
