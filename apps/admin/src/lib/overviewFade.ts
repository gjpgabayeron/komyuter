import type { ExpressionSpecification } from "maplibre-gl";

/**
 * Overview fade-in helpers (Phase 1: smooth polyline rendering).
 *
 * Pure and Node-testable — the animation driver itself (fadeInOverviewLayers
 * in RouteOverviewLayer.tsx) rAF-steps the factor returned here across the
 * line/arrow layers. MapLibre's setPaintProperty accepts no per-call
 * transition (StyleSetterOptions only has `validate`), so the fade is a
 * factor applied to the shared hover/focus-aware opacity expression.
 */

/** Fade duration when fresh overview geometry lands. */
export const OVERVIEW_FADE_MS = 250;

/** Visual hierarchy for the overview polylines:
 *  - the hovered route stays at full opacity and every OTHER route dims to
 *    0.5 (attention without losing context);
 *  - clicking a route focuses it: the focused route stays at 1 and every
 *    OTHER route dims further to 0.15 (maximum emphasis, spatial context
 *    preserved);
 *  - with nothing hovered/focused, all routes render at full opacity.
 *  The "other routes" dim level is carried per feature via a numeric
 *  `dim` feature-state (0.5 or 0.15); the active route's own hovered/focused
 *  state overrides it to 1. */
const OVERVIEW_OPACITY: ExpressionSpecification = [
  "case",
  ["==", ["feature-state", "hovered"], true],
  1,
  ["==", ["feature-state", "focused"], true],
  1,
  ["coalesce", ["feature-state", "dim"], 1],
];

/** The shared opacity expression scaled by `factor` (0 = invisible, 1 = the
 *  full hover/focus-aware expression). Clamped to [0, 1]. */
export function overviewOpacityAt(factor: number): ExpressionSpecification {
  if (factor >= 1) return OVERVIEW_OPACITY;
  const clamped = Math.max(0, Math.min(1, factor));
  return ["*", OVERVIEW_OPACITY, clamped] as unknown as ExpressionSpecification;
}

/** True when the map is still usable for style operations. A MapLibre map
 *  destroyed by react-map-gl on navigation-away keeps its JS object but drops
 *  its internal `style` — `getLayer`/`setPaintProperty` then throw. Fades run
 *  on timers/rAF and can outlive the map, so every step must bail gracefully. */
export function mapIsUsable(map: import("maplibre-gl").Map): boolean {
  try {
    return !!map.getStyle();
  } catch {
    return false;
  }
}

/** Animates one or more layers' paint opacity from 0 → 1 over
 *  `durationMs` using plain numeric values (used where no hover-aware
 *  expression exists, e.g. the editor's draft line). rAF-stepped because
 *  MapLibre's setPaintProperty accepts no per-call transition. The layers are
 *  zeroed SYNCHRONOUSLY first so a freshly created layer (created at full
 *  opacity by its spec) can never paint a full-opacity frame before the fade
 *  takes over (edit→overview flicker). */
export function fadeLineLayers(
  map: import("maplibre-gl").Map,
  layers: readonly { id: string; prop: "line-opacity" | "icon-opacity" }[],
  durationMs = OVERVIEW_FADE_MS,
): void {
  const zero = () => {
    if (!mapIsUsable(map)) return;
    for (const { id, prop } of layers) {
      if (!map.getLayer(id)) continue;
      map.setPaintProperty(id, prop, 0);
    }
  };
  zero();
  // Use performance.now() for BOTH the start and every step — the rAF
  // callback's `now` can be skewed against it (negative deltas), which made
  // MapLibre reject the writes and caused the flicker. Always clamped to
  // [0, 1] so a write can never be rejected.
  const start = performance.now();
  const step = () => {
    const t = Math.max(
      0,
      Math.min(1, (performance.now() - start) / durationMs),
    );
    for (const { id, prop } of layers) {
      if (!map.getLayer(id)) continue;
      map.setPaintProperty(id, prop, t);
    }
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/** Scales an opacity paint value by `factor` (0..1): plain numbers scale
 *  directly (clamped to [0, 1] so a write is never rejected by MapLibre);
 *  expressions (e.g. the hover/focus-aware OVERVIEW_OPACITY case) are
 *  wrapped in a `["*", expr, factor]` multiplier so a DIM feature — the
 *  focused-state recede — never jumps to full opacity first. */
function scalePaintValue(
  value: number | ExpressionSpecification,
  factor: number,
): number | ExpressionSpecification {
  if (typeof value === "number") {
    return Math.max(0, Math.min(1, value * factor));
  }
  if (factor >= 1) return value;
  return ["*", value, factor] as unknown as ExpressionSpecification;
}

/** Animates one or more layers' paint opacity down to 0 over `durationMs`,
 *  then invokes `onDone` — used for the crossfade-out tail (unmount fade-out,
 *  editor draft fade-out) so old geometry stays visible as an anchor while
 *  the new geometry takes over, then gets removed. The fade starts from each
 *  layer's CURRENT painted value — a focused/dimmed route (0.15/0.5 via the
 *  hover expression) fades smoothly from where it is instead of jumping to
 *  full opacity first. Returns a cancel handle so a newer state can abort the
 *  fade (e.g. a fresh route opened mid-fade-out — otherwise the fade and the
 *  new fade-in would fight over the same opacity, and the apply guard would
 *  stay blocked). rAF-stepped. */
export function fadeOutLayers(
  map: import("maplibre-gl").Map,
  layers: readonly { id: string; prop: "line-opacity" | "icon-opacity" }[],
  durationMs = OVERVIEW_FADE_MS,
  onDone?: () => void,
  shouldAbort?: () => boolean,
): () => void {
  let cancelled = false;
  // Capture each layer's current opacity BEFORE animating so the fade starts
  // from the actual painted state (number or hover expression).
  const startValues = new Map<string, number | ExpressionSpecification>();
  if (mapIsUsable(map)) {
    for (const { id, prop } of layers) {
      if (!map.getLayer(id)) continue;
      const current = map.getPaintProperty(id, prop) as
        number | ExpressionSpecification | undefined;
      if (current !== undefined) startValues.set(id, current);
    }
  }
  const start = performance.now();
  const step = () => {
    if (cancelled) return;
    if (!mapIsUsable(map)) return;
    // Abort the fade (without onDone) once the caller's condition flips — e.g.
    // a newer overview mount claiming the map mid-StrictMode-cycle must stop
    // the old teardown's fade-out from fighting the new fade-in.
    if (shouldAbort?.()) return;
    // Same-clock reads (performance.now() only — no rAF-timestamp skew) and a
    // hard clamp so factor never exceeds [0, 1].
    const t = Math.max(
      0,
      Math.min(1, (performance.now() - start) / durationMs),
    );
    const factor = 1 - t;
    for (const { id, prop } of layers) {
      if (!map.getLayer(id)) continue;
      const base = startValues.get(id);
      if (base === undefined) continue;
      map.setPaintProperty(id, prop, scalePaintValue(base, factor));
    }
    if (t < 1) {
      requestAnimationFrame(step);
    } else if (!shouldAbort?.()) {
      onDone?.();
    }
  };
  requestAnimationFrame(step);
  return () => {
    cancelled = true;
  };
}
