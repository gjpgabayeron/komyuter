import type { StopShape } from "@/lib/stopShapes";

/** Signboard green-blue (draft path — committed to save). */
export const DRAFT_LINE = "#1B6DB2";
/** Crossfade-out duration for the editor's committed draft line (edit→overview). */
export const DRAFT_FADE_OUT_MS = 200;
/** Vivid orange (transient connecting line — the straight fallback shown
 *  until a road-snapped path exists; never persisted). */
export const PREVIEW_LINE = "#FF5C00";

/** Distinct palette for detour (alternative-route) lines (FR-012): a
 *  per-detour cycle avoiding the base route colors (routeColors.ts) so an
 *  alternative reads as a different service, not a recolor. */
export const DETOUR_COLORS = [
  "#C98A1B",
  "#178B7E",
  "#8E5CC3",
  "#B4553C",
] as const;

/** Palette color for the nth detour of a direction (T029 cycling). */
export function detourColorForIndex(index: number): string {
  return DETOUR_COLORS[index % DETOUR_COLORS.length];
}

/** Stable per-detour color from the detour_id hash — soft-deleting one detour
 *  must not reshuffle the remaining detours' colors between sessions (US3). */
export function detourColorFor(detourId: string): string {
  let hash = 0;
  for (let index = 0; index < detourId.length; index += 1) {
    hash = (hash * 31 + detourId.charCodeAt(index)) >>> 0;
  }
  return detourColorForIndex(hash % DETOUR_COLORS.length);
}

/** Signal amber — the LIVE detour composition (entry/exit/loop) while the
 *  editor is open; transient, never persisted. */
export const DETOUR_DRAFT_COLOR = "#D97706";

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
