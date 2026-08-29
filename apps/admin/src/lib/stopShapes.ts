import type { StopType } from "@komyuter/shared";
import { STOP_COLORS } from "@/lib/colors";

/**
 * Distinct visual identity per stop type (FR-015): shape + colour pair so
 * types are never distinguished by colour alone (WCAG / DESIGN.md — always
 * pair colour with shape or text). Colors are registry values from
 * lib/colors.ts (STOP_COLORS) — no local hex (FR-012/SC-007).
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
  terminal: {
    shape: "square",
    color: STOP_COLORS.terminal,
    softFill: "#E8F1FA",
  },
  // Regular boarding point — outlined circle.
  major_stop: {
    shape: "circle",
    color: STOP_COLORS.major_stop,
    softFill: "#E8F5EF",
  },
  // Hail-and-ride point — amber diamond (signal amber = attention/hail).
  waiting_area: {
    shape: "diamond",
    color: STOP_COLORS.waiting_area,
    softFill: "#FAF1E0",
  },
};

export function getStopShape(type: StopType): StopShapeStyle {
  return STOP_SHAPES[type];
}
