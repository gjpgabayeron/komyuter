/**
 * The context plate's reveal motion, shared by the plate's CSS transform and
 * the camera's compensating padded ease (ADR-0024 §6–7).
 *
 * One duration and one curve, so the plate and the map move as a single
 * gesture. The CSS value is the same cubic-bezier `ease-out`; `revealEasing`
 * evaluates it in JS because MapLibre needs a function, not a CSS string.
 */
export const REVEAL_DURATION_MS = 180;

/** `cubic-bezier(0, 0, 0.2, 1)` — Tailwind's `ease-out`. */
export const REVEAL_EASING_CSS = "cubic-bezier(0, 0, 0.2, 1)";

const CONTROL_X1 = 0;
const CONTROL_Y1 = 0;
const CONTROL_X2 = 0.2;
const CONTROL_Y2 = 1;

/** One axis of a cubic Bézier with endpoints fixed at 0 and 1. */
function bezier(t: number, p1: number, p2: number): number {
  const mt = 1 - t;
  return 3 * mt * mt * t * p1 + 3 * mt * t * t * p2 + t * t * t;
}

/**
 * The reveal curve as a timing function: `revealEasing(0) === 0`,
 * `revealEasing(1) === 1`, fast at the start and settling at the end.
 *
 * Evaluated by bisection — the x control points (0, 0.2) keep the curve
 * monotonic, so a fixed 24-iteration search is exact enough for a 180 ms
 * animation and stays a pure function a test can pin.
 */
export function revealEasing(t: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  let low = 0;
  let high = 1;
  let x = t;
  for (let i = 0; i < 24; i += 1) {
    x = (low + high) / 2;
    if (bezier(x, CONTROL_X1, CONTROL_X2) < t) low = x;
    else high = x;
  }
  return bezier(x, CONTROL_Y1, CONTROL_Y2);
}
