import { memo, useEffect, useRef } from "react";
import { useMap } from "react-map-gl/maplibre";
import type { GeoLineString } from "@komyuter/shared";
import {
  ensureGeoJsonSource,
  lineLayerSpec,
  setSourceData,
  useDrawWhenReady,
} from "@/lib/mapLayers";
import { fadeLineLayers, fadeOutLayers } from "@/lib/overviewFade";
import { DRAFT_FADE_OUT_MS, DRAFT_LINE, PREVIEW_LINE } from "./constants";

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

export const RouteLines = memo(function RouteLines({
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
