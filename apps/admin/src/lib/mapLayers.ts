import { useEffect, useRef } from "react";
import type {
  ExpressionSpecification,
  GeoJSONSource,
  LayerSpecification,
  Map as MapLibreMap,
} from "maplibre-gl";
import type { GeoLineString } from "@komyuter/shared";

/**
 * Shared imperative MapLibre line-drawing lifecycle for the plotting
 * (`RouteLines`) and overview (`RouteOverviewLayer`) renderers — one source of
 * truth so both pipelines behave identically and reliably.
 *
 * Perf-audit fixes this addresses:
 * - "no render until interaction": the old code gated every draw on
 *   `map.isStyleLoaded()` and relied on `load`/`styledata` re-firing. With a
 *   vector style that stays "not loaded" for a long time, data arriving in
 *   that window could never be drawn. `useDrawWhenReady` marks the draw
 *   DIRTY and retries on `load`/`styledata`/`idle` until the first success.
 * - perpetual idle→setData loop: `idle` only re-ticks when a draw is still
 *   dirty (or layers were just rebuilt), and callers skip `setData` when the
 *   content signature is unchanged — so settled maps stop redrawing.
 * - style reloads destroy runtime layers: `load`/`styledata` invalidate the
 *   "ensured" flag so the source/layers are rebuilt and the data redrawn.
 */

/** Ensures a GeoJSON source exists under `id`; returns true once present. */
export function ensureGeoJsonSource(map: MapLibreMap, id: string): boolean {
  if (!map.getSource(id)) {
    map.addSource(id, {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });
  }
  return true;
}

/** Pushes features into a GeoJSON source (no-op when the source is missing). */
export function setSourceData(
  map: MapLibreMap,
  sourceId: string,
  features: {
    type: "Feature";
    properties: Record<string, unknown>;
    geometry: GeoLineString;
  }[],
): void {
  (map.getSource(sourceId) as GeoJSONSource | undefined)?.setData({
    type: "FeatureCollection",
    features,
  } as Parameters<GeoJSONSource["setData"]>[0]);
}

/** Builds a basic line layer spec with a kind/direction filter. */
export function lineLayerSpec(
  id: string,
  opts: {
    source: string;
    filter: ExpressionSpecification;
    color: ExpressionSpecification;
    width: number;
    dasharray?: number[];
    opacity?: ExpressionSpecification | number;
  },
): LayerSpecification {
  return {
    id,
    type: "line",
    source: opts.source,
    filter: opts.filter,
    layout: { "line-cap": "round", "line-join": "round" },
    paint: {
      "line-color": opts.color,
      "line-width": opts.width,
      ...(opts.dasharray ? { "line-dasharray": opts.dasharray } : {}),
      ...(opts.opacity !== undefined ? { "line-opacity": opts.opacity } : {}),
    },
  };
}

/**
 * Runs `ensure` (create source/layers; returns true when present) and, when
 * the content signature changed, `apply` (setData) — whenever `deps` change
 * or the map becomes drawable, retrying until the first successful draw.
 * `idle` re-ticks only while dirty, so a settled map does not redraw in a
 * loop. On a style (re)load the source/layers are destroyed: `invalidate`
 * resets the signature so `apply` always runs after a rebuild.
 */
export function useDrawWhenReady(
  map: MapLibreMap | undefined,
  deps: unknown[],
  ensure: () => boolean,
  signature: () => unknown,
  apply: () => void,
): void {
  const ensureRef = useRef(ensure);
  ensureRef.current = ensure;
  const signatureRef = useRef(signature);
  signatureRef.current = signature;
  const applyRef = useRef(apply);
  applyRef.current = apply;
  const ensuredRef = useRef(false);
  const dirtyRef = useRef(false);
  const lastSignature = useRef<unknown>(null);

  useEffect(() => {
    if (!map) return;
    const tick = () => {
      if (!map.isStyleLoaded()) return;
      if (!ensuredRef.current) {
        ensuredRef.current = ensureRef.current();
      }
      if (ensuredRef.current && dirtyRef.current) {
        const signatureValue = signatureRef.current();
        if (signatureValue !== lastSignature.current) {
          lastSignature.current = signatureValue;
          applyRef.current();
        }
        dirtyRef.current = false;
      }
    };
    const invalidate = () => {
      // A style (re)load destroys runtime layers — rebuild AND force a
      // redraw even if the content signature is unchanged.
      ensuredRef.current = false;
      dirtyRef.current = true;
      lastSignature.current = null;
      tick();
    };
    dirtyRef.current = true;
    tick();
    map.on("load", invalidate);
    map.on("styledata", invalidate);
    map.on("idle", tick);
    return () => {
      map.off("load", invalidate);
      map.off("styledata", invalidate);
      map.off("idle", tick);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, ...deps]);
}
