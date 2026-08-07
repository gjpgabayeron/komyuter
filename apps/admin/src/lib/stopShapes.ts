import type { StopType } from "@komyuter/shared";

/**
 * Distinct visual identity per stop type (FR-015): shape + colour pair so
 * types are never distinguished by colour alone (WCAG / DESIGN.md — always
 * pair colour with shape or text).
 */
export type StopShape = "square" | "circle" | "diamond";

export interface StopShapeStyle {
  shape: StopShape;
  /** Primary ink/border colour (hex). */
  color: string;
  /** Light tint used for selected/preview fills. */
  softFill: string;
}

export const STOP_SHAPES: Record<StopType, StopShapeStyle> = {
  // Start/end of the route — solid signboard green-blue plate.
  terminal: { shape: "square", color: "#1B6DB2", softFill: "#E8F1FA" },
  // Regular boarding point — outlined circle.
  major_stop: { shape: "circle", color: "#1F9E6B", softFill: "#E8F5EF" },
  // Hail-and-ride point — amber diamond (signal amber = attention/hail).
  waiting_area: { shape: "diamond", color: "#C98A1B", softFill: "#FAF1E0" },
};

export function getStopShape(type: StopType): StopShapeStyle {
  return STOP_SHAPES[type];
}
