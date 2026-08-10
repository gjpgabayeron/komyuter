import { useEffect, useMemo, useRef, useState } from "react";
import { Marker, useMap } from "react-map-gl/maplibre";
import type {
  Map as MapLibreMap,
  MapLayerMouseEvent,
  MapMouseEvent,
} from "maplibre-gl";
import type { GeoLineString, OverviewRouteEntity } from "@komyuter/shared";
import { useOverviewQuery } from "./useRouteQueries";
import { usePlottingStore } from "@/lib/plottingStore";
import {
  ensureGeoJsonSource,
  lineLayerSpec,
  setSourceData,
  useDrawWhenReady,
} from "@/lib/mapLayers";
import {
  OVERVIEW_FADE_MS,
  fadeOutLayers,
  mapIsUsable,
  overviewOpacityAt,
} from "@/lib/overviewFade";
import { getStopShape, type StopShape } from "@/lib/stopShapes";
import { divergingSegments } from "@/lib/coords";
import { findOppositeOverlapRuns, shiftOverlapRuns } from "@/lib/overlap";

/** All overview line + arrow layers — casing included so hit targets stay wide. */
const OVERVIEW_LAYERS = [
  "overview-lines-base",
  "overview-lines-return",
  "overview-lines-casing-base",
  "overview-lines-casing-return",
  "overview-arrows-base",
  "overview-arrows-return",
];

/** Distance between direction arrows along a polyline (pixels). */
const ARROW_SPACING_PX = 200;

/** Creates the small right-pointing triangle used for direction arrows. */
function createArrowIcon(): {
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
function writeOverviewOpacity(map: MapLibreMap, t: number): void {
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
function animateOverviewFadeIn(map: MapLibreMap, onDone?: () => void): void {
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

const SHAPE_CLASS: Record<StopShape, string> = {
  square: "rounded-[4px]",
  circle: "rounded-full",
  diamond: "rotate-45 rounded-[3px]",
};

interface OverviewRoute {
  routeId: string;
  name: string;
  color: string | null;
  /** Base direction polyline (admin-plotted direction). */
  polyline: GeoLineString | null;
  /** Derived return direction polyline (may be null for legacy single directions). */
  returnPolyline: GeoLineString | null;
  stops: OverviewRouteEntity["stops"];
}

interface OverviewFeature {
  id: number;
  type: "Feature";
  properties: {
    routeId: string;
    name: string;
    color: string;
    direction: "base" | "return";
  };
  geometry: GeoLineString;
}

function fitToOverview(map: MapLibreMap, overview: OverviewRoute) {
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

/**
 * Overview mode (routes exist, none open): draws every plotted route's
 * polyline on the map. Hovering a line raises it and shows a name tooltip;
 * clicking focuses that route (zoom in, stop markers, others dimmed) and the
 * right panel offers editing. Direction is shown by arrow symbols placed at
 * regular intervals along each polyline (pointing the way of travel). The
 * derived return is drawn only where it leaves the base corridor, so shared
 * stretches are never doubled up.
 */
export function RouteOverviewLayer() {
  const map = useMap().current?.getMap();

  const overviewRouteId = usePlottingStore((s) => s.overviewRouteId);
  const setOverviewRouteId = usePlottingStore((s) => s.setOverviewRouteId);

  // ONE request for every route's base/return polylines + stops (perf audit —
  // the old N+1 detail fetches delayed the first paint and churned the store).
  const overview = useOverviewQuery();

  const overviewRoutes = useMemo<OverviewRoute[]>(
    () =>
      (overview.data ?? []).map((route) => ({
        routeId: route.route_id,
        name: route.name,
        color: route.color,
        polyline: route.base_polyline,
        returnPolyline: route.return_polyline,
        stops: route.stops,
      })),
    [overview.data],
  );

  const overviewRoutesRef = useRef(overviewRoutes);
  overviewRoutesRef.current = overviewRoutes;
  const featuresRef = useRef<{ id: number; routeId: string }[]>([]);

  const [hoveredRouteId, setHoveredRouteId] = useState<string | null>(null);
  const [hover, setHover] = useState<{
    x: number;
    y: number;
    name: string;
  } | null>(null);

  // Draw the overview line source/layers via the SHARED lifecycle

  // (useDrawWhenReady — same primitive as RouteLines, so both pipelines

  // behave identically: retry until the first successful draw, then only

  // redraw on real data/style changes, never on idle chatter).

  // Heavy derived geometry (overlap runs, diverging segments) is memoized
  // so redraws never recompute it — only data changes rebuild the features.
  const overviewFeatures = useMemo<OverviewFeature[]>(() => {
    // The BASE direction is the route's primary line — always drawn in

    // full on its saved geometry. The derived RETURN is drawn ONLY where

    // it genuinely leaves the base corridor (divergingSegments). Shared

    // bidirectional corridors get a subtle tapered lateral shift so both

    // directions read as two parallel lines (Pasted #34 model).

    const overlapRuns = new Map(
      findOppositeOverlapRuns(
        overviewRoutes.flatMap((route) => {
          const coords = route.polyline?.coordinates ?? [];

          return coords.length >= 2 ? [{ routeId: route.routeId, coords }] : [];
        }),
      ).map((entry) => [entry.routeId, entry.runs]),
    );

    const features: OverviewFeature[] = [];

    let nextFeatureId = 0;

    const metaOf = new Map(
      overviewRoutes.map((route) => [
        route.routeId,

        { name: route.name, color: route.color || "#1B6DB2" },
      ]),
    );

    overviewRoutes.forEach((route) => {
      const meta = metaOf.get(route.routeId) ?? { name: "", color: "#1B6DB2" };

      const baseCoords = route.polyline?.coordinates ?? [];

      const returnCoords = route.returnPolyline?.coordinates ?? [];

      if (baseCoords.length >= 2) {
        features.push({
          id: nextFeatureId++,

          type: "Feature",

          properties: {
            routeId: route.routeId,
            name: meta.name,
            color: meta.color,
            direction: "base",
          },

          geometry: {
            type: "LineString",
            coordinates: shiftOverlapRuns(
              baseCoords,
              overlapRuns.get(route.routeId) ?? [],
            ),
          },
        });
      }

      for (const run of divergingSegments(returnCoords, baseCoords)) {
        features.push({
          id: nextFeatureId++,

          type: "Feature",

          properties: {
            routeId: route.routeId,
            name: meta.name,
            color: meta.color,
            direction: "return",
          },

          geometry: { type: "LineString", coordinates: run },
        });
      }
    });

    return features;
  }, [overviewRoutes]);
  // One-time fade-in per MOUNT — the same simple pattern as the editor's
  // draft line: one trigger (this effect), retry until the base layer exists,
  // then a single 0→1 fade. No anchors, no crossfades, no re-fades: a later
  // data change (refetch / save) swaps the geometry INSTANTLY via the apply —
  // re-fading the already-visible lines is what reads as the flicker.
  // Deliberately NOT inside the apply step: the fade's setPaintProperty calls
  // emit `styledata`, which useDrawWhenReady treats as a style reload
  // (invalidate → apply → fade → styledata → …) — that cycle self-sustains
  // into a constant fade loop.
  const fadedInRef = useRef(false);
  /** Whether the overview source was missing at this mount's first data-effect
   *  run (evaluated BEFORE the ensure creates it): missing → FRESH (fade in
   *  0→1); present → the layers survived the edit (fast return → restore to
   *  full instantly, never zero the visible lines). Decided from MAP state
   *  only — module state is unreliable under HMR module duplication. */
  const freshRef = useRef<boolean | null>(null);
  useEffect(() => {
    if (!map) return;
    // Capture the mount-time source state BEFORE the empty-features guard and
    // before the ensure can create the source: on the initial page load the
    // ensure may create the (empty) source while the overview query is still
    // resolving — capturing after that would misclassify the fresh overview
    // as a "survivor" and skip the fade-in.
    if (freshRef.current === null) {
      freshRef.current = !map.getSource("overview-lines");
    }
    if (overviewFeatures.length === 0) return;
    if (fadedInRef.current) return;
    let attempts = 0;
    const tryFade = () => {
      if (!map.getLayer("overview-lines-base")) {
        if (attempts++ < 300) requestAnimationFrame(tryFade);
        return;
      }
      fadedInRef.current = true;
      if (freshRef.current) {
        animateOverviewFadeIn(map);
      } else {
        // Layers survived the edit (fast return) — they are at some partial
        // opacity from the cancelled teardown fade-out. Never zero the
        // visible lines; restore them to full immediately.
        writeOverviewOpacity(map, 1);
      }
    };
    tryFade();
  }, [overviewFeatures, map]);

  useDrawWhenReady(
    map,
    [overviewFeatures],
    () => {
      if (!map) return false;
      ensureGeoJsonSource(map, "overview-lines");

      if (!map.hasImage("route-arrow")) {
        const arrow = createArrowIcon();

        if (arrow) map.addImage("route-arrow", arrow, { sdf: true });
      }

      const lineLayers = [
        lineLayerSpec("overview-lines-casing-base", {
          source: "overview-lines",

          filter: ["==", ["get", "direction"], "base"],

          color: ["literal", "#ffffff"],

          width: 7,

          opacity: overviewOpacityAt(1),
        }),

        lineLayerSpec("overview-lines-casing-return", {
          source: "overview-lines",

          filter: ["==", ["get", "direction"], "return"],

          color: ["literal", "#ffffff"],

          width: 7,

          opacity: overviewOpacityAt(1),
        }),

        lineLayerSpec("overview-lines-base", {
          source: "overview-lines",

          filter: ["==", ["get", "direction"], "base"],

          color: ["coalesce", ["get", "color"], "#1B6DB2"],

          width: 3.5,

          opacity: overviewOpacityAt(1),
        }),

        lineLayerSpec("overview-lines-return", {
          source: "overview-lines",

          filter: ["==", ["get", "direction"], "return"],

          color: ["coalesce", ["get", "color"], "#1B6DB2"],

          width: 3.5,

          opacity: overviewOpacityAt(1),
        }),
      ];

      for (const layer of lineLayers) {
        if (!map.getLayer(layer.id)) map.addLayer(layer);
      }

      for (const direction of ["base", "return"] as const) {
        const id = `overview-arrows-${direction}`;

        if (!map.getLayer(id)) {
          map.addLayer({
            id,

            type: "symbol",

            source: "overview-lines",

            filter: ["==", ["get", "direction"], direction],

            layout: {
              "symbol-placement": "line",

              "symbol-spacing": ARROW_SPACING_PX,

              "icon-image": "route-arrow",

              "icon-size": 0.7,

              "icon-rotation-alignment": "map",

              "icon-allow-overlap": false,
            },

            paint: {
              "icon-color": ["coalesce", ["get", "color"], "#1B6DB2"],

              "icon-opacity": overviewOpacityAt(1),
            },
          });
        }
      }

      return true;
    },

    // Signature = the memoized feature array identity: a data change rebuilds
    // the memo (new reference); a style reload resets the util's signature so
    // the rebuild still redraws (perf-audit review fix).
    () => overviewFeatures,
    () => {
      const features = overviewFeatures;
      featuresRef.current = features.map((feature) => ({
        id: feature.id,
        routeId: feature.properties.routeId,
      }));
      setSourceData(map!, "overview-lines", features);
    },
    OVERVIEW_LAYERS,
  );

  /** The map-scoped mount token: a fresh object identity per mount, stored on
   *  the MAP (shared across module copies — HMR can load two copies of this
   *  module, so module-level state is unreliable). The unmount teardown
   *  captures its own token; its delayed fade-out/removeAll are ABORTED if a
   *  newer mount already re-owns the layers (fast Back during the 250 ms
   *  overview→edit fade-out would otherwise let the old teardown fight the
   *  new fade-in and delete the new mount's layers — the edit→overview
   *  flicker). */
  /** Cancel handle of the in-flight teardown fade-out (best-effort; module
   *  state is unreliable under HMR duplication, so this is a soft cancel). */
  const teardownFadeCancelRef = useRef<(() => void) | null>(null);

  // Tear down the overview layers/source/image only when the component
  // unmounts (or the map is replaced) — NOT on every data refresh, which
  // would rebuild all six layers repeatedly and flicker. MapLibre keeps
  // whatever was drawn, so without this they'd linger under the editing view.
  // CROSSFADE: on unmount (overview→edit) the old geometry fades OUT over
  // OVERVIEW_FADE_MS while the editor's draft line fades in on top, then the
  // layers/source/image are removed — no cut, no blank frame.
  useEffect(() => {
    if (!map) return;
    // Claim the map for THIS setup: every setup (StrictMode cycle, map
    // re-settle) gets a FRESH token, so any prior teardown's fade-out and
    // delayed removal abort the moment this setup runs.
    const myToken = {};
    (
      map as MapLibreMap & { __komyuterOverviewMount?: object }
    ).__komyuterOverviewMount = myToken;
    let removed = false;
    const removeAll = () => {
      if (removed) return;
      removed = true;
      if (!mapIsUsable(map)) return;
      for (const layerId of OVERVIEW_LAYERS) {
        if (map.getLayer(layerId)) map.removeLayer(layerId);
      }
      if (map.getSource("overview-lines")) {
        map.removeSource("overview-lines");
      }
      if (map.hasImage("route-arrow")) {
        map.removeImage("route-arrow");
      }
    };
    return () => {
      const layers: { id: string; prop: "line-opacity" | "icon-opacity" }[] =
        OVERVIEW_LAYERS.map((id) => ({
          id,
          prop: id.startsWith("overview-lines-")
            ? "line-opacity"
            : "icon-opacity",
        }));
      const cancel = fadeOutLayers(
        map,
        layers,
        OVERVIEW_FADE_MS,
        () => {
          teardownFadeCancelRef.current = null;
          removeAll();
        },
        // Abort the fade-out the moment a newer mount claims the map (fast
        // Back / StrictMode re-mount) — its opacity writes must never fight
        // the new mount's fade-in, and the delayed removal must never delete
        // the new mount's layers.
        () =>
          (map as MapLibreMap & { __komyuterOverviewMount?: object })
            .__komyuterOverviewMount !== myToken,
      );
      teardownFadeCancelRef.current = cancel;
    };
  }, [map]);

  // Hover + click interactions.
  useEffect(() => {
    if (!map) return;
    const clearHover = () => {
      setHoveredRouteId(null);
      setHover(null);
      map.getCanvas().style.cursor = "";
    };
    const onMouseLeave = (event: MapLayerMouseEvent) => {
      // The base/return pair sits on opposite sides of the road; leaving one
      // layer may just mean the pointer crossed onto its sibling. Only clear
      // when no overview line is under the pointer anymore.
      const hits = map.queryRenderedFeatures(event.point, {
        layers: OVERVIEW_LAYERS,
      });
      if (hits.length === 0) clearHover();
    };
    const onMove = (event: MapLayerMouseEvent) => {
      const feature = event.features?.[0];
      const routeId = feature?.properties?.routeId;
      if (typeof routeId !== "string" || !feature) {
        clearHover();
        return;
      }
      map.getCanvas().style.cursor = "pointer";
      setHoveredRouteId(routeId);
      setHover({
        x: event.point.x,
        y: event.point.y,
        name: String(feature.properties.name ?? ""),
      });
    };
    const onClick = (event: MapLayerMouseEvent) => {
      const feature = event.features?.[0];
      const routeId = feature?.properties?.routeId;
      if (typeof routeId !== "string" || !feature) return;
      setOverviewRouteId(routeId);
      const overview = overviewRoutesRef.current.find(
        (route) => route.routeId === routeId,
      );
      if (overview) fitToOverview(map, overview);
    };
    const onMapClick = (event: MapMouseEvent) => {
      const hits = map.queryRenderedFeatures(event.point, {
        layers: OVERVIEW_LAYERS,
      });
      if (hits.length === 0) setOverviewRouteId(null);
    };
    map.on("mousemove", OVERVIEW_LAYERS, onMove);
    map.on("mouseleave", OVERVIEW_LAYERS, onMouseLeave);
    map.on("click", OVERVIEW_LAYERS, onClick);
    map.on("click", onMapClick);
    return () => {
      map.off("mousemove", OVERVIEW_LAYERS, onMove);
      map.off("mouseleave", OVERVIEW_LAYERS, onMouseLeave);
      map.off("click", OVERVIEW_LAYERS, onClick);
      map.off("click", onMapClick);
      clearHover();
    };
  }, [map, setOverviewRouteId]);

  // Apply hover/focus emphasis: the active route at full opacity, every other
  // route dimmed via a numeric `dim` feature-state — 0.5 while hovering,
  // 0.15 while focused (focus takes precedence), null at rest.
  useEffect(() => {
    if (!map || !map.getSource("overview-lines")) return;
    const dim =
      overviewRouteId !== null ? 0.15 : hoveredRouteId !== null ? 0.2 : null;
    for (const feature of featuresRef.current) {
      const isHovered = feature.routeId === hoveredRouteId;
      const isFocused = feature.routeId === overviewRouteId;
      map.setFeatureState(
        { source: "overview-lines", id: feature.id },
        {
          hovered: isHovered,
          focused: isFocused,
          dim: !isHovered && !isFocused ? dim : null,
        },
      );
    }
  }, [map, hoveredRouteId, overviewRouteId, overviewRoutes]);

  const focused =
    overviewRoutes.find((route) => route.routeId === overviewRouteId) ?? null;

  return (
    <>
      {focused?.stops.map((stop, index) => {
        const shape = getStopShape(stop.type);
        const [lng, lat] = stop.location.coordinates;
        return (
          <Marker key={stop.stop_id} longitude={lng} latitude={lat}>
            <div className="flex flex-col items-center gap-0.5">
              <span
                className={[
                  "flex size-6 items-center justify-center border-2 border-white text-[11px] font-bold tabular-nums shadow-[0_1px_2px_rgba(0,0,0,0.3)] ring-2 ring-white",
                  SHAPE_CLASS[shape.shape],
                ].join(" ")}
                style={{ backgroundColor: shape.color, color: "#ffffff" }}
              >
                {shape.shape === "diamond" ? (
                  <span className="-rotate-45">{index + 1}</span>
                ) : (
                  index + 1
                )}
              </span>
              <span className="rounded-xs border border-[#1B6DB2] bg-white px-1 text-[10px] leading-4 font-medium text-[#1B6DB2]">
                {stop.name}
              </span>
            </div>
          </Marker>
        );
      })}
      {hover && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg border bg-white px-2 py-1 text-xs font-medium"
          style={{ left: hover.x, top: hover.y - 10 }}
        >
          {hover.name}
        </div>
      )}
    </>
  );
}
