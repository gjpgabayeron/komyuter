import { useEffect, useRef } from "react";
import { useMap } from "react-map-gl/maplibre";
import { usePlottingStore } from "@/lib/plottingStore";
import type { CameraPadding } from "@/features/routes/workspace/geometry";

/**
 * Frames the whole route whenever `requestFit` is fired (route selection,
 * route load). Reads fresh state at effect time so async-loaded stops/paths
 * are framed once they arrive.
 *
 * The fit has no padding numbers of its own: it installs the layout's
 * visible-region padding on the map first (ADR-0024), so MapLibre's own fit
 * maths accounts for the plates and the route can never land underneath one.
 */
export function RouteFitter({ padding }: { padding: CameraPadding }) {
  const map = useMap().current;
  const fitCounter = usePlottingStore((s) => s.fitCounter);
  const paddingRef = useRef(padding);
  paddingRef.current = padding;

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
    // Set before fitting: MapLibre adds the live padding to a fit's available
    // width, so this is the fit's padding, not a constant beside it.
    map.setPadding(paddingRef.current);
    map.fitBounds(bounds, { maxZoom: 15, duration: 450 });
  }, [fitCounter, map]);

  return null;
}
