import type { Map as MapLibreMap } from "maplibre-gl";
import type { GeoLineString, OverviewRouteEntity } from "@komyuter/shared";
import {
  OVERVIEW_FADE_MS,
  mapIsUsable,
  overviewOpacityAt,
} from "@/lib/overviewFade";

/** All overview line + arrow layers — casing included so hit targets stay wide. */
export const OVERVIEW_LAYERS = [
  "overview-lines-base",
  "overview-lines-return",
  "overview-lines-casing-base",
  "overview-lines-casing-return",
  "overview-arrows-base",
  "overview-arrows-return",
];

/** Distance between direction arrows along a polyline (pixels). */
export const ARROW_SPACING_PX = 200;

/** Creates the small right-pointing triangle used for direction arrows. */
export function createArrowIcon(): {
  width: number;
  height: number;
  data: Uint8ClampedArray;
} | null {
  const size = 28;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.moveTo(6, 5);
  ctx.lineTo(23, 14);
  ctx.lineTo(6, 23);
  ctx.closePath();
  ctx.fill();
  return {
    width: size,
    height: size,
    data: ctx.getImageData(0, 0, size, size).data,
  };
}

/** Writes the current fade-in opacity (overviewOpacityAt(t)) to every existing
 *  overview layer. Missing layers are skipped — the writes are safe no-ops
 *  until the layers exist. */
export function writeOverviewOpacity(map: MapLibreMap, t: number): void {
  if (!mapIsUsable(map)) return;
  const isLine = (layerId: string) => layerId.startsWith("overview-lines-");
  const opacity = overviewOpacityAt(t);
  for (const layerId of OVERVIEW_LAYERS) {
    if (!map.getLayer(layerId)) continue;
    map.setPaintProperty(
      layerId,
      isLine(layerId) ? "line-opacity" : "icon-opacity",
      opacity,
    );
  }
}

/** Single-flight guard: at most one fade-in timeline runs at a time. */
let fadeTimelineRunning = false;

/** Runs the 0→1 fade-in on a fixed 25 ms setTimeout timeline (immune to rAF
 *  starvation). `onDone` fires on completion. The caller zeroes first via
 *  writeOverviewOpacity(map, 0) — so freshly created layers never paint a
 *  full-opacity frame. A no-op while another timeline is running. */
export function animateOverviewFadeIn(
  map: MapLibreMap,
  onDone?: () => void,
): void {
  if (fadeTimelineRunning) return;
  fadeTimelineRunning = true;
  writeOverviewOpacity(map, 0);
  const start = performance.now();
  const step = () => {
    const t = Math.max(
      0,
      Math.min(1, (performance.now() - start) / OVERVIEW_FADE_MS),
    );
    writeOverviewOpacity(map, t);
    if (t < 1) {
      window.setTimeout(step, 25);
    } else {
      fadeTimelineRunning = false;
      onDone?.();
    }
  };
  step();
}

export interface OverviewRoute {
  routeId: string;
  name: string;
  color: string | null;
  /** Base direction polyline (admin-plotted direction). */
  polyline: GeoLineString | null;
  /** Derived return direction polyline (may be null for legacy single directions). */
  returnPolyline: GeoLineString | null;
  stops: OverviewRouteEntity["stops"];
}

export function fitToOverview(map: MapLibreMap, overview: OverviewRoute) {
  const points: [number, number][] = [
    ...(overview.polyline?.coordinates ?? []),
    ...overview.stops.map((stop) => stop.location.coordinates),
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
  map.fitBounds(bounds, { padding: 90, maxZoom: 14.5, duration: 500 });
}
