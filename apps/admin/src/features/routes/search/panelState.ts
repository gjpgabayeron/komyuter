import type { PoiSearchStatus } from "@/lib/plottingStore";

/**
 * The five answers the results plate can show (frame spec, "Five states of the
 * plate"):
 *
 * - `loading` — a query is in flight; skeleton rows.
 * - `results` — at least one scoped hit; the list.
 * - `empty` — the upstream answered, but nothing survived the visible region.
 * - `unavailable` — search could not run; one line naming the cause.
 * - `absent` — a confident single hit is on the map; no plate at all.
 */
export type SearchPanelState =
  "loading" | "results" | "empty" | "unavailable" | "absent";

export interface SearchPanelInput {
  /** True while the query is in flight. */
  loading: boolean;
  /** Rows the current answer produced. */
  candidateCount: number;
  /** Why the answer is empty, when it is. */
  status: PoiSearchStatus;
}

/**
 * The plate's state, as a pure function so the five branches are testable
 * without a renderer. `loading` wins over a stale answer; `results` wins if a
 * scoped hit exists; a null status with no rows is the confident-hit `absent`
 * state, where the map marker and popup are the answer.
 */
export function searchPanelState({
  loading,
  candidateCount,
  status,
}: SearchPanelInput): SearchPanelState {
  if (loading) return "loading";
  if (candidateCount > 0) return "results";
  if (status === "out_of_area") return "empty";
  if (status !== null) return "unavailable";
  return "absent";
}
