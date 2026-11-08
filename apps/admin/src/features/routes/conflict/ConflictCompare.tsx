import { useEffect, useMemo } from "react";
import "maplibre-gl/dist/maplibre-gl.css";
import Map, { Marker, useMap } from "react-map-gl/maplibre";
import type { GeoLineString } from "@komyuter/shared";
import { baseMapStyleFor, ILOILO_CITY } from "@/lib/tiles";
import { usePlottingStore } from "@/lib/plottingStore";
import {
  ensureGeoJsonSource,
  lineLayerSpec,
  setSourceData,
  useDrawWhenReady,
} from "@/lib/mapLayers";
import { SIGNBOARD_BLUE } from "../map/constants";

/**
 * The side-by-side comparison inside the resolver (ADR-0020 §"Conflict
 * preview").
 *
 * Mine on the left, theirs on the right, synchronised cameras. Each side's
 * decision card sits **under its own map**, so the choice and the geometry it
 * applies to are one column. Read-only: nothing here writes.
 */

const SIGNAL_AMBER = "#D97706";

export type CompareSide = "mine" | "theirs";

export interface CompareStop {
  id: string;
  name: string;
  location: [number, number];
  order: number;
  otherOrder: number | null;
  orderConflict: boolean;
  ghost: boolean;
}

export interface ViewState {
  longitude: number;
  latitude: number;
  zoom: number;
}

export const INITIAL_VIEW: ViewState = {
  longitude: ILOILO_CITY[0],
  latitude: ILOILO_CITY[1],
  zoom: 14,
};

function boundsOf(
  points: [number, number][],
): [[number, number], [number, number]] {
  const longs = points.map((point) => point[0]);
  const lats = points.map((point) => point[1]);
  const pad = 0.0015;
  return [
    [Math.min(...longs) - pad, Math.min(...lats) - pad],
    [Math.max(...longs) + pad, Math.max(...lats) + pad],
  ];
}

/**
 * Two columns. When `showMaps`, each column is a map above its decision card;
 * otherwise it is just the card (Route details, order).
 */
export function ComparePane({
  left,
  right,
}: {
  left: { map: React.ReactNode | null; detail: React.ReactNode };
  right: { map: React.ReactNode | null; detail: React.ReactNode };
}) {
  return (
    <div className="grid min-h-0 flex-1 grid-cols-2">
      <CompareColumn side="mine" map={left.map} detail={left.detail} />
      <CompareColumn side="theirs" map={right.map} detail={right.detail} />
    </div>
  );
}

function CompareColumn({
  side,
  map,
  detail,
}: {
  side: CompareSide;
  map: React.ReactNode | null;
  detail: React.ReactNode;
}) {
  return (
    <div
      className={`grid min-h-0 ${
        map
          ? "grid-rows-[minmax(0,70%)_minmax(0,30%)]"
          : "grid-rows-[minmax(0,1fr)]"
      } ${side === "theirs" ? "border-border border-l" : ""}`}
    >
      {map ? (
        <div className="relative min-h-0">
          <SideLabel side={side} />
          {map}
        </div>
      ) : null}
      <div
        className={`min-h-0 overflow-y-auto p-4 ${map ? "border-border border-t" : ""}`}
      >
        <span className="text-muted-foreground mb-2 block text-[10px] font-semibold tracking-[0.14em] uppercase">
          {side === "mine" ? "Mine" : "Theirs"}
        </span>
        {detail}
      </div>
    </div>
  );
}

function SideLabel({ side }: { side: CompareSide }) {
  return (
    <span
      style={{
        borderColor: side === "mine" ? SIGNBOARD_BLUE : SIGNAL_AMBER,
        color: side === "mine" ? SIGNBOARD_BLUE : SIGNAL_AMBER,
      }}
      className="pointer-events-none absolute top-2 left-2 z-10 rounded-[3px] border bg-white/95 px-1.5 py-0.5 text-[10px] font-bold tracking-[0.14em] uppercase"
    >
      {side === "mine" ? "Mine" : "Theirs"}
    </span>
  );
}

/**
 * One side's map. Controlled: the camera lives in `ComparePane`, so panning or
 * zooming either map moves both.
 */
export function SideMap({
  side,
  view,
  onViewChange,
  stop,
  polyline,
  fitBounds,
}: {
  side: CompareSide;
  view: ViewState;
  onViewChange: (view: ViewState) => void;
  stop: CompareStop | null;
  /** This side's route line — a visual guide, never a choice. */
  polyline: GeoLineString | null;
  /** Only the left map fits, then the shared camera carries the right. */
  fitBounds: [[number, number], [number, number]] | null;
}) {
  const baseStyle = usePlottingStore((state) => state.layers.baseStyle);
  const mapStyle = useMemo(() => baseMapStyleFor(baseStyle), [baseStyle]);
  const color = side === "mine" ? SIGNBOARD_BLUE : SIGNAL_AMBER;

  return (
    <Map
      {...view}
      mapStyle={mapStyle}
      dragRotate={false}
      pitchWithRotate={false}
      style={{ width: "100%", height: "100%" }}
      onMove={(event) =>
        onViewChange({
          longitude: event.viewState.longitude,
          latitude: event.viewState.latitude,
          zoom: event.viewState.zoom,
        })
      }
    >
      {fitBounds ? (
        <CameraFitter bounds={fitBounds} onFit={onViewChange} />
      ) : null}
      <SideLine side={side} polyline={polyline} />
      {stop ? (
        <Marker
          longitude={stop.location[0]}
          latitude={stop.location[1]}
          anchor="center"
        >
          <div
            role="img"
            aria-label={`${stop.name} — ${side}${stop.ghost ? ", deleted here" : ""}`}
            className="flex flex-col items-center gap-0.5"
          >
            <span
              style={{
                borderColor: color,
                color,
                borderStyle: stop.ghost ? "dashed" : "solid",
                backgroundColor: stop.ghost ? "transparent" : "#ffffff",
                opacity: stop.ghost ? 0.75 : 1,
              }}
              className="flex size-5 items-center justify-center rounded-[3px] border-2 text-[10px] font-bold tabular-nums"
            >
              {stop.ghost ? "−" : stop.order}
            </span>
            {stop.orderConflict && stop.otherOrder !== null ? (
              <span
                style={{ borderColor: color, color }}
                className="rounded-[3px] border bg-white px-1 text-[10px] leading-4 font-semibold tabular-nums"
              >
                {stop.order}·{stop.otherOrder}
              </span>
            ) : null}
          </div>
        </Marker>
      ) : null}
    </Map>
  );
}

function CameraFitter({
  bounds,
  onFit,
}: {
  bounds: [[number, number], [number, number]];
  onFit: (view: ViewState) => void;
}) {
  const map = useMap().current?.getMap();

  useEffect(() => {
    if (!map) return;
    const camera = map.cameraForBounds(bounds, {
      padding: 44,
      maxZoom: 18,
    });
    if (!camera) return;
    const center = camera.center as
      { lng: number; lat: number } | [number, number];
    onFit({
      longitude: Array.isArray(center) ? center[0] : center.lng,
      latitude: Array.isArray(center) ? center[1] : center.lat,
      zoom: camera.zoom ?? map.getZoom(),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, bounds[0][0], bounds[0][1], bounds[1][0], bounds[1][1]]);

  return null;
}

/** This side's route line, drawn as context for the position comparison. */
function SideLine({
  side,
  polyline,
}: {
  side: CompareSide;
  polyline: GeoLineString | null;
}) {
  const map = useMap().current?.getMap();
  const source = `conflict-side-${side}`;
  const layer = `conflict-side-line-${side}`;
  const color = side === "mine" ? SIGNBOARD_BLUE : SIGNAL_AMBER;

  useDrawWhenReady(
    map,
    [polyline],
    () => {
      if (!map) return false;
      ensureGeoJsonSource(map, source);
      const spec = lineLayerSpec(layer, {
        source,
        filter: ["==", ["get", "kind"], side],
        color: ["literal", color],
        width: 4,
      });
      if (!map.getLayer(layer)) map.addLayer(spec);
      return true;
    },
    () => JSON.stringify(polyline?.coordinates ?? null),
    () => {
      if (!map) return;
      setSourceData(
        map,
        source,
        polyline
          ? [
              {
                type: "Feature",
                properties: { kind: side },
                geometry: polyline,
              },
            ]
          : [],
      );
    },
    [layer],
  );

  return null;
}

/** Bounds for the selected stop's positions on both maps. */
export function compareBounds(
  stops: [number, number][],
): [[number, number], [number, number]] | null {
  return stops.length > 0 ? boundsOf(stops) : null;
}
