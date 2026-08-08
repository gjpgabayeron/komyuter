import { useEffect, useMemo, useRef, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { Marker, useMap } from "react-map-gl/maplibre";
import type {
  ExpressionSpecification,
  GeoJSONSource,
  Map as MapLibreMap,
  MapLayerMouseEvent,
  MapMouseEvent,
} from "maplibre-gl";
import type { GeoLineString } from "@komyuter/shared";
import type { RouteSummary, StopEntity } from "./routesApi";
import { getRoute } from "./routesApi";
import { routeKeys } from "@/lib/queryKeys";
import { usePlottingStore } from "@/lib/plottingStore";
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

/** Rasterizes a small right-pointing triangle into an RGBA image for
 *  MapLibre's SDF icon pipeline (icon-color tints it per route). The triangle
 *  points EAST; the symbol layer's line placement rotates it to the direction
 *  of travel. */
function createArrowIcon(): {
  width: number;
  height: number;
  data: Uint8ClampedArray;
} | null {
  if (typeof document === "undefined") return null;
  const size = 28;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = "#000000";
  ctx.beginPath();
  ctx.moveTo(6, 5); // back top
  ctx.lineTo(23, 14); // tip
  ctx.lineTo(6, 23); // back bottom
  ctx.closePath();
  ctx.fill();
  return {
    width: size,
    height: size,
    data: ctx.getImageData(0, 0, size, size).data,
  };
}

/** Default: all routes visible. When any route is hovered/focused, the active
 *  one stays at full opacity and everything else recedes. */
const OVERVIEW_OPACITY: ExpressionSpecification = [
  "case",
  ["==", ["feature-state", "hovered"], true],
  1,
  ["==", ["feature-state", "focused"], true],
  1,
  ["==", ["feature-state", "emphasized"], true],
  0.15,
  0.9,
];

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
  stops: StopEntity[];
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
export function RouteOverviewLayer({ routes }: { routes: RouteSummary[] }) {
  const map = useMap().current?.getMap();
  const overviewRouteId = usePlottingStore((s) => s.overviewRouteId);
  const setOverviewRouteId = usePlottingStore((s) => s.setOverviewRouteId);

  const details = useQueries({
    queries: routes.map((route) => ({
      queryKey: routeKeys.detail(route.route_id),
      queryFn: () => getRoute(route.route_id),
      staleTime: 30_000,
    })),
  });

  const overviewRoutes = useMemo<OverviewRoute[]>(
    () =>
      routes.map((route, index) => {
        const base = details[index]?.data?.directions[0];
        const returnDirection = details[index]?.data?.directions[1];
        return {
          routeId: route.route_id,
          name: route.name,
          color: route.color,
          polyline: base?.base_polyline ?? null,
          returnPolyline: returnDirection?.base_polyline ?? null,
          stops: base?.stops ?? [],
        };
      }),
    [routes, details],
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

  // Draw the overview line source/layers (imperative — same pattern as RouteLines).
  useEffect(() => {
    if (!map) return;
    const update = () => {
      if (!map.isStyleLoaded()) return;
      if (!map.getSource("overview-lines")) {
        map.addSource("overview-lines", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
      }
      if (!map.hasImage("route-arrow")) {
        const arrow = createArrowIcon();
        if (arrow) map.addImage("route-arrow", arrow, { sdf: true });
      }
      if (!map.getLayer("overview-lines-casing-base")) {
        map.addLayer({
          id: "overview-lines-casing-base",
          type: "line",
          source: "overview-lines",
          filter: ["==", ["get", "direction"], "base"],
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-color": "#ffffff",
            "line-width": 7,
            "line-opacity": OVERVIEW_OPACITY,
          },
        });
      }
      if (!map.getLayer("overview-lines-casing-return")) {
        map.addLayer({
          id: "overview-lines-casing-return",
          type: "line",
          source: "overview-lines",
          filter: ["==", ["get", "direction"], "return"],
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-color": "#ffffff",
            "line-width": 7,
            "line-opacity": OVERVIEW_OPACITY,
          },
        });
      }
      if (!map.getLayer("overview-lines-base")) {
        map.addLayer({
          id: "overview-lines-base",
          type: "line",
          source: "overview-lines",
          filter: ["==", ["get", "direction"], "base"],
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-color": ["coalesce", ["get", "color"], "#1B6DB2"],
            "line-width": 3.5,
            "line-opacity": OVERVIEW_OPACITY,
          },
        });
      }
      if (!map.getLayer("overview-lines-return")) {
        map.addLayer({
          id: "overview-lines-return",
          type: "line",
          source: "overview-lines",
          filter: ["==", ["get", "direction"], "return"],
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-color": ["coalesce", ["get", "color"], "#1B6DB2"],
            "line-width": 3.5,
            "line-opacity": OVERVIEW_OPACITY,
          },
        });
      }
      if (!map.getLayer("overview-arrows-base")) {
        map.addLayer({
          id: "overview-arrows-base",
          type: "symbol",
          source: "overview-lines",
          filter: ["==", ["get", "direction"], "base"],
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
            "icon-opacity": OVERVIEW_OPACITY,
          },
        });
      }
      if (!map.getLayer("overview-arrows-return")) {
        map.addLayer({
          id: "overview-arrows-return",
          type: "symbol",
          source: "overview-lines",
          filter: ["==", ["get", "direction"], "return"],
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
            "icon-opacity": OVERVIEW_OPACITY,
          },
        });
      }
      // The BASE direction is the route's primary line — always drawn in full
      // on its saved geometry. The derived RETURN is drawn ONLY where it
      // genuinely leaves the base corridor (divergingSegments): on shared
      // stretches the return is an exact reverse (redundant), so drawing it
      // there would split the route into two parallel lines. Every road is
      // therefore rendered once, unbroken — no artificial gaps or spacing.
      //
      // Where two routes genuinely share a bidirectional corridor (or a single
      // loop doubles back on itself), the overlapping runs get a subtle lateral
      // shift — right of travel, tapered at each end — so both directions read
      // as two parallel lines instead of hiding behind each other. Everything
      // else stays a single unbroken line (Pasted #34 model).
      const overlapRuns = new Map(
        findOppositeOverlapRuns(
          overviewRoutes.flatMap((route) => {
            const coords = route.polyline?.coordinates ?? [];
            return coords.length >= 2
              ? [{ routeId: route.routeId, coords }]
              : [];
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
        const meta = metaOf.get(route.routeId) ?? {
          name: "",
          color: "#1B6DB2",
        };
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
      featuresRef.current = features.map((feature) => ({
        id: feature.id,
        routeId: feature.properties.routeId,
      }));
      (map.getSource("overview-lines") as GeoJSONSource | undefined)?.setData({
        type: "FeatureCollection",
        features,
      } as Parameters<GeoJSONSource["setData"]>[0]);
    };
    if (map.isStyleLoaded()) update();
    map.on("load", update);
    map.on("styledata", update);
    return () => {
      map.off("load", update);
      map.off("styledata", update);
    };
  }, [map, overviewRoutes]);

  // Tear down the overview layers/source/image only when the component
  // unmounts (or the map is replaced) — NOT on every data refresh, which
  // would rebuild all six layers repeatedly and flicker. MapLibre keeps
  // whatever was drawn, so without this they'd linger under the editing view.
  useEffect(() => {
    if (!map) return;
    return () => {
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
  // route receded once anything is active.
  useEffect(() => {
    if (!map || !map.getSource("overview-lines")) return;
    const anythingActive = hoveredRouteId !== null || overviewRouteId !== null;
    for (const feature of featuresRef.current) {
      const isHovered = feature.routeId === hoveredRouteId;
      const isFocused = feature.routeId === overviewRouteId;
      map.setFeatureState(
        { source: "overview-lines", id: feature.id },
        {
          hovered: isHovered,
          focused: isFocused,
          emphasized: anythingActive && !isHovered && !isFocused,
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
