/** Which plate the workspace's right column shows. */
export type RightPlate = "search" | "properties" | "none";

export interface RightPlateInput {
  /** True while the search pill holds focus or a query. */
  searchActive: boolean;
  /** Rows the current answer produced. */
  candidateCount: number;
  /** True when the search ended without rows and says why. */
  hasStatus: boolean;
}

/**
 * The right-column decision, as a pure function.
 *
 * Three outcomes, and each one is a different user intent:
 * - `properties` — no search session; the plotter is editing the route.
 * - `search` — a session with something to report: rows, or the reason there
 *   are none. With the pill's dropdown gone, an empty or failed search only has
 *   this plate to speak through.
 * - `none` — a session with a confident single hit: the map is the answer, and
 *   the column collapses so the place is not crowded by chrome.
 *
 * Kept out of the JSX so the rule is testable and the workspace page stays a
 * thin assembly (ADR-0014's split).
 */
export function rightPlateFor(input: RightPlateInput): RightPlate {
  if (!input.searchActive) return "properties";
  if (input.candidateCount > 0 || input.hasStatus) return "search";
  return "none";
}
