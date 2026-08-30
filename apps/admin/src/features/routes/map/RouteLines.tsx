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
import {
  DETOUR_DASH,
  DRAFT_FADE_OUT_MS,
  DRAFT_LINE,
  PREVIEW_LINE,
} from "./constants";
import type { DetourContextLines } from "@/lib/coords";

/**
 * Imperatively draws the route lines straight onto the map via the raw
 * maplibre API. This deliberately bypasses react-map-gl's <Source>/<Layer>
 * components, whose internal `map.style._loaded` gating proved unreliable
 * across maplibre versions — addSource/addLayer/setData are the canonical
 * maplibre calls and always render once the style is loaded.
 */
interface RouteLineFeature {
  type: "Feature";
  properties: {
    kind: "draft" | "draft-dimmed" | "detour-primary" | "connecting";
    color: string;
    /** Set on detour-primary features — drives the inactive half-opacity. */
    active?: boolean;
  };
  geometry: GeoLineString;
}

export const RouteLines = memo(function RouteLines({
  draft,
  connecting,
  color,
  routeId,
  detourContext,
  detourActive = true,
}: {
  draft: GeoLineString | null;
  connecting: GeoLineString | null;
  color: string;
  routeId: string | null;
  /**
   * Detour-focus context (detour as primary path): when present, the draft
   * renders as before/after (solid) + the replaced arc (dimmed) + a solid
   * primary connection (before + detour loop + after). Null keeps the plain
   * single draft line.
   */
  detourContext?: DetourContextLines | null;
  /** Whether the FOCUSED detour is active — inactive connections fade to
   *  half opacity, matching the saved dashed lines and detour stops. */
  detourActive?: boolean;
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

  // Detour-focus context fade-in: the SOLID primary connection appears when
  // the detour editor opens with a composed loop. Fade it in (same pattern
  // as the draft fade-in) so the context change doesn't pop. The dimmed arc
  // is deliberately EXCLUDED — fadeLineLayers animates to full opacity
  // (t → 1), which would clobber the arc's spec opacity of 0.3; it appears
  // at its lowered value instantly instead. Keyed on a ref that tracks the
  // previous context — re-arms every time context toggles.
  //
  // INACTIVE detours never fade: fadeLineLayers writes a FLAT number ending
  // at 1, which would permanently replace the data-driven opacity expression
  // (["case", ["get", "active"], 1, 0.5]) and leave an inactive detour's
  // connection fully opaque. Instead the expression is (re)applied directly —
  // also covering the toggle-inactive-after-fade case, where a previous fade
  // left a flat 1 on the layer.
  const contextFadedRef = useRef(false);
  useEffect(() => {
    if (!map || !detourContext) {
      contextFadedRef.current = false;
      return;
    }
    if (contextFadedRef.current) return;
    let attempts = 0;
    const tryApply = () => {
      if (map.getLayer("route-line-detour-primary")) {
        contextFadedRef.current = true;
        if (detourActive === false) {
          map.setPaintProperty("route-line-detour-primary", "line-opacity", [
            "case",
            ["get", "active"],
            1,
            0.5,
          ]);
        } else {
          fadeLineLayers(map, [
            { id: "route-line-detour-primary", prop: "line-opacity" },
          ]);
        }
        return;
      }
      if (attempts++ < 30) requestAnimationFrame(tryApply);
    };
    tryApply();
  }, [map, detourContext, detourActive]);

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
    [draft, connecting, color, detourContext, detourActive],
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
        // Detour-focus context: the original arc the detour replaces, drawn
        // DASHED at lowered opacity so it reads as temporarily de-emphasized
        // while the detour takes priority (the detour itself is the solid
        // primary connection, drawn above this layer).
        lineLayerSpec("route-line-draft-dimmed", {
          source: "route-lines",
          filter: ["==", ["get", "kind"], "draft-dimmed"],
          color: ["coalesce", ["get", "color"], DRAFT_LINE],
          width: 4,
          dasharray: [...DETOUR_DASH],
          opacity: 0.3,
        }),
        // Detour-focus context: the SOLID "detour as primary" connection
        // (main-before + detour loop + main-after) on top of everything.
        // Inactive detours fade to half opacity like every other detour line.
        lineLayerSpec("route-line-detour-primary", {
          source: "route-lines",
          filter: ["==", ["get", "kind"], "detour-primary"],
          color: ["coalesce", ["get", "color"], DRAFT_LINE],
          width: 4,
          opacity: ["case", ["get", "active"], 1, 0.5],
        }),
      ];
      for (const layer of layers) {
        if (!map.getLayer(layer.id)) map.addLayer(layer);
      }
      return true;
    },
    () => {
      const features: RouteLineFeature[] = [];
      if (detourContext) {
        // Detour focused: the main route is drawn in three parts — the arcs
        // OUTSIDE the detour at full opacity (the solid connection into and
        // out of it) and the REPLACED arc between split/merge dimmed.
        // Rendered independently of the `draft` prop so the connection shows
        // even when the routes layer toggle is off (it IS the focus).
        // Degenerate slices (split at the first vertex, merge at the last)
        // are single points — MapLibre rejects 1-coordinate LineStrings, so
        // only features with ≥2 coordinates are emitted.
        const valid = (line: GeoLineString) => line.coordinates.length >= 2;
        if (valid(detourContext.before)) {
          features.push({
            type: "Feature",
            properties: { kind: "draft", color },
            geometry: detourContext.before,
          });
        }
        if (valid(detourContext.after)) {
          features.push({
            type: "Feature",
            properties: { kind: "draft", color },
            geometry: detourContext.after,
          });
        }
        if (valid(detourContext.replaced)) {
          features.push({
            type: "Feature",
            properties: { kind: "draft-dimmed", color },
            geometry: detourContext.replaced,
          });
        }
        if (valid(detourContext.primary)) {
          features.push({
            type: "Feature",
            properties: { kind: "detour-primary", color, active: detourActive },
            geometry: detourContext.primary,
          });
        }
      } else if (draft) {
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
      // same vertex count still redraws (perf-audit review fix). Activation
      // flips the line's opacity — it MUST participate or setData never
      // re-runs when only is_active changes.
      return JSON.stringify(
        features.map((f) => [
          f.properties.kind,
          f.properties.color,
          (f.properties as { active?: boolean }).active ?? true,
          f.geometry.coordinates,
        ]),
      );
    },
    () => {
      const features: RouteLineFeature[] = [];
      if (detourContext) {
        // Detour focused: the main route is drawn in three parts — the arcs
        // OUTSIDE the detour at full opacity (the solid connection into and
        // out of it) and the REPLACED arc between split/merge dimmed.
        // Rendered independently of the `draft` prop so the connection shows
        // even when the routes layer toggle is off (it IS the focus).
        // Degenerate slices (split at the first vertex, merge at the last)
        // are single points — MapLibre rejects 1-coordinate LineStrings, so
        // only features with ≥2 coordinates are emitted.
        const valid = (line: GeoLineString) => line.coordinates.length >= 2;
        if (valid(detourContext.before)) {
          features.push({
            type: "Feature",
            properties: { kind: "draft", color },
            geometry: detourContext.before,
          });
        }
        if (valid(detourContext.after)) {
          features.push({
            type: "Feature",
            properties: { kind: "draft", color },
            geometry: detourContext.after,
          });
        }
        if (valid(detourContext.replaced)) {
          features.push({
            type: "Feature",
            properties: { kind: "draft-dimmed", color },
            geometry: detourContext.replaced,
          });
        }
        if (valid(detourContext.primary)) {
          features.push({
            type: "Feature",
            properties: { kind: "detour-primary", color, active: detourActive },
            geometry: detourContext.primary,
          });
        }
      } else if (draft) {
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
    [
      "route-line-draft",
      "route-line-connecting",
      "route-line-draft-dimmed",
      "route-line-detour-primary",
    ],
  );

  return null;
});
