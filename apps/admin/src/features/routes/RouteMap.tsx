import { useEffect, useState } from "react";
import type { StyleSpecification } from "maplibre-gl";
import { MapPin } from "lucide-react";
import type { GeoLineString } from "@komyuter/shared";
import "maplibre-gl/dist/maplibre-gl.css";
import Map, { MapProvider, Marker, useMap } from "react-map-gl/maplibre";
import type { GeoJSONSource } from "maplibre-gl";
import { PoiSearchBar } from "@/features/routes/PoiSearchBar";
import { getTileSource, ILOILO_CITY } from "@/lib/tiles";
import { straightLineThrough } from "@/lib/coords";
import { getStopShape, type StopShape } from "@/lib/stopShapes";
import { STOP_TYPE_LABELS } from "@/features/routes/stopLabels";
import { clearSelection, isStopSelected, selectStop } from "@/lib/selection";
import { usePlottingStore } from "@/lib/plottingStore";

/** Signboard green-blue (draft path — committed to save). */
const DRAFT_LINE = "#1B6DB2";
/** Vivid orange (connecting/preview line — the proposed "after" path awaiting
 *  Apply/Revert). Chosen to stand out against light AND dark map tiles, and
 *  clearly distinct from the committed blue line. */
const PREVIEW_LINE = "#FF5C00";

/** Static Tailwind classes per stop shape (FR-015). */
const SHAPE_CLASS: Record<StopShape, string> = {
  square: "rounded-[4px]",
  circle: "rounded-full",
  diamond: "rotate-45 rounded-[3px]",
};

const BASE_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    "route-sign-basemap": getTileSource(),
  },
  layers: [
    {
      id: "route-sign-basemap",
      type: "raster",
      source: "route-sign-basemap",
    },
  ],
};

interface Viewport {
  longitude: number;
  latitude: number;
  zoom: number;
}

interface RouteMapProps {
  className?: string;
  /** Overlay layers (path/stops) rendered above the map, added in US1+. */
  children?: React.ReactNode;
}

/**
 * Full-bleed MapLibre base map for the Route Plotting page (Q1/B layout).
 * Owns its viewport; later phases lift the viewport into the plotting store
 * when the map needs to react to external actions (e.g. "zoom to route").
 */
/**
 * Frames the whole route whenever `requestFit` is fired (route selection,
 * route load). Reads fresh state at effect time so async-loaded stops/paths
 * are framed once they arrive.
 */
function RouteFitter() {
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

/**
 * Smoothly pans and centers the selected stop's marker (from map click or
 * stop list), so the active stop is always in view. Reads fresh store state
 * at effect time so a stale stop id never panics.
 */
function SelectionPanner() {
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

/**
 * Imperatively draws the route lines straight onto the map via the raw
 * maplibre API. This deliberately bypasses react-map-gl's <Source>/<Layer>
 * components, whose internal `map.style._loaded` gating proved unreliable
 * across maplibre versions — addSource/addLayer/setData are the canonical
 * maplibre calls and always render once the style is loaded.
 */
interface RouteLineFeature {
  type: "Feature";
  properties: { kind: "draft" | "connecting" };
  geometry: GeoLineString;
}

function RouteLines({
  draft,
  connecting,
  color,
}: {
  draft: GeoLineString | null;
  connecting: GeoLineString | null;
  color: string;
}) {
  const map = useMap().current?.getMap();

  useEffect(() => {
    if (!map) return;
    const update = () => {
      if (!map.isStyleLoaded()) return;
      if (!map.getSource("route-lines")) {
        map.addSource("route-lines", {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        });
      }
      if (!map.getLayer("route-line-draft")) {
        map.addLayer({
          id: "route-line-draft",
          type: "line",
          source: "route-lines",
          layout: { "line-cap": "round", "line-join": "round" },
          paint: { "line-color": color, "line-width": 4 },
          filter: ["==", ["get", "kind"], "draft"],
        });
      } else {
        // Live colour feedback: the committed line follows the route's colour
        // as it's edited in the properties panel.
        map.setPaintProperty("route-line-draft", "line-color", color);
      }
      if (!map.getLayer("route-line-connecting")) {
        map.addLayer({
          id: "route-line-connecting",
          type: "line",
          source: "route-lines",
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-color": PREVIEW_LINE,
            "line-width": 4,
            "line-dasharray": [2, 1],
          },
          filter: ["==", ["get", "kind"], "connecting"],
        });
      }
      const features: RouteLineFeature[] = [];
      if (draft) {
        features.push({
          type: "Feature",
          properties: { kind: "draft" },
          geometry: draft,
        });
      }
      if (connecting) {
        features.push({
          type: "Feature",
          properties: { kind: "connecting" },
          geometry: connecting,
        });
      }
      const source = map.getSource("route-lines") as GeoJSONSource | undefined;
      source?.setData({
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
  }, [map, draft, connecting, color]);

  return null;
}

export function RouteMap({ className, children }: RouteMapProps) {
  const routeColor = usePlottingStore((s) => s.routeMeta?.color ?? null);
  const [viewport, setViewport] = useState<Viewport>({
    longitude: ILOILO_CITY[0],
    latitude: ILOILO_CITY[1],
    zoom: 13,
  });

  const routeId = usePlottingStore((s) => s.routeId);
  const tool = usePlottingStore((s) => s.tool);
  const stops = usePlottingStore((s) => s.stops);
  const polyline = usePlottingStore((s) => s.polyline);
  const snap = usePlottingStore((s) => s.snap);
  const selection = usePlottingStore((s) => s.selection);
  const poi = usePlottingStore((s) => s.poi);
  const addStop = usePlottingStore((s) => s.addStop);
  const moveStop = usePlottingStore((s) => s.moveStop);
  const setSelection = usePlottingStore((s) => s.setSelection);
  const setPoi = usePlottingStore((s) => s.setPoi);

  const handleMapClick = (event: { lngLat: { lng: number; lat: number } }) => {
    // Any map click is a "different action" — dismiss the temporary POI marker.
    setPoi(null);
    // No plotting controls active with no route (FR-030).
    if (routeId === null) return;
    if (tool === "select") {
      // Select tool: tapping empty map clears the selection.
      setSelection(clearSelection);
      return;
    }
    // Add tool: exact [lng,lat] placement at the clicked point (FR-022);
    // placement is never blocked (FR-009); the store handles the connecting line.
    addStop([event.lngLat.lng, event.lngLat.lat]);
  };

  const canDrag = routeId !== null && tool === "select";

  // Always keep a visible connecting line between stops (FR-006): prefer the
  // road-following preview; otherwise draw a client-side straight line until a
  // snapped or committed path exists (FR-009 fallback — never block/blank).
  const connectingLine: GeoLineString | null =
    snap.status === "preview" && snap.polyline
      ? snap.polyline
      : polyline
        ? null
        : straightLineThrough(stops.map((stop) => stop.location));

  return (
    <div
      className={className}
      style={{ position: "relative", width: "100%", height: "100%" }}
    >
      <MapProvider>
        <Map
          {...viewport}
          onClick={handleMapClick}
          onMove={(event) =>
            setViewport({
              longitude: event.viewState.longitude,
              latitude: event.viewState.latitude,
              zoom: event.viewState.zoom,
            })
          }
          mapStyle={BASE_STYLE}
          style={{ width: "100%", height: "100%" }}
        >
          <RouteFitter />
          <SelectionPanner />
          <RouteLines
            draft={polyline}
            connecting={connectingLine}
            color={routeColor ?? DRAFT_LINE}
          />
          {routeId !== null && <PoiSearchBar />}
          {poi && (
            <Marker longitude={poi[0]} latitude={poi[1]}>
              <div className="flex flex-col items-center gap-0.5">
                <span className="flex size-7 items-center justify-center rounded-full border-2 border-white bg-[#C98A1B] text-[#201A10] shadow-[0_1px_2px_rgba(0,0,0,0.3)] ring-2 ring-white">
                  <MapPin className="size-4" />
                </span>
                <span className="rounded-xs border border-[#C98A1B] bg-white px-1 text-[10px] leading-4 font-medium text-[#201A10]">
                  Place
                </span>
              </div>
            </Marker>
          )}
          {stops.map((stop, index) => {
            const selected = isStopSelected(selection, stop.id);
            const shape = getStopShape(stop.type);
            return (
              <Marker
                key={stop.id}
                longitude={stop.location[0]}
                latitude={stop.location[1]}
                draggable={canDrag}
                onDragEnd={(event: { lngLat: { lng: number; lat: number } }) =>
                  moveStop(stop.id, [event.lngLat.lng, event.lngLat.lat])
                }
              >
                <div className="relative flex flex-col items-center">
                  <button
                    type="button"
                    aria-label={`Stop ${index + 1}: ${stop.name} (${STOP_TYPE_LABELS[stop.type]})`}
                    onClick={(event) => {
                      event.stopPropagation();
                      setSelection(selectStop(stop.id));
                    }}
                    style={{
                      backgroundColor: shape.color,
                      borderColor: "#ffffff",
                      color:
                        stop.type === "waiting_area" ? "#201A10" : "#ffffff",
                    }}
                    className={[
                      // Filled type-colour plate + white border + white halo for
                      // contrast against any basemap; selection adds a dark outline.
                      "flex size-7 items-center justify-center border-2 text-xs font-bold tabular-nums shadow-[0_1px_2px_rgba(0,0,0,0.3)] ring-2 ring-white transition-colors",
                      SHAPE_CLASS[shape.shape],
                      selected &&
                        "outline-foreground outline-2 outline-offset-1",
                      canDrag
                        ? "cursor-grab active:cursor-grabbing"
                        : "cursor-pointer",
                    ].join(" ")}
                  >
                    {shape.shape === "diamond" ? (
                      <span className="-rotate-45">{index + 1}</span>
                    ) : (
                      index + 1
                    )}
                  </button>
                  {/* Labels are absolutely positioned so the marker plate stays
                    perfectly centered when a label appears (no perceived shift). */}
                  {selected ? (
                    <span className="absolute top-full mt-0.5 max-w-28 truncate rounded-xs border border-[#1B6DB2] bg-white px-1 text-[10px] leading-4 font-medium text-[#1B6DB2]">
                      {stop.name}
                    </span>
                  ) : (
                    index === 0 && (
                      <span className="absolute top-full mt-0.5 rounded-xs border border-[#1B6DB2] bg-white px-1 text-[10px] leading-4 font-medium text-[#1B6DB2]">
                        Start
                      </span>
                    )
                  )}
                </div>
              </Marker>
            );
          })}
          {children}
        </Map>
      </MapProvider>
    </div>
  );
}
