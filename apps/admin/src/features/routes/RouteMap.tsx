import { useMemo, useState } from "react";
import { MapPin } from "lucide-react";
import "maplibre-gl/dist/maplibre-gl.css";
import Map, { Marker } from "react-map-gl/maplibre";
import { baseMapStyleFor, ILOILO_CITY } from "@/lib/tiles";
import { resolveConnectingLine } from "@/lib/coords";
import { pathFromConnections } from "@/lib/connections";
import { getStopShape } from "@/lib/stopShapes";
import { STOP_TYPE_LABELS } from "@/features/routes/stopLabels";
import { clearSelection, isStopSelected, selectStop } from "@/lib/selection";
import {
  usePlottingStore,
  visibleStopsForLayers,
  type DraftStop,
} from "@/lib/plottingStore";
import {
  BasemapController,
  PerspectiveController,
  RouteFitter,
  RouteLines,
  SelectionPanner,
} from "./map";
import { DRAFT_LINE, SHAPE_CLASS } from "./map/constants";

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
        {poi && (
          <Marker longitude={poi[0]} latitude={poi[1]}>
            <div className="flex flex-col items-center gap-0.5">
              <span className="flex size-7 items-center justify-center rounded-full border-2 border-white bg-[#C98A1B] text-[#201A10] ring-2 ring-white">
                <MapPin className="size-4" />
              </span>
              <span className="rounded-xs border border-[#C98A1B] bg-white px-1 text-[11px] leading-4 font-medium text-[#201A10]">
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
                    color: stop.type === "waiting_area" ? "#201A10" : "#ffffff",
                  }}
                  className={[
                    // Filled type-colour plate + white border + white halo for
                    // contrast against any basemap; selection adds a dark outline.
                    "flex size-7 items-center justify-center border-2 text-xs font-bold tabular-nums ring-2 ring-white transition-colors",
                    SHAPE_CLASS[shape.shape],
                    selected && "outline-foreground outline-2 outline-offset-1",
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
                  <span className="absolute top-full mt-0.5 max-w-28 truncate rounded-xs border border-[#1B6DB2] bg-white px-1 text-[11px] leading-4 font-medium text-[#1B6DB2]">
                    {index === 0 ? `Start · ${stop.name}` : stop.name}
                  </span>
                )}
              </div>
            </Marker>
          );
        })}
        {children}
      </Map>
    </div>
  );
}
