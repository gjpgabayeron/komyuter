import type { StopShape } from "@/lib/stopShapes";

/** Signboard green-blue (draft path — committed to save). */
export const DRAFT_LINE = "#1B6DB2";
/** Crossfade-out duration for the editor's committed draft line (edit→overview). */
export const DRAFT_FADE_OUT_MS = 200;
/** Vivid orange (transient connecting line — the straight fallback shown
 *  until a road-snapped path exists; never persisted). */
export const PREVIEW_LINE = "#FF5C00";

/** Static Tailwind classes per stop shape (FR-015). */
export const SHAPE_CLASS: Record<StopShape, string> = {
  square: "rounded-[4px]",
  circle: "rounded-full",
  diamond: "rotate-45 rounded-[3px]",
};

/** Basemap layers that the opacity fade must NEVER touch — the route lines
 *  and overview overlays are drawn on top of the basemap and stay opaque. */
export const OVERLAY_LAYER_PREFIXES = [
  "route-line-",
  "overview-",
  "route-arrow",
];
