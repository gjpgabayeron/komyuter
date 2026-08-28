import { memo } from "react";
import { useMap } from "react-map-gl/maplibre";
import type { GeoLineString } from "@komyuter/shared";
import {
  ensureGeoJsonSource,
  lineLayerSpec,
  setSourceData,
  useDrawWhenReady,
} from "@/lib/mapLayers";
import {
  DETOUR_DASH,
  DETOUR_DRAFT_COLOR,
} from "@/features/routes/map/constants";
import {
  DEFAULT_ROUTE_COLOR,
  detourLineColorFor,
} from "@/features/routes/routeColors";
import { useDetourStore } from "@/features/detours/detourStore";
import { useDetoursQuery } from "@/features/routes/useRouteQueries";
import { usePlottingStore } from "@/lib/plottingStore";

/**
 * Renders everything detour-shaped on the map:
 *  - SAVED detours of the OPEN direction — dashed lines in per-detour palette
 *    colors, drawn whenever a direction is open (tool or no tool, FR-012),
 *    gated by the Layers → Markers → "Show detour lines" toggle and the
 *    sidebar's per-detour eye toggle;
 *  - the LIVE composition while the editor is open: the amber dashed loop
 *    [split, ...detour stops, merge].
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
    kind: "detour" | "detour-draft";
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
  const target = useDetourStore((s) => s.target);
  const draftLoop = useDetourStore((s) => s.loop);
  const hiddenDetourIds = useDetourStore((s) => s.hiddenDetourIds);
  const layers = usePlottingStore((s) => s.layers);

  // Saved detours render for the OPEN direction regardless of the detour
  // tool being active (the direction the admin is working on is the map's
  // reference baseline; alternatives stay visible for comparison).
  const directionId = usePlottingStore((s) => s.directionId);
  const { data: savedDetours } = useDetoursQuery(directionId);
  const routeColor = usePlottingStore((s) => s.routeMeta?.color ?? null);

  const savedFeatures: DetourFeature[] = layers.detours
    ? (savedDetours ?? [])
        .filter((detour) => !hiddenDetourIds.includes(detour.detour_id))
        .map<DetourFeature>((detour) => ({
          type: "Feature",
          properties: {
            kind: "detour",
            color: detourLineColorFor(
              routeColor ?? DEFAULT_ROUTE_COLOR,
              detour.detour_id,
            ),
            detourIndex: 0,
            active: detour.is_active,
          },
          geometry: detour.detour_polyline,
        }))
    : EMPTY_LINES;

  // The live draft composition (only while the editor is open).
  const draftFeatures: DetourFeature[] =
    open && draftLoop && target
      ? [
          {
            type: "Feature",
            properties: {
              kind: "detour-draft",
              color: DETOUR_DRAFT_COLOR,
              detourIndex: -1,
              active: true,
            },
            geometry: draftLoop,
          },
        ]
      : EMPTY_LINES;

  const ensure = () => {
    if (!map) return false;
    ensureGeoJsonSource(map, "detour-lines");
    ensureGeoJsonSource(map, "detour-draft-line");
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
        // Inactive alternative routes fade to lowered opacity.
        opacity: ["case", ["get", "active"], 1, 0.35],
      }),
    );
    addLayer(
      lineLayerSpec("detour-draft-line", {
        source: "detour-draft-line",
        filter: ["==", "kind", "detour-draft"],
        color: ["get", "color"],
        width: 4,
        dasharray: [...DETOUR_DASH],
      }),
    );
    return true;
  };

  const signature = () =>
    JSON.stringify({
      saved: savedFeatures.map((f) => [
        f.properties.color,
        f.geometry.coordinates,
      ]),
      draft: draftFeatures.length ? draftFeatures[0]!.geometry.coordinates : [],
    });

  const apply = () => {
    setSourceData(map!, "detour-lines", savedFeatures);
    setSourceData(map!, "detour-draft-line", draftFeatures);
  };

  useDrawWhenReady(
    map,
    [
      open,
      target,
      draftLoop,
      savedDetours,
      hiddenDetourIds,
      directionId,
      layers.detours,
    ],
    ensure,
    signature,
    apply,
    ["detour-line", "detour-draft-line"],
  );

  return null;
});
