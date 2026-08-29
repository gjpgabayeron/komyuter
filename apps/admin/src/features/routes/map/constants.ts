import type { StopShape } from "@/lib/stopShapes";
import {
  activeRoute as DRAFT_LINE,
  previewLine as PREVIEW_LINE,
  DETOUR_COLORS,
  detourColorForIndex,
  detourColorFor,
  attentionAmber as DETOUR_DRAFT_COLOR,
} from "@/lib/colors";

/** Re-exported line tokens: the color VALUES live in lib/colors.ts (single
 *  source, FR-012/SC-007); map-only constants stay here. */

export {
  DRAFT_LINE,
  PREVIEW_LINE,
  DETOUR_COLORS,
  detourColorForIndex,
  detourColorFor,
  DETOUR_DRAFT_COLOR,
};

/** Crossfade-out duration for the editor's committed draft line (edit→overview). */
export const DRAFT_FADE_OUT_MS = 200;

/** Dash pattern marking every detour line as an alternative to the solid
 *  base route, so a switched-off detour is still legibly a detour. */
export const DETOUR_DASH = [8, 6];

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
