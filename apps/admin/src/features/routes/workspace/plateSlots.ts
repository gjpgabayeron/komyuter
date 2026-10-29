/** Which plate a slot shows, or that it shows none. */
export type ContextPlate = "search" | "none";
export type RightPlate = "properties" | "none";

/** The workspace's two plate slots (ADR-0024). */
export interface PlateSlots {
  /** Revealed over the free region's left edge while a search has something to say. */
  context: ContextPlate;
  /** The right column: properties while editing, nothing while searching. */
  right: RightPlate;
}

export interface PlateSlotInput {
  /** True while the search pill holds a session (focus or a live query). */
  searchActive: boolean;
  /** True while the query is in flight — the plate's loading state. */
  loading: boolean;
  /** Rows the current answer produced. */
  candidateCount: number;
  /** True when the search ended without rows and says why. */
  hasStatus: boolean;
}

/**
 * Which plate lives where — the rule, as a pure function.
 *
 * Two slots, and each one is a different user intent:
 * - no session → properties on the right, no context column;
 * - a session that is loading, has rows, or has a reason there are none →
 *   results in the context column and properties yielded, so the two never
 *   share the screen and the search state's map width is unambiguous;
 * - a session with a confident single hit → neither plate: the map marks the
 *   place and its popup is the answer.
 *
 * A field that is merely focused has no query in flight, no rows and no
 * status, so it opens nothing — the reveal follows a query, never a caret.
 *
 * Kept out of the JSX so the rule is testable and the workspace page stays a
 * thin assembly.
 */
export function plateSlotsFor(input: PlateSlotInput): PlateSlots {
  if (!input.searchActive) return { context: "none", right: "properties" };
  if (input.loading || input.candidateCount > 0 || input.hasStatus) {
    return { context: "search", right: "none" };
  }
  return { context: "none", right: "none" };
}
