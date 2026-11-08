import { useMemo, useState } from "react";
import { GitBranch, Merge, X } from "lucide-react";
import "maplibre-gl/dist/maplibre-gl.css";
import Map, { Marker, Popup } from "react-map-gl/maplibre";
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
  CameraPaddingController,
  PerspectiveController,
  PoiCandidatesLayer,
  PoiFocuser,
  PoiPin,
  PoiPopup,
  RouteFitter,
  RouteLines,
  SelectionPanner,
} from "./map";
import type { CameraPadding } from "./workspace/geometry";
import {
  DRAFT_LINE,
  PICKED_RED,
  SHAPE_CLASS,
  SIGNBOARD_BLUE,
} from "./map/constants";
import { useDetourStore } from "@/features/detours/detourStore";
import { splitBaseForDetour } from "@/features/detours/detourSplit";
import { useDetourPreviewStore } from "@/features/detours/detourPreviewStore";
import { useRestrictionStore } from "@/features/restrictions/restrictionStore";
import { nearestVertexIndex } from "@/features/restrictions/restrictionHelpers";
import {
  useDetourEditing,
  useWorkspaceAccess,
} from "@/features/auth/useCapabilities";
import {
  useDirectionsQuery,
  useDetoursQuery,
  useDirectionStopsQuery,
} from "@/features/routes/useRouteQueries";
import { buildDetourTarget } from "@/features/detours/target";
import { pinSizeForZoom } from "./poiScope";

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
  /** The layout's visible-region padding — every camera move frames inside it. */
  padding: CameraPadding;
}

/**
 * Full-bleed MapLibre base map for the Route Plotting page (Q1/B layout).
 * Owns its viewport; later phases lift the viewport into the plotting store
 * when the map needs to react to external actions (e.g. "zoom to route").
 */
export function RouteMap({ className, children, padding }: RouteMapProps) {
  const { readOnly } = useWorkspaceAccess();
  // The detour editor is a plotting surface: an Account without `ROUTES_EDIT`
  // still SEES saved detours and their stops, but nothing on the map opens an
  // editor it could not save (the marker becomes a plain chip).
  const detourEditing = useDetourEditing();
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
  const poiLabel = usePlottingStore((s) => s.poiLabel);
  const poiHit = usePlottingStore((s) => s.poiHit);
  const poiSelection = usePlottingStore((s) => s.poiSelection);
  const setPoiSelection = usePlottingStore((s) => s.setPoiSelection);
  const mapViewport = usePlottingStore((s) => s.mapViewport);
  const addStop = usePlottingStore((s) => s.addStop);
  const moveStop = usePlottingStore((s) => s.moveStop);
  const setSelection = usePlottingStore((s) => s.setSelection);
  const setMapViewport = usePlottingStore((s) => s.setMapViewport);
  // The picked marker tracks the camera's zoom, so it keeps its proportion to
  // the streets; candidate pins use the same scale, one step smaller.
  const pickedPx = pinSizeForZoom(mapViewport?.zoom) + 6;
  // Detour stops are first-class stops while the detour editor is open: the
  // same marker plates as base stops, draggable, clickable → property panel.
  const detourOpen = useDetourStore((s) => s.open);
  const restrictionEditing = useRestrictionStore((s) => s.editing);
  const detourStops = useDetourStore((s) => s.detourStops);
  const selectedDetourStopId = useDetourStore((s) => s.selectedDetourStopId);
  const detourEntry = useDetourStore((s) => s.entry);
  const detourExit = useDetourStore((s) => s.exit);
  const detourPreview = useDetourPreviewStore((s) => s.preview);
  const hideDetourPreview = useDetourPreviewStore((s) => s.hide);
  const detourSplit = useMemo(() => {
    if (!detourOpen || !detourEntry || !detourExit || !polyline) return null;
    return splitBaseForDetour(polyline, detourEntry, detourExit);
  }, [detourOpen, detourEntry, detourExit, polyline]);
  const openDirectionId = usePlottingStore((s) => s.directionId);
  const routeMeta = usePlottingStore((s) => s.routeMeta);
  const { data: savedDetours } = useDetoursQuery(openDirectionId);
  const { data: directions } = useDirectionsQuery(routeId);
  const { data: directionStops } = useDirectionStopsQuery(openDirectionId);
  const openDirection =
    directions?.find((d) => d.direction_id === openDirectionId) ?? null;

  const handleMapClick = (event: { lngLat: { lng: number; lat: number } }) => {
    // A map click closes the popup but keeps the picked marker: the place the
    // search resolved to is still the answer, and a click on the map should not
    // erase it. Only the popup's own dismiss (× / `onClose`) drops the marker.
    setPoiSelection(null);
    // A restriction range is being picked: the next two map clicks choose
    // base-polyline vertices, and no other tool may consume them.
    const restriction = useRestrictionStore.getState();
    if (restriction.editing) {
      // Restriction mode reuses the toolbar tool: Select chooses a saved band
      // (handled by RestrictionLayer), Add starts/re-ranges a range and the
      // next two map clicks choose its endpoints.
      if (tool === "add") {
        if (restriction.mode !== "picking") restriction.startNew();
        if (openDirection) {
          const rangeLine =
            restriction.detourId === null
              ? openDirection.base_polyline
              : (savedDetours?.find(
                  (detour) => detour.detour_id === restriction.detourId,
                )?.detour_polyline ??
                useDetourStore.getState().loop ??
                openDirection.base_polyline);
          const index = nearestVertexIndex(
            [event.lngLat.lng, event.lngLat.lat],
            rangeLine,
          );
          if (index !== null) useRestrictionStore.getState().pick(index);
        }
      }
      return;
    }
    // While the detour editor is open the map taps belong to it (entry/exit/
    // waypoint placement) — the base-route tooling steps aside entirely.
    // Guard on `open`, not `mode` (a future idle-but-open state must not
    // leak detour taps into base-route tooling; review follow-up).
    // While a detour is focused: ONLY the Add tool places nodes/stops; any
    // other tool click (e.g. Select) focuses BACK to the main route.
    if (useDetourStore.getState().open) {
      if (tool === "add") {
        useDetourStore
          .getState()
          .handleMapClick([event.lngLat.lng, event.lngLat.lat]);
      } else if (tool === "select") {
        // A stray map tap may clear the selected stop, but it must NEVER
        // drop the focused alternative: the detour stays open until Back,
        // Esc, or another branch is chosen.
        setSelection(clearSelection);
      }
      return;
    }
    // No plotting controls active with no route (FR-030).
    if (routeId === null) return;
    if (tool === "select") {
      // Select tool: tapping empty map clears the selection.
      setSelection(clearSelection);
      return;
    }
    // Add tool: exact [lng,lat] placement at the clicked point (FR-022);
    // placement is never blocked (FR-009); the store handles the connecting
    // line. Explicitly scoped — a stray non-select tool (e.g. detour without
    // an open editor) must never insert a base-route stop.
    if (tool === "add") {
      addStop([event.lngLat.lng, event.lngLat.lat]);
    }
  };

  const handleStopClick = (stopId: string) => {
    if (routeId === null) return;
    // A base stop selected from the merged detour list opens the base stop
    // editor while the detour draft stays live. Clear the detour-stop
    // selection so the rail has one clear subject.
    useDetourStore.getState().selectDetourStop(null);
    setSelection(selectStop(stopId));
  };

  // Read-only (ticket #47): stops are selection targets, never draggable —
  // a drag is a stop edit, and nothing on this surface may write.
  const canDrag =
    routeId !== null &&
    tool === "select" &&
    !readOnly &&
    !detourOpen &&
    !restrictionEditing;

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
        onMoveEnd={(event) => {
          // Search follows the camera, so the camera has to be somewhere the
          // pill can read it: this component renders inside `<Map>`, the pill
          // does not. Published on move-end, not on move, to keep the store
          // quiet while a drag is in flight. The canvas size is published
          // alongside the bounds so the search scope can subtract the plates.
          const bounds = event.target.getBounds();
          const container = event.target.getContainer();
          setMapViewport({
            longitude: event.viewState.longitude,
            latitude: event.viewState.latitude,
            zoom: event.viewState.zoom,
            bounds: {
              west: bounds.getWest(),
              south: bounds.getSouth(),
              east: bounds.getEast(),
              north: bounds.getNorth(),
            },
            width: container.clientWidth,
            height: container.clientHeight,
          });
        }}
        mapStyle={mapStyle}
        style={{ width: "100%", height: "100%" }}
      >
        <CameraPaddingController padding={padding} />
        <RouteFitter padding={padding} />
        <SelectionPanner />
        <PoiFocuser padding={padding} />
        <PoiCandidatesLayer />
        <PoiPopup />
        {!detourOpen && detourPreview && (
          <Popup
            longitude={detourPreview.longitude}
            latitude={detourPreview.latitude}
            anchor="bottom"
            offset={22}
            closeButton={false}
            closeOnClick={false}
            maxWidth="16rem"
            onClose={hideDetourPreview}
          >
            <div className="flex w-56 flex-col gap-1.5 p-0.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-foreground truncate text-sm font-semibold">
                    {detourPreview.detour.label}
                  </p>
                  <p className="text-muted-foreground text-xs leading-snug">
                    {detourPreview.detour.is_active ? "Active" : "Inactive"} ·{" "}
                    {detourPreview.detour.detour_stops.length} stops
                    {detourPreview.detour.additional_distance_meters !== null
                      ? ` · +${Math.round(
                          detourPreview.detour.additional_distance_meters,
                        )} m`
                      : ""}
                  </p>
                  {detourPreview.detour.commuter_instruction && (
                    <p className="text-muted-foreground text-[11px] leading-snug">
                      {detourPreview.detour.commuter_instruction}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  aria-label="Dismiss alternative route details"
                  onClick={hideDetourPreview}
                  className="text-muted-foreground hover:text-foreground -mt-0.5 -mr-0.5 shrink-0 rounded-sm p-0.5"
                >
                  <X className="size-3.5" />
                </button>
              </div>
              {detourEditing ? (
                <button
                  type="button"
                  onClick={() => {
                    if (!openDirection) return;
                    hideDetourPreview();
                    setSelection(clearSelection);
                    useDetourStore.getState().openEdit(
                      detourPreview.detour,
                      buildDetourTarget(
                        openDirection,
                        routeMeta?.name ?? "Route",
                        savedDetours?.length ?? 0,
                        (directionStops ?? []).map((s) => ({
                          stop_id: s.stop_id,
                          name: s.name,
                          location: s.location.coordinates,
                        })),
                      ),
                    );
                  }}
                  className="bg-primary text-primary-foreground hover:bg-primary/90 flex w-full items-center justify-center gap-1 rounded-sm px-2 py-1.5 text-xs font-semibold"
                >
                  Edit alternative route
                </button>
              ) : (
                <p className="text-muted-foreground text-[11px]">Read-only</p>
              )}
            </div>
          </Popup>
        )}
        <BasemapController />
        <PerspectiveController />
        <RouteLines
          draft={layers.routes ? polyline : null}
          connecting={layers.routes && !detourSplit ? connectingLine : null}
          color={routeColor ?? DRAFT_LINE}
          routeId={routeId}
          detourSplit={detourSplit}
        />
        {poi && (
          <Marker longitude={poi[0]} latitude={poi[1]}>
            <div className="flex flex-col items-center gap-0.5">
              {/* Same silhouette as a candidate pin, one step larger. Red while
                  its card is open — the "focused" state — and signboard blue once
                  the card is closed, so the searched place stays on the map and
                  stays clickable to focus it again. */}
              <button
                type="button"
                disabled={poiHit === null}
                aria-label={`Show ${poiLabel ?? "this place"} details`}
                onClick={(event) => {
                  event.stopPropagation();
                  if (poiHit) setPoiSelection(poiHit);
                }}
                className="focus-visible:outline-foreground flex cursor-pointer rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-default"
              >
                <PoiPin
                  size={pickedPx}
                  color={poiSelection ? PICKED_RED : SIGNBOARD_BLUE}
                />
              </button>
              <span
                style={{
                  borderColor: poiSelection ? PICKED_RED : SIGNBOARD_BLUE,
                  color: poiSelection ? PICKED_RED : SIGNBOARD_BLUE,
                }}
                className="max-w-40 truncate rounded-xs border bg-white px-1 text-[11px] leading-4 font-medium"
              >
                {poiLabel ?? "Place"}
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
              <div
                className={
                  restrictionEditing
                    ? "pointer-events-none relative flex flex-col items-center"
                    : "relative flex flex-col items-center"
                }
              >
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
        {detourOpen && layers.detourNodes && detourEntry && detourExit && (
          <>
            {/* Split node marker */}
            <Marker
              longitude={detourEntry.coordinate[0]}
              latitude={detourEntry.coordinate[1]}
              draggable={true}
              onDragEnd={(event: { lngLat: { lng: number; lat: number } }) =>
                useDetourStore
                  .getState()
                  .moveEntry([event.lngLat.lng, event.lngLat.lat])
              }
            >
              <div className="relative flex flex-col items-center">
                <button
                  type="button"
                  aria-label="Detour split node (drag to move)"
                  className="flex size-7 cursor-grab items-center justify-center rounded-full border-2 border-white bg-[#C98100] text-white ring-2 ring-white transition-colors active:cursor-grabbing"
                >
                  <GitBranch className="size-3.5" />
                </button>
                {layers.markerLabels && (
                  <span className="absolute top-full mt-0.5 rounded-xs border border-[#C98100] bg-white px-1 text-[11px] leading-4 font-medium text-[#C98100]">
                    Split
                  </span>
                )}
              </div>
            </Marker>
            <Marker
              longitude={detourExit.coordinate[0]}
              latitude={detourExit.coordinate[1]}
              draggable={true}
              onDragEnd={(event: { lngLat: { lng: number; lat: number } }) =>
                useDetourStore
                  .getState()
                  .moveExit([event.lngLat.lng, event.lngLat.lat])
              }
            >
              <div className="relative flex flex-col items-center">
                <button
                  type="button"
                  aria-label="Detour merge node (drag to move)"
                  className="flex size-7 cursor-grab items-center justify-center rounded-full border-2 border-white bg-[#0F172A] text-white ring-2 ring-white transition-colors active:cursor-grabbing"
                >
                  <Merge className="size-3.5" />
                </button>
                {layers.markerLabels && (
                  <span className="absolute top-full mt-0.5 rounded-xs border border-[#0F172A] bg-white px-1 text-[11px] leading-4 font-medium text-[#0F172A]">
                    Merge
                  </span>
                )}
              </div>
            </Marker>
          </>
        )}
        {detourOpen &&
          layers.detourStops &&
          detourStops.map((stop, index) => {
            const selected = selectedDetourStopId === stop.id;
            const shape = getStopShape(stop.type);
            return (
              <Marker
                key={stop.id}
                longitude={stop.location[0]}
                latitude={stop.location[1]}
                draggable={true}
                onDragEnd={(event: { lngLat: { lng: number; lat: number } }) =>
                  useDetourStore
                    .getState()
                    .moveDetourStop(stop.id, [
                      event.lngLat.lng,
                      event.lngLat.lat,
                    ])
                }
              >
                <div className="relative flex flex-col items-center">
                  <button
                    type="button"
                    aria-label={`Detour stop ${index + 1}: ${stop.name} (${STOP_TYPE_LABELS[stop.type]})`}
                    onClick={(event) => {
                      event.stopPropagation();
                      setSelection(clearSelection);
                      useDetourStore.getState().selectDetourStop(stop.id);
                    }}
                    style={{
                      backgroundColor: "#ffffff",
                      borderColor: shape.color,
                      color: shape.color,
                    }}
                    className={[
                      // Distinct from base stops: HOLLOW, dashed outline so a
                      // detour stop never reads as a main-route stop even at
                      // the same type colour (FR-012).
                      "flex size-7 items-center justify-center border-2 text-xs font-bold tabular-nums ring-2 ring-white transition-colors",
                      SHAPE_CLASS[shape.shape],
                      selected &&
                        "outline-foreground outline-2 outline-offset-1",
                      "focus-visible:outline-foreground focus-visible:outline-2 focus-visible:outline-offset-1",
                      "cursor-grab active:cursor-grabbing",
                    ].join(" ")}
                  >
                    {shape.shape === "diamond" ? (
                      <span className="-rotate-45">{index + 1}</span>
                    ) : (
                      index + 1
                    )}
                  </button>
                  {layers.detourStopLabels && (
                    <span className="absolute top-full mt-0.5 max-w-28 truncate rounded-xs border border-[#1B6DB2] bg-white px-1 text-[11px] leading-4 font-medium text-[#1B6DB2]">
                      {stop.name}
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
