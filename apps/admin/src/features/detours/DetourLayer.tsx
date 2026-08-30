import { memo } from "react";
import { useMap } from "react-map-gl/maplibre";
import type { GeoLineString } from "@komyuter/shared";
import {
  ensureGeoJsonSource,
  lineLayerSpec,
  setSourceData,
  useDrawWhenReady,
} from "@/lib/mapLayers";
import { DETOUR_DASH } from "@/features/routes/map/constants";
import { DEFAULT_ROUTE_COLOR } from "@/features/routes/routeColors";
import { useDetourStore } from "@/features/detours/detourStore";
import { useDetoursQuery } from "@/features/routes/useRouteQueries";
import { usePlottingStore } from "@/lib/plottingStore";

/**
 * Renders everything detour-shaped on the map:
 *  - SAVED detours of the OPEN direction — dashed lines in per-detour palette
 *    colors, drawn whenever a direction is open (tool or no tool, FR-012),
 *    gated by the Layers → Markers → "Show detour lines" toggle and the
 *    sidebar's per-detour eye toggle. While a detour editor is FOCUSED
 *    (`open`) these are hidden entirely so the admin concentrates on the
 *    current detour — its connection renders as the solid primary path in
 *    RouteLines (split → loop → merge), and the other alternatives recede.
 *
 * There is NO amber dashed live-composition line anymore: the focused
 * detour's loop is drawn by RouteLines' solid `detour-primary` connection,
 * so a dashed copy of the same geometry would be redundant visual noise.
 *
 * Split/merge nodes and detour stops are HTML markers (RouteMap) — draggable
 * and clickable — so this layer owns only the LINE geometry; entry/exit pins
 * were removed when the nodes became draggable markers.
 *
 * Drawn imperatively on the raw maplibre API (same contract as RouteLines:
 * addSource/addLayer/setData, with useDrawWhenReady re-arming after style
 * reloads).
 */

interface DetourFeature {
  type: "Feature";
  properties: {
    kind: "detour";
    color: string;
    detourIndex: number;
    /** Inactive detours render at low opacity (and hide their nodes). */
    active: boolean;
  };
  geometry: GeoLineString;
}

const EMPTY_LINES: DetourFeature[] = [];

export const DetourLayer = memo(function DetourLayer() {
  const map = useMap().current?.getMap();

  const open = useDetourStore((s) => s.open);
  const hiddenDetourIds = useDetourStore((s) => s.hiddenDetourIds);
  const layers = usePlottingStore((s) => s.layers);

  // Saved detours render for the OPEN direction regardless of the detour
  // tool being active — EXCEPT while the detour editor is focused, when all
  // other alternatives' dashed lines hide so the current detour is the sole
  // focal point.
  const directionId = usePlottingStore((s) => s.directionId);
  const { data: savedDetours } = useDetoursQuery(directionId);
  const routeColor = usePlottingStore((s) => s.routeMeta?.color ?? null);

  // Detour polylines share the MAIN route's color — the dashed style is the
  // sole differentiator between the main path and its alternatives (visual
  // cohesion: focus on the structural relationship, not color contrast).
  const detourColor = routeColor ?? DEFAULT_ROUTE_COLOR;

  const savedFeatures: DetourFeature[] =
    layers.detours && !open
      ? (savedDetours ?? [])
          .filter((detour) => !hiddenDetourIds.includes(detour.detour_id))
          .map<DetourFeature>((detour) => ({
            type: "Feature",
            properties: {
              kind: "detour",
              color: detourColor,
              detourIndex: 0,
              active: detour.is_active,
            },
            geometry: detour.detour_polyline,
          }))
      : EMPTY_LINES;

  const ensure = () => {
    if (!map) return false;
    ensureGeoJsonSource(map, "detour-lines");
    const addLayer = (spec: Parameters<typeof map.addLayer>[0]) => {
      if (!map.getLayer(spec.id)) map.addLayer(spec);
    };
    addLayer(
      lineLayerSpec("detour-line", {
        source: "detour-lines",
        filter: ["==", "kind", "detour"],
        color: ["get", "color"],
        width: 4,
        dasharray: [...DETOUR_DASH],
        // Inactive alternative routes fade to half opacity.
        opacity: ["case", ["get", "active"], 1, 0.5],
      }),
    );
    return true;
  };

  const signature = () =>
    JSON.stringify({
      saved: savedFeatures.map((f) => [
        f.properties.color,
        // Activation flips the line's opacity — it MUST participate in the
        // signature or setData never re-runs when only is_active changes.
        f.properties.active,
        f.geometry.coordinates,
      ]),
    });

  const apply = () => {
    setSourceData(map!, "detour-lines", savedFeatures);
  };

  useDrawWhenReady(
    map,
    [open, savedDetours, hiddenDetourIds, directionId, layers.detours],
    ensure,
    signature,
    apply,
    ["detour-line"],
  );

  return null;
});
