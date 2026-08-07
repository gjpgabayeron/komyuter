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
  polyline: GeoLineString | null;
  stops: StopEntity[];
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
 * right panel offers editing. Rendered inside the map so it has map access.
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
        return {
          routeId: route.route_id,
          name: route.name,
          color: route.color,
          polyline: base?.base_polyline ?? null,
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
      if (!map.getLayer("overview-lines-casing")) {
        map.addLayer({
          id: "overview-lines-casing",
          type: "line",
          source: "overview-lines",
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-color": "#ffffff",
            "line-width": 7,
            "line-opacity": OVERVIEW_OPACITY,
          },
        });
      }
      if (!map.getLayer("overview-lines")) {
        map.addLayer({
          id: "overview-lines",
          type: "line",
          source: "overview-lines",
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-color": ["coalesce", ["get", "color"], "#1B6DB2"],
            "line-width": 3.5,
            "line-opacity": OVERVIEW_OPACITY,
          },
        });
      }
      const features = overviewRoutes
        .filter((route) => route.polyline !== null)
        .map((route, index) => ({
          id: index,
          type: "Feature" as const,
          properties: {
            routeId: route.routeId,
            name: route.name,
            color: route.color ?? "#1B6DB2",
          },
          geometry: route.polyline as GeoLineString,
        }));
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

  // Hover + click interactions.
  useEffect(() => {
    if (!map) return;
    const clearHover = () => {
      setHoveredRouteId(null);
      setHover(null);
      map.getCanvas().style.cursor = "";
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
        layers: ["overview-lines"],
      });
      if (hits.length === 0) setOverviewRouteId(null);
    };
    map.on("mousemove", "overview-lines", onMove);
    map.on("mouseleave", "overview-lines", clearHover);
    map.on("click", "overview-lines", onClick);
    map.on("click", onMapClick);
    return () => {
      map.off("mousemove", "overview-lines", onMove);
      map.off("mouseleave", "overview-lines", clearHover);
      map.off("click", "overview-lines", onClick);
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
