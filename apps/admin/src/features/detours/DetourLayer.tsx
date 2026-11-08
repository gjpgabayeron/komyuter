import { memo, useEffect } from "react";
import { useMap } from "react-map-gl/maplibre";
import type { MapLayerMouseEvent } from "react-map-gl/maplibre";
import type { GeoLineString } from "@komyuter/shared";
import {
  ensureGeoJsonSource,
  lineLayerSpec,
  setSourceData,
  useDrawWhenReady,
} from "@/lib/mapLayers";
import { DETOUR_DASH } from "@/features/routes/map/constants";
import { DEFAULT_ROUTE_COLOR } from "@/features/routes/routeColors";
import { useDetourPreviewStore } from "@/features/detours/detourPreviewStore";
import { useDetourStore } from "@/features/detours/detourStore";
import { useRestrictionStore } from "@/features/restrictions/restrictionStore";
import { useDetoursQuery } from "@/features/routes/useRouteQueries";
import { usePlottingStore } from "@/lib/plottingStore";

/**
 * Renders everything detour-shaped on the map:
 *  - SAVED detours of the OPEN direction while no detour editor is open —
 *    dashed lines in per-detour palette colors, gated by the Layers →
 *    Markers → "Show detour lines" toggle and the per-detour eye toggle;
 *  - the LIVE composition while the editor is open: the focused detour's
 *    draft loop only. Saved alternatives step aside so the focused path is
 *    the only alternative competing with the main route.
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
    detourId?: string;
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

  // While a detour is focused, only its live draft may compete with the main
  // route: saved alternative lines step aside for both an existing detour and
  // a new composition. On main focus every saved alternative shows, minus the
  // eye-hidden ones.
  const savedFeatures: DetourFeature[] =
    layers.detours && !open
      ? (savedDetours ?? [])
          .filter((detour) => !hiddenDetourIds.includes(detour.detour_id))
          .map<DetourFeature>((detour) => ({
            type: "Feature",
            properties: {
              kind: "detour",
              color: routeColor ?? DEFAULT_ROUTE_COLOR,
              detourIndex: 0,
              detourId: detour.detour_id,
              active: detour.is_active,
            },
            geometry: detour.detour_polyline,
          }))
      : EMPTY_LINES;

  // Clicking an unfocused alternative's line previews it; it must not focus
  // the editor by itself. The popup owns the CTA that does.
  useEffect(() => {
    if (!map) return;
    const onClick = (event: MapLayerMouseEvent) => {
      if (useDetourStore.getState().open) return;
      if (useRestrictionStore.getState().editing) return;
      const detourId = event.features?.[0]?.properties?.detourId;
      const detour = (savedDetours ?? []).find(
        (candidate) => candidate.detour_id === detourId,
      );
      if (detour) {
        useDetourPreviewStore
          .getState()
          .show(detour, [event.lngLat.lng, event.lngLat.lat]);
      }
    };
    map.on("click", "detour-line", onClick);
    return () => {
      map.off("click", "detour-line", onClick);
    };
  }, [map, savedDetours]);

  // The live draft composition (only while the editor is open).
  const draftFeatures: DetourFeature[] =
    open && draftLoop && target
      ? [
          {
            type: "Feature",
            properties: {
              kind: "detour-draft",
              color: routeColor ?? DEFAULT_ROUTE_COLOR,
              detourIndex: -1,
              active: true,
            },
            geometry: draftLoop,
          },
        ]
      : EMPTY_LINES;

  // The replaced main segment is drawn by RouteLines, whose layers can be
  // re-added after the detour layers on a style reload. Keep the alternative
  // line ABOVE the route layers so its literal opacity is actually visible
  // instead of being covered by the solid base line.
  useEffect(() => {
    if (!map) return;
    let raising = false;
    const raise = () => {
      if (raising) return;
      const layers = map.getStyle()?.layers ?? [];
      const ids = layers.map((layer) => layer.id);
      const detourIndex = ids.indexOf("detour-line");
      const draftIndex = ids.indexOf("detour-draft-line");
      const routeAbove = ids.some(
        (id, index) =>
          id.startsWith("route-line-") &&
          ((detourIndex !== -1 && index > detourIndex) ||
            (draftIndex !== -1 && index > draftIndex)),
      );
      if (!routeAbove) return;
      raising = true;
      if (detourIndex !== -1 && map.getLayer("detour-line")) {
        map.moveLayer("detour-line");
      }
      if (draftIndex !== -1 && map.getLayer("detour-draft-line")) {
        map.moveLayer("detour-draft-line");
      }
      raising = false;
    };
    map.on("styledata", raise);
    raise();
    return () => {
      map.off("styledata", raise);
    };
  }, [map]);

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
        // Literal opacity (not a data-driven expression): alternatives must
        // visibly recede even when MapLibre refuses to evaluate line-opacity
        // for a feature expression.
        opacity: 0.3,
      }),
    );
    addLayer(
      lineLayerSpec("detour-draft-line", {
        source: "detour-draft-line",
        filter: ["==", "kind", "detour-draft"],
        color: ["get", "color"],
        width: 4,
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

  // The layer is conditionally mounted only while an alternative is focused.
  // MapLibre keeps sources/layers after React unmounts, so clear them here or
  // the previous alternative's polyline survives the return to Main.
  useEffect(() => {
    if (!map) return;
    return () => {
      for (const layerId of ["detour-line", "detour-draft-line"]) {
        if (map.getLayer(layerId)) map.removeLayer(layerId);
      }
      for (const sourceId of ["detour-lines", "detour-draft-line"]) {
        if (map.getSource(sourceId)) map.removeSource(sourceId);
      }
    };
  }, [map]);

  return null;
});
