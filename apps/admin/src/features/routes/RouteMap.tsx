import { fadeLineLayers, fadeOutLayers } from "@/lib/overviewFade";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { MapPin } from "lucide-react";
import type { GeoLineString } from "@komyuter/shared";
import "maplibre-gl/dist/maplibre-gl.css";
import Map, { MapProvider, Marker, useMap } from "react-map-gl/maplibre";

import { PoiSearchBar } from "@/features/routes/PoiSearchBar";
import { baseMapStyleFor, ILOILO_CITY } from "@/lib/tiles";
import {
  ensureGeoJsonSource,
  lineLayerSpec,
  setSourceData,
  useDrawWhenReady,
} from "@/lib/mapLayers";
import { resolveConnectingLine } from "@/lib/coords";
import { pathFromConnections } from "@/lib/connections";
import { getStopShape, type StopShape } from "@/lib/stopShapes";
import { STOP_TYPE_LABELS } from "@/features/routes/stopLabels";
import { clearSelection, isStopSelected, selectStop } from "@/lib/selection";
import {
  usePlottingStore,
  visibleStopsForLayers,
  type DraftStop,
} from "@/lib/plottingStore";

/** Signboard green-blue (draft path — committed to save). */
const DRAFT_LINE = "#1B6DB2";
/** Crossfade-out duration for the editor's committed draft line (edit→overview). */
const DRAFT_FADE_OUT_MS = 200;
/** Vivid orange (transient connecting line — the straight fallback shown
 *  until a road-snapped path exists; never persisted). */
const PREVIEW_LINE = "#FF5C00";

/** Static Tailwind classes per stop shape (FR-015). */
const SHAPE_CLASS: Record<StopShape, string> = {
  square: "rounded-[4px]",
  circle: "rounded-full",
  diamond: "rotate-45 rounded-[3px]",
};

/** Basemap layers that the opacity fade must NEVER touch — the route lines
 *  and overview overlays are drawn on top of the basemap and stay opaque. */
const OVERLAY_LAYER_PREFIXES = ["route-line-", "overview-", "route-arrow"];

interface Viewport {
  longitude: number;
  latitude: number;
  zoom: number;
  pitch: number;
  bearing: number;
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
 * Applies the 3D camera when the basemap style is "3d" (the liberty style
 * shown in a tilted perspective, per OpenFreeMap's own demo): tilts the map
 * to pitch 60 and allows rotation; switching back to a flat style levels the
 * camera. Mirrors OpenFreeMap's liberty-3d demo behavior.
 */
function PerspectiveController() {
  const map = useMap().current?.getMap();
  const baseStyle = usePlottingStore((s) => s.layers.baseStyle);

  useEffect(() => {
    if (!map || !map.isStyleLoaded()) return;
    if (baseStyle === "3d") {
      map.easeTo({ pitch: 60, bearing: 0, duration: 500 });
    } else {
      map.easeTo({ pitch: 0, bearing: 0, duration: 500 });
    }
  }, [map, baseStyle]);

  return null;
}

/**
 * Applies the basemap layer controls to the raster layer: visibility (on/off)
 * and `raster-opacity`. Rendered INSIDE `<Map>` (where useMap() resolves) and
 * re-applies on every style load, so switching the basemap style can never
 * leave the layer uncontrolled.
 */
function BasemapController() {
  const map = useMap().current?.getMap();
  const baseOpacity = usePlottingStore((s) => s.layers.baseOpacity);

  useEffect(() => {
    if (!map) return;
    const apply = () => {
      if (!map.isStyleLoaded()) return;
      // Fade the BASEMAP layers (the map's own style layers) to the chosen
      // opacity. The route lines / overview overlays are skipped so they
      // always stay fully opaque. Overwriting the opacity paint props with a
      // constant is safe for basemap layers (their defaults are 1.0).
      const layers = map.getStyle()?.layers ?? [];
      for (const layer of layers) {
        if (
          OVERLAY_LAYER_PREFIXES.some((prefix) => layer.id.startsWith(prefix))
        ) {
          continue;
        }
        switch (layer.type) {
          case "background":
            map.setPaintProperty(layer.id, "background-opacity", baseOpacity);
            break;
          case "fill":
            map.setPaintProperty(layer.id, "fill-opacity", baseOpacity);
            break;
          case "line":
            map.setPaintProperty(layer.id, "line-opacity", baseOpacity);
            break;
          case "symbol":
            map.setPaintProperty(layer.id, "icon-opacity", baseOpacity);
            map.setPaintProperty(layer.id, "text-opacity", baseOpacity);
            break;
          case "raster":
            map.setPaintProperty(layer.id, "raster-opacity", baseOpacity);
            break;
          default:
            break;
        }
      }
    };
    apply();
    map.on("styledata", apply);
    map.on("load", apply);
    return () => {
      map.off("styledata", apply);
      map.off("load", apply);
    };
  }, [map, baseOpacity]);

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
  properties: { kind: "draft" | "connecting"; color: string };
  geometry: GeoLineString;
}

const RouteLines = memo(function RouteLines({
  draft,
  connecting,
  color,
  routeId,
}: {
  draft: GeoLineString | null;
  connecting: GeoLineString | null;
  color: string;
  routeId: string | null;
}) {
  const map = useMap().current?.getMap();
  // Crossfade bookkeeping for the draft line: keep the CURRENT draft in a ref
  // (the fade-out completion checks it), the LAST non-null draft (the anchor
  // to fade out), and a guard that pauses the apply's source update while a
  // fade-out is running (otherwise setData([]) would cut the line instantly).
  const draftRef = useRef<GeoLineString | null>(draft);
  draftRef.current = draft;
  const lastDraftRef = useRef<GeoLineString | null>(null);
  const draftFadeOutRef = useRef(false);
  // One-time fade-in for the committed draft line per route open: entering
  // the editor from the overview fades the polyline in instead of popping it
  // (the overview→edit transition carries the fade over). Keyed on routeId so
  // snap auto-commits during editing stay immediate (responsiveness), and the
  // fade re-arms for the next route. Deliberately NOT inside the apply step —
  // the fade's setPaintProperty emits `styledata`, which would feed
  // useDrawWhenReady's invalidate→apply cycle (the overview fade-loop bug).
  const draftFadedForRef = useRef<string | null>(null);
  useEffect(() => {
    if (!map || !draft || routeId === null) return;
    if (draftFadedForRef.current === routeId) return;
    const layerId = "route-line-draft";
    let attempts = 0;
    const tryFade = () => {
      if (map.getLayer(layerId)) {
        draftFadedForRef.current = routeId;
        fadeLineLayers(map, [{ id: layerId, prop: "line-opacity" }]);
        return;
      }
      // The layer is created by useDrawWhenReady on style load — retry a few
      // frames so the very first draw still fades in.
      if (attempts++ < 30) requestAnimationFrame(tryFade);
    };
    tryFade();
  }, [map, draft, routeId]);

  // CROSSFADE OUT (edit→overview / route close): when the committed draft
  // becomes null while geometry was showing, fade the line to 0 over ~200 ms
  // instead of popping it — the overview's fresh lines fade in on top. The
  // apply step pauses its source update during the fade (guard below), and the
  // geometry is only cleared after the fade completes.
  const draftFadeOutCancelRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (!map) return;
    if (draft) {
      lastDraftRef.current = draft;
      // A new route opened while (or right after) a fade-out was running:
      // cancel the fade, unblock the apply guard, and re-arm the fade-in so
      // the fresh draft actually renders (second-edit blank bug — the layer
      // was left at opacity 0 and the fade-in skipped for the same routeId).
      if (draftFadeOutRef.current) {
        draftFadeOutRef.current = false;
        draftFadeOutCancelRef.current?.();
        draftFadeOutCancelRef.current = null;
        draftFadedForRef.current = null;
      }
      return;
    }
    if (!lastDraftRef.current || draftFadeOutRef.current) return;
    draftFadeOutRef.current = true;
    draftFadedForRef.current = null; // re-arm the fade-in for the NEXT open
    draftFadeOutCancelRef.current = fadeOutLayers(
      map,
      [{ id: "route-line-draft", prop: "line-opacity" }],
      DRAFT_FADE_OUT_MS,
      () => {
        draftFadeOutRef.current = false;
        draftFadeOutCancelRef.current = null;
        // Only clear the geometry if the route is still closed — a new route
        // may have opened during the fade (its own data must survive).
        if (draftRef.current === null) {
          lastDraftRef.current = null;
          setSourceData(map, "route-lines", []);
        }
      },
    );
    return () => {
      draftFadeOutCancelRef.current?.();
      draftFadeOutCancelRef.current = null;
    };
  }, [map, draft]);

  useDrawWhenReady(
    map,
    [draft, connecting, color],
    () => {
      if (!map) return false;
      ensureGeoJsonSource(map, "route-lines");
      const layers = [
        lineLayerSpec("route-line-connecting", {
          source: "route-lines",
          filter: ["==", ["get", "kind"], "connecting"],
          color: ["coalesce", ["get", "color"], PREVIEW_LINE],
          width: 4,
          dasharray: [2, 1],
        }),
        lineLayerSpec("route-line-draft", {
          source: "route-lines",
          filter: ["==", ["get", "kind"], "draft"],
          color: ["coalesce", ["get", "color"], DRAFT_LINE],
          width: 4,
        }),
      ];
      for (const layer of layers) {
        if (!map.getLayer(layer.id)) map.addLayer(layer);
      }
      return true;
    },
    () => {
      const features: RouteLineFeature[] = [];
      if (draft) {
        features.push({
          type: "Feature",
          properties: { kind: "draft", color },
          geometry: draft,
        });
      }
      if (connecting) {
        features.push({
          type: "Feature",
          properties: { kind: "connecting", color: PREVIEW_LINE },
          geometry: connecting,
        });
      }
      // Content-based signature INCLUDING coordinates: a drag that keeps the
      // same vertex count still redraws (perf-audit review fix).
      return JSON.stringify(
        features.map((f) => [
          f.properties.kind,
          f.properties.color,
          f.geometry.coordinates,
        ]),
      );
    },
    () => {
      const features: RouteLineFeature[] = [];
      if (draft) {
        features.push({
          type: "Feature",
          properties: { kind: "draft", color },
          geometry: draft,
        });
      }
      if (connecting) {
        features.push({
          type: "Feature",
          properties: { kind: "connecting", color: PREVIEW_LINE },
          geometry: connecting,
        });
      }
      // While a draft fade-out runs, keep the previous geometry pinned so the
      // line can fade out instead of being cut by an empty source update.
      if (draftFadeOutRef.current) return;
      setSourceData(map!, "route-lines", features);
    },
    ["route-line-draft", "route-line-connecting"],
  );

  return null;
});

export function RouteMap({ className, children }: RouteMapProps) {
  const routeColor = usePlottingStore((s) => s.routeMeta?.color ?? null);
  const [viewport, setViewport] = useState<Viewport>({
    longitude: ILOILO_CITY[0],
    latitude: ILOILO_CITY[1],
    zoom: 13,
    pitch: 0,
    bearing: 0,
  });

  const routeId = usePlottingStore((s) => s.routeId);
  const tool = usePlottingStore((s) => s.tool);
  const stops = usePlottingStore((s) => s.stops);
  const connections = usePlottingStore((s) => s.connections);
  const polyline = usePlottingStore((s) => s.polyline);
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

  const handleStopClick = (stopId: string) => {
    if (routeId === null) return;
    setSelection(selectStop(stopId));
  };

  const canDrag = routeId !== null && tool === "select";

  // Keep a visible connecting line between stops (FR-006): the committed
  // road-snapped draft is drawn separately; before any path exists a
  // client-side straight line bridges the stops so the map is never blank
  // (FR-009 fallback — it is only ever a display line, never persisted).
  // Locations follow the CHAIN order: stops disconnected (connected-to/from
  // = None) drop off both the fallback and the transient stub.
  const chainOrderedLocations = useMemo(() => {
    const chain = pathFromConnections(connections, stops);
    if (chain.stopIds.length < 2) {
      // Degenerate graph (no path yet): keep only stops that still have at
      // least one connection, so a disconnected stop never reappears.
      return stops
        .filter((stop) =>
          connections.some(
            (edge) => edge.from === stop.id || edge.to === stop.id,
          ),
        )
        .map((stop) => stop.location);
    }
    return chain.stopIds
      .map((id) => stops.find((stop) => stop.id === id))
      .filter((stop): stop is DraftStop => stop !== undefined)
      .map((stop) => stop.location);
  }, [connections, stops]);
  const pathStopIds = usePlottingStore((s) => s.pathStopIds);
  // True only when the committed road path no longer matches the current
  // chain: after setStopLinks (a rewire OR a disconnect) the association is
  // nulled, and once the re-snap lands it mismatches by order or length. A
  // placement (extra stop) never fires it — the transient stub handles the
  // new stop, so no chain line flashes on ordinary placement near the path.
  const chainOutOfSync = useMemo(() => {
    const chain = pathFromConnections(connections, stops);
    if (chain.stopIds.length < 2) return false;
    if (pathStopIds === null) return true; // mid-rewire: association invalidated
    return (
      pathStopIds.length === chain.stopIds.length &&
      !pathStopIds.every((id, i) => id === chain.stopIds[i])
    );
  }, [connections, stops, pathStopIds]);
  const connectingLine = useMemo(
    () =>
      resolveConnectingLine(polyline, chainOrderedLocations, chainOutOfSync),
    [polyline, chainOrderedLocations, chainOutOfSync],
  );

  // Layer filtering (FR-016): markers follow Stops/Terminals; the route path
  // lines follow Routes. Original placement indices are kept for numbering.
  const layers = usePlottingStore((s) => s.layers);
  // Memoize the basemap style: a STABLE reference unless the style choice
  // actually changes. react-map-gl reloads the whole style whenever the
  // mapStyle reference differs — a fresh object per render would setStyle on
  // every re-render (marker toggles, opacity) and flicker the route lines.
  const mapStyle = useMemo(
    () => baseMapStyleFor(layers.baseStyle),
    [layers.baseStyle],
  );
  const visibleMarkers = useMemo(
    () =>
      visibleStopsForLayers(stops, layers).map((stop) => ({
        stop,
        index: stops.findIndex((s) => s.id === stop.id),
      })),
    [stops, layers],
  );

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
              pitch: event.viewState.pitch ?? 0,
              bearing: event.viewState.bearing ?? 0,
            })
          }
          mapStyle={mapStyle}
          style={{ width: "100%", height: "100%" }}
        >
          <RouteFitter />
          <SelectionPanner />
          <BasemapController />
          <PerspectiveController />
          <RouteLines
            draft={layers.routes ? polyline : null}
            connecting={layers.routes ? connectingLine : null}
            color={routeColor ?? DRAFT_LINE}
            routeId={routeId}
          />
          {routeId !== null && <PoiSearchBar />}
          {poi && (
            <Marker longitude={poi[0]} latitude={poi[1]}>
              <div className="flex flex-col items-center gap-0.5">
                <span className="flex size-7 items-center justify-center rounded-full border-2 border-white bg-[#C98A1B] text-[#201A10] ring-2 ring-white">
                  <MapPin className="size-4" />
                </span>
                <span className="rounded-xs border border-[#C98A1B] bg-white px-1 text-[10px] leading-4 font-medium text-[#201A10]">
                  Place
                </span>
              </div>
            </Marker>
          )}
          {visibleMarkers.map(({ stop, index }) => {
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
                      handleStopClick(stop.id);
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
                      "flex size-7 items-center justify-center border-2 text-xs font-bold tabular-nums ring-2 ring-white transition-colors",
                      SHAPE_CLASS[shape.shape],
                      selected &&
                        "outline-foreground outline-2 outline-offset-1",
                      "focus-visible:outline-foreground focus-visible:outline-2 focus-visible:outline-offset-1",
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
                    perfectly centered when a label appears (no perceived shift).
                    The marker-labels layer toggle controls the ACTUAL stop name
                    beneath every marker (the first keeps a "Start · " prefix
                    for orientation) — not just the Start chip (Pasted #42/#45). */}
                  {layers.markerLabels && (
                    <span className="absolute top-full mt-0.5 max-w-28 truncate rounded-xs border border-[#1B6DB2] bg-white px-1 text-[10px] leading-4 font-medium text-[#1B6DB2]">
                      {index === 0 ? `Start · ${stop.name}` : stop.name}
                    </span>
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
